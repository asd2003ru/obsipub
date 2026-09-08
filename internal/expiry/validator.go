package expiry

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

func ValidateTTL(seconds int) error {
	if seconds < 60 || seconds > 86400 {
		return fmt.Errorf("TTL must be between 60 and 86400 seconds, got %d", seconds)
	}
	return nil
}

func ValidateExpiresAt(value string) (time.Time, error) {
	if value == "" {
		return time.Time{}, fmt.Errorf("Expires-At value is empty")
	}
	t, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return time.Time{}, fmt.Errorf("invalid RFC3339 timestamp %q: %w", value, err)
	}
	if !t.After(time.Now().UTC()) {
		return time.Time{}, fmt.Errorf("Expires-At %q is in the past", value)
	}
	return t.UTC(), nil
}

func ParseHeaders(ttlHeader, expiresHeader string) (time.Time, bool, error) {
	if ttlHeader != "" && expiresHeader != "" {
		return time.Time{}, false, fmt.Errorf("conflicting expiry headers: both X-ObsiPub-TTL and X-ObsiPub-Expires-At provided")
	}
	if ttlHeader != "" {
		s := strings.TrimSpace(ttlHeader)
		seconds, err := strconv.Atoi(s)
		if err != nil {
			return time.Time{}, false, fmt.Errorf("invalid X-ObsiPub-TTL %q: %w", s, err)
		}
		if err := ValidateTTL(seconds); err != nil {
			return time.Time{}, false, err
		}
		expiresAt := time.Now().UTC().Add(time.Duration(seconds) * time.Second)
		return expiresAt, true, nil
	}
	if expiresHeader != "" {
		t, err := ValidateExpiresAt(strings.TrimSpace(expiresHeader))
		if err != nil {
			return time.Time{}, false, err
		}
		return t, true, nil
	}
	return time.Time{}, false, nil
}
