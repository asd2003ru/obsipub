package files

import (
	"path/filepath"
	"strings"
)

// MaxSearchResults bounds the response size for publication note roots.
const MaxSearchResults = 50

// SearchResult is safe metadata for a matching Markdown note.
type SearchResult struct {
	Path  string   `json:"path"`
	Name  string   `json:"name"`
	Title string   `json:"title"`
	Tags  []string `json:"tags"`
}

// Search finds Markdown notes whose relative path, display name, title, or
// content contains query, case-insensitively. Results are path-sorted and
// bounded so neither file contents nor absolute paths are exposed.
func (s *Store) Search(query string) ([]SearchResult, error) {
	needle := strings.ToLower(strings.TrimSpace(query))
	if needle == "" {
		return []SearchResult{}, nil
	}

	paths, err := s.markdownPaths()
	if err != nil {
		return nil, err
	}
	results := make([]SearchResult, 0, min(len(paths), MaxSearchResults))
	for _, path := range paths {
		body, err := s.ReadMarkdown(path)
		if err != nil {
			return nil, err
		}
		name := strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
		title, tags := markdownTitleAndTags(body)
		if title == "" {
			title = name
		}
		tagsStr := strings.Join(tags, " ")
		if !strings.Contains(strings.ToLower(path), needle) &&
			!strings.Contains(strings.ToLower(name), needle) &&
			!strings.Contains(strings.ToLower(title), needle) &&
			!strings.Contains(strings.ToLower(tagsStr), needle) &&
			!strings.Contains(strings.ToLower(body), needle) {
			continue
		}
		results = append(results, SearchResult{Path: path, Name: name, Title: title, Tags: tags})
		if len(results) == MaxSearchResults {
			break
		}
	}
	return results, nil
}

func markdownTitleAndTags(markdown string) (string, []string) {
	frontMatter, rest := splitFrontMatter(markdown)
	title, tags := parseFrontMatter(frontMatter)
	if title != "" {
		return title, tags
	}
	// Fallback to first heading
	title = extractFirstHeading(rest)
	if title == "" {
		title = ""
	}
	return title, tags
}

func splitFrontMatter(source string) (string, string) {
	lines := strings.Split(source, "\n")
	if len(lines) == 0 || strings.TrimSpace(lines[0]) != "---" {
		return "", source
	}
	for i := 1; i < len(lines); i++ {
		if strings.TrimSpace(lines[i]) == "---" || strings.TrimSpace(lines[i]) == "..." {
			return strings.Join(lines[1:i], "\n"), strings.Join(lines[i+1:], "\n")
		}
	}
	return "", source
}

func parseFrontMatter(front string) (string, []string) {
	var title string
	var tags []string
	lines := strings.Split(front, "\n")
	inTags := false
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || trimmed == "---" {
			continue
		}
		if inTags {
			if strings.HasPrefix(trimmed, "- ") {
				tags = append(tags, strings.TrimSpace(trimmed[2:]))
			} else {
				inTags = false
				// process as regular line
				continue
			}
			continue
		}
		if strings.HasPrefix(trimmed, "tags:") {
			val := strings.TrimSpace(strings.TrimPrefix(trimmed, "tags:"))
			if val != "" {
				if strings.HasPrefix(val, "[") && strings.HasSuffix(val, "]") {
					inner := val[1 : len(val)-1]
					parts := strings.Split(inner, ",")
					for _, p := range parts {
						t := strings.TrimSpace(p)
						if t != "" {
							tags = append(tags, t)
						}
					}
				} else {
					// single tag or space-separated? treat as array with single item
					tags = append(tags, val)
				}
			} else {
				inTags = true
			}
			continue
		}
		if strings.HasPrefix(trimmed, "title:") {
			title = strings.TrimSpace(strings.TrimPrefix(trimmed, "title:"))
			continue
		}
	}
	return title, tags
}

func extractFirstHeading(source string) string {
	for _, line := range strings.Split(source, "\n") {
		trimmed := strings.TrimSpace(line)
		if !strings.HasPrefix(trimmed, "#") {
			continue
		}
		title := strings.TrimSpace(strings.TrimLeft(trimmed, "#"))
		if title != "" {
			return strings.TrimRight(title, "# ")
		}
	}
	return ""
}
