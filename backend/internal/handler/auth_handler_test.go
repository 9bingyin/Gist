package handler_test

import (
	"errors"
	"net/http"
	"testing"

	"gist/backend/internal/handler"
	"gist/backend/internal/service"
	"gist/backend/internal/service/mock"

	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"
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

func TestAuthHandler_Register_UserExists(t *testing.T) {
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

	mockService.EXPECT().
		Register(gomock.Any(), "alice", "", "alice@example.com", "secret123").
		Return(nil, service.ErrUserExists)

	err := h.Register(c)
	require.NoError(t, err)
	require.Equal(t, http.StatusConflict, rec.Code)
}

func TestAuthHandler_Register_UsernameRequired(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockAuthService(ctrl)
	h := handler.NewAuthHandlerHelper(mockService)

	e := newTestEcho()
	reqBody := map[string]interface{}{
		"username": "",
		"email":    "alice@example.com",
		"password": "secret123",
	}
	req := newJSONRequest(http.MethodPost, "/auth/register", reqBody)
	c, rec := newTestContext(e, req)

	mockService.EXPECT().
		Register(gomock.Any(), "", "", "alice@example.com", "secret123").
		Return(nil, service.ErrUsernameRequired)

	err := h.Register(c)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestAuthHandler_Register_InvalidUsername(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockAuthService(ctrl)
	h := handler.NewAuthHandlerHelper(mockService)

	e := newTestEcho()
	reqBody := map[string]interface{}{
		"username": "1invalid",
		"email":    "alice@example.com",
		"password": "secret123",
	}
	req := newJSONRequest(http.MethodPost, "/auth/register", reqBody)
	c, rec := newTestContext(e, req)

	mockService.EXPECT().
		Register(gomock.Any(), "1invalid", "", "alice@example.com", "secret123").
		Return(nil, service.ErrInvalidUsername)

	err := h.Register(c)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestAuthHandler_Register_EmailRequired(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockAuthService(ctrl)
	h := handler.NewAuthHandlerHelper(mockService)

	e := newTestEcho()
	reqBody := map[string]interface{}{
		"username": "alice",
		"email":    "",
		"password": "secret123",
	}
	req := newJSONRequest(http.MethodPost, "/auth/register", reqBody)
	c, rec := newTestContext(e, req)

	mockService.EXPECT().
		Register(gomock.Any(), "alice", "", "", "secret123").
		Return(nil, service.ErrEmailRequired)

	err := h.Register(c)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestAuthHandler_Register_PasswordRequired(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockAuthService(ctrl)
	h := handler.NewAuthHandlerHelper(mockService)

	e := newTestEcho()
	reqBody := map[string]interface{}{
		"username": "alice",
		"email":    "alice@example.com",
		"password": "",
	}
	req := newJSONRequest(http.MethodPost, "/auth/register", reqBody)
	c, rec := newTestContext(e, req)

	mockService.EXPECT().
		Register(gomock.Any(), "alice", "", "alice@example.com", "").
		Return(nil, service.ErrPasswordRequired)

	err := h.Register(c)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestAuthHandler_Register_PasswordTooShort(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockAuthService(ctrl)
	h := handler.NewAuthHandlerHelper(mockService)

	e := newTestEcho()
	reqBody := map[string]interface{}{
		"username": "alice",
		"email":    "alice@example.com",
		"password": "123",
	}
	req := newJSONRequest(http.MethodPost, "/auth/register", reqBody)
	c, rec := newTestContext(e, req)

	mockService.EXPECT().
		Register(gomock.Any(), "alice", "", "alice@example.com", "123").
		Return(nil, service.ErrPasswordTooShort)

	err := h.Register(c)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestAuthHandler_Login_UserNotFound(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockAuthService(ctrl)
	h := handler.NewAuthHandlerHelper(mockService)

	e := newTestEcho()
	reqBody := map[string]interface{}{
		"identifier": "unknown",
		"password":   "secret123",
	}
	req := newJSONRequest(http.MethodPost, "/auth/login", reqBody)
	c, rec := newTestContext(e, req)

	mockService.EXPECT().
		Login(gomock.Any(), "unknown", "secret123").
		Return(nil, service.ErrUserNotFound)

	err := h.Login(c)
	require.NoError(t, err)
	require.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestAuthHandler_UpdateProfile_CurrentPasswordRequired(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockAuthService(ctrl)
	h := handler.NewAuthHandlerHelper(mockService)

	e := newTestEcho()
	reqBody := map[string]interface{}{
		"newPassword": "newpass123",
	}
	req := newJSONRequest(http.MethodPut, "/auth/profile", reqBody)
	c, rec := newTestContext(e, req)

	mockService.EXPECT().
		UpdateProfile(gomock.Any(), "", "", "", "newpass123").
		Return(nil, service.ErrCurrentPasswordRequired)

	err := h.UpdateProfile(c)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestAuthHandler_UpdateProfile_SamePassword(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockAuthService(ctrl)
	h := handler.NewAuthHandlerHelper(mockService)

	e := newTestEcho()
	reqBody := map[string]interface{}{
		"currentPassword": "oldpass",
		"newPassword":     "oldpass",
	}
	req := newJSONRequest(http.MethodPut, "/auth/profile", reqBody)
	c, rec := newTestContext(e, req)

	mockService.EXPECT().
		UpdateProfile(gomock.Any(), "", "", "oldpass", "oldpass").
		Return(nil, service.ErrSamePassword)

	err := h.UpdateProfile(c)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestAuthHandler_GetStatus_Error(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockAuthService(ctrl)
	h := handler.NewAuthHandlerHelper(mockService)

	e := newTestEcho()
	req := newJSONRequest(http.MethodGet, "/auth/status", nil)
	c, rec := newTestContext(e, req)

	mockService.EXPECT().
		CheckUserExists(gomock.Any()).
		Return(false, errors.New("database error"))

	err := h.GetStatus(c)
	require.NoError(t, err)
	require.Equal(t, http.StatusInternalServerError, rec.Code)
}

func TestAuthHandler_GetCurrentUser_NotFound(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockAuthService(ctrl)
	h := handler.NewAuthHandlerHelper(mockService)

	e := newTestEcho()
	req := newJSONRequest(http.MethodGet, "/auth/me", nil)
	c, rec := newTestContext(e, req)

	mockService.EXPECT().
		GetCurrentUser(gomock.Any()).
		Return(nil, service.ErrUserNotFound)

	err := h.GetCurrentUser(c)
	require.NoError(t, err)
	require.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestAuthHandler_Register_InternalError(t *testing.T) {
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

	mockService.EXPECT().
		Register(gomock.Any(), "alice", "", "alice@example.com", "secret123").
		Return(nil, errors.New("unexpected error"))

	err := h.Register(c)
	require.NoError(t, err)
	require.Equal(t, http.StatusInternalServerError, rec.Code)
}

func TestAuthHandler_Register_InvalidJSON(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockAuthService(ctrl)
	h := handler.NewAuthHandlerHelper(mockService)

	e := newTestEcho()
	req := newJSONRequestRaw(http.MethodPost, "/auth/register", "{invalid json")
	c, rec := newTestContext(e, req)

	err := h.Register(c)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestAuthHandler_Login_InvalidJSON(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockAuthService(ctrl)
	h := handler.NewAuthHandlerHelper(mockService)

	e := newTestEcho()
	req := newJSONRequestRaw(http.MethodPost, "/auth/login", "{invalid json")
	c, rec := newTestContext(e, req)

	err := h.Login(c)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestAuthHandler_UpdateProfile_InvalidJSON(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockAuthService(ctrl)
	h := handler.NewAuthHandlerHelper(mockService)

	e := newTestEcho()
	req := newJSONRequestRaw(http.MethodPut, "/auth/profile", "{invalid json")
	c, rec := newTestContext(e, req)

	err := h.UpdateProfile(c)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestAuthHandler_Login_InternalError(t *testing.T) {
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

	mockService.EXPECT().
		Login(gomock.Any(), "alice", "secret123").
		Return(nil, errors.New("unexpected database error"))

	err := h.Login(c)
	require.NoError(t, err)
	require.Equal(t, http.StatusInternalServerError, rec.Code)
}

func TestAuthHandler_GetCurrentUser_InternalError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockAuthService(ctrl)
	h := handler.NewAuthHandlerHelper(mockService)

	e := newTestEcho()
	req := newJSONRequest(http.MethodGet, "/auth/me", nil)
	c, rec := newTestContext(e, req)

	mockService.EXPECT().
		GetCurrentUser(gomock.Any()).
		Return(nil, errors.New("unexpected database error"))

	err := h.GetCurrentUser(c)
	require.NoError(t, err)
	require.Equal(t, http.StatusInternalServerError, rec.Code)
}

func TestAuthHandler_UpdateProfile_InternalError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockAuthService(ctrl)
	h := handler.NewAuthHandlerHelper(mockService)

	e := newTestEcho()
	reqBody := map[string]interface{}{
		"nickname": "New Nickname",
	}
	req := newJSONRequest(http.MethodPut, "/auth/profile", reqBody)
	c, rec := newTestContext(e, req)

	mockService.EXPECT().
		UpdateProfile(gomock.Any(), "New Nickname", "", "", "").
		Return(nil, errors.New("unexpected database error"))

	err := h.UpdateProfile(c)
	require.NoError(t, err)
	require.Equal(t, http.StatusInternalServerError, rec.Code)
}

func TestAuthHandler_UpdateProfile_PasswordChange_WithNewToken(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockAuthService(ctrl)
	h := handler.NewAuthHandlerHelper(mockService)

	e := newTestEcho()
	reqBody := map[string]interface{}{
		"currentPassword": "oldpass",
		"newPassword":     "newpass123",
	}
	req := newJSONRequest(http.MethodPut, "/auth/profile", reqBody)
	c, rec := newTestContext(e, req)

	newToken := "new-jwt-token"
	updatedUser := &service.User{
		Username: "alice",
		Nickname: "Alice",
		Email:    "alice@example.com",
	}

	mockService.EXPECT().
		UpdateProfile(gomock.Any(), "", "", "oldpass", "newpass123").
		Return(&service.UpdateProfileResponse{User: updatedUser, Token: &newToken}, nil)

	err := h.UpdateProfile(c)
	require.NoError(t, err)

	var resp handler.UpdateProfileResponse
	assertJSONResponse(t, rec, http.StatusOK, &resp)
	require.Equal(t, "alice", resp.User.Username)
	require.NotNil(t, resp.Token)
	require.Equal(t, "new-jwt-token", *resp.Token)

	// Verify cookie is updated
	cookies := rec.Result().Cookies()
	require.NotEmpty(t, cookies)
}
