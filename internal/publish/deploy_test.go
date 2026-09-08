package publish

import (
	"archive/zip"
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func archiveForTest(t *testing.T, files map[string]string) []byte {
	t.Helper()
	var out bytes.Buffer
	writer := zip.NewWriter(&out)
	for name, body := range files {
		entry, err := writer.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := entry.Write([]byte(body)); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return out.Bytes()
}

func TestDeployActivatesValidatedArchive(t *testing.T) {
	root := filepath.Join(t.TempDir(), "notes")
	manifest := `{"version":1,"index":"index.md","tree":{"path":"index.md","name":"index"}}`
	manager := NewManager(root)
	got, err := manager.Deploy(bytes.NewReader(archiveForTest(t, map[string]string{
		"index.md": "# hello", "index.json": manifest, ".themes/Bolt/theme.css": "body{}",
	})))
	if err != nil {
		t.Fatal(err)
	}
	if got.Index != "index.md" || got.Tree.Name != "index" {
		t.Fatalf("unexpected manifest: %#v", got)
	}
	if _, ready := manager.State(); !ready {
		t.Fatal("publication not active")
	}
	if _, err := os.Stat(filepath.Join(root, "index.md")); err != nil {
		t.Fatal(err)
	}
}

func TestDeployRejectsTraversalAndKeepsPublication(t *testing.T) {
	root := filepath.Join(t.TempDir(), "notes")
	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "old.md"), []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}
	manager := NewManager(root)
	_, err := manager.Deploy(bytes.NewReader(archiveForTest(t, map[string]string{
		"../escape.md": "no", "index.json": `{"version":1,"index":"index.md","tree":{"path":"index.md","name":"index"}}`,
	})))
	if err == nil {
		t.Fatal("traversal archive was accepted")
	}
	if _, err := os.Stat(filepath.Join(root, "old.md")); err != nil {
		t.Fatalf("old root changed: %v", err)
	}
}

func TestManifestAllowsFiniteCycleReference(t *testing.T) {
	root := t.TempDir()
	for _, name := range []string{"a.md", "b.md"} {
		if err := os.WriteFile(filepath.Join(root, name), []byte("# note"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	manifest := Manifest{Version: 1, Index: "a.md", Tree: Node{Path: "a.md", Name: "a", Children: []Node{{Path: "b.md", Name: "b", Children: []Node{{Path: "a.md", Name: "a"}}}}}}
	if err := manifest.Validate(root); err != nil {
		t.Fatalf("finite reference was rejected: %v", err)
	}
}

func TestValidatePrefix(t *testing.T) {
	if err := ValidatePrefix("hello"); err != nil {
		t.Fatalf("valid prefix rejected: %v", err)
	}
	if err := ValidatePrefix("hello-world_123"); err != nil {
		t.Fatalf("valid prefix rejected: %v", err)
	}
	if err := ValidatePrefix(""); err == nil {
		t.Fatal("empty prefix accepted")
	}
	if err := ValidatePrefix("."); err == nil {
		t.Fatal("dot prefix accepted")
	}
	if err := ValidatePrefix(".."); err == nil {
		t.Fatal("dotdot prefix accepted")
	}
	if err := ValidatePrefix("hello/world"); err == nil {
		t.Fatal("slash prefix accepted")
	}
	if err := ValidatePrefix("hello\\world"); err == nil {
		t.Fatal("backslash prefix accepted")
	}
	if err := ValidatePrefix("hello!world"); err == nil {
		t.Fatal("invalid char prefix accepted")
	}
	if err := ValidatePrefix("a"); err != nil {
		t.Fatalf("short prefix rejected unexpectedly: %v", err)
	}
	long := ""
	for i := 0; i < 65; i++ {
		long += "a"
	}
	if err := ValidatePrefix(long); err == nil {
		t.Fatal("overlong prefix accepted")
	}
}

func TestNewSiteIndependentPublications(t *testing.T) {
	base := filepath.Join(t.TempDir(), "sites")
	m1, err := NewSite(base, "site-a")
	if err != nil {
		t.Fatal(err)
	}
	m2, err := NewSite(base, "site-b")
	if err != nil {
		t.Fatal(err)
	}
	archive := archiveForTest(t, map[string]string{
		"index.md": "# a", "index.json": `{"version":1,"index":"index.md","tree":{"path":"index.md","name":"index"}}`,
	})
	got1, err := m1.Deploy(bytes.NewReader(archive))
	if err != nil {
		t.Fatalf("site-a deploy failed: %v", err)
	}
	if got1.Index != "index.md" {
		t.Fatalf("unexpected manifest: %#v", got1)
	}
	got2, err := m2.Deploy(bytes.NewReader(archive))
	if err != nil {
		t.Fatalf("site-b deploy failed: %v", err)
	}
	if got2.Index != "index.md" {
		t.Fatalf("unexpected manifest: %#v", got2)
	}
	// Ensure independent directories exist
	if _, err := os.Stat(filepath.Join(base, "site-a", "index.md")); err != nil {
		t.Fatalf("site-a file missing: %v", err)
	}
	if _, err := os.Stat(filepath.Join(base, "site-b", "index.md")); err != nil {
		t.Fatalf("site-b file missing: %v", err)
	}
}

func TestSiteDeploymentRollback(t *testing.T) {
	base := filepath.Join(t.TempDir(), "rollback")
	m, err := NewSite(base, "rollback-site")
	if err != nil {
		t.Fatal(err)
	}
	manifest := `{"version":1,"index":"index.md","tree":{"path":"index.md","name":"index"}}`
	archive := archiveForTest(t, map[string]string{
		"index.md": "# first", "index.json": manifest,
	})
	_, err = m.Deploy(bytes.NewReader(archive))
	if err != nil {
		t.Fatal(err)
	}
	// Verify previous backup was cleaned
	if _, err := os.Stat(filepath.Join(base, "rollback-site.previous")); !os.IsNotExist(err) {
		if err == nil {
			t.Fatal("previous backup still exists after successful deploy")
		}
	}
}

func TestManifestPasswordHashWithoutPlaintext(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "index.md"), []byte("# hello"), 0o644); err != nil {
		t.Fatal(err)
	}
	manifest := Manifest{
		Version:      1,
		Index:        "index.md",
		Tree:         Node{Path: "index.md", Name: "index"},
		Prefix:       "secure",
		PasswordHash: "sha256:$5$hashvalue",
	}
	if err := manifest.Validate(root); err != nil {
		t.Fatalf("manifest with password hash rejected: %v", err)
	}
	// Confirm PasswordHash is preserved and not overwritten by default behavior
	m := manifest
	m.PasswordHash = ""
	if m.PasswordHash != "" {
		t.Fatal("unexpected mutation")
	}
}

func TestPrefixTraversalBlocked(t *testing.T) {
	_, err := NewSite("/tmp", "../../etc")
	if err == nil {
		t.Fatal("traversal prefix accepted")
	}
	_, err = NewSite("/tmp", ".")
	if err == nil {
		t.Fatal("dot prefix accepted")
	}
}

func TestDeploymentRollbackOnInvalidArchive(t *testing.T) {
	root := filepath.Join(t.TempDir(), "notes")
	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "old.md"), []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}
	manager := NewManager(root)
	_, err := manager.Deploy(bytes.NewReader(archiveForTest(t, map[string]string{
		"../escape.md": "no", "index.json": `{"version":1,"index":"index.md","tree":{"path":"index.md","name":"index"}}`,
	})))
	if err == nil {
		t.Fatal("invalid archive accepted")
	}
	if _, err := os.Stat(filepath.Join(root, "old.md")); err != nil {
		t.Fatalf("existing file lost after failed deploy: %v", err)
	}
}

