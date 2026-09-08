package expiry

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestStoreSetAndGet(t *testing.T) {
	root := filepath.Join(t.TempDir(), "store-test")
	os.MkdirAll(root, 0755)
	s, err := OpenStore(root)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if _, err := os.Stat(DatabasePath(root)); err != nil {
		t.Fatalf("expiry database was not created beside root: %v", err)
	}

	if _, ok, err := s.GetExpiry("test"); err != nil || ok {
		t.Errorf("expected no entry: %v %v", ok, err)
	}

	expires := time.Now().UTC().Add(1 * time.Hour)
	if err := s.SetExpiry("test", expires); err != nil {
		t.Fatal(err)
	}

	got, ok, err := s.GetExpiry("test")
	if err != nil || !ok {
		t.Fatal(err)
	}
	if got.Sub(expires).Abs() > time.Minute {
		t.Errorf("expiry mismatch: got %v want %v", got, expires)
	}

	if err := s.DeleteExpiry("test"); err != nil {
		t.Fatal(err)
	}
	_, ok, err = s.GetExpiry("test")
	if ok || err != nil {
		t.Errorf("expected deleted entry to be missing: %v %v", ok, err)
	}
}

func TestCoordinatorRemovesExpiredDefaultPublication(t *testing.T) {
	root := filepath.Join(t.TempDir(), "notes")
	if err := os.MkdirAll(root, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "index.json"), []byte(`{}`), 0644); err != nil {
		t.Fatal(err)
	}
	c, err := NewCoordinator(root)
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	if err := c.SetExpiry("", time.Now().UTC().Add(-time.Minute)); err != nil {
		t.Fatal(err)
	}
	if !c.CheckAndRemove("") {
		t.Fatal("expected default publication to expire")
	}
	if _, err := os.Stat(root); !os.IsNotExist(err) {
		t.Fatalf("expected default publication directory to be removed, stat error: %v", err)
	}
}

func TestCoordinatorRootDeletePreservesPrefixedPublication(t *testing.T) {
	root := filepath.Join(t.TempDir(), "notes")
	if err := os.MkdirAll(filepath.Join(root, "yaya"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "index.json"), []byte(`{}`), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "yaya", "index.json"), []byte(`{"prefix":"yaya"}`), 0644); err != nil {
		t.Fatal(err)
	}
	c, err := NewCoordinator(root)
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	if err := c.Delete(""); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, "yaya", "index.json")); err != nil {
		t.Fatalf("prefixed publication was deleted with root: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "index.json")); !os.IsNotExist(err) {
		t.Fatalf("root publication was not deleted, stat error: %v", err)
	}
}
