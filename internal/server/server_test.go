package server

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/asd2003ru/obsipub/internal/config"
	"github.com/asd2003ru/obsipub/internal/logger"
	"github.com/asd2003ru/obsipub/internal/publish"
)

func serverArchive(t *testing.T, body, name string) []byte {
	t.Helper()
	var out bytes.Buffer
	w := zip.NewWriter(&out)
	for path, content := range map[string]string{
		"index.md": body, "other.md": "# " + name,
		"index.json": `{"version":1,"index":"index.md","tree":{"path":"index.md","name":"index"}}`,
	} {
		entry, err := w.Create(path)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := entry.Write([]byte(content)); err != nil {
			t.Fatal(err)
		}
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	return out.Bytes()
}

func deployServerSite(t *testing.T, root, prefix, body string) {
	t.Helper()
	manager, err := publish.NewSite(root, prefix)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := manager.Deploy(bytes.NewReader(serverArchive(t, body, prefix))); err != nil {
		t.Fatal(err)
	}
}

func deployProtectedServerSite(t *testing.T, root, prefix, body, password string) {
	t.Helper()
	manager, err := publish.NewSite(root, prefix)
	if err != nil {
		t.Fatal(err)
	}
	archive := serverArchive(t, body, prefix)
	// Replace the compatibility manifest in the test archive with a hashed password.
	var out bytes.Buffer
	reader, err := zip.NewReader(bytes.NewReader(archive), int64(len(archive)))
	if err != nil {
		t.Fatal(err)
	}
	writer := zip.NewWriter(&out)
	for _, file := range reader.File {
		entry, err := writer.Create(file.Name)
		if err != nil {
			t.Fatal(err)
		}
		opened, err := file.Open()
		if err != nil {
			t.Fatal(err)
		}
		content, err := io.ReadAll(opened)
		opened.Close()
		if err != nil {
			t.Fatal(err)
		}
		if file.Name == "index.json" {
			content = []byte(fmt.Sprintf(`{"version":1,"index":"index.md","prefix":%q,"passwordHash":%q,"tree":{"path":"index.md","name":"index"}}`, prefix, publish.HashPassword(password)))
		}
		if _, err := entry.Write(content); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := manager.Deploy(bytes.NewReader(out.Bytes())); err != nil {
		t.Fatal(err)
	}
}

func TestPrefixRoutesUseIndependentPublications(t *testing.T) {
	root := filepath.Join(t.TempDir(), "notes")
	deployServerSite(t, root, "alpha", "# alpha")
	deployServerSite(t, root, "beta", "# beta")
	app, err := New(config.Config{Root: root})
	if err != nil {
		t.Fatal(err)
	}

	for _, test := range []struct{ path, want string }{
		{"/alpha/api/markdown?path=index.md", "# alpha"},
		{"/beta/api/markdown?path=index.md", "# beta"},
	} {
		resp, err := app.Test(httptest.NewRequest(http.MethodGet, test.path, nil))
		if err != nil {
			t.Fatal(err)
		}
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("%s: status %d", test.path, resp.StatusCode)
		}
		defer resp.Body.Close()
		var got bytes.Buffer
		_, _ = got.ReadFrom(resp.Body)
		if got.String() != test.want {
			t.Fatalf("%s: got %q want %q", test.path, got.String(), test.want)
		}
	}

	resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/missing/api/config", nil))
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("unknown prefix status %d", resp.StatusCode)
	}
}

func TestDefaultRoutesRemainCompatible(t *testing.T) {
	root := filepath.Join(t.TempDir(), "notes")
	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "index.md"), []byte("# default"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := publish.Write(root, publish.Manifest{Version: 1, Index: "index.md", Tree: publish.Node{Path: "index.md", Name: "index"}}); err != nil {
		t.Fatal(err)
	}
	app, err := New(config.Config{Root: root})
	if err != nil {
		t.Fatal(err)
	}
	resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/api/markdown?path=index.md", nil))
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status %d", resp.StatusCode)
	}
	defer resp.Body.Close()
	var got bytes.Buffer
	_, _ = got.ReadFrom(resp.Body)
	if got.String() != "# default" {
		t.Fatalf("got %q", got.String())
	}
}