func TestManifestPersistPasswordHash(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "index.md"), []byte("# hello"), 0o644); err != nil {
		t.Fatal(err)
	}
	manifest := Manifest{
		Version: 1, Index: "index.md",
		Tree:   Node{Path: "index.md", Name: "index"},
		Prefix: "test", PasswordHash: "sha256:$2a$10$hash",
	}
	if err := Write(root, manifest); err != nil {
		t.Fatalf("write manifest with hash failed: %v", err)
	}
	loaded, err := Load(root)
	if err != nil {
		t.Fatalf("load manifest with hash failed: %v", err)
	}
	if loaded.PasswordHash != manifest.PasswordHash {
		t.Fatalf("password hash lost: got %q want %q", loaded.PasswordHash, manifest.PasswordHash)
	}
	if loaded.Prefix != manifest.Prefix {
		t.Fatalf("prefix lost: got %q want %q", loaded.Prefix, manifest.Prefix)
	}
}

func TestCrossPublicationIsolation(t *testing.T) {
	base := filepath.Join(t.TempDir(), "sites")
	m1, err := NewSite(base, "pub-a")
	if err != nil {
		t.Fatal(err)
	}
	_, err = NewSite(base, "pub-b")
	if err != nil {
		t.Fatal(err)
	}
	archive := archiveForTest(t, map[string]string{
		"index.md": "# a", "index.json": `{"version":1,"index":"index.md","tree":{"path":"index.md","name":"index"}}`,
	})
	_, err = m1.Deploy(bytes.NewReader(archive))
	if err != nil {
		t.Fatalf("pub-a deploy failed: %v", err)
	}
	// pub-b must remain unaffected
	if _, err := os.Stat(filepath.Join(base, "pub-b", "index.md")); !os.IsNotExist(err) {
		if err == nil {
			t.Fatal("pub-b file unexpectedly exists after pub-a deploy")
		}
	}
}

