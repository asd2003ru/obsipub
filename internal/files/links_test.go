package files

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLinksBuildsRootedTreeWithoutDuplicates(t *testing.T) {
	root := t.TempDir()
	writeLinkNote(t, root, "index.md", "[[alpha]]\n[[beta]]\n[[alpha]]")
	writeLinkNote(t, root, "alpha.md", "[[shared]]\n[[index]]")
	writeLinkNote(t, root, "beta.md", "[[shared]]")
	writeLinkNote(t, root, "shared.md", "")

	store, err := NewStore(root)
	if err != nil {
		t.Fatal(err)
	}
	graph, err := store.Links("index.md", 4)
	if err != nil {
		t.Fatal(err)
	}

	if graph.Path != "index.md" || graph.Name != "index" {
		t.Fatalf("root = %#v, want index.md/index", graph)
	}
	if len(graph.Children) != 2 {
		t.Fatalf("root children = %#v, want alpha and beta", graph.Children)
	}
	if graph.Children[0].Path != "alpha.md" || graph.Children[1].Path != "beta.md" {
		t.Fatalf("root child paths = %#v", graph.Children)
	}
	if len(graph.Children[0].Children) != 1 || graph.Children[0].Children[0].Path != "shared.md" {
		t.Fatalf("alpha subtree = %#v, want shared.md", graph.Children[0])
	}
	if len(graph.Children[1].Children) != 0 {
		t.Fatalf("beta should not duplicate shared.md: %#v", graph.Children[1])
	}
	if countLinkPath(graph, "index.md") != 1 || countLinkPath(graph, "shared.md") != 1 {
		t.Fatalf("tree contains a duplicate or cycle: %#v", graph)
	}
}

func TestLinksResolveLocallyThenRootWithoutBasenameDuplicates(t *testing.T) {
	root := t.TempDir()
	writeLinkNote(t, root, "docs/start.md", "[[next]]\n[[shared/item]]")
	writeLinkNote(t, root, "docs/next.md", "")
	writeLinkNote(t, root, "next.md", "")
	writeLinkNote(t, root, "shared/item.md", "")
	writeLinkNote(t, root, "other/item.md", "")

	store, err := NewStore(root)
	if err != nil {
		t.Fatal(err)
	}
	graph, err := store.Links("docs/start.md", 2)
	if err != nil {
		t.Fatal(err)
	}

	if len(graph.Children) != 2 {
		t.Fatalf("children = %#v, want two canonical targets", graph.Children)
	}
	if graph.Children[0].Path != "docs/next.md" || graph.Children[1].Path != "shared/item.md" {
		t.Fatalf("resolved paths = %#v, want local next and qualified shared item", graph.Children)
	}
	if countLinkPath(graph, "next.md") != 0 || countLinkPath(graph, "other/item.md") != 0 {
		t.Fatalf("tree contains an unrelated basename match: %#v", graph)
	}
}

func TestLinksRecognizeAdjacentLinksAndExcludeEmbeds(t *testing.T) {
	root := t.TempDir()
	writeLinkNote(t, root, "index.md", "[[first]][[second]] ![[embedded]]")
	writeLinkNote(t, root, "first.md", "")
	writeLinkNote(t, root, "second.md", "")
	writeLinkNote(t, root, "embedded.md", "")

	store, err := NewStore(root)
	if err != nil {
		t.Fatal(err)
	}
	graph, err := store.Links("index.md", 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(graph.Children) != 2 || graph.Children[0].Path != "first.md" || graph.Children[1].Path != "second.md" {
		t.Fatalf("adjacent links = %#v, want first and second only", graph.Children)
	}
}

func TestLinksExcludeExcalidrawDocuments(t *testing.T) {
	root := t.TempDir()
	writeLinkNote(t, root, "index.md", "[[article]]\n[[drawing.excalidraw]]")
	writeLinkNote(t, root, "article.md", "")
	writeLinkNote(t, root, "drawing.excalidraw.md", "")
	store, err := NewStore(root)
	if err != nil {
		t.Fatal(err)
	}
	graph, err := store.Links("index.md", 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(graph.Children) != 1 || graph.Children[0].Path != "article.md" {
		t.Fatalf("tree exposes drawing: %#v", graph.Children)
	}
}

func countLinkPath(node LinkRef, path string) int {
	count := 0
	if node.Path == path {
		count++
	}
	for _, child := range node.Children {
		count += countLinkPath(child, path)
	}
	return count
}

func writeLinkNote(t *testing.T, root, path, body string) {
	t.Helper()
	fullPath := filepath.Join(root, path)
	if err := os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(fullPath, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}