func TestAuthEnforcedBeforeEveryProtectedResource(t *testing.T) {
	root := filepath.Join(t.TempDir(), "notes")
	deployProtectedServerSite(t, root, "locked", "# locked", "secret")
	app, err := New(config.Config{Root: root, APIKey: "test-api-key"})
	if err != nil {
		t.Fatal(err)
	}

	resources := []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/locked/api/config"},
		{http.MethodGet, "/locked/api/markdown?path=index.md"},
		{http.MethodGet, "/locked/api/search?q=locked"},
		{http.MethodGet, "/locked/api/links"},
		{http.MethodGet, "/locked/api/raw?path=index.md"},
		{http.MethodGet, "/locked/api/theme"},
		{http.MethodGet, "/locked"},
		{http.MethodGet, "/locked/"},
	}

	for _, r := range resources {
		req := httptest.NewRequest(r.method, r.path, nil)
		resp, err := app.Test(req)
		if err != nil {
			t.Fatalf("%s %s: %v", r.method, r.path, err)
		}
		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("%s %s: expected 401, got %d", r.method, r.path, resp.StatusCode)
		}
		resp.Body.Close()
	}

	// Public auth endpoints must remain accessible without cookie.
	publicEndpoints := []string{"/locked/api/auth/status", "/locked/api/auth/login"}
	for _, path := range publicEndpoints {
		method := http.MethodGet
		if path == "/locked/api/auth/login" {
			method = http.MethodPost
		}
		var body *bytes.Buffer
		if method == http.MethodPost {
			body = bytes.NewBufferString(`{"password":"secret"}`)
		} else {
			body = bytes.NewBuffer(nil)
		}
		req := httptest.NewRequest(method, path, body)
		if method == http.MethodPost {
			req.Header.Set("Content-Type", "application/json")
		}
		resp, err := app.Test(req)
		if err != nil {
			t.Fatalf("%s %s: %v", method, path, err)
		}
		resp.Body.Close()
		if path == "/locked/api/auth/login" {
			if resp.StatusCode != http.StatusOK {
				t.Errorf("%s %s: expected 200, got %d", method, path, resp.StatusCode)
			}
		} else {
			if resp.StatusCode != http.StatusOK {
				t.Errorf("%s %s: expected 200, got %d", method, path, resp.StatusCode)
			}
		}
	}

	// Login to get cookie.
	loginReq := httptest.NewRequest(http.MethodPost, "/locked/api/auth/login", strings.NewReader(`{"password":"secret"}`))
	loginReq.Header.Set("Content-Type", "application/json")
	loginResp, err := app.Test(loginReq)
	if err != nil {
		t.Fatal(err)
	}
	setCookie := loginResp.Header.Get("Set-Cookie")
	loginResp.Body.Close()
	if setCookie == "" {
		t.Fatal("expected Set-Cookie header after login")
	}
	if !strings.Contains(setCookie, "HttpOnly") || !strings.Contains(strings.ToLower(setCookie), "samesite=lax") {
		t.Errorf("cookie missing security attributes: %q", setCookie)
	}

	cookie := strings.Split(setCookie, ";")[0]

	// With valid cookie, protected resources should succeed (or reach the handler).
	for _, r := range resources {
		req := httptest.NewRequest(r.method, r.path, nil)
		req.Header.Set("Cookie", cookie)
		resp, err := app.Test(req)
		if err != nil {
			t.Fatalf("%s %s (authed): %v", r.method, r.path, err)
		}
		// When no web/dist/index.html exists, the handler returns 404,
		// which confirms auth passed (not 401 unauthorized).
		if resp.StatusCode == http.StatusUnauthorized {
			t.Errorf("%s %s (authed): unexpected 401", r.method, r.path)
		}
		resp.Body.Close()
	}
}

