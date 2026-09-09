package server

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v3"

	"github.com/asd2003ru/obsipub/internal/files"
	"github.com/asd2003ru/obsipub/internal/logger"
	"github.com/asd2003ru/obsipub/internal/publish"
)

const baseTheme = `:root{color-scheme:light dark}body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;margin:0;background:#111827;color:#e5e7eb}.markdown-body{line-height:1.65}.markdown-body a{color:#93c5fd}.markdown-body img{max-width:100%}.callout{border-left:4px solid #8b5cf6;background:rgba(139,92,246,.12);padding:.75rem 1rem;margin:1rem 0;border-radius:.5rem}.callout-title{font-weight:700;text-transform:capitalize}`

type configResponse struct {
	Ready                  bool          `json:"ready"`
	Index                  string        `json:"index,omitempty"`
	Theme                  string        `json:"theme,omitempty"`
	ShowLineNumbers        bool          `json:"showLineNumbers"`
	ShowArticleLineNumbers bool          `json:"showArticleLineNumbers"`
	FullWidth              bool          `json:"fullWidth"`
	Tree                   *publish.Node `json:"tree,omitempty"`
}

type publication struct {
	manager *publish.Manager
	store   *files.Store
	log     logger.Logger
}

func newPublication(root, prefix string, log logger.Logger) (*publication, error) {
	manager, err := publish.NewSite(root, prefix)
	if err != nil {
		return nil, err
	}
	store, err := files.NewStore(filepath.Join(root, prefix))
	if err != nil {
		return nil, err
	}
	return &publication{manager: manager, store: store, log: log}, nil
}

func (p *publication) state() (publish.Manifest, bool) { return p.manager.State() }

func (p *publication) config(c fiber.Ctx) error {
	manifest, ready := p.state()
	if !ready {
		return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "not published"})
	}
	tree := manifest.Tree
	return c.JSON(configResponse{Ready: true, Index: manifest.Index, Theme: manifest.Theme, ShowLineNumbers: manifest.ShowLineNumbers, ShowArticleLineNumbers: manifest.ShowArticleLineNumbers, FullWidth: manifest.FullWidth, Tree: &tree})
}

func (p *publication) markdown(c fiber.Ctx) error {
	manifest, ready := p.state()
	if !ready {
		return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "not published"})
	}
	body, err := p.store.ReadMarkdown(c.Query("path", manifest.Index))
	if err != nil {
		return apiFileError(c, err)
	}
	c.Type("text/markdown", "utf-8")
	return c.SendString(body)
}

func (p *publication) search(c fiber.Ctx) error {
	if _, ready := p.state(); !ready {
		return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "not published"})
	}
	results, err := p.store.Search(c.Query("q"))
	if err != nil {
		return apiFileError(c, err)
	}
	return c.JSON(results)
}

func (p *publication) links(c fiber.Ctx) error {
	manifest, ready := p.state()
	if !ready {
		return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "not published"})
	}
	depth := 4
	if value := c.Query("depth"); value != "" {
		parsed, err := strconv.Atoi(value)
		if err != nil || parsed < 1 || parsed > 64 {
			return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "depth must be between 1 and 64"})
		}
		depth = parsed
	}
	graph, err := p.store.Links(c.Query("root", manifest.Index), depth)
	if err != nil {
		return apiFileError(c, err)
	}
	return c.JSON(graph)
}

func (p *publication) raw(c fiber.Ctx) error {
	if _, ready := p.state(); !ready {
		return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "not published"})
	}
	path := c.Query("path")
	if path == "" {
		return c.SendStatus(http.StatusNotFound)
	}
	full, err := p.store.RawPathFrom(path, c.Query("from"))
	if err != nil {
		return apiFileError(c, err)
	}
	return c.SendFile(full)
}

func (p *publication) theme(c fiber.Ctx) error {
	manifest, ready := p.state()
	if !ready || manifest.Theme == "" {
		c.Type("text/css", "utf-8")
		return c.SendString(baseTheme)
	}
	full, err := p.store.RawPath(manifest.Theme)
	if err != nil {
		c.Type("text/css", "utf-8")
		return c.SendString(baseTheme)
	}
	return c.SendFile(full)
}

func (p *publication) authStatus(c fiber.Ctx, signer *authSigner) error {
	manifest, ready := p.state()
	if !ready {
		return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "not published"})
	}
	return c.JSON(authStatusResponse{
		Ready:         true,
		Protected:     manifest.HasPassword(),
		Authenticated: !manifest.HasPassword() || signer.validCookie(c, manifest.Prefix),
	})
}

func (p *publication) authLogin(c fiber.Ctx, signer *authSigner) error {
	manifest, ready := p.state()
	if !ready {
		return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "not published"})
	}
	if !manifest.HasPassword() {
		return c.JSON(authStatusResponse{Ready: true, Authenticated: true})
	}
	var request authRequest
	if err := json.Unmarshal(c.Body(), &request); err != nil {
		return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "expected JSON password"})
	}
	if !publish.VerifyPassword(request.Password, manifest.PasswordHash) {
		p.log.Info("auth_failure type=publication_password client_ip=%s prefix=%s", c.IP(), manifest.Prefix)
		return c.Status(http.StatusUnauthorized).JSON(fiber.Map{"error": "invalid password"})
	}
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
	return c.JSON(authStatusResponse{Ready: true, Protected: true, Authenticated: true})
}

func apiFileError(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, files.ErrForbidden):
		if strings.Contains(c.Get("Accept"), "text/html") {
			return errorPage(c, http.StatusForbidden, "Access forbidden", "You do not have permission to access this resource.", c.Path())
		}
		return c.Status(http.StatusForbidden).JSON(fiber.Map{"error": "forbidden"})
	case errors.Is(err, files.ErrNotFound), errors.Is(err, os.ErrNotExist):
		return c.Status(http.StatusNotFound).JSON(fiber.Map{"error": "not found"})
	default:
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "internal error"})
	}
}
