package server

import (
	"database/sql"
	"os"
	"path/filepath"

	"github.com/asd2003ru/obsipub/internal/expiry"
	"github.com/asd2003ru/obsipub/internal/publish"
)

func listPublications(root string, coordinator *expiry.Coordinator) []map[string]interface{} {
	var results []map[string]interface{}
	// Root/default publication
	if manifest, ready := publish.NewManager(root).State(); ready {
		expiresAt, ok, err := coordinator.GetExpiry("")
		if err != nil || ok {
			if ok && !expiresAt.IsZero() {
				results = append(results, map[string]interface{}{
					"prefix":    "",
					"index":     manifest.Index,
					"protected": manifest.HasPassword(),
					"expiresAt": expiresAt.Unix(),
				})
			} else {
				results = append(results, map[string]interface{}{
					"prefix":    "",
					"index":     manifest.Index,
					"protected": manifest.HasPassword(),
					"expiresAt": nil,
				})
			}
		} else {
			results = append(results, map[string]interface{}{
				"prefix":    "",
				"index":     manifest.Index,
				"protected": manifest.HasPassword(),
				"expiresAt": nil,
			})
		}
	}
	// Prefixed publications
	entries, err := os.ReadDir(root)
	if err == nil {
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			prefix := entry.Name()
			if prefix == "." || prefix == ".." {
				continue
			}
			if err := publish.ValidatePrefix(prefix); err != nil {
				continue
			}
			manager, err := publish.NewSite(root, prefix)
			if err != nil {
				continue
			}
			manifest, ready := manager.State()
			if !ready {
				continue
			}
			expiresAt, ok, err := coordinator.GetExpiry(prefix)
			if err != nil {
				ok = false
			}
			r := map[string]interface{}{
				"prefix":    prefix,
				"index":     manifest.Index,
				"protected": manifest.HasPassword(),
				"expiresAt": nil,
			}
			if ok && !expiresAt.IsZero() {
				r["expiresAt"] = expiresAt.Unix()
			}
			results = append(results, r)
		}
	}
	return results
}
func cleanStaleExpiryRows(root string, coordinator *expiry.Coordinator) {
	entries, err := os.ReadDir(root)
	if err != nil {
		return
	}
	validPrefixes := make(map[string]bool)
	validPrefixes[""] = true
	for _, entry := range entries {
		if entry.IsDir() {
			name := entry.Name()
			if name != "." && name != ".." {
				if err := publish.ValidatePrefix(name); err == nil {
					validPrefixes[name] = true
				}
			}
		}
	}
	// Check root manifest
	if _, err := os.Stat(filepath.Join(root, publish.ManifestName)); err == nil {
		validPrefixes[""] = true
	} else {
		delete(validPrefixes, "")
	}
	// Get all stored prefixes from coordinator store
	// We'll iterate through SQLite rows by opening the DB directly for simplicity.
	dbPath := expiry.DatabasePath(root)
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return
	}
	defer db.Close()
	rows, err := db.Query(`SELECT prefix FROM publications`)
	if err != nil {
		return
	}
	defer rows.Close()
	var stale []string
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			continue
		}
		if !validPrefixes[p] {
			stale = append(stale, p)
		}
	}
	rows.Close()
	for _, p := range stale {
		_ = coordinator.Delete(p)
	}
}
