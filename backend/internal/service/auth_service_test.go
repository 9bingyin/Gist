package service

import (
	"context"
	"errors"
	"testing"

	"golang.org/x/crypto/bcrypt"
)

func TestAuthService_RegisterAndLogin_Success(t *testing.T) {
	repo := newSettingsRepoStub()
	svc := NewAuthService(repo)

	resp, err := svc.Register(context.Background(), "alice1", "", "alice@example.com", "secret1")
	if err != nil {
		t.Fatalf("register failed: %v", err)
	}
	if resp == nil || resp.User == nil {
		t.Fatal("expected auth response with user")
	}
	if resp.User.Username != "alice1" {
		t.Fatalf("unexpected username: %s", resp.User.Username)
	}
	if resp.User.Nickname != "alice1" {
		t.Fatalf("expected nickname default to username")
	}
	if resp.User.Email != "alice@example.com" {
		t.Fatalf("unexpected email: %s", resp.User.Email)
	}
	if resp.Token == "" {
		t.Fatal("expected token")
	}

	ok, err := svc.ValidateToken(resp.Token)
	if err != nil || !ok {
		t.Fatalf("expected token to be valid, err=%v", err)
	}

	loginResp, err := svc.Login(context.Background(), "alice1", "secret1")
	if err != nil {
		t.Fatalf("login failed: %v", err)
	}
	if loginResp.User == nil || loginResp.User.Username != "alice1" {
		t.Fatalf("unexpected login user")
	}

	loginByEmail, err := svc.Login(context.Background(), "Alice@Example.com", "secret1")
	if err != nil {
		t.Fatalf("login by email failed: %v", err)
	}
	if loginByEmail.User == nil || loginByEmail.User.Email != "alice@example.com" {
		t.Fatalf("unexpected email in login response")
	}
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
		{name: "missing username", username: "", email: "a@b.com", password: "secret", wantErr: ErrUsernameRequired},
		{name: "invalid username", username: "1alice", email: "a@b.com", password: "secret", wantErr: ErrInvalidUsername},
		{name: "missing email", username: "alice", email: "", password: "secret", wantErr: ErrEmailRequired},
		{name: "missing password", username: "alice", email: "a@b.com", password: "", wantErr: ErrPasswordRequired},
		{name: "short password", username: "alice", email: "a@b.com", password: "123", wantErr: ErrPasswordTooShort},
	}

	for _, tc := range cases {
		repo := newSettingsRepoStub()
		svc := NewAuthService(repo)

		_, err := svc.Register(context.Background(), tc.username, tc.nickname, tc.email, tc.password)
		if !errors.Is(err, tc.wantErr) {
			t.Fatalf("%s: expected %v, got %v", tc.name, tc.wantErr, err)
		}
	}
}

func TestAuthService_Register_UserExists(t *testing.T) {
	repo := newSettingsRepoStub()
	repo.data[keyUserUsername] = "existing"
	svc := NewAuthService(repo)

	_, err := svc.Register(context.Background(), "alice", "", "alice@example.com", "secret1")
	if !errors.Is(err, ErrUserExists) {
		t.Fatalf("expected ErrUserExists, got %v", err)
	}
}

func TestAuthService_Login_Errors(t *testing.T) {
	repo := newSettingsRepoStub()
	svc := NewAuthService(repo)

	if _, err := svc.Login(context.Background(), "", "secret"); !errors.Is(err, ErrUsernameRequired) {
		t.Fatalf("expected ErrUsernameRequired, got %v", err)
	}
	if _, err := svc.Login(context.Background(), "alice", ""); !errors.Is(err, ErrPasswordRequired) {
		t.Fatalf("expected ErrPasswordRequired, got %v", err)
	}
	if _, err := svc.Login(context.Background(), "alice", "secret"); !errors.Is(err, ErrUserNotFound) {
		t.Fatalf("expected ErrUserNotFound, got %v", err)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte("secret1"), bcrypt.DefaultCost)
	if err != nil {
		t.Fatalf("failed to hash password: %v", err)
	}
	repo.data[keyUserUsername] = "alice"
	repo.data[keyUserEmail] = "alice@example.com"
	repo.data[keyUserPasswordHash] = string(hash)
	repo.data[keyUserJWTSecret] = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

	if _, err := svc.Login(context.Background(), "bob", "secret1"); !errors.Is(err, ErrInvalidPassword) {
		t.Fatalf("expected ErrInvalidPassword, got %v", err)
	}
	if _, err := svc.Login(context.Background(), "alice", "wrong"); !errors.Is(err, ErrInvalidPassword) {
		t.Fatalf("expected ErrInvalidPassword, got %v", err)
	}
}

func TestAuthService_UpdateProfile(t *testing.T) {
	repo := newSettingsRepoStub()
	svc := NewAuthService(repo)

	hash, err := bcrypt.GenerateFromPassword([]byte("secret1"), bcrypt.DefaultCost)
	if err != nil {
		t.Fatalf("failed to hash password: %v", err)
	}
	repo.data[keyUserUsername] = "alice"
	repo.data[keyUserNickname] = "Alice"
	repo.data[keyUserEmail] = "alice@example.com"
	repo.data[keyUserPasswordHash] = string(hash)

	updated, err := svc.UpdateProfile(context.Background(), "New Nick", "new@example.com", "", "")
	if err != nil {
		t.Fatalf("update profile failed: %v", err)
	}
	if updated.User.Nickname != "New Nick" || updated.User.Email != "new@example.com" {
		t.Fatalf("unexpected updated user")
	}
	if updated.Token != nil {
		t.Fatalf("expected no token for non-password update")
	}

	if _, err := svc.UpdateProfile(context.Background(), "", "", "", "newpass"); !errors.Is(err, ErrCurrentPasswordRequired) {
		t.Fatalf("expected ErrCurrentPasswordRequired, got %v", err)
	}
	if _, err := svc.UpdateProfile(context.Background(), "", "", "wrong", "newpass"); !errors.Is(err, ErrInvalidPassword) {
		t.Fatalf("expected ErrInvalidPassword, got %v", err)
	}
	if _, err := svc.UpdateProfile(context.Background(), "", "", "secret1", "123"); !errors.Is(err, ErrPasswordTooShort) {
		t.Fatalf("expected ErrPasswordTooShort, got %v", err)
	}
	if _, err := svc.UpdateProfile(context.Background(), "", "", "secret1", "secret1"); !errors.Is(err, ErrSamePassword) {
		t.Fatalf("expected ErrSamePassword, got %v", err)
	}

	updated, err = svc.UpdateProfile(context.Background(), "", "", "secret1", "newpass1")
	if err != nil {
		t.Fatalf("update password failed: %v", err)
	}
	if updated.User.Username != "alice" {
		t.Fatalf("unexpected username after update")
	}
	if updated.Token == nil || *updated.Token == "" {
		t.Fatalf("expected new token after password change")
	}
}

func TestAuthService_ValidateToken_MissingSecret(t *testing.T) {
	repo := newSettingsRepoStub()
	svc := NewAuthService(repo)

	ok, err := svc.ValidateToken("invalid")
	if !errors.Is(err, ErrInvalidToken) || ok {
		t.Fatalf("expected ErrInvalidToken, got ok=%v err=%v", ok, err)
	}
}
