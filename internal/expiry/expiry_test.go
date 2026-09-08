package expiry

import (
	"testing"
	"time"
)

func TestValidateTTL(t *testing.T) {
	if err := ValidateTTL(60); err != nil {
		t.Errorf("expected 60 to be valid: %v", err)
	}
	if err := ValidateTTL(86400); err != nil {
		t.Errorf("expected 86400 to be valid: %v", err)
	}
	if err := ValidateTTL(59); err == nil {
		t.Errorf("expected 59 to be rejected")
	}
	if err := ValidateTTL(86401); err == nil {
		t.Errorf("expected 86401 to be rejected")
	}
}

func TestValidateExpiresAt(t *testing.T) {
	_, err := ValidateExpiresAt("2026-09-08T12:00:00Z")
	if err != nil {
		t.Errorf("valid RFC3339 rejected: %v", err)
	}
	_, err = ValidateExpiresAt("not a timestamp")
	if err == nil {
		t.Errorf("expected invalid timestamp to be rejected")
	}
	_, err = ValidateExpiresAt("2000-01-01T00:00:00Z")
	if err == nil {
		t.Errorf("expected past timestamp to be rejected")
	}
}

func TestParseHeaders(t *testing.T) {
	expires, has, err := ParseHeaders("300", "")
	if err != nil || !has {
		t.Errorf("expected TTL header to parse: %v %v", has, err)
	}
	if expires.Unix() < time.Now().Unix() {
		t.Errorf("expected future expiry")
	}

	_, _, err = ParseHeaders("300", "2026-09-08T12:00:00Z")
	if err == nil {
		t.Errorf("expected conflicting headers to be rejected")
	}

	_, has, err = ParseHeaders("", "")
	if err != nil || has {
		t.Errorf("expected no headers to return no expiry")
	}
	if _, _, err = ParseHeaders("300seconds", ""); err == nil {
		t.Errorf("expected malformed TTL to be rejected")
	}
}
