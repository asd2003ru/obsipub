package files

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSearchMatchesPathTitleAndContent(t *testing.T) {
	root := t.TempDir()
	writeSearchNote(t, root, "guides/Install.md", "# Быстрая установка\nТекст заметки")
	writeSearchNote(t, root, "reference.md", "# Справочник\nУпоминается Zoxide")
	writeSearchNote(t, root, ".hidden.md", "# Hidden\nsecret")
	store, err := NewStore(root)
	if err != nil {
		t.Fatal(err)
	}

	for _, test := range []struct {
		query string
		path  string
		title string
	}{
		{"INSTALL", "guides/Install.md", "Быстрая установка"},
		{"справочник", "reference.md", "Справочник"},
		{"zOxIdE", "reference.md", "Справочник"},
	} {
		results, err := store.Search(test.query)
		if err != nil {
			t.Fatalf("Search(%q): %v", test.query, err)
		}
		if len(results) != 1 || results[0].Path != test.path || results[0].Title != test.title {
			t.Fatalf("Search(%q) = %#v", test.query, results)
		}
	}

	results, err := store.Search("secret")
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 0 {
		t.Fatalf("hidden note leaked into search: %#v", results)
	}
}

func TestSearchReturnsEmptyForBlankQueryAndBoundsResults(t *testing.T) {
	root := t.TempDir()
	for i := 0; i < MaxSearchResults+3; i++ {
		writeSearchNote(t, root, filepath.Join("notes", string(rune('a'+i))+".md"), "matching text")
	}
	store, err := NewStore(root)
	if err != nil {
		t.Fatal(err)
	}

	empty, err := store.Search("  ")
	if err != nil || len(empty) != 0 {
		t.Fatalf("blank Search() = %#v, %v", empty, err)
	}
	results, err := store.Search("matching")
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != MaxSearchResults {
		t.Fatalf("result count = %d, want %d", len(results), MaxSearchResults)
	}
}

func TestRawPathFromResolvesVaultWideObsidianEmbeds(t *testing.T) {
	root := t.TempDir()
	writeSearchNote(t, root, "WiKi/MTS-HC-001/start.md", "# start")
	writeSearchNote(t, root, "_resources/picture.jpeg", "image")
	writeSearchNote(t, root, "Excalidraw/diagram.excalidraw.md", `{"elements":[]}`)
	store, err := NewStore(root)
	if err != nil {
		t.Fatal(err)
	}

	for requested, want := range map[string]string{
		"_resources/picture.jpeg": "_resources/picture.jpeg",
		"diagram.excalidraw":      "Excalidraw/diagram.excalidraw.md",
	} {
		full, err := store.RawPathFrom(requested, "WiKi/MTS-HC-001/start.md")
		if err != nil {
			t.Fatalf("RawPathFrom(%q) error = %v", requested, err)
		}
		rel, err := filepath.Rel(root, full)
		if err != nil || filepath.ToSlash(rel) != want {
			t.Errorf("RawPathFrom(%q) = %q, want %q", requested, rel, want)
		}
	}
}

func writeSearchNote(t *testing.T, root, rel, body string) {
	t.Helper()
	path := filepath.Join(root, rel)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}
