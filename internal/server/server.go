package server

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/static"

	"github.com/asd2003ru/obsipub/internal/config"
	"github.com/asd2003ru/obsipub/internal/expiry"
	"github.com/asd2003ru/obsipub/internal/logger"
	"github.com/asd2003ru/obsipub/internal/publish"
)

// New creates the HTTP application with API routes and frontend serving.
func New(cfg config.Config, logs ...logger.Logger) (*fiber.App, error) {
	log := cfg.Logger
	if len(logs) > 0 && logs[0] != nil {
		log = logs[0]
	}
	if log == nil {
		log = logger.New(logger.TextType, logger.InfoLevel)
	}
	signer, err := newAuthSigner(cfg.APIKey)
	if err != nil {
		return nil, err
	}
	coordinator, err := expiry.NewCoordinator(cfg.Root)
	if err != nil {
		return nil, fmt.Errorf("expiry coordinator: %w", err)
	}
	janitor := expiry.StartJanitor(coordinator, 30*time.Second, log)

	defaultPub, err := newDefaultPublication(cfg.Root, log)
	if err != nil {
		janitor.Stop()
		return nil, err
	}
	var fiberConfig = fiber.Config{AppName: "obsipub", BodyLimit: 512 << 20}
	if len(cfg.TrustedProxies) > 0 {
		fiberConfig.TrustProxy = true
		fiberConfig.ProxyHeader = "X-Forwarded-For"
		fiberConfig.TrustProxyConfig = fiber.TrustProxyConfig{Proxies: cfg.TrustedProxies}
		log.Debug("trusted proxy configured proxies=%v header=%s", cfg.TrustedProxies, "X-Forwarded-For")
	} else {
		log.Debug("trusted proxy disabled (default)")
	}
	app := fiber.New(fiberConfig)

	// Request logging middleware: method, path, status, duration, client IP.
	app.Use(func(c fiber.Ctx) error {
		start := time.Now()
		prefix := requestLogPrefix(c.Path())
		log.Debug("http request details method=%s path=%s remote_ip=%s client_ip=%s proxy_trusted=%v forwarded_for=%s forwarded_proto=%s user_agent=%s", c.Method(), c.Path(), c.RequestCtx().RemoteAddr().String(), c.IP(), c.IsProxyTrusted(), c.Get("X-Forwarded-For"), c.Get("X-Forwarded-Proto"), c.Get("User-Agent"))
		err := c.Next()
		duration := time.Since(start)
		clientIP := c.IP()
		log.Info("request method=%s path=%s prefix=%s status=%d duration=%s client_ip=%s", c.Method(), c.Path(), prefix, c.Response().StatusCode(), duration, clientIP)
		return err
	})

	app.Hooks().OnPreShutdown(func() error {
		janitor.Stop()
		_ = coordinator.Close()
		return nil
	})
	app.Use("/api", cors.New(cors.Config{AllowOrigins: []string{"*"}, AllowMethods: []string{"GET", "POST", "OPTIONS"}, AllowHeaders: []string{"Content-Type", "X-API-Key", "X-ObsiPub-Prefix", "X-ObsiPub-Password", "X-ObsiPub-TTL", "X-ObsiPub-Expires-At"}}))

	registerRoutes(app, "", signer, coordinator, log, func(c fiber.Ctx) (*publication, error) {
		defaultPub.manager.Reload()
		if coordinator.CheckAndRemove("") {
			log.Info("publication expired and deleted prefix= client_ip=%s", c.IP())
			return nil, fmt.Errorf("publication expired")
		}
		return defaultPub, nil
	})
	registerRoutes(app, "/:prefix", signer, coordinator, log, func(c fiber.Ctx) (*publication, error) {
		prefix := c.Params("prefix")
		if err := publish.ValidatePrefix(prefix); err != nil {
			return nil, err
		}
		if coordinator.CheckAndRemove(prefix) {
			log.Info("publication expired and deleted prefix=%s client_ip=%s", prefix, c.IP())
			return nil, fmt.Errorf("publication expired")
		}
		return newPublication(cfg.Root, prefix, log)
	})

	app.Post("/api/publish", func(c fiber.Ctx) error {
		if !publish.IsAuthorized(c.Get("X-API-Key"), cfg.APIKey) {
			log.Info("auth_failure type=api_key client_ip=%s prefix=unknown", c.IP())
			return c.Status(http.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
		}
		if !strings.HasPrefix(strings.ToLower(c.Get("Content-Type")), "application/zip") {
			return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "expected application/zip"})
		}
		prefix := c.Get("X-ObsiPub-Prefix")
		if prefix != "" {
			if err := publish.ValidatePrefix(prefix); err != nil {
				return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "invalid prefix"})
			}
		}
		password := c.Get("X-ObsiPub-Password")
		var manager *publish.Manager
		if prefix == "" {
			manager = defaultPub.manager
		} else {
			m, err := publish.NewSite(cfg.Root, prefix)
			if err != nil {
				return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "invalid prefix"})
			}
			manager = m
		}
		expiresAt, err := expiry.ComputeExpiresAt(c.Get("X-ObsiPub-TTL"), c.Get("X-ObsiPub-Expires-At"))
		if err != nil {
			return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}
		var manifest publish.Manifest
		if err := coordinator.WithPrefix(prefix, func() error {
			var err error
			manifest, err = manager.DeployWithOverrides(bytes.NewReader(c.Body()), prefix, password)
			if err != nil {
				log.Info("publication_upload_failed prefix=%s error=%v client_ip=%s", prefix, err, c.IP())
				return err
			}
			if expiresAt > 0 {
				return coordinator.SetExpiry(prefix, time.Unix(expiresAt, 0).UTC())
			}
			return coordinator.DeleteExpiry(prefix)
		}); err != nil {
			log.Info("publication_upload_failed prefix=%s error=%v client_ip=%s", prefix, err, c.IP())
			return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "invalid publication"})
		}
		log.Info("publication_upload_success prefix=%s index=%s protected=%v expires_at=%d client_ip=%s", manifest.Prefix, manifest.Index, manifest.HasPassword(), expiresAt, c.IP())
		result := fiber.Map{"ready": true, "index": manifest.Index, "theme": manifest.Theme, "prefix": manifest.Prefix}
		if expiresAt > 0 {
			result["expiresAt"] = expiresAt
		} else {
			result["expiresAt"] = nil
		}
		return c.Status(http.StatusCreated).JSON(result)
	})

	app.Post("/api/admin/publications/expiry", func(c fiber.Ctx) error {
		if !publish.IsAuthorized(c.Get("X-API-Key"), cfg.APIKey) {
			log.Info("auth_failure type=api_key client_ip=%s endpoint=/api/admin/publications/expiry", c.IP())
			return c.Status(http.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
		}
		var body struct {
			Prefix    string      `json:"prefix"`
			TTL       interface{} `json:"ttl"`
			ExpiresAt interface{} `json:"expiresAt"`
		}
		if err := json.Unmarshal(c.Body(), &body); err != nil {
			return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "expected JSON body"})
		}
		if body.Prefix != "" {
			if err := publish.ValidatePrefix(body.Prefix); err != nil {
				return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "invalid prefix"})
			}
		}
		var expiresAt int64
		var hasExpiry bool
		hasTTL := body.TTL != nil
		hasExpires := body.ExpiresAt != nil
		switch {
		case hasTTL && hasExpires:
			return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "conflicting expiry: both ttl and expiresAt provided"})
		case hasTTL:
			switch v := body.TTL.(type) {
			case float64:
				if v != float64(int64(v)) || v <= 0 || v > 86400 || v < 60 {
					return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "TTL must be between 60 and 86400 seconds"})
				}
				hasExpiry = true
				expiresAt = time.Now().UTC().Add(time.Duration(int64(v)) * time.Second).Unix()
			case string:
				s := strings.TrimSpace(v)
				if sec, err := strconv.Atoi(s); err == nil && expiry.ValidateTTL(sec) == nil {
					hasExpiry = true
					expiresAt = time.Now().UTC().Add(time.Duration(sec) * time.Second).Unix()
				} else {
					return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "TTL must be between 60 and 86400 seconds"})
				}
			default:
				return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "invalid ttl value"})
			}
		case hasExpires:
			switch v := body.ExpiresAt.(type) {
			case float64:
				if v != float64(int64(v)) || v <= float64(time.Now().Unix()) {
					return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "expiresAt must be a future Unix timestamp"})
				}
				if v > 0 {
					hasExpiry = true
					expiresAt = int64(v)
				} else {
					hasExpiry = false
				}
			case string:
				s := strings.TrimSpace(v)
				if s == "" || s == "null" {
					hasExpiry = false
				} else {
					t, err := time.Parse(time.RFC3339, s)
					if err != nil {
						t, err = time.Parse(time.RFC3339Nano, s)
					}
					if err != nil {
						if sec, parseErr := strconv.ParseInt(s, 10, 64); parseErr == nil && sec > 0 {
							if sec <= time.Now().Unix() {
								return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "expiresAt must be in the future"})
							}
							hasExpiry = true
							expiresAt = sec
						} else {
							return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "invalid expiresAt value"})
						}
					} else {
						hasExpiry = true
						expiresAt = t.UTC().Unix()
					}
				}
			default:
				return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "invalid expiresAt value"})
			}
		default:
			hasExpiry = false
		}
		if err := coordinator.WithPrefix(body.Prefix, func() error {
			manager := publish.NewManager(filepath.Join(cfg.Root, body.Prefix))
			if body.Prefix != "" {
				var err error
				manager, err = publish.NewSite(cfg.Root, body.Prefix)
				if err != nil {
					return err
				}
			}
			if _, ready := manager.State(); !ready {
				return fmt.Errorf("publication not found")
			}
			if hasExpiry && expiresAt > 0 {
				return coordinator.SetExpiry(body.Prefix, time.Unix(expiresAt, 0).UTC())
			}
			return coordinator.DeleteExpiry(body.Prefix)
		}); err != nil {
			log.Info("expiry_change_failed prefix=%s error=%v client_ip=%s", body.Prefix, err, c.IP())
			return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "expiry update failed"})
		}
		log.Info("expiry_change_success prefix=%s expires_at=%v has_expiry=%v client_ip=%s", body.Prefix, func() interface{} {
			if hasExpiry && expiresAt > 0 {
				return expiresAt
			}
			return nil
		}(), hasExpiry, c.IP())
		// Clean stale expiry rows for prefixes that no longer exist.
		cleanStaleExpiryRows(cfg.Root, coordinator)
		return c.JSON(fiber.Map{"updated": true, "prefix": body.Prefix, "expiresAt": func() interface{} {
			if hasExpiry && expiresAt > 0 {
				return expiresAt
			}
			return nil
		}()})
	})

	app.Post("/api/admin/publications/delete", func(c fiber.Ctx) error {
		if !publish.IsAuthorized(c.Get("X-API-Key"), cfg.APIKey) {
			log.Info("auth_failure type=api_key client_ip=%s endpoint=/api/admin/publications/delete", c.IP())
			return c.Status(http.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
		}
		var body struct {
			Prefix string `json:"prefix"`
		}
		if err := json.Unmarshal(c.Body(), &body); err != nil {
			return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "expected JSON body"})
		}
		if body.Prefix != "" {
			if err := publish.ValidatePrefix(body.Prefix); err != nil {
				return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "invalid prefix"})
			}
		}
		if err := coordinator.Delete(body.Prefix); err != nil {
			log.Info("publication_delete_failed prefix=%s error=%v client_ip=%s", body.Prefix, err, c.IP())
			return c.Status(http.StatusBadRequest).JSON(fiber.Map{"error": "delete failed"})
		}
		log.Info("publication_delete_success prefix=%s client_ip=%s", body.Prefix, c.IP())
		cleanStaleExpiryRows(cfg.Root, coordinator)
		return c.JSON(fiber.Map{"deleted": true, "prefix": body.Prefix})
	})

	app.Get("/api/admin/publications", func(c fiber.Ctx) error {
		if !publish.IsAuthorized(c.Get("X-API-Key"), cfg.APIKey) {
			log.Info("auth_failure type=api_key client_ip=%s endpoint=/api/admin/publications", c.IP())
			return c.Status(http.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
		}
		results := listPublications(cfg.Root, coordinator)
		return c.JSON(results)
	})

	app.Use("/themes", static.New(filepath.Join(cfg.Root, ".themes")))
	mountFrontend(app, cfg.Root, signer, coordinator, defaultPub)
	return app, nil
}
func requestLogPrefix(path string) string {
	path = strings.TrimPrefix(path, "/")
	if path == "" || strings.HasPrefix(path, "api/") || path == "api" || strings.HasPrefix(path, "themes/") || path == "themes" || strings.HasPrefix(path, "assets/") || path == "assets" {
		return "default"
	}
	if prefix, _, ok := strings.Cut(path, "/"); ok && prefix != "" {
		return prefix
	}
	return "default"
}
