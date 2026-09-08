package server

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"

	"github.com/asd2003ru/obsipub/internal/publish"
)

type authStatusResponse struct {
	Ready         bool `json:"ready"`
	Protected     bool `json:"protected"`
	Authenticated bool `json:"authenticated"`
}

type authRequest struct {
	Password string `json:"password"`
}

const authCookieName = "obsipub_auth"

type authSigner struct{ key []byte }

func newAuthSigner(apiKey string) (*authSigner, error) {
	if apiKey != "" {
		digest := sha256.Sum256([]byte(apiKey))
		return &authSigner{key: digest[:]}, nil
	}
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return nil, fmt.Errorf("generate cookie signing key: %w", err)
	}
	return &authSigner{key: key}, nil
}

func (s *authSigner) value(prefix string) string {
	payload := prefix + "." + strconv.FormatInt(time.Now().Add(7*24*time.Hour).Unix(), 10)
	sig := hmac.New(sha256.New, s.key)
	_, _ = sig.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString([]byte(payload)) + "." + base64.RawURLEncoding.EncodeToString(sig.Sum(nil))
}

func (s *authSigner) validCookie(c fiber.Ctx, prefix string) bool {
	raw := c.Cookies(authCookieName)
	parts := strings.Split(raw, ".")
	if len(parts) != 2 {
		return false
	}
	payload, err1 := base64.RawURLEncoding.DecodeString(parts[0])
	signature, err2 := base64.RawURLEncoding.DecodeString(parts[1])
	if err1 != nil || err2 != nil {
		return false
	}
	segments := strings.Split(string(payload), ".")
	if len(segments) != 2 || segments[0] != prefix {
		return false
	}
	expires, err := strconv.ParseInt(segments[1], 10, 64)
	if err != nil || expires < time.Now().Unix() {
		return false
	}
	sig := hmac.New(sha256.New, s.key)
	_, _ = sig.Write(payload)
	return subtle.ConstantTimeCompare(signature, sig.Sum(nil)) == 1
}

func cookiePath(c fiber.Ctx) string {
	prefix := c.Params("prefix")
	if prefix == "" {
		return "/"
	}
	return "/" + prefix
}
func redirectWithoutPwd(c fiber.Ctx) string {
	rawQuery := string(c.Request().URI().QueryString())
	if rawQuery == "" {
		return c.Path()
	}
	values, err := url.ParseQuery(rawQuery)
	if err != nil {
		return c.Path()
	}
	values.Del("pwd")
	newQuery := values.Encode()
	if newQuery != "" {
		return c.Path() + "?" + newQuery
	}
	return c.Path()
}
func quickAuthCheck(c fiber.Ctx, manifest publish.Manifest, prefix string, signer *authSigner) bool {
	pwd := c.Query("pwd")
	if pwd == "" || !manifest.HasPassword() {
		return false
	}
	if publish.VerifyPassword(pwd, manifest.PasswordHash) {
		path := cookiePath(c)
		c.Cookie(&fiber.Cookie{
			Name:     authCookieName,
			Value:    signer.value(manifest.Prefix),
			Path:     path,
			HTTPOnly: true,
			Secure:   c.Protocol() == "https" || strings.EqualFold(c.Get("X-Forwarded-Proto"), "https"),
			SameSite: "Lax",
			MaxAge:   7 * 24 * 60 * 60,
		})
		c.Redirect().To(redirectWithoutPwd(c))
		return true
	}
	return false
}