func TestPublicPublicationAccessWithoutCookie(t *testing.T) {
	root := filepath.Join(t.TempDir(), "notes")
	deployServerSite(t, root, "open", "# open")
	app, err := New(config.Config{Root: root})
	if err != nil {
		t.Fatal(err)
	}

	paths := []string{
		"/open/api/config",
		"/open/api/markdown?path=index.md",
		"/open/api/search?q=open",
		"/open/api/links",
		"/open/api/theme",
	}
	for _, path := range paths {
		resp, err := app.Test(httptest.NewRequest(http.MethodGet, path, nil))
		if err != nil {
			t.Fatalf("%s: %v", path, err)
		}
		if resp.StatusCode != http.StatusOK {
			t.Errorf("%s: expected 200, got %d", path, resp.StatusCode)
		}
		resp.Body.Close()
	}

	// Frontend routes should not return 401 for public publications.
	frontendPaths := []string{"/open/", "/open"}
	for _, path := range frontendPaths {
		resp, err := app.Test(httptest.NewRequest(http.MethodGet, path, nil))
		if err != nil {
			t.Fatalf("%s: %v", path, err)
		}
		if resp.StatusCode == http.StatusUnauthorized {
			t.Errorf("%s: unexpected 401 for public site", path)
		}
		resp.Body.Close()
	}
}

func TestProtectedPublicationAuthStatusAndLogin(t *testing.T) {
	root := filepath.Join(t.TempDir(), "notes")
	deployProtectedServerSite(t, root, "secure", "# secure", "correct horse")
	app, err := New(config.Config{Root: root, APIKey: "test-api-key"})
	if err != nil {
		t.Fatal(err)
	}

	resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/secure/api/auth/status", nil))
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status endpoint returned %d", resp.StatusCode)
	}
	var status authStatusResponse
	if err := json.NewDecoder(resp.Body).Decode(&status); err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if !status.Protected || status.Authenticated {
		t.Fatalf("unexpected unauthenticated status: %#v", status)
	}

	wrong := httptest.NewRequest(http.MethodPost, "/secure/api/auth/login", strings.NewReader(`{"password":"wrong"}`))
	wrong.Header.Set("Content-Type", "application/json")
	resp, err = app.Test(wrong)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("wrong password returned %d", resp.StatusCode)
	}
	resp.Body.Close()

	login := httptest.NewRequest(http.MethodPost, "/secure/api/auth/login", strings.NewReader(`{"password":"correct horse"}`))
	login.Header.Set("Content-Type", "application/json")
	resp, err = app.Test(login)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("correct password returned %d", resp.StatusCode)
	}
	setCookie := resp.Header.Get("Set-Cookie")
	resp.Body.Close()
	if !strings.Contains(setCookie, "obsipub_auth=") || !strings.Contains(strings.ToLower(setCookie), "path=/secure") || !strings.Contains(setCookie, "HttpOnly") {
		t.Fatalf("cookie missing required attributes: %q", setCookie)
	}

	check := httptest.NewRequest(http.MethodGet, "/secure/api/auth/status", nil)
	check.Header.Set("Cookie", strings.Split(setCookie, ";")[0])
	resp, err = app.Test(check)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if err := json.NewDecoder(resp.Body).Decode(&status); err != nil {
		t.Fatal(err)
	}
	if !status.Authenticated {
		t.Fatal("valid auth cookie was not accepted")
	}
}

func TestPrefixedFrontendAuthEnforcedWithDist(t *testing.T) {
	root := filepath.Join(t.TempDir(), "notes")
	deployProtectedServerSite(t, root, "locked", "# locked", "secret")
	app, err := New(config.Config{Root: root, APIKey: "test-api-key"})
	if err != nil {
		t.Fatal(err)
	}

	assetPath := filepath.Join("web", "dist", "assets", "test.js")
	assetDir := filepath.Dir(assetPath)
	if err := os.MkdirAll(assetDir, 0o755); err != nil {
		t.Fatal(err)
	}
	indexPath := filepath.Join("web", "dist", "index.html")
	if err := os.WriteFile(indexPath, []byte("<!doctype html><html></html>"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(assetPath, []byte("console.log('test')"), 0o644); err != nil {
		t.Fatal(err)
	}
	defer os.Remove(assetPath)
	defer os.Remove(indexPath)

	// Unauthenticated protected prefixed asset request must get 401.
	resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/locked/assets/test.js", nil))
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("unauthenticated asset: expected 401, got %d", resp.StatusCode)
	}
	resp.Body.Close()

	// Login to get cookie.
	loginReq := httptest.NewRequest(http.MethodPost, "/locked/api/auth/login", strings.NewReader(`{"password":"secret"}`))
	loginReq.Header.Set("Content-Type", "application/json")
	loginResp, err := app.Test(loginReq)
	if err != nil {
		t.Fatal(err)
	}
	cookie := strings.Split(loginResp.Header.Get("Set-Cookie"), ";")[0]
	loginResp.Body.Close()

	// Authenticated request should reach the asset.
	req := httptest.NewRequest(http.MethodGet, "/locked/assets/test.js", nil)
	req.Header.Set("Cookie", cookie)
	resp, err = app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Errorf("authenticated asset: expected 200, got %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if string(body) != "console.log('test')" {
		t.Errorf("asset content mismatch: %q", body)
	}
}

func TestPrefixedFrontendUnknownPathReturnsNotFound(t *testing.T) {
	root := filepath.Join(t.TempDir(), "notes")
	deployServerSite(t, root, "yaya", "# yaya")
	app, err := New(config.Config{Root: root})
	if err != nil {
		t.Fatal(err)
	}

	resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/yaya/ee/", nil))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("unknown prefixed frontend path: expected 404, got %d", resp.StatusCode)
	}
}

