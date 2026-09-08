package publish

import (
	"archive/zip"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

const (
	maxArchiveFiles = 10000
	maxArchiveBytes = 512 << 20
)

// Manager serializes publication changes and exposes the active manifest.
type Manager struct {
	root     string
	prefix   string
	mu       sync.RWMutex
	manifest Manifest
	ready    bool
}

func (m *Manager) pubRoot() string {
	if m.prefix == "" {
		return m.root
	}
	return filepath.Join(m.root, m.prefix)
}

func NewManager(root string) *Manager {
	m := &Manager{root: root}
	if manifest, err := Load(m.pubRoot()); err == nil {
		m.manifest, m.ready = manifest, true
	}
	return m
}

func NewSite(base, prefix string) (*Manager, error) {
	if err := ValidatePrefix(prefix); err != nil {
		return nil, fmt.Errorf("invalid site prefix: %w", err)
	}
	m := &Manager{root: base, prefix: prefix}
	if manifest, err := Load(m.pubRoot()); err == nil {
		m.manifest, m.ready = manifest, true
	}
	return m, nil
}

func (m *Manager) State() (Manifest, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.manifest, m.ready
}

// Reload refreshes the cached manifest after an external publication change.
func (m *Manager) Reload() {
	m.mu.Lock()
	defer m.mu.Unlock()
	manifest, err := Load(m.pubRoot())
	if err != nil {
		m.manifest = Manifest{}
		m.ready = false
		return
	}
	m.manifest = manifest
	m.ready = true
}

// Deploy verifies a ZIP in an isolated directory before replacing root.
func (m *Manager) Deploy(body io.Reader) (Manifest, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	pubRoot := m.pubRoot()
	parent := filepath.Dir(pubRoot)
	if err := os.MkdirAll(parent, 0o755); err != nil {
		return Manifest{}, err
	}
	archive, err := os.CreateTemp(parent, ".obsipub-upload-*.zip")
	if err != nil {
		return Manifest{}, err
	}
	archiveName := archive.Name()
	defer os.Remove(archiveName)
	limited := io.LimitReader(body, maxArchiveBytes+1)
	written, err := io.Copy(archive, limited)
	closeErr := archive.Close()
	if err != nil {
		return Manifest{}, err
	}
	if closeErr != nil {
		return Manifest{}, closeErr
	}
	if written > maxArchiveBytes {
		return Manifest{}, fmt.Errorf("archive exceeds %d bytes", maxArchiveBytes)
	}

	reader, err := zip.OpenReader(archiveName)
	if err != nil {
		return Manifest{}, fmt.Errorf("invalid zip: %w", err)
	}
	defer reader.Close()
	stage, err := os.MkdirTemp(parent, ".obsipub-stage-*")
	if err != nil {
		return Manifest{}, err
	}
	deployed := false
	defer func() {
		if !deployed {
			_ = os.RemoveAll(stage)
		}
	}()
	if err := unzipSafe(reader.File, stage); err != nil {
		return Manifest{}, err
	}
	manifest, err := Load(stage)
	if err != nil {
		return Manifest{}, fmt.Errorf("invalid publication manifest: %w", err)
	}

	backup := pubRoot + ".previous"
	_ = os.RemoveAll(backup)
	if _, err := os.Lstat(pubRoot); err == nil {
		if err := os.Rename(pubRoot, backup); err != nil {
			return Manifest{}, fmt.Errorf("prepare deployment: %w", err)
		}
	}
	if err := os.Rename(stage, pubRoot); err != nil {
		if _, restoreErr := os.Lstat(backup); restoreErr == nil {
			_ = os.Rename(backup, pubRoot)
		}
		return Manifest{}, fmt.Errorf("activate deployment: %w", err)
	}
	deployed = true
	_ = os.RemoveAll(backup)
	m.manifest, m.ready = manifest, true
	return manifest, nil
}

func unzipSafe(entries []*zip.File, target string) error {
	if len(entries) == 0 || len(entries) > maxArchiveFiles {
		return fmt.Errorf("archive file count is invalid")
	}
	seen := make(map[string]bool, len(entries))
	var total uint64
	for _, entry := range entries {
		name, err := normalizePath(entry.Name)
		if err != nil {
			return fmt.Errorf("invalid archive path %q", entry.Name)
		}
		if seen[name] {
			return fmt.Errorf("duplicate archive path %q", name)
		}
		seen[name] = true
		if entry.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("symbolic links are not allowed")
		}
		if entry.UncompressedSize64 > maxArchiveBytes || total > maxArchiveBytes-entry.UncompressedSize64 {
			return fmt.Errorf("archive is too large when unpacked")
		}
		total += entry.UncompressedSize64
		full := filepath.Join(target, filepath.FromSlash(name))
		if entry.FileInfo().IsDir() {
			if err := os.MkdirAll(full, 0o755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			return err
		}
		in, err := entry.Open()
		if err != nil {
			return err
		}
		out, err := os.OpenFile(full, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
		if err != nil {
			_ = in.Close()
			return err
		}
		_, copyErr := io.Copy(out, io.LimitReader(in, int64(entry.UncompressedSize64)+1))
		closeOut := out.Close()
		closeIn := in.Close()
		if copyErr != nil || closeOut != nil || closeIn != nil {
			return errors.Join(copyErr, closeOut, closeIn)
		}
	}
	return nil
}

func (m *Manager) DeployWithOverrides(body io.Reader, prefix string, password string) (Manifest, error) {
	if prefix != m.prefix {
		return Manifest{}, fmt.Errorf("deployment prefix %q does not match manager prefix %q", prefix, m.prefix)
	}
	if prefix != "" {
		if err := ValidatePrefix(prefix); err != nil {
			return Manifest{}, fmt.Errorf("invalid prefix: %w", err)
		}
	}
	manifest, err := m.Deploy(body)
	if err != nil {
		return Manifest{}, err
	}
	manifest.Prefix = prefix
	if password != "" {
		manifest.PasswordHash = HashPassword(password)
	} else {
		manifest.PasswordHash = ""
	}
	pubRoot := m.pubRoot()
	if err := Write(pubRoot, manifest); err != nil {
		return Manifest{}, fmt.Errorf("manifest consistency update: %w", err)
	}
	m.mu.Lock()
	m.manifest = manifest
	m.ready = true
	m.mu.Unlock()
	return manifest, nil
}

func IsAuthorized(got, want string) bool {
	return want != "" && strings.TrimSpace(got) == want
}
