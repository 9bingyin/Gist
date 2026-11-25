//go:generate mockgen -source=$GOFILE -destination=mock/$GOFILE -package=mock
package service

import (
	"context"
	"crypto/md5"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"

	"gist/backend/internal/repository"
	"gist/backend/pkg/logger"
)

// Auth setting keys.
const (
	keyUserUsername     = "user.username"
	keyUserNickname     = "user.nickname"
	keyUserEmail        = "user.email"
	keyUserPasswordHash = "user.password_hash"
	keyUserJWTSecret    = "user.jwt_secret"
)

// Auth errors.
var (
	ErrUserExists              = errors.New("user already exists")
	ErrUserNotFound            = errors.New("user not found")
	ErrInvalidPassword         = errors.New("invalid password")
	ErrInvalidToken            = errors.New("invalid token")
	ErrUsernameRequired        = errors.New("username is required")
	ErrInvalidUsername         = errors.New("username must not contain whitespace or control characters")
	ErrEmailRequired           = errors.New("email is required")
	ErrPasswordRequired        = errors.New("password is required")
	ErrPasswordTooShort        = errors.New("password must be at least 6 characters")
	ErrPasswordTooLong         = errors.New("password must be at most 72 bytes")
	ErrCurrentPasswordRequired = errors.New("current password is required")
	ErrSamePassword            = errors.New("new password must be different from current password")
)

// User represents the authenticated user.
type User struct {
	Username  string `json:"username"`
	Nickname  string `json:"nickname"`
	Email     string `json:"email"`
	AvatarURL string `json:"avatarUrl"`
}

// AuthService provides authentication functionality.
type AuthService interface {
	CheckUserExists(ctx context.Context) (bool, error)
	Register(ctx context.Context, username, nickname, email, password string) (*AuthResponse, error)
	Login(ctx context.Context, identifier, password string) (*AuthResponse, error)
	GetCurrentUser(ctx context.Context) (*User, error)
	ValidateToken(ctx context.Context, token string) (bool, error)
	UpdateProfile(ctx context.Context, nickname, email, currentPassword, newPassword string) (*UpdateProfileResponse, error)
}

// AuthResponse is returned after successful login/register.
type AuthResponse struct {
	Token string `json:"token"`
	User  *User  `json:"user"`
}

// UpdateProfileResponse is returned after updating profile.
type UpdateProfileResponse struct {
	User  *User   `json:"user"`
	Token *string `json:"token,omitempty"`
}

type authService struct {
	repo       repository.SettingsRepository
	registerMu sync.Mutex

	secretMu    sync.RWMutex
	jwtSecret   []byte
	secretReady bool
}

// NewAuthService creates a new auth service.
func NewAuthService(repo repository.SettingsRepository) AuthService {
	return &authService{repo: repo}
}

func isValidUsername(username string) bool {
	if username == "" {
		return false
	}
	for _, r := range username {
		if unicode.IsSpace(r) || unicode.IsControl(r) {
			return false
		}
	}
	return true
}

func hashPassword(password string) ([]byte, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		if errors.Is(err, bcrypt.ErrPasswordTooLong) {
			return nil, ErrPasswordTooLong
		}
		return nil, fmt.Errorf("hash password: %w", err)
	}
	return hash, nil
}

func (s *authService) CheckUserExists(ctx context.Context) (bool, error) {
	setting, err := s.repo.Get(ctx, keyUserUsername)
	if err != nil {
		return false, fmt.Errorf("check user exists: %w", err)
	}
	return setting != nil && setting.Value != "", nil
}

func (s *authService) Register(ctx context.Context, username, nickname, email, password string) (*AuthResponse, error) {
	username = strings.TrimSpace(strings.ToLower(username))
	nickname = strings.TrimSpace(nickname)
	email = strings.TrimSpace(email)

	if username == "" {
		return nil, ErrUsernameRequired
	}
	if !isValidUsername(username) {
		return nil, ErrInvalidUsername
	}
	if nickname == "" {
		nickname = username
	}
	if email == "" {
		return nil, ErrEmailRequired
	}
	if password == "" {
		return nil, ErrPasswordRequired
	}
	if len(password) < 6 {
		return nil, ErrPasswordTooShort
	}

	s.registerMu.Lock()
	defer s.registerMu.Unlock()

	exists, err := s.CheckUserExists(ctx)
	if err != nil {
		return nil, err
	}
	if exists {
		logger.Warn("auth register exists", "module", "service", "action", "create", "resource", "auth", "result", "failed", "actor", username)
		return nil, ErrUserExists
	}

	hash, err := hashPassword(password)
	if err != nil {
		return nil, err
	}

	jwtSecret := make([]byte, 32)
	if _, err := rand.Read(jwtSecret); err != nil {
		return nil, fmt.Errorf("generate jwt secret: %w", err)
	}
	jwtSecretHex := hex.EncodeToString(jwtSecret)

	if err := s.repo.SetMany(ctx, map[string]string{
		keyUserUsername:     username,
		keyUserNickname:     nickname,
		keyUserEmail:        email,
		keyUserPasswordHash: string(hash),
		keyUserJWTSecret:    jwtSecretHex,
	}); err != nil {
		return nil, fmt.Errorf("save user: %w", err)
	}

	s.cacheJWTSecret(jwtSecret)

	token, err := signToken(username, jwtSecret)
	if err != nil {
		return nil, err
	}

	logger.Info("auth register", "module", "service", "action", "create", "resource", "auth", "result", "ok", "actor", username)
	return &AuthResponse{
		Token: token,
		User: &User{
			Username:  username,
			Nickname:  nickname,
			Email:     email,
			AvatarURL: gravatarURL(email),
		},
	}, nil
}

