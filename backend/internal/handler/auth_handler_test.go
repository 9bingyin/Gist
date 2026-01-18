package handler_test

import (
	"gist/backend/internal/handler"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"

	"gist/backend/internal/service"
	"gist/backend/internal/service/mock"
)

func TestAuthHandler_GetStatus_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockAuthService(ctrl)
	h := handler.NewAuthHandlerHelper(mockService)

	e := newTestEcho()
	req := newJSONRequest(http.MethodGet, "/auth/status", nil)
	c, rec := newTestContext(e, req)

	mockService.EXPECT().
		CheckUserExists(gomock.Any()).
		Return(true, nil)

	err := h.GetStatus(c)
	require.NoError(t, err)

	var resp handler.AuthStatusResponse
	assertJSONResponse(t, rec, http.StatusOK, &resp)
	require.True(t, resp.Exists)
}

func TestAuthHandler_Register_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockAuthService(ctrl)
	h := handler.NewAuthHandlerHelper(mockService)

	e := newTestEcho()
	reqBody := map[string]interface{}{
		"username": "alice",
		"email":    "alice@example.com",
		"password": "secret123",
	}
	req := newJSONRequest(http.MethodPost, "/auth/register", reqBody)
	c, rec := newTestContext(e, req)

	authResp := &service.AuthResponse{
		Token: "test-token",
		User: &service.User{
			Username: "alice",
			Email:    "alice@example.com",
		},
	}

	mockService.EXPECT().
		Register(gomock.Any(), "alice", "", "alice@example.com", "secret123").
		Return(authResp, nil)

	err := h.Register(c)
	require.NoError(t, err)

	var resp handler.AuthResponseDTO
	assertJSONResponse(t, rec, http.StatusOK, &resp)
	require.Equal(t, "test-token", resp.Token)
	require.Equal(t, "alice", resp.User.Username)

	// Check cookie is set
	cookies := rec.Result().Cookies()
	require.NotEmpty(t, cookies, "should set auth cookie")
}

func TestAuthHandler_Login_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockAuthService(ctrl)
	h := handler.NewAuthHandlerHelper(mockService)

	e := newTestEcho()
	reqBody := map[string]interface{}{
		"identifier": "alice",
		"password":   "secret123",
	}
	req := newJSONRequest(http.MethodPost, "/auth/login", reqBody)
	c, rec := newTestContext(e, req)

	authResp := &service.AuthResponse{
		Token: "test-token",
		User: &service.User{
			Username: "alice",
			Email:    "alice@example.com",
		},
	}

	mockService.EXPECT().
		Login(gomock.Any(), "alice", "secret123").
		Return(authResp, nil)

	err := h.Login(c)
	require.NoError(t, err)

	var resp handler.AuthResponseDTO
	assertJSONResponse(t, rec, http.StatusOK, &resp)
	require.Equal(t, "test-token", resp.Token)
}

func TestAuthHandler_Login_InvalidCredentials(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockAuthService(ctrl)
	h := handler.NewAuthHandlerHelper(mockService)

	e := newTestEcho()
	reqBody := map[string]interface{}{
		"identifier": "alice",
		"password":   "wrong",
	}
	req := newJSONRequest(http.MethodPost, "/auth/login", reqBody)
	c, rec := newTestContext(e, req)

	mockService.EXPECT().
		Login(gomock.Any(), "alice", "wrong").
		Return(nil, service.ErrInvalidPassword)

	err := h.Login(c)
	require.NoError(t, err)

	require.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestAuthHandler_GetCurrentUser_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockAuthService(ctrl)
	h := handler.NewAuthHandlerHelper(mockService)

	e := newTestEcho()
	req := newJSONRequest(http.MethodGet, "/auth/me", nil)
	c, rec := newTestContext(e, req)

	user := &service.User{
		Username: "alice",
		Nickname: "Alice",
		Email:    "alice@example.com",
	}

	mockService.EXPECT().
		GetCurrentUser(gomock.Any()).
		Return(user, nil)

	err := h.GetCurrentUser(c)
	require.NoError(t, err)

	var resp handler.UserResponse
	assertJSONResponse(t, rec, http.StatusOK, &resp)
	require.Equal(t, "alice", resp.Username)
}

func TestAuthHandler_UpdateProfile_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockAuthService(ctrl)
	h := handler.NewAuthHandlerHelper(mockService)

	e := newTestEcho()
	reqBody := map[string]interface{}{
		"nickname": "New Nickname",
		"email":    "new@example.com",
	}
	req := newJSONRequest(http.MethodPut, "/auth/profile", reqBody)
	c, rec := newTestContext(e, req)

	updatedUser := &service.User{
		Username: "alice",
		Nickname: "New Nickname",
		Email:    "new@example.com",
	}

	mockService.EXPECT().
		UpdateProfile(gomock.Any(), "New Nickname", "new@example.com", "", "").
		Return(&service.UpdateProfileResponse{User: updatedUser}, nil)

	err := h.UpdateProfile(c)
	require.NoError(t, err)

	var resp handler.UpdateProfileResponse
	assertJSONResponse(t, rec, http.StatusOK, &resp)
	require.Equal(t, "New Nickname", resp.User.Nickname)
}

func TestAuthHandler_Logout_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockAuthService(ctrl)
	h := handler.NewAuthHandlerHelper(mockService)

	e := newTestEcho()
	req := newJSONRequest(http.MethodPost, "/auth/logout", nil)
	c, rec := newTestContext(e, req)

	err := h.Logout(c)
	require.NoError(t, err)

	require.Equal(t, http.StatusOK, rec.Code)
	// Verify cookie is cleared
	cookies := rec.Result().Cookies()
	var authCookie *http.Cookie
	for _, cookie := range cookies {
		if cookie.Name == "gist_auth" {
			authCookie = cookie
			break
		}
	}
	require.NotNil(t, authCookie)
	require.Equal(t, -1, authCookie.MaxAge)
}
