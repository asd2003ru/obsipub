package expiry

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

const dbFileName = ".obsipub-expiry.sqlite3"

// DatabasePath returns the metadata path next to (rather than inside) root,
// so replacing the default publication directory cannot delete the database.
func DatabasePath(root string) string {
	base := filepath.Base(filepath.Clean(root))
	return filepath.Join(filepath.Dir(filepath.Clean(root)), "."+base+dbFileName)
}

type Store struct {
	db   *sql.DB
	root string
}

func OpenStore(root string) (*Store, error) {
	if err := os.MkdirAll(root, 0755); err != nil {
		return nil, fmt.Errorf("create expiry root: %w", err)
	}
	dbPath := DatabasePath(root)
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open expiry sqlite: %w", err)
	}
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping expiry sqlite: %w", err)
	}
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS publications (
		prefix TEXT PRIMARY KEY,
		expires_at INTEGER
	)`)
	if err != nil {
		return nil, fmt.Errorf("create expiry table: %w", err)
	}
	return &Store{db: db, root: root}, nil
}

func (s *Store) Close() error {
	if s.db != nil {
		return s.db.Close()
	}
	return nil
}

func (s *Store) SetExpiry(prefix string, expiresAt time.Time) error {
	_, err := s.db.Exec(`INSERT OR REPLACE INTO publications (prefix, expires_at) VALUES (?, ?)`,
		prefix, expiresAt.Unix())
	return err
}

func (s *Store) GetExpiry(prefix string) (time.Time, bool, error) {
	var ts sql.NullInt64
	err := s.db.QueryRow(`SELECT expires_at FROM publications WHERE prefix = ?`, prefix).Scan(&ts)
	if err == sql.ErrNoRows {
		return time.Time{}, false, nil
	}
	if err != nil {
		return time.Time{}, false, err
	}
	if !ts.Valid || ts.Int64 == 0 {
		return time.Time{}, false, nil
	}
	return time.Unix(ts.Int64, 0), true, nil
}

func (s *Store) DeleteExpiry(prefix string) error {
	_, err := s.db.Exec(`DELETE FROM publications WHERE prefix = ?`, prefix)
	return err
}

func (s *Store) ListExpiredBefore(now time.Time) ([]string, error) {
	rows, err := s.db.Query(`SELECT prefix FROM publications WHERE expires_at > 0 AND expires_at < ?`, now.Unix())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var prefixes []string
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			continue
		}
		prefixes = append(prefixes, p)
	}
	return prefixes, rows.Err()
}

func (s *Store) RemoveRow(prefix string) error {
	_, err := s.db.Exec(`DELETE FROM publications WHERE prefix = ?`, prefix)
	return err
}