func (s *authService) Login(ctx context.Context, identifier, password string) (*AuthResponse, error) {
	identifier = strings.TrimSpace(identifier)

	if identifier == "" {
		return nil, ErrUsernameRequired
	}
	if password == "" {
		return nil, ErrPasswordRequired
	}

	storedUsername, err := s.getString(ctx, keyUserUsername)
	if err != nil {
		return nil, err
	}
	if storedUsername == "" {
		return nil, ErrUserNotFound
	}

	storedEmail, err := s.getString(ctx, keyUserEmail)
	if err != nil {
		return nil, err
	}

	identifierLower := strings.ToLower(identifier)
	if storedUsername != identifierLower && strings.ToLower(storedEmail) != identifierLower {
		logger.Warn("auth login invalid identifier", "module", "service", "action", "login", "resource", "auth", "result", "failed", "actor", identifier)
		return nil, ErrInvalidPassword
	}

	storedHash, err := s.getString(ctx, keyUserPasswordHash)
	if err != nil {
		return nil, err
	}

	if err := bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(password)); err != nil {
		logger.Warn("auth login invalid password", "module", "service", "action", "login", "resource", "auth", "result", "failed", "actor", identifier)
		return nil, ErrInvalidPassword
	}

	storedNickname, err := s.getString(ctx, keyUserNickname)
	if err != nil {
		return nil, err
	}
	if storedNickname == "" {
		storedNickname = storedUsername
	}

	secretBytes, err := s.getJWTSecret(ctx)
	if err != nil {
		return nil, err
	}

	token, err := signToken(storedUsername, secretBytes)
	if err != nil {
		return nil, err
	}

	logger.Info("auth login", "module", "service", "action", "login", "resource", "auth", "result", "ok", "actor", storedUsername)
	return &AuthResponse{
		Token: token,
		User: &User{
			Username:  storedUsername,
			Nickname:  storedNickname,
			Email:     storedEmail,
			AvatarURL: gravatarURL(storedEmail),
		},
	}, nil
}

func (s *authService) GetCurrentUser(ctx context.Context) (*User, error) {
	username, err := s.getString(ctx, keyUserUsername)
	if err != nil {
		return nil, err
	}
	if username == "" {
		return nil, ErrUserNotFound
	}

	nickname, err := s.getString(ctx, keyUserNickname)
	if err != nil {
		return nil, err
	}
	if nickname == "" {
		nickname = username
	}
	email, err := s.getString(ctx, keyUserEmail)
	if err != nil {
		return nil, err
	}

	return &User{
		Username:  username,
		Nickname:  nickname,
		Email:     email,
		AvatarURL: gravatarURL(email),
	}, nil
}

// ValidateToken validates a JWT token using an in-memory cached signing key.
func (s *authService) ValidateToken(ctx context.Context, tokenString string) (bool, error) {
	secretBytes, err := s.getJWTSecret(ctx)
	if err != nil || len(secretBytes) == 0 {
		return false, ErrInvalidToken
	}

	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return secretBytes, nil
	})
	if err != nil || !token.Valid {
		return false, ErrInvalidToken
	}
	return true, nil
}

func (s *authService) cacheJWTSecret(secret []byte) {
	copied := append([]byte(nil), secret...)
	s.secretMu.Lock()
	s.jwtSecret = copied
	s.secretReady = true
	s.secretMu.Unlock()
}

func (s *authService) getJWTSecret(ctx context.Context) ([]byte, error) {
	s.secretMu.RLock()
	if s.secretReady && len(s.jwtSecret) > 0 {
		secret := s.jwtSecret
		s.secretMu.RUnlock()
		return secret, nil
	}
	s.secretMu.RUnlock()

	jwtSecretHex, err := s.getString(ctx, keyUserJWTSecret)
	if err != nil {
		return nil, err
	}
	if jwtSecretHex == "" {
		return nil, ErrInvalidToken
	}
	secretBytes, err := hex.DecodeString(jwtSecretHex)
	if err != nil {
		return nil, fmt.Errorf("decode jwt secret: %w", err)
	}
	s.cacheJWTSecret(secretBytes)
	return secretBytes, nil
}

