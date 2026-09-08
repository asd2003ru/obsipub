package publish

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const (
	ManifestName    = "index.json"
	ManifestVersion = 1
)

// Node is a navigation node in a published dependency tree.
type Node struct {
	Path     string `json:"path"`
	Name     string `json:"name"`
	Children []Node `json:"children,omitempty"`
}

// Manifest describes one self-contained published vault subset.
type Manifest struct {
	Version                int    `json:"version"`
	Index                  string `json:"index"`
	Theme                  string `json:"theme,omitempty"`
	ShowLineNumbers        bool   `json:"showLineNumbers"`
	ShowArticleLineNumbers bool   `json:"showArticleLineNumbers"`
	Tree                   Node   `json:"tree"`
	Prefix                 string `json:"prefix,omitempty"`
	PasswordHash           string `json:"passwordHash,omitempty"`
}

func ValidatePrefix(prefix string) error {
	if prefix == "" {
		return fmt.Errorf("prefix must not be empty")
	}
	if len(prefix) > 64 {
		return fmt.Errorf("prefix exceeds 64 characters")
	}
	if prefix == "." || prefix == ".." {
		return fmt.Errorf("prefix must not be . or ..")
	}
	for _, r := range prefix {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			continue
		}
		return fmt.Errorf("prefix contains invalid character: %q", r)
	}
	return nil
}

func ValidatePasswordHash(hash string) error {
	if hash == "" {
		return fmt.Errorf("password hash must not be empty")
	}
	if len(hash) < 8 {
		return fmt.Errorf("password hash too short")
	}
	if !strings.HasPrefix(hash, "sha256:") {
		return fmt.Errorf("password hash must start with sha256:")
	}
	for _, r := range hash {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == ':' || r == '$' || r == '.' || r == '_' || r == '-' || r == '/' || r == '+' || r == '=' {
			continue
		}
		return fmt.Errorf("password hash contains invalid character: %q", r)
	}
	return nil
}

func (m Manifest) HasPassword() bool {
	return m.PasswordHash != ""
}

// HashPassword creates the portable password representation stored in a manifest.
func HashPassword(password string) string {
	digest := sha256.Sum256([]byte(password))
	return "sha256:" + hex.EncodeToString(digest[:])
}

// VerifyPassword compares a plaintext password to a manifest hash in constant time.
func VerifyPassword(password, encoded string) bool {
	if !strings.HasPrefix(encoded, "sha256:") {
		return false
	}
	want, err := hex.DecodeString(strings.TrimPrefix(encoded, "sha256:"))
	if err != nil || len(want) != sha256.Size {
		return false
	}
	got := sha256.Sum256([]byte(password))
	return subtle.ConstantTimeCompare(got[:], want) == 1
}

func normalizePath(path string) (string, error) {
	path = strings.TrimSpace(strings.ReplaceAll(path, "\\", "/"))
	if path == "" || strings.HasPrefix(path, "/") {
		return "", fmt.Errorf("path must be a non-empty relative path")
	}
	clean := filepath.ToSlash(filepath.Clean(filepath.FromSlash(path)))
	if clean == "." || clean == ".." || strings.HasPrefix(clean, "../") {
		return "", fmt.Errorf("path escapes archive root")
	}
	return clean, nil
}

func validateNode(node Node, root string, depth int) error {
	if depth > 128 {
		return fmt.Errorf("tree is too deep")
	}
	path, err := normalizePath(node.Path)
	if err != nil || !strings.EqualFold(filepath.Ext(path), ".md") {
		return fmt.Errorf("invalid tree node %q", node.Path)
	}
	if _, err := os.Stat(filepath.Join(root, filepath.FromSlash(path))); err != nil {
		return fmt.Errorf("tree node %q: %w", path, err)
	}
	for _, child := range node.Children {
		if err := validateNode(child, root, depth+1); err != nil {
			return err
		}
	}
	return nil
}

// Validate verifies the manifest and all files it points to inside root.
func (m Manifest) Validate(root string) error {
	if m.Prefix != "" {
		if err := ValidatePrefix(m.Prefix); err != nil {
			return fmt.Errorf("invalid manifest prefix: %w", err)
		}
	}
	if m.PasswordHash != "" {
		if err := ValidatePasswordHash(m.PasswordHash); err != nil {
			return fmt.Errorf("invalid manifest password hash: %w", err)
		}
	}
	if m.Version != ManifestVersion {
		return fmt.Errorf("unsupported index.json version %d", m.Version)
	}
	index, err := normalizePath(m.Index)
	if err != nil || !strings.EqualFold(filepath.Ext(index), ".md") {
		return fmt.Errorf("invalid main article")
	}
	if _, err := os.Stat(filepath.Join(root, filepath.FromSlash(index))); err != nil {
		return fmt.Errorf("main article %q: %w", index, err)
	}
	if m.Tree.Path != index {
		return fmt.Errorf("tree root must match main article")
	}
	if err := validateNode(m.Tree, root, 1); err != nil {
		return err
	}
	if m.Theme != "" {
		theme, err := normalizePath(m.Theme)
		if err != nil || !strings.HasPrefix(theme, ".themes/") || !strings.EqualFold(filepath.Ext(theme), ".css") {
			return fmt.Errorf("invalid theme entry")
		}
		if _, err := os.Stat(filepath.Join(root, filepath.FromSlash(theme))); err != nil {
			return fmt.Errorf("theme entry %q: %w", theme, err)
		}
	}
	return nil
}

func Load(root string) (Manifest, error) {
	body, err := os.ReadFile(filepath.Join(root, ManifestName))
	if err != nil {
		return Manifest{}, err
	}
	var manifest Manifest
	if err := json.Unmarshal(body, &manifest); err != nil {
		return Manifest{}, fmt.Errorf("decode index.json: %w", err)
	}
	if err := manifest.Validate(root); err != nil {
		return Manifest{}, err
	}
	return manifest, nil
}

func Write(root string, manifest Manifest) error {
	if err := manifest.Validate(root); err != nil {
		return err
	}
	body, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(root, ManifestName), append(body, '\n'), 0o644)
}
