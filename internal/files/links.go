package files

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// LinkRef is a visible Markdown note connected to another note.
type LinkRef struct {
	Path      string    `json:"path"`
	Name      string    `json:"name"`
	Children  []LinkRef `json:"children,omitempty"`
	Truncated bool      `json:"truncated,omitempty"`
}

var (
	wikiLinkPattern     = regexp.MustCompile(`\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]`)
	markdownLinkPattern = regexp.MustCompile(`\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)`)
)

// Links builds an acyclic outgoing Markdown dependency tree for notePath.
// Attachments and embeds are intentionally excluded from the navigation tree.
func (s *Store) Links(notePath string, maxDepth int) (LinkRef, error) {
	if _, err := s.ReadMarkdown(notePath); err != nil {
		return LinkRef{}, err
	}
	current, err := s.normalizedMarkdownPath(notePath)
	if err != nil {
		return LinkRef{}, err
	}

	notes, err := s.markdownPaths()
	if err != nil {
		return LinkRef{}, err
	}
	exists := make(map[string]struct{}, len(notes))
	for _, path := range notes {
		exists[path] = struct{}{}
	}

	outgoing := make(map[string][]string, len(notes))
	basenameMap := make(map[string][]string, len(notes))
	for _, path := range notes {
		base := filepath.Base(path)
		basenameMap[base] = append(basenameMap[base], path)
	}
	for _, source := range notes {
		body, err := s.ReadMarkdown(source)
		if err != nil {
			return LinkRef{}, err
		}
		for _, target := range extractNoteTargets(body, source, basenameMap) {
			if _, ok := exists[target]; !ok || target == source {
				continue
			}
			outgoing[source] = append(outgoing[source], target)
		}
	}

	return LinkRef{
		Path:     current,
		Name:     strings.TrimSuffix(filepath.Base(current), filepath.Ext(current)),
		Children: buildLinkTree(current, outgoing, maxDepth),
	}, nil
}

func (s *Store) markdownPaths() ([]string, error) {
	paths := []string{}
	var visit func(string, string) error
	visit = func(absDir, relDir string) error {
		entries, err := os.ReadDir(absDir)
		if err != nil {
			return err
		}
		for _, entry := range entries {
			if strings.HasPrefix(entry.Name(), ".") {
				continue
			}
			rel := filepath.ToSlash(filepath.Join(relDir, entry.Name()))
			if entry.IsDir() {
				if err := visit(filepath.Join(absDir, entry.Name()), rel); err != nil {
					return err
				}
				continue
			}
			// Excalidraw stores drawings in .excalidraw.md files. They are
			// renderable attachments, not navigation articles.
			if strings.EqualFold(filepath.Ext(entry.Name()), ".md") && !strings.HasSuffix(strings.ToLower(entry.Name()), ".excalidraw.md") {
				paths = append(paths, rel)
			}
		}
		return nil
	}
	if err := visit(s.Root, ""); err != nil {
		if os.IsNotExist(err) {
			return paths, nil
		}
		return nil, err
	}
	sort.Strings(paths)
	return paths, nil
}

func (s *Store) normalizedMarkdownPath(path string) (string, error) {
	full, err := s.Resolve(path)
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(s.Root, full)
	if err != nil {
		return "", err
	}
	return filepath.ToSlash(rel), nil
}

func extractNoteTargets(markdown, source string, basenameMap map[string][]string) []string {
	// Fenced blocks are code, not note content, so links in them are ignored.
	markdown = stripFencedCode(markdown)
	targets := make(map[string]struct{})
	for _, match := range wikiLinkPattern.FindAllStringSubmatchIndex(markdown, -1) {
		if match[0] > 0 && markdown[match[0]-1] == '!' {
			continue // embeds are not navigation nodes
		}
		addResolvedTarget(targets, markdown[match[2]:match[3]], source, basenameMap)
	}
	for _, match := range markdownLinkPattern.FindAllStringSubmatchIndex(markdown, -1) {
		if match[0] > 0 && markdown[match[0]-1] == '!' {
			continue // images are not navigation nodes
		}
		addResolvedTarget(targets, markdown[match[2]:match[3]], source, basenameMap)
	}
	result := make([]string, 0, len(targets))
	for target := range targets {
		result = append(result, target)
	}
	sort.Strings(result)
	return result
}