func signToken(username string, secretBytes []byte) (string, error) {
	claims := jwt.MapClaims{
		"sub": username,
		"iat": time.Now().Unix(),
		"exp": time.Now().Add(30 * 24 * time.Hour).Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(secretBytes)
	if err != nil {
		return "", fmt.Errorf("sign token: %w", err)
	}
	return tokenString, nil
}

// UpdateProfile validates all inputs (including password checks) up-front and writes
// all changes atomically in a single transaction.
func (s *authService) UpdateProfile(ctx context.Context, nickname, email, currentPassword, newPassword string) (*UpdateProfileResponse, error) {
	username, err := s.getString(ctx, keyUserUsername)
	if err != nil {
		return nil, err
	}
	if username == "" {
		logger.Warn("auth profile update missing user", "module", "service", "action", "update", "resource", "auth", "result", "failed")
		return nil, ErrUserNotFound
	}

	currentNickname, err := s.getString(ctx, keyUserNickname)
	if err != nil {
		return nil, err
	}
	if currentNickname == "" {
		currentNickname = username
	}
	currentEmail, err := s.getString(ctx, keyUserEmail)
	if err != nil {
		return nil, err
	}

	updates := make(map[string]string)

	// Validate password change BEFORE persisting any profile field.
	var newSecretBytes []byte
	if newPassword != "" {
		if currentPassword == "" {
			logger.Warn("auth profile update missing current password", "module", "service", "action", "update", "resource", "auth", "result", "failed", "actor", username)
			return nil, ErrCurrentPasswordRequired
		}
		if len(newPassword) < 6 {
			logger.Warn("auth profile update password too short", "module", "service", "action", "update", "resource", "auth", "result", "failed", "actor", username)
			return nil, ErrPasswordTooShort
		}

		storedHash, err := s.getString(ctx, keyUserPasswordHash)
		if err != nil {
			return nil, err
		}
		if err := bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(currentPassword)); err != nil {
			logger.Warn("auth profile update invalid current password", "module", "service", "action", "update", "resource", "auth", "result", "failed", "actor", username)
			return nil, ErrInvalidPassword
		}
		if err := bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(newPassword)); err == nil {
			logger.Warn("auth profile update same password", "module", "service", "action", "update", "resource", "auth", "result", "failed", "actor", username)
			return nil, ErrSamePassword
		}

		hash, err := hashPassword(newPassword)
		if err != nil {
			return nil, err
		}
		newSecretBytes = make([]byte, 32)
		if _, err := rand.Read(newSecretBytes); err != nil {
			return nil, fmt.Errorf("generate new jwt secret: %w", err)
		}
		updates[keyUserPasswordHash] = string(hash)
		updates[keyUserJWTSecret] = hex.EncodeToString(newSecretBytes)
	}

	nickname = strings.TrimSpace(nickname)
	if nickname != "" && nickname != currentNickname {
		updates[keyUserNickname] = nickname
		currentNickname = nickname
	}

	email = strings.TrimSpace(email)
	if email != "" && email != currentEmail {
		updates[keyUserEmail] = email
		currentEmail = email
	}

	if len(updates) > 0 {
		if err := s.repo.SetMany(ctx, updates); err != nil {
			logger.Warn("auth profile update failed", "module", "service", "action", "update", "resource", "auth", "result", "failed", "actor", username, "error", err)
			return nil, fmt.Errorf("update profile: %w", err)
		}
	}

	var newToken *string
	if len(newSecretBytes) > 0 {
		s.cacheJWTSecret(newSecretBytes)
		token, err := signToken(username, newSecretBytes)
		if err != nil {
			return nil, fmt.Errorf("generate new token: %w", err)
		}
		newToken = &token
	}

	logger.Info("auth profile updated", "module", "service", "action", "update", "resource", "auth", "result", "ok", "actor", username, "password_changed", newToken != nil)
	return &UpdateProfileResponse{
		User: &User{
			Username:  username,
			Nickname:  currentNickname,
			Email:     currentEmail,
			AvatarURL: gravatarURL(currentEmail),
		},
		Token: newToken,
	}, nil
}

func (s *authService) getString(ctx context.Context, key string) (string, error) {
	setting, err := s.repo.Get(ctx, key)
	if err != nil {
		return "", err
	}
	if setting == nil {
		return "", nil
	}
	return setting.Value, nil
}

func gravatarURL(email string) string {
	email = strings.ToLower(strings.TrimSpace(email))
	hash := md5.Sum([]byte(email))
	return fmt.Sprintf("https://www.gravatar.com/avatar/%s?d=mp&s=80", hex.EncodeToString(hash[:]))
}
