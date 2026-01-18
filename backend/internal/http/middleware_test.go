package http_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	gh "gist/backend/internal/http"
	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"

	"gist/backend/internal/service/mock"
)

func TestJWTAuthMiddleware(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockAuth := mock.NewMockAuthService(ctrl)
	middleware := gh.JWTAuthMiddleware(mockAuth)

	e := echo.New()
	handler := func(c echo.Context) error {
		return c.String(http.StatusOK, "ok")
	}

	t.Run("MissingAuth", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)

		err := middleware(handler)(c)
		require.NoError(t, err)
		require.Equal(t, http.StatusUnauthorized, rec.Code)
	})

	t.Run("InvalidToken", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Header.Set("Authorization", "Bearer invalid-token")
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)

		mockAuth.EXPECT().ValidateToken("invalid-token").Return(false, nil)

		err := middleware(handler)(c)
		require.NoError(t, err)
		require.Equal(t, http.StatusUnauthorized, rec.Code)
	})

	t.Run("ValidTokenHeader", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Header.Set("Authorization", "Bearer valid-token")
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)

		mockAuth.EXPECT().ValidateToken("valid-token").Return(true, nil)

		err := middleware(handler)(c)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, rec.Code)
		require.Equal(t, "ok", rec.Body.String())
	})

	t.Run("ValidTokenCookie", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.AddCookie(&http.Cookie{Name: gh.AuthCookieName, Value: "cookie-token"})
		rec := httptest.NewRecorder()
		c := e.NewContext(req, rec)

		mockAuth.EXPECT().ValidateToken("cookie-token").Return(true, nil)

		err := middleware(handler)(c)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, rec.Code)
	})
}
