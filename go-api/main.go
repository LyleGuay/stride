package main

import (
	"embed"
	"errors"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

// staticFiles embeds the compiled frontend (web-client/dist) at build time.
// The Dockerfile copies dist into go-api/static/ before running go build.
//
//go:embed all:static
var staticFiles embed.FS

func main() {
	log.SetPrefix("stride-api: ")
	log.SetFlags(0)

	// Load .env for local development. In production (Railway) env vars are
	// injected directly, so a missing file is not an error.
	// Distinguish "file not found" from a parse error — a malformed .env silently
	// uses wrong env vars, so we fatal on parse errors.
	if err := godotenv.Load(); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			log.Println("No .env file found, using environment variables")
		} else {
			log.Fatalf("Error parsing .env file: %v", err)
		}
	}

	pool := getDBPool()
	defer pool.Close()

	// OPENAI_BASE_URL can be overridden for testing/proxying; defaults to OpenAI.
	openAIBaseURL := os.Getenv("OPENAI_BASE_URL")
	if openAIBaseURL == "" {
		openAIBaseURL = "https://api.openai.com"
	}
	handler := Handler{db: pool, openAIBaseURL: openAIBaseURL}

	router := gin.Default()
	router.SetTrustedProxies(nil)
	handler.registerRoutes(router)

	// Serve the embedded React frontend for all non-/api routes.
	// Files with extensions (JS, CSS, images, etc.) are served directly from the FS.
	// Everything else serves index.html so react-router handles client-side navigation.
	// Avoids http.FileServer to prevent redirect loops on directory paths like "/".
	staticFS, err := fs.Sub(staticFiles, "static")
	if err != nil {
		log.Fatal("failed to create static sub-FS: ", err)
	}
	// Read index.html once at startup for the SPA fallback.
	indexHTML, err := fs.ReadFile(staticFS, "index.html")
	if err != nil {
		log.Println("Warning: index.html not found in embedded static files (expected in production)")
	}
	router.NoRoute(func(c *gin.Context) {
		path := strings.TrimPrefix(c.Request.URL.Path, "/")
		// Serve files with an extension (JS, CSS, images, etc.) directly from the FS.
		if strings.Contains(path, ".") {
			c.FileFromFS(path, http.FS(staticFS))
			return
		}
		// SPA route — send index.html bytes directly. We avoid c.FileFromFS("index.html")
		// because Go's http.FileServer always redirects /index.html → ./ causing a loop.
		c.Data(http.StatusOK, "text/html; charset=utf-8", indexHTML)
	})

	// PORT is injected by Railway in production; default to 3000 for local dev.
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}
	router.Run(":" + port)
}
