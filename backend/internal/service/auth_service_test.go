package service_test

import (
	"gist/backend/internal/service"
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"
)

func TestAuthService_RegisterAndLogin_Success(t *testing.T) {
	repo := newSettingsRepoStub()
	svc := service.NewAuthService(repo)

	resp, err := svc.Register(context.Background(), "alice1", "", "alice@example.com", "secret1")
	require.NoError(t, err, "register should not fail")
	require.NotNil(t, resp, "expected auth response")
	require.NotNil(t, resp.User, "expected user in response")
	require.Equal(t, "alice1", resp.User.Username)
	require.Equal(t, "alice1", resp.User.Nickname, "expected nickname default to username")
	require.Equal(t, "alice@example.com", resp.User.Email)
	require.NotEmpty(t, resp.Token, "expected token")

	ok, err := svc.ValidateToken(resp.Token)
	require.NoError(t, err, "token validation should not fail")
	require.True(t, ok, "expected token to be valid")

	loginResp, err := svc.Login(context.Background(), "alice1", "secret1")
	require.NoError(t, err, "login should not fail")
	require.NotNil(t, loginResp.User, "expected user in login response")
	require.Equal(t, "alice1", loginResp.User.Username)

	loginByEmail, err := svc.Login(context.Background(), "Alice@Example.com", "secret1")
	require.NoError(t, err, "login by email should not fail")
	require.NotNil(t, loginByEmail.User, "expected user in login response")
	require.Equal(t, "alice@example.com", loginByEmail.User.Email)
}

func TestAuthService_Register_ValidationErrors(t *testing.T) {
	cases := []struct {
		name     string
		username string
		nickname string
		email    string
		password string
		wantErr  error
	}{
		{name: "missing username", username: "", email: "a@b.com", password: "secret", wantErr: service.ErrUsernameRequiredHelper},
		{name: "invalid username", username: "1alice", email: "a@b.com", password: "secret", wantErr: service.ErrInvalidUsernameHelper},
		{name: "missing email", username: "alice", email: "", password: "secret", wantErr: service.ErrEmailRequiredHelper},
		{name: "missing password", username: "alice", email: "a@b.com", password: "", wantErr: service.ErrPasswordRequiredHelper},
		{name: "short password", username: "alice", email: "a@b.com", password: "123", wantErr: service.ErrPasswordTooShortHelper},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := newSettingsRepoStub()
			svc := service.NewAuthService(repo)

			_, err := svc.Register(context.Background(), tc.username, tc.nickname, tc.email, tc.password)
			require.ErrorIs(t, err, tc.wantErr)
		})
	}
}

func TestAuthService_Register_UserExists(t *testing.T) {
	repo := newSettingsRepoStub()
	repo.data[service.KeyUserUsername] = "existing"
	svc := service.NewAuthService(repo)

	_, err := svc.Register(context.Background(), "alice", "", "alice@example.com", "secret1")
	require.ErrorIs(t, err, service.ErrUserExistsHelper)
}

func TestAuthService_Login_Errors(t *testing.T) {
	repo := newSettingsRepoStub()
	svc := service.NewAuthService(repo)

	_, err := svc.Login(context.Background(), "", "secret")
	require.ErrorIs(t, err, service.ErrUsernameRequiredHelper)

	_, err = svc.Login(context.Background(), "alice", "")
	require.ErrorIs(t, err, service.ErrPasswordRequiredHelper)

	_, err = svc.Login(context.Background(), "alice", "secret")
	require.ErrorIs(t, err, service.ErrUserNotFoundHelper)

	hash, err := bcrypt.GenerateFromPassword([]byte("secret1"), bcrypt.DefaultCost)
	require.NoError(t, err, "failed to hash password")

	repo.data[service.KeyUserUsername] = "alice"
	repo.data[service.KeyUserEmail] = "alice@example.com"
	repo.data[service.KeyUserPasswordHash] = string(hash)
	repo.data[service.KeyUserJWTSecret] = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

	_, err = svc.Login(context.Background(), "bob", "secret1")
	require.ErrorIs(t, err, service.ErrInvalidPasswordHelper)

	_, err = svc.Login(context.Background(), "alice", "wrong")
	require.ErrorIs(t, err, service.ErrInvalidPasswordHelper)
}

func TestAuthService_UpdateProfile(t *testing.T) {
	repo := newSettingsRepoStub()
	svc := service.NewAuthService(repo)

	hash, err := bcrypt.GenerateFromPassword([]byte("secret1"), bcrypt.DefaultCost)
	require.NoError(t, err, "failed to hash password")

	repo.data[service.KeyUserUsername] = "alice"
	repo.data[service.KeyUserNickname] = "Alice"
	repo.data[service.KeyUserEmail] = "alice@example.com"
	repo.data[service.KeyUserPasswordHash] = string(hash)

	updated, err := svc.UpdateProfile(context.Background(), "New Nick", "new@example.com", "", "")
	require.NoError(t, err, "update profile should not fail")
	require.Equal(t, "New Nick", updated.User.Nickname)
	require.Equal(t, "new@example.com", updated.User.Email)
	require.Nil(t, updated.Token, "expected no token for non-password update")

	_, err = svc.UpdateProfile(context.Background(), "", "", "", "newpass")
	require.ErrorIs(t, err, service.ErrCurrentPasswordRequiredHelper)

	_, err = svc.UpdateProfile(context.Background(), "", "", "wrong", "newpass")
	require.ErrorIs(t, err, service.ErrInvalidPasswordHelper)

	_, err = svc.UpdateProfile(context.Background(), "", "", "secret1", "123")
	require.ErrorIs(t, err, service.ErrPasswordTooShortHelper)

	_, err = svc.UpdateProfile(context.Background(), "", "", "secret1", "secret1")
	require.ErrorIs(t, err, service.ErrSamePasswordHelper)

	updated, err = svc.UpdateProfile(context.Background(), "", "", "secret1", "newpass1")
	require.NoError(t, err, "update password should not fail")
	require.Equal(t, "alice", updated.User.Username)
	require.NotNil(t, updated.Token, "expected new token after password change")
	require.NotEmpty(t, *updated.Token, "expected non-empty token")
}

func TestAuthService_ValidateToken_MissingSecret(t *testing.T) {
	repo := newSettingsRepoStub()
	svc := service.NewAuthService(repo)

	ok, err := svc.ValidateToken("invalid")
	require.ErrorIs(t, err, service.ErrInvalidTokenHelper)
	require.False(t, ok, "expected token to be invalid")
}
