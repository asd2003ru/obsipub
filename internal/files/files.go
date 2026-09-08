package files

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

var (
	ErrForbidden = errors.New("forbidden")
	ErrNotFound  = errors.New("not found")
)

// Store safely exposes files located under Root only.
type Store struct {
	Root string
}

func NewStore(root string) (*Store, error) {
	abs, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	return &Store{Root: filepath.Clean(abs)}, nil
}

func (s *Store) Resolve(userPath string) (string, error) {
	cleaned := strings.TrimSpace(userPath)
	cleaned = strings.TrimPrefix(cleaned, "/")
	if cleaned == "" || cleaned == "." {
		return s.Root, nil
	}
	cleaned = filepath.Clean(filepath.FromSlash(cleaned))
	if filepath.IsAbs(cleaned) {
		return "", ErrForbidden
	}

	full := filepath.Join(s.Root, cleaned)
	abs, err := filepath.Abs(full)
	if err != nil {
		return "", err
	}
	if !s.inside(abs) {
		return "", ErrForbidden
	}
	return abs, nil
}

func (s *Store) ReadMarkdown(userPath string) (string, error) {
	if !strings.EqualFold(filepath.Ext(userPath), ".md") {
		return "", ErrNotFound
	}
	full, err := s.Resolve(userPath)
	if err != nil {
		return "", err
	}
	b, err := os.ReadFile(full)
	if errors.Is(err, os.ErrNotExist) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func (s *Store) RawPath(userPath string) (string, error) {
	full, err := s.Resolve(userPath)
	if err != nil {
		return "", err
	}
	return rawFile(full)
}

// RawPathFrom resolves an Obsidian embed from its source note, then from the
// vault root, and finally by filename anywhere in the publication graph.
func (s *Store) RawPathFrom(userPath, from string) (string, error) {
	userPath = strings.TrimSpace(userPath)
	if userPath == "" {
		return "", ErrNotFound
	}

	candidates := []string{}
	if from != "" {
		candidates = append(candidates, filepath.ToSlash(filepath.Join(filepath.Dir(filepath.FromSlash(from)), filepath.FromSlash(userPath))))
	}
	candidates = append(candidates, userPath)
	for _, candidate := range candidates {
		full, err := s.RawPath(candidate)
		if err == nil {
			return full, nil
		}
		if errors.Is(err, ErrForbidden) {
			return "", err
		}
	}

	names := map[string]bool{filepath.Base(filepath.FromSlash(userPath)): true}
	if strings.EqualFold(filepath.Ext(userPath), ".excalidraw") {
		names[filepath.Base(filepath.FromSlash(userPath))+".md"] = true
	}
	var found string
	err := filepath.WalkDir(s.Root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil || entry.IsDir() || found != "" {
			return walkErr
		}
		if names[entry.Name()] {
			found = path
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	if found == "" {
		return "", ErrNotFound
	}
	return rawFile(found)
}

func rawFile(full string) (string, error) {
	st, err := os.Stat(full)
	if errors.Is(err, os.ErrNotExist) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", err
	}
	if st.IsDir() {
		return "", ErrNotFound
	}
	return full, nil
}

func (s *Store) ThemePath(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", ErrNotFound
	}
	name = filepath.Clean(filepath.FromSlash(name))
	if filepath.IsAbs(name) || name == "." || name == ".." || strings.HasPrefix(name, ".."+string(filepath.Separator)) {
		return "", ErrForbidden
	}
	if filepath.Ext(name) == "" {
		name += ".css"
	}
	if !strings.EqualFold(filepath.Ext(name), ".css") {
		return "", ErrNotFound
	}
	return s.RawPath(filepath.ToSlash(filepath.Join(".themes", name)))
}

func (s *Store) inside(abs string) bool {
	rel, err := filepath.Rel(s.Root, abs)
	if err != nil {
		return false
	}
	return rel == "." || (rel != ".." && !strings.HasPrefix(rel, fmt.Sprintf("..%c", filepath.Separator)))
}
