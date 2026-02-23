package main

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

// dummyHash is a pre-computed bcrypt hash used when a login username isn't found.
// Running bcrypt against it (instead of returning early) keeps response time
// constant, preventing timing-based username enumeration.
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("dummy"), bcrypt.DefaultCost)

// login verifies username/password and returns the user's auth token.
// POST /api/login (public — no auth required).
func (h *Handler) login(c *gin.Context) {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		apiError(c, http.StatusBadRequest, "invalid request body")
		return
	}

	u, lookupErr := queryOne[user](h.db, c,
		"SELECT * FROM users WHERE username = @username",
		pgx.NamedArgs{"username": body.Username})

	// Always run bcrypt to keep response time constant regardless of whether the
	// username was found — prevents timing-based username enumeration.
	hashToCheck := string(dummyHash)
	if lookupErr == nil {
		hashToCheck = u.Password
	}
	compareErr := bcrypt.CompareHashAndPassword([]byte(hashToCheck), []byte(body.Password))

	if lookupErr != nil {
		apiError(c, http.StatusUnauthorized, "invalid credentials")
		return
	}
	if compareErr != nil {
		apiError(c, http.StatusUnauthorized, "invalid credentials")
		return
	}

	c.JSON(http.StatusOK, gin.H{"token": u.AuthToken, "user_id": u.ID})
}

// authMiddleware validates the Bearer token and sets user_id on the context.
func (h *Handler) authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			apiError(c, http.StatusUnauthorized, "missing or invalid authorization header")
			c.Abort()
			return
		}
		token := strings.TrimPrefix(header, "Bearer ")

		var userID int
		err := h.db.QueryRow(c, "SELECT id FROM users WHERE auth_token = $1", token).Scan(&userID)
		if err != nil {
			apiError(c, http.StatusUnauthorized, "invalid token")
			c.Abort()
			return
		}

		c.Set("user_id", userID)
		c.Next()
	}
}