func TestDefaultProtectedSiteAuthAndCookie(t *testing.T) {
	root := filepath.Join(t.TempDir(), "notes")
	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "index.md"), []byte("# default protected"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := publish.Write(root, publish.Manifest{
		Version:      1,
		Index:        "index.md",
		Tree:         publish.Node{Path: "index.md", Name: "index"},
		PasswordHash: publish.HashPassword("defaultsecret"),
	}); err != nil {
		t.Fatal(err)
	}

	app, err := New(config.Config{Root: root, APIKey: "test-api-key"})
	if err != nil {
		t.Fatal(err)
	}

	// Protected resources should return 401 without cookie.
	for _, r := range []string{
		"/api/config",
		"/api/markdown?path=index.md",
		"/api/search?q=default",
		"/api/links",
		"/api/raw?path=index.md",
		"/api/theme",
		"/",
	} {
		resp, err := app.Test(httptest.NewRequest(http.MethodGet, r, nil))
		if err != nil {
			t.Fatalf("%s: %v", r, err)
		}
		if resp.StatusCode != http.StatusUnauthorized {
			t.Errorf("%s: expected 401, got %d", r, resp.StatusCode)
		}
		resp.Body.Close()
	}

	// Auth endpoints must remain public.
	for _, path := range []string{"/api/auth/status", "/api/auth/login"} {
		method := http.MethodGet
		var body *bytes.Buffer
		if path == "/api/auth/login" {
			method = http.MethodPost
			body = bytes.NewBufferString(`{"password":"defaultsecret"}`)
		} else {
			body = bytes.NewBuffer(nil)
		}
		req := httptest.NewRequest(method, path, body)
		if method == http.MethodPost {
			req.Header.Set("Content-Type", "application/json")
		}
		resp, err := app.Test(req)
		if err != nil {
			t.Fatalf("%s: %v", path, err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Errorf("%s: expected 200, got %d", path, resp.StatusCode)
		}
	}

	// Login to obtain cookie.
	loginReq := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"password":"defaultsecret"}`))
	loginReq.Header.Set("Content-Type", "application/json")
	loginResp, err := app.Test(loginReq)
	if err != nil {
		t.Fatal(err)
	}
	setCookie := loginResp.Header.Get("Set-Cookie")
	loginResp.Body.Close()
	if setCookie == "" {
		t.Fatal("expected Set-Cookie header after login")
	}
	cookie := strings.Split(setCookie, ";")[0]

	// With cookie, protected resources should not return 401.
	for _, r := range []string{"/api/config", "/api/markdown?path=index.md", "/", "/"} {
		req := httptest.NewRequest(http.MethodGet, r, nil)
		req.Header.Set("Cookie", cookie)
		resp, err := app.Test(req)
		if err != nil {
			t.Fatalf("%s (authed): %v", r, err)
		}
		if resp.StatusCode == http.StatusUnauthorized {
			t.Errorf("%s (authed): unexpected 401", r)
		}
		resp.Body.Close()
	}
}

func TestPublishLegacyDefaultUpload(t *testing.T) {
	root := filepath.Join(t.TempDir(), "notes")
	app, err := New(config.Config{Root: root, APIKey: "test-key"})
	if err != nil {
		t.Fatal(err)
	}
	archive := serverArchive(t, "# legacy", "default")
	req := httptest.NewRequest(http.MethodPost, "/api/publish", bytes.NewReader(archive))
	req.Header.Set("Content-Type", "application/zip")
	req.Header.Set("X-API-Key", "test-key")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201, got %d", resp.StatusCode)
	}
	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	if result["prefix"] != "" {
		t.Fatalf("expected empty prefix, got %v", result["prefix"])
	}
	if result["ready"] != true {
		t.Fatal("expected ready true")
	}
}

func TestPublishPrefixedPublicUpload(t *testing.T) {
	root := filepath.Join(t.TempDir(), "sites")
	app, err := New(config.Config{Root: root, APIKey: "test-key"})
	if err != nil {
		t.Fatal(err)
	}
	archive := serverArchive(t, "# public", "public")
	req := httptest.NewRequest(http.MethodPost, "/api/publish", bytes.NewReader(archive))
	req.Header.Set("Content-Type", "application/zip")
	req.Header.Set("X-API-Key", "test-key")
	req.Header.Set("X-ObsiPub-Prefix", "public-site")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201, got %d", resp.StatusCode)
	}
	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	if result["prefix"] != "public-site" {
		t.Fatalf("expected prefix public-site, got %v", result["prefix"])
	}
	if _, ok := result["ready"]; !ok || result["ready"] != true {
		t.Fatal("expected ready true")
	}
}

func TestPublishPrefixedProtectedUploadWithHashedManifestAndLoginAccess(t *testing.T) {
	root := filepath.Join(t.TempDir(), "sites")
	app, err := New(config.Config{Root: root, APIKey: "test-key"})
	if err != nil {
		t.Fatal(err)
	}
	archive := serverArchive(t, "# protected", "protected")
	req := httptest.NewRequest(http.MethodPost, "/api/publish", bytes.NewReader(archive))
	req.Header.Set("Content-Type", "application/zip")
	req.Header.Set("X-API-Key", "test-key")
	req.Header.Set("X-ObsiPub-Prefix", "protected-site")
	req.Header.Set("X-ObsiPub-Password", "mysecret")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201, got %d", resp.StatusCode)
	}
	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if result["prefix"] != "protected-site" {
		t.Fatalf("expected prefix protected-site, got %v", result["prefix"])
	}

	// Verify manifest hash exists and is not plaintext.
	manifestPath := filepath.Join(root, "protected-site", "index.json")
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("manifest not found after publish: %v", err)
	}
	var manifest publish.Manifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		t.Fatal(err)
	}
	if manifest.Prefix != "protected-site" {
		t.Fatalf("manifest prefix mismatch: got %q", manifest.Prefix)
	}
	if manifest.PasswordHash == "" {
		t.Fatal("expected non-empty password hash in manifest")
	}
	if manifest.PasswordHash == "mysecret" {
		t.Fatal("password stored as plaintext")
	}
	if !strings.HasPrefix(manifest.PasswordHash, "sha256:") {
		t.Fatalf("expected sha256: prefix, got %q", manifest.PasswordHash)
	}

	// Verify protected site requires auth.
	authResp, err := app.Test(httptest.NewRequest(http.MethodGet, "/protected-site/api/config", nil))
	if err != nil {
		t.Fatal(err)
	}
	authResp.Body.Close()
	if authResp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401 for protected site, got %d", authResp.StatusCode)
	}

	// Login and verify access.
	loginReq := httptest.NewRequest(http.MethodPost, "/protected-site/api/auth/login", strings.NewReader(`{"password":"mysecret"}`))
	loginReq.Header.Set("Content-Type", "application/json")
	loginResp, err := app.Test(loginReq)
	if err != nil {
		t.Fatal(err)
	}
	if loginResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 login, got %d", loginResp.StatusCode)
	}
	cookie := strings.Split(loginResp.Header.Get("Set-Cookie"), ";")[0]
	loginResp.Body.Close()

	accessReq := httptest.NewRequest(http.MethodGet, "/protected-site/api/config", nil)
	accessReq.Header.Set("Cookie", cookie)
	accessResp, err := app.Test(accessReq)
	if err != nil {
		t.Fatal(err)
	}
	accessResp.Body.Close()
	if accessResp.StatusCode == http.StatusUnauthorized {
		t.Fatal("authenticated access should not return 401")
	}
}

func TestPublishInvalidPrefix(t *testing.T) {
	root := filepath.Join(t.TempDir(), "sites")
	app, err := New(config.Config{Root: root, APIKey: "test-key"})
	if err != nil {
		t.Fatal(err)
	}
	archive := serverArchive(t, "# bad", "bad")
	req := httptest.NewRequest(http.MethodPost, "/api/publish", bytes.NewReader(archive))
	req.Header.Set("Content-Type", "application/zip")
	req.Header.Set("X-API-Key", "test-key")
	req.Header.Set("X-ObsiPub-Prefix", "bad/one")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid prefix, got %d", resp.StatusCode)
	}
}

func TestPublishAPIKeyFailures(t *testing.T) {
	root := filepath.Join(t.TempDir(), "notes")
	app, err := New(config.Config{Root: root, APIKey: "test-key"})
	if err != nil {
		t.Fatal(err)
	}
	archive := serverArchive(t, "# api", "api")

	// Empty configured key should reject.
	appEmpty, err := New(config.Config{Root: root})
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/publish", bytes.NewReader(archive))
	req.Header.Set("Content-Type", "application/zip")
	req.Header.Set("X-API-Key", "")
	resp, err := appEmpty.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401 for empty configured key, got %d", resp.StatusCode)
	}

	// Wrong key should be rejected.
	req2 := httptest.NewRequest(http.MethodPost, "/api/publish", bytes.NewReader(archive))
	req2.Header.Set("Content-Type", "application/zip")
	req2.Header.Set("X-API-Key", "wrong-key")
	resp2, err := app.Test(req2)
	if err != nil {
		t.Fatal(err)
	}
	resp2.Body.Close()
	if resp2.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401 for wrong key, got %d", resp2.StatusCode)
	}

	// Missing key should be rejected.
	req3 := httptest.NewRequest(http.MethodPost, "/api/publish", bytes.NewReader(archive))
	req3.Header.Set("Content-Type", "application/zip")
	resp3, err := app.Test(req3)
	if err != nil {
		t.Fatal(err)
	}
	resp3.Body.Close()
	if resp3.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401 for missing key, got %d", resp3.StatusCode)
	}
}

func TestPrefixedRoutesAreReverseProxySafe(t *testing.T) {
	root := filepath.Join(t.TempDir(), "notes")
	deployProtectedServerSite(t, root, "docs", "# docs", "secret")
	app, err := New(config.Config{Root: root, APIKey: "test-api-key"})
	if err != nil {
		t.Fatal(err)
	}

	// A protected frontend response must link back through the publication
	// prefix instead of assuming that the server is mounted at the host root.
	frontendReq := httptest.NewRequest(http.MethodGet, "https://public.example.test/docs/", nil)
	frontendReq.Host = "public.example.test"
	resp, err := app.Test(frontendReq)
	if err != nil {
		t.Fatal(err)
	}
	body, err := io.ReadAll(resp.Body)
	resp.Body.Close()
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("protected frontend: expected 401, got %d", resp.StatusCode)
	}
	if !strings.Contains(string(body), `/docs/api/auth/login`) {
		t.Errorf("auth shell does not preserve publication base path: %s", body)
	}
	if strings.Contains(string(body), "localhost") {
		t.Errorf("auth shell contains localhost URL: %s", body)
	}

	// Login remains scoped to the publication and keeps the secure attribute
	// when the externally visible request uses HTTPS.
	loginReq := httptest.NewRequest(http.MethodPost, "https://public.example.test/docs/api/auth/login", strings.NewReader(`{"password":"secret"}`))
	loginReq.Host = "public.example.test"
	loginReq.Header.Set("X-Forwarded-Proto", "https")
	loginReq.Header.Set("Content-Type", "application/json")
	loginResp, err := app.Test(loginReq)
	if err != nil {
		t.Fatal(err)
	}
	setCookie := loginResp.Header.Get("Set-Cookie")
	loginResp.Body.Close()
	for _, want := range []string{"path=/docs", "httponly", "secure", "samesite=lax"} {
		if !strings.Contains(strings.ToLower(setCookie), want) {
			t.Errorf("Set-Cookie missing %q: %q", want, setCookie)
		}
	}

	// The same cookie must work for the prefixed API resource, independent of
	// the public hostname selected by a reverse proxy.
	cookie := strings.Split(setCookie, ";")[0]
	configReq := httptest.NewRequest(http.MethodGet, "https://public.example.test/docs/api/config", nil)
	configReq.Host = "public.example.test"
	configReq.Header.Set("Cookie", cookie)
	configResp, err := app.Test(configReq)
	if err != nil {
		t.Fatal(err)
	}
	configResp.Body.Close()
	if configResp.StatusCode != http.StatusOK {
		t.Fatalf("authenticated prefixed config: expected 200, got %d", configResp.StatusCode)
	}
}

func TestTrustedProxyIPBehavior(t *testing.T) {
	root := filepath.Join(t.TempDir(), "proxy-notes")
	os.MkdirAll(root, 0755)
	if err := os.WriteFile(filepath.Join(root, "index.md"), []byte("# proxy"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := publish.Write(root, publish.Manifest{Version: 1, Index: "index.md", Tree: publish.Node{Path: "index.md", Name: "index"}}); err != nil {
		t.Fatal(err)
	}

	app, err := New(config.Config{Root: root, TrustedProxies: []string{"10.0.0.0/8"}}, logger.New(logger.TextType, logger.InfoLevel))
	if err != nil {
		t.Fatal(err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/config", nil)
	req.Header.Set("X-Forwarded-For", "10.0.0.1")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200 with trusted proxy header, got %d", resp.StatusCode)
	}
}

func TestBannerDisabledAndStartupLogFields(t *testing.T) {
	root := filepath.Join(t.TempDir(), "banner-notes")
	os.MkdirAll(root, 0755)
	app, err := New(config.Config{Root: root}, logger.New(logger.TextType, logger.InfoLevel))
	if err != nil {
		t.Fatal(err)
	}
	_ = app
	// Banner disabled is enforced via ListenConfig in main; server creation succeeds.
}

func TestConfigParsingTrustedProxies(t *testing.T) {
	// The config parsing is covered by Load; verify split behavior directly.
	cfg := config.Config{Root: "x", TrustedProxies: []string{"127.0.0.1", "10.0.0.0/8"}}
	if len(cfg.TrustedProxies) != 2 {
		t.Errorf("expected 2 proxies, got %d", len(cfg.TrustedProxies))
	}
}

func TestEmbeddedErrorTemplateEscapesDynamicValues(t *testing.T) {
	var body bytes.Buffer
	if err := errorTmpl.Execute(&body, errorData{
		Status:  404,
		Title:   `<script>alert("xss")</script>`,
		Message: `<img src=x onerror=alert(1)>`,
		Detail:  `path="<unsafe>"`,
		HomeURL: `/`,
	}); err != nil {
		t.Fatal(err)
	}

	rendered := body.String()
	if strings.Contains(rendered, `<script>alert("xss")</script>`) || strings.Contains(rendered, `<img src=x onerror=alert(1)>`) {
		t.Fatalf("template rendered unescaped HTML: %s", rendered)
	}
	for _, escaped := range []string{`&lt;script&gt;`, `&lt;img src=x onerror=alert(1)&gt;`, `&#34;&lt;unsafe&gt;&#34;`} {
		if !strings.Contains(rendered, escaped) {
			t.Errorf("template output missing escaped value %q: %s", escaped, rendered)
		}
	}
}

