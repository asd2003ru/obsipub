package server

import (
	"bytes"
	_ "embed"
	"html/template"
	"net/http"

	"github.com/gofiber/fiber/v3"
)

//go:embed templates/landing.html
var landingTemplate string

//go:embed templates/auth.html
var authTemplate string

//go:embed templates/error.html
var errorTemplate string

type authData struct {
	LoginURL string
}

type errorData struct {
	Status  int
	Title   string
	Message string
	Detail  string
	HomeURL string
}

var (
	landingTmpl = template.Must(template.New("landing").Parse(landingTemplate))
	authTmpl    = template.Must(template.New("auth").Parse(authTemplate))
	errorTmpl   = template.Must(template.New("error").Parse(errorTemplate))
)

func authShellResponse(c fiber.Ctx, prefix string) error {
	c.Type("html", "utf-8")
	loginPath := "/api/auth/login"
	if prefix != "" {
		loginPath = "/" + prefix + loginPath
	}
	var buf bytes.Buffer
	if err := authTmpl.Execute(&buf, authData{LoginURL: loginPath}); err != nil {
		return err
	}
	return c.Status(http.StatusUnauthorized).SendString(buf.String())
}

func missingPrefixedPlaceholder(c fiber.Ctx, prefix string) error {
	return errorPage(c, http.StatusNotFound, "Publication not found", "There is no published site for this prefix.", "/"+prefix+"/")
}

func waitingPage(c fiber.Ctx) error {
	c.Type("html", "utf-8")
	var buf bytes.Buffer
	if err := landingTmpl.Execute(&buf, nil); err != nil {
		return err
	}
	return c.SendString(buf.String())
}

func errorPage(c fiber.Ctx, status int, title, message, detail string) error {
	return errorPageWithHome(c, status, title, message, detail, "/")
}

func errorPageWithHome(c fiber.Ctx, status int, title, message, detail, homeURL string) error {
	c.Type("html", "utf-8")
	var buf bytes.Buffer
	if err := errorTmpl.Execute(&buf, errorData{
		Status:  status,
		Title:   title,
		Message: message,
		Detail:  detail,
		HomeURL: homeURL,
	}); err != nil {
		return err
	}
	return c.Status(status).SendString(buf.String())
}
