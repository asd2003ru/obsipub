package main

import (
	"fmt"
	"os"

	"github.com/asd2003ru/obsipub/internal/config"
	"github.com/asd2003ru/obsipub/internal/logger"
	"github.com/asd2003ru/obsipub/internal/server"

	"github.com/gofiber/fiber/v3"
)

func main() {
	log := logger.New(logger.TextType, logger.InfoLevel)

	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err, "configuration load failed")
	}

	if err := os.MkdirAll(cfg.Root, 0755); err != nil {
		log.Fatal(err, "create notes root failed")
	}

	app, err := server.New(cfg, log)
	if err != nil {
		log.Fatal(err, "server init failed")
	}

	addr := fmt.Sprintf("%s:%s", cfg.Host, cfg.Port)
	proxyInfo := "none"
	if len(cfg.TrustedProxies) > 0 {
		proxyInfo = fmt.Sprintf("%v", cfg.TrustedProxies)
	}
	log.Info("obsipub startup program=obsipub listen=%s root=%s trusted_proxy=%s level=info format=text", addr, cfg.Root, proxyInfo)
	if err := app.Listen(addr, fiber.ListenConfig{DisableStartupMessage: true}); err != nil {
		log.Fatal(err, "listen failed")
	}
}