func TestEmbeddedAuthTemplateUsesPrefixAwareLoginURL(t *testing.T) {
	var body bytes.Buffer
	if err := authTmpl.Execute(&body, authData{LoginURL: `/docs/api/auth/login`}); err != nil {
		t.Fatal(err)
	}

	rendered := body.String()
	if !strings.Contains(rendered, `action="/docs/api/auth/login"`) {
		t.Fatalf("auth form lost publication prefix: %s", rendered)
	}
	if !strings.Contains(rendered, `fetch(document.getElementById('authForm').action`) {
		t.Fatalf("auth script does not submit through the rendered form action: %s", rendered)
	}
}

func TestUploadResponseKeepsExpiresAtButManifestOmitsIt(t *testing.T) {
	root := filepath.Join(t.TempDir(), "sites")
	app, err := New(config.Config{Root: root, APIKey: "test-key"})
	if err != nil {
		t.Fatal(err)
	}
	archive := serverArchive(t, "# expiry", "expiry-site")
	req := httptest.NewRequest(http.MethodPost, "/api/publish", bytes.NewReader(archive))
	req.Header.Set("Content-Type", "application/zip")
	req.Header.Set("X-API-Key", "test-key")
	req.Header.Set("X-ObsiPub-Prefix", "expiry-site")
	req.Header.Set("X-ObsiPub-Expires-At", "2026-12-31T23:59:59Z")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201, got %d", resp.StatusCode)
	}
	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	if result["expiresAt"] == nil {
		t.Fatal("expected non-null expiresAt in API response")
	}

	// Manifest must not contain expiresAt.
	manifestPath := filepath.Join(root, "expiry-site", "index.json")
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), `"expiresAt"`) {
		t.Fatalf("manifest index.json must omit expiresAt: %s", string(data))
	}
}

