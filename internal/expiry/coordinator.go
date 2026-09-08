package expiry

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type Coordinator struct {
	mu          sync.RWMutex
	operationMu sync.Mutex
	store       *Store
	root        string
}

// WithPrefix serializes a publication mutation with expiry checks and janitor
// cleanup for the selected prefix.
func (c *Coordinator) WithPrefix(prefix string, fn func() error) error {
	c.operationMu.Lock()
	defer c.operationMu.Unlock()
	return fn()
}

func NewCoordinator(root string) (*Coordinator, error) {
	store, err := OpenStore(root)
	if err != nil {
		return nil, err
	}
	return &Coordinator{store: store, root: root}, nil
}

func (c *Coordinator) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.store.Close()
}

func (c *Coordinator) SetExpiry(prefix string, expiresAt time.Time) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.store.SetExpiry(prefix, expiresAt)
}

func (c *Coordinator) DeleteExpiry(prefix string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.store.DeleteExpiry(prefix)
}

func (c *Coordinator) GetExpiry(prefix string) (time.Time, bool, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.store.GetExpiry(prefix)
}

func (c *Coordinator) IsExpired(prefix string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	expiresAt, ok, err := c.store.GetExpiry(prefix)
	if err != nil || !ok {
		return false
	}
	return !expiresAt.IsZero() && time.Now().UTC().After(expiresAt)
}

func (c *Coordinator) RemoveExpiredBefore(now time.Time) error {
	_, err := c.RemoveExpiredBeforeWithCount(now)
	return err
}

// RemoveExpiredBeforeWithCount removes expired publications and reports how many were removed.
func (c *Coordinator) RemoveExpiredBeforeWithCount(now time.Time) (int, error) {
	c.operationMu.Lock()
	defer c.operationMu.Unlock()
	c.mu.Lock()
	defer c.mu.Unlock()
	prefixes, err := c.store.ListExpiredBefore(now)
	if err != nil {
		return 0, err
	}
	for _, p := range prefixes {
		_ = c.removePhysical(p)
		_ = c.store.RemoveRow(p)
	}
	return len(prefixes), nil
}

func (c *Coordinator) CheckAndRemove(prefix string) bool {
	c.operationMu.Lock()
	defer c.operationMu.Unlock()
	c.mu.Lock()
	defer c.mu.Unlock()
	expiresAt, ok, err := c.store.GetExpiry(prefix)
	if err != nil || !ok || expiresAt.IsZero() {
		return false
	}
	if time.Now().UTC().After(expiresAt) {
		_ = c.removePhysical(prefix)
		// Keep the expired marker until the janitor removes it. This lets a
		// second request in the same process still return 404 after the
		// publication directory has already been removed, rather than
		// mistaking it for a never-published prefix.
		return true
	}
	return false
}

func (c *Coordinator) Delete(prefix string) error {
	c.operationMu.Lock()
	defer c.operationMu.Unlock()
	c.mu.Lock()
	defer c.mu.Unlock()
	_ = c.removePhysical(prefix)
	return c.store.RemoveRow(prefix)
}

func (c *Coordinator) removePhysical(prefix string) error {
	if prefix == "" {
		return c.removeRootPublication()
	}
	pubRoot := c.root
	pubRoot = filepath.Join(c.root, prefix)
	_ = os.RemoveAll(pubRoot)
	previous := pubRoot + ".previous"
	_ = os.Remove(previous)
	return nil
}

// removeRootPublication removes only the root publication. Prefixed sites are
// stored as sibling directories and must survive root deletion.
func (c *Coordinator) removeRootPublication() error {
	entries, err := os.ReadDir(c.root)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	hasPrefixedSites := false
	for _, entry := range entries {
		preserve := false
		if entry.IsDir() {
			manifest, readErr := os.ReadFile(filepath.Join(c.root, entry.Name(), "index.json"))
			var meta struct {
				Prefix string `json:"prefix"`
			}
			preserve = readErr == nil && json.Unmarshal(manifest, &meta) == nil && meta.Prefix == entry.Name()
		}
		if preserve {
			hasPrefixedSites = true
			continue
		}
		_ = os.RemoveAll(filepath.Join(c.root, entry.Name()))
	}
	if !hasPrefixedSites {
		_ = os.Remove(c.root)
	}
	_ = os.RemoveAll(c.root + ".previous")
	return nil
}
