package server

import (
	"io/fs"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gofiber/fiber/v3"

	"github.com/asd2003ru/obsipub/internal/expiry"
	"github.com/asd2003ru/obsipub/internal/files"
	"github.com/asd2003ru/obsipub/internal/logger"
	"github.com/asd2003ru/obsipub/internal/publish"
)

func newDefaultPublication(root string, log logger.Logger) (*publication, error) {
	manager := publish.NewManager(root)
	store, err := files.NewStore(root)
	if err != nil {
		return nil, err
	}
	return &publication{manager: manager, store: store, log: log}, nil
}
func registerRoutes(app *fiber.App, base string, signer *authSigner, coordinator *expiry.Coordinator, log logger.Logger, resolve func(fiber.Ctx) (*publication, error)) {
	wrapProtected := func(handler func(*publication, fiber.Ctx) error) fiber.Handler {
		return func(c fiber.Ctx) error {
			p, err := resolve(c)
			if err != nil {
				return c.SendStatus(http.StatusNotFound)
			}
			manifest, ready := p.state()
			if ready && manifest.HasPassword() {
				if !signer.validCookie(c, manifest.Prefix) {
					log.Info("auth_failure type=cookie_invalid prefix=%s client_ip=%s", manifest.Prefix, c.IP())
					return c.Status(http.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
				}
			}
			return handler(p, c)
		}
	}
	wrapPublic := func(handler func(*publication, fiber.Ctx) error) fiber.Handler {
		return func(c fiber.Ctx) error {
			p, err := resolve(c)
			if err != nil {
				return c.SendStatus(http.StatusNotFound)
			}
			return handler(p, c)
		}
	}
	app.Get(base+"/api/config", wrapProtected(func(p *publication, c fiber.Ctx) error { return p.config(c) }))
	app.Get(base+"/api/markdown", wrapProtected(func(p *publication, c fiber.Ctx) error { return p.markdown(c) }))
	app.Get(base+"/api/search", wrapProtected(func(p *publication, c fiber.Ctx) error { return p.search(c) }))
	app.Get(base+"/api/links", wrapProtected(func(p *publication, c fiber.Ctx) error { return p.links(c) }))
	app.Get(base+"/api/raw", wrapProtected(func(p *publication, c fiber.Ctx) error { return p.raw(c) }))
	app.Get(base+"/api/theme", wrapProtected(func(p *publication, c fiber.Ctx) error { return p.theme(c) }))
	app.Get(base+"/api/auth/status", wrapPublic(func(p *publication, c fiber.Ctx) error { return p.authStatus(c, signer) }))
	app.Post(base+"/api/auth/login", wrapPublic(func(p *publication, c fiber.Ctx) error { return p.authLogin(c, signer) }))
}
func mountFrontend(app *fiber.App, root string, signer *authSigner, coordinator *expiry.Coordinator, defaultPub *publication) {
	fsys := os.DirFS("web/dist")
	indexPath := "index.html"

	app.Get("/:prefix", prefixedFrontend(root, signer, coordinator, "", defaultPub.log))
	app.Get("/:prefix/*", prefixedFrontend(root, signer, coordinator, "*", defaultPub.log))

	app.Use("/", func(c fiber.Ctx) error {
		if coordinator.CheckAndRemove("") {
			return waitingPage(c)
		}
		defaultPub.manager.Reload()
		manifest, ready := defaultPub.state()
		if !ready {
			return waitingPage(c)
		}
		if ready && manifest.HasPassword() {
			if quickAuthCheck(c, manifest, manifest.Prefix, signer) {
				return nil
			}
			if !signer.validCookie(c, manifest.Prefix) {
				return authShellResponse(c, manifest.Prefix)
			}
		}
		path := strings.TrimPrefix(c.Path(), "/")
		if path == "" || path == "." {
			return serveFSIndex(c, fsys, indexPath)
		}
		return serveFSFile(c, fsys, path)
	})

	app.Get("*", func(c fiber.Ctx) error {
		if coordinator.CheckAndRemove("") {
			return waitingPage(c)
		}
		defaultPub.manager.Reload()
		manifest, ready := defaultPub.state()
		if !ready {
			return waitingPage(c)
		}
		if ready && manifest.HasPassword() {
			if quickAuthCheck(c, manifest, manifest.Prefix, signer) {
				return nil
			}
			if !signer.validCookie(c, manifest.Prefix) {
				return authShellResponse(c, manifest.Prefix)
			}
		}
		return serveFSIndex(c, fsys, indexPath)
	})
}
func prefixedFrontend(root string, signer *authSigner, coordinator *expiry.Coordinator, param string, log logger.Logger) fiber.Handler {
	return func(c fiber.Ctx) error {
		prefix := c.Params("prefix")
		if err := publish.ValidatePrefix(prefix); err != nil {
			return errorPage(c, http.StatusNotFound, "Page not found", "The requested path does not exist in this publication.", c.Path())
		}
		fsys := os.DirFS("web/dist")

		if prefix == "assets" {
			requestPath := c.Params("*")
			if assetPath, ok := traversalSafeAsset(fsys, requestPath); ok {
				return serveFSFile(c, fsys, assetPath)
			}
		}

		if coordinator.CheckAndRemove(prefix) {
			return c.SendStatus(http.StatusNotFound)
		}
		p, err := newPublication(root, prefix, log)
		if err != nil {
			return c.SendStatus(http.StatusNotFound)
		}
		manifest, ready := p.state()
		if !ready {
			return missingPrefixedPlaceholder(c, prefix)
		}
		if manifest.HasPassword() {
			if quickAuthCheck(c, manifest, manifest.Prefix, signer) {
				return nil
			}
			if !signer.validCookie(c, manifest.Prefix) {
				return authShellResponse(c, manifest.Prefix)
			}
		}
		if param == "" && c.Path() == "/"+prefix {
			return c.Redirect().To(c.Path() + "/")
		}
		if param == "*" && c.Params("*") != "" {
			requestPath := c.Params("*")
			cleaned := strings.TrimSpace(requestPath)
			cleaned = strings.TrimPrefix(cleaned, "/")
			if cleaned != "" && cleaned != "." {
				fullPath := filepath.Clean(filepath.FromSlash(cleaned))
				if filepath.IsAbs(fullPath) || fullPath == ".." || strings.HasPrefix(fullPath, ".."+string(filepath.Separator)) {
					return errorPage(c, http.StatusNotFound, "Page not found", "The requested path does not exist in this publication.", c.Path())
				}
				if _, err := fs.Stat(fsys, fullPath); err == nil {
					return serveFSFile(c, fsys, fullPath)
				}
			}
			return errorPage(c, http.StatusNotFound, "Page not found", "The requested path does not exist in this publication.", c.Path())
		}
		return serveFSIndex(c, fsys, "index.html")
	}
}

func serveFSFile(c fiber.Ctx, fsys fs.FS, path string) error {
	data, err := fs.ReadFile(fsys, path)
	if err != nil {
		return c.SendStatus(http.StatusNotFound)
	}
	ext := filepath.Ext(path)
	contentType := mime.TypeByExtension(ext)
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	contentType = strings.Split(contentType, ";")[0]
	c.Set(fiber.HeaderContentType, contentType)
	return c.Send(data)
}

func serveFSIndex(c fiber.Ctx, fsys fs.FS, indexPath string) error {
	data, err := fs.ReadFile(fsys, indexPath)
	if err != nil {
		return c.SendStatus(http.StatusNotFound)
	}
	c.Type("html", "utf-8")
	return c.Send(data)
}

func traversalSafeAsset(fsys fs.FS, requestPath string) (string, bool) {
	cleaned := strings.TrimSpace(requestPath)
	cleaned = strings.TrimPrefix(cleaned, "/")
	if cleaned == "" || cleaned == "." {
		return "", false
	}
	cleaned = filepath.Clean(filepath.FromSlash(cleaned))
	if filepath.IsAbs(cleaned) || cleaned == ".." || strings.HasPrefix(cleaned, ".."+string(filepath.Separator)) {
		return "", false
	}
	fullPath := filepath.Join("assets", cleaned)
	info, err := fs.Stat(fsys, fullPath)
	if err != nil || info == nil || info.IsDir() {
		return "", false
	}
	return fullPath, true
}