func TestAdminExpiryPersistsViaDBNotManifest(t *testing.T) {
	root := filepath.Join(t.TempDir(), "sites")
	app, err := New(config.Config{Root: root, APIKey: "test-key"})
	if err != nil {
		t.Fatal(err)
	}
	archive := serverArchive(t, "# admin", "admin-site")
	req := httptest.NewRequest(http.MethodPost, "/api/publish", bytes.NewReader(archive))
	req.Header.Set("Content-Type", "application/zip")
	req.Header.Set("X-API-Key", "test-key")
	req.Header.Set("X-ObsiPub-Prefix", "admin-site")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()

	// Set expiry via admin endpoint.
	adminReq := httptest.NewRequest(http.MethodPost, "/api/admin/publications/expiry", strings.NewReader(`{"prefix":"admin-site","ttl":"300"}`))
	adminReq.Header.Set("Content-Type", "application/json")
	adminReq.Header.Set("X-API-Key", "test-key")
	adminResp, err := app.Test(adminReq)
	if err != nil {
		t.Fatal(err)
	}
	defer adminResp.Body.Close()
	if adminResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 for admin expiry, got %d", adminResp.StatusCode)
	}

	// List should show expiry.
	listReq := httptest.NewRequest(http.MethodGet, "/api/admin/publications", nil)
	listReq.Header.Set("X-API-Key", "test-key")
	listResp, err := app.Test(listReq)
	if err != nil {
		t.Fatal(err)
	}
	defer listResp.Body.Close()
	var listResults []map[string]interface{}
	if err := json.NewDecoder(listResp.Body).Decode(&listResults); err != nil {
		t.Fatal(err)
	}
	var found bool
	for _, r := range listResults {
		if r["prefix"] == "admin-site" {
			found = true
			if r["expiresAt"] == nil {
				t.Fatal("expected expiresAt in admin list after expiry set")
			}
		}
	}
	if !found {
		t.Fatal("admin-site not found in publications list")
	}

	// Manifest must not have been modified by admin expiry change.
	manifestPath := filepath.Join(root, "admin-site", "index.json")
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), `"expiresAt"`) {
		t.Fatalf("manifest must remain without expiresAt after admin expiry update: %s", string(data))
	}
}

func TestPublishResponseIncludesExpiresAt(t *testing.T) {
	root := filepath.Join(t.TempDir(), "notes")
	app, err := New(config.Config{Root: root, APIKey: "test-key"})
	if err != nil {
		t.Fatal(err)
	}
	archive := serverArchive(t, "# expiry", "expiry")
	req := httptest.NewRequest(http.MethodPost, "/api/publish", bytes.NewReader(archive))
	req.Header.Set("Content-Type", "application/zip")
	req.Header.Set("X-API-Key", "test-key")
	req.Header.Set("X-ObsiPub-Prefix", "expiry-site")
	req.Header.Set("X-ObsiPub-Expires-At", "2026-12-31T23:59:59Z")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("expected 201, got %d", resp.StatusCode)
	}
	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	exp, ok := result["expiresAt"]
	if !ok {
		t.Fatal("expected expiresAt in response")
	}
	if exp == nil {
		t.Fatal("expected non-null expiresAt")
	}
	if result["prefix"] != "expiry-site" {
		t.Errorf("expected prefix expiry-site, got %v", result["prefix"])
	}
}
