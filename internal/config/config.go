package config

import (
	"flag"
	"os"
	"strings"

	"github.com/asd2003ru/obsipub/internal/logger"
)

// Config contains runtime settings for the server.
type Config struct {
	Root           string
	Host           string
	Port           string
	APIKey         string
	TrustedProxies []string
	Logger         logger.Logger
}

// Load reads configuration from defaults, environment variables and CLI flags.
// Priority: flags > env vars > defaults. The server starts in API-only mode,
// creates the configured root if missing, and waits for plugin publication upload.
func Load() (Config, error) {
	c := Config{
		Root: "notes",
		Host: "localhost",
		Port: "8088",
	}

	root := getEnv("OBSIPUB_ROOT", c.Root)

	flag.StringVar(&root, "root", root, "publication notes root")
	flag.StringVar(&root, "r", root, "publication notes root (shorthand)")
	flag.StringVar(&c.APIKey, "api-key", getEnv("OBSIPUB_API_KEY", ""), "API key accepted by POST /api/publish")
	flag.StringVar(&c.Host, "host", getEnv("OBSIPUB_HOST", c.Host), "server host")
	flag.StringVar(&c.Port, "port", getEnv("OBSIPUB_PORT", c.Port), "server port")

	trustedProxiesRaw := getEnv("OBSIPUB_TRUSTED_PROXIES", "")
	flag.StringVar(&trustedProxiesRaw, "trusted-proxy", trustedProxiesRaw, "trusted proxy IPs/CIDRs (comma-separated)")
	flag.Parse()

	c.Root = root
	if trustedProxiesRaw != "" {
		c.TrustedProxies = splitComma(trustedProxiesRaw)
	}
	return c, nil
}

func splitComma(s string) []string {
	parts := strings.Split(s, ",")
	var result []string
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			result = append(result, p)
		}
	}
	return result
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