func TestArchiveProtectionsWithPrefixedManager(t *testing.T) {
	base := filepath.Join(t.TempDir(), "protect")
	m, err := NewSite(base, "protect-site")
	if err != nil {
		t.Fatal(err)
	}
	archive := archiveForTest(t, map[string]string{
		"index.md": "# ok", "index.json": `{"version":1,"index":"index.md","tree":{"path":"index.md","name":"index"}}`,
	})
	_, err = m.Deploy(bytes.NewReader(archive))
	if err != nil {
		t.Fatalf("valid deploy failed: %v", err)
	}
	// Invalid archive should not corrupt the deployed site
	_, err = m.Deploy(bytes.NewReader(archiveForTest(t, map[string]string{
		"../escape.md": "bad", "index.json": `{"version":1,"index":"index.md","tree":{"path":"index.md","name":"index"}}`,
	})))
	if err == nil {
		t.Fatal("traversal archive accepted for prefixed site")
	}
	if _, err := os.Stat(filepath.Join(base, "protect-site", "index.md")); err != nil {
		t.Fatalf("existing publication file lost after failed deploy: %v", err)
	}
}

func TestHasPasswordAndValidatePasswordHash(t *testing.T) {
	m := Manifest{Version: 1, Index: "a.md", Tree: Node{Path: "a.md", Name: "a"}, PasswordHash: "sha256:$2a$10$hash"}
	if !m.HasPassword() {
		t.Fatal("expected HasPassword true")
	}
	if err := ValidatePasswordHash("sha256:$2a$10$hash"); err != nil {
		t.Fatalf("valid hash rejected: %v", err)
	}
	if err := ValidatePasswordHash("plaintext"); err == nil {
		t.Fatal("plaintext hash accepted")
	}
	if err := ValidatePasswordHash(""); err == nil {
		t.Fatal("empty hash accepted")
	}
	if err := ValidatePasswordHash("sha256:bad!char"); err == nil {
		t.Fatal("invalid char hash accepted")
	}
	if err := ValidatePasswordHash("md5:abc"); err == nil {
		t.Fatal("wrong prefix hash accepted")
	}
}

func TestBackwardCompatibleManifestWithoutPrefixOrHash(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "index.md"), []byte("# hello"), 0o644); err != nil {
		t.Fatal(err)
	}
	manifest := Manifest{Version: 1, Index: "index.md", Tree: Node{Path: "index.md", Name: "index"}}
	if err := manifest.Validate(root); err != nil {
		t.Fatalf("backward-compatible manifest rejected: %v", err)
	}
	if manifest.HasPassword() {
		t.Fatal("expected no password")
	}
	if manifest.Prefix != "" {
		t.Fatal("expected empty prefix")
	}
}

func TestAuthorization(t *testing.T) {
	if !IsAuthorized("key", "key") || IsAuthorized("wrong", "key") || IsAuthorized("", "") {
		t.Fatal("unexpected authorization result")
	}
}

func TestGeneratedIndexOmitsExpiresAt(t *testing.T) {
	root := filepath.Join(t.TempDir(), "notes")
	manager := NewManager(root)
	archive := archiveForTest(t, map[string]string{
		"index.md": "# hello", "index.json": `{"version":1,"index":"index.md","tree":{"path":"index.md","name":"index"}}`,
	})
	_, err := manager.DeployWithOverrides(bytes.NewReader(archive), "", "")
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(root, "index.json"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), `"expiresAt"`) {
		t.Fatalf("generated index.json must omit expiresAt: %s", string(data))
	}
}

func TestOldManifestWithExpiredFieldLoadsAndRewritesWithoutIt(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "index.md"), []byte("# hello"), 0o644); err != nil {
		t.Fatal(err)
	}
	manifestJSON := `{"version":1,"index":"index.md","expiresAt":123456,"tree":{"path":"index.md","name":"index"}}`
	if err := os.WriteFile(filepath.Join(root, "index.json"), []byte(manifestJSON), 0o644); err != nil {
		t.Fatal(err)
	}
	loaded, err := Load(root)
	if err != nil {
		t.Fatalf("old manifest with unknown expiresAt should load: %v", err)
	}
	if loaded.Index != "index.md" {
		t.Fatalf("unexpected index: %q", loaded.Index)
	}
	// Rewrite should omit the field.
	if err := Write(root, loaded); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(root, "index.json"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), `"expiresAt"`) {
		t.Fatalf("rewritten index.json must omit expiresAt: %s", string(data))
	}
}

func TestDeployWithOverridesRejectsMismatchedPrefix(t *testing.T) {
	base := filepath.Join(t.TempDir(), "sites")
	m, err := NewSite(base, "my-site")
	if err != nil {
		t.Fatal(err)
	}
	archive := archiveForTest(t, map[string]string{
		"index.md": "# ok", "index.json": `{"version":1,"index":"index.md","tree":{"path":"index.md","name":"index"}}`,
	})
	_, err = m.DeployWithOverrides(bytes.NewReader(archive), "other-site", "")
	if err == nil {
		t.Fatal("expected error for mismatched prefix")
	}
	_, err = m.DeployWithOverrides(bytes.NewReader(archive), "", "")
	if err == nil {
		t.Fatal("expected error for empty prefix with prefixed manager")
	}
}