func stripFencedCode(markdown string) string {
	lines := strings.Split(markdown, "\n")
	inFence := false
	for i, line := range lines {
		if strings.HasPrefix(strings.TrimSpace(line), "```") {
			inFence = !inFence
			lines[i] = ""
			continue
		}
		if inFence {
			lines[i] = ""
		}
	}
	return strings.Join(lines, "\n")
}

func addResolvedTarget(targets map[string]struct{}, raw, source string, basenameMap map[string][]string) {
	target := strings.TrimSpace(raw)
	target = strings.SplitN(target, "#", 2)[0]
	target = strings.SplitN(target, "?", 2)[0]
	if target == "" || isExternalTarget(target) {
		return
	}

	// Match Obsidian's resolution order: the source directory, vault root, then
	// an unambiguous bare filename elsewhere in the vault. Each link resolves to
	// one canonical target, so a qualified path cannot add an unrelated basename.
	for _, base := range []string{filepath.Dir(source), ""} {
		for _, candidate := range notePathCandidates(base, target) {
			if _, ok := basenameMap[filepath.Base(candidate)]; ok && containsPath(basenameMap[filepath.Base(candidate)], candidate) {
				targets[candidate] = struct{}{}
				return
			}
		}
	}
	if !strings.ContainsAny(target, "/\\") {
		for _, candidate := range notePathCandidates("", target) {
			matches := basenameMap[filepath.Base(candidate)]
			if len(matches) == 1 {
				targets[matches[0]] = struct{}{}
			}
		}
	}
}

func notePathCandidates(base, raw string) []string {
	if strings.HasPrefix(raw, "/") {
		base = ""
		raw = strings.TrimPrefix(raw, "/")
	}
	candidate := filepath.Clean(filepath.Join(base, filepath.FromSlash(raw)))
	if filepath.IsAbs(candidate) || candidate == ".." || strings.HasPrefix(candidate, ".."+string(filepath.Separator)) {
		return nil
	}
	if filepath.Ext(candidate) == "" {
		candidate += ".md"
	}
	if !strings.EqualFold(filepath.Ext(candidate), ".md") {
		return nil
	}
	return []string{filepath.ToSlash(candidate)}
}

func containsPath(paths []string, candidate string) bool {
	for _, path := range paths {
		if path == candidate {
			return true
		}
	}
	return false
}

func isExternalTarget(target string) bool {
	lower := strings.ToLower(target)
	return strings.Contains(lower, "://") || strings.HasPrefix(lower, "mailto:") || strings.HasPrefix(lower, "tel:") || strings.HasPrefix(lower, "data:")
}

func hasVisibleChild(source string, edges map[string][]string, ancestors, seen map[string]bool) bool {
	for _, target := range edges[source] {
		if !ancestors[target] && !seen[target] {
			return true
		}
	}
	return false
}

// buildLinkTree creates an acyclic visual tree rooted at the requested note.
// A tree-wide seen set prevents a note from appearing under multiple parents,
// while the ancestor set also blocks cycles back to the current branch.
func buildLinkTree(root string, edges map[string][]string, maxDepth int) []LinkRef {
	seen := map[string]bool{root: true}
	return buildLinkChildren(root, edges, maxDepth, map[string]bool{root: true}, seen)
}

func buildLinkChildren(source string, edges map[string][]string, remaining int, ancestors map[string]bool, seen map[string]bool) []LinkRef {
	unique := make(map[string]struct{})
	for _, target := range edges[source] {
		if !ancestors[target] && !seen[target] {
			unique[target] = struct{}{}
		}
	}
	paths := make([]string, 0, len(unique))
	for path := range unique {
		paths = append(paths, path)
	}
	sort.Strings(paths)

	// Add all current-level paths to the global seen set before recursing,
	// so nested branches don't repeat files that appear as siblings.
	for _, path := range paths {
		seen[path] = true
	}

	children := make([]LinkRef, 0, len(paths))
	for _, path := range paths {
		node := LinkRef{
			Path: path,
			Name: strings.TrimSuffix(filepath.Base(path), filepath.Ext(path)),
		}
		nextAncestors := make(map[string]bool, len(ancestors)+1)
		for ancestor := range ancestors {
			nextAncestors[ancestor] = true
		}
		nextAncestors[path] = true
		if remaining > 1 {
			node.Children = buildLinkChildren(path, edges, remaining-1, nextAncestors, seen)
		} else {
			node.Truncated = hasVisibleChild(path, edges, nextAncestors, seen)
		}
		children = append(children, node)
	}
	return children
}
