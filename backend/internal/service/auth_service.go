//go:generate mockgen -source=$GOFILE -destination=mock/$GOFILE -package=mock
package service

import (
	"context"
	"crypto/md5"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"

	"gist/backend/pkg/logger"
	"gist/backend/internal/repository"
)

// usernameRegex validates username format: lowercase letters and numbers only, starts with letter
var usernameRegex = regexp.MustCompile(`^[a-z][a-z0-9]*$`)

// Auth setting keys
const (
	keyUserUsername     = "user.username"
	keyUserNickname     = "user.nickname"
	keyUserEmail        = "user.email"
	keyUserPasswordHash = "user.password_hash"
	keyUserJWTSecret    = "user.jwt_secret"
)

// Auth errors
var (
	ErrUserExists              = errors.New("user already exists")
	ErrUserNotFound            = errors.New("user not found")
	ErrInvalidPassword         = errors.New("invalid password")
	ErrInvalidToken            = errors.New("invalid token")
	ErrUsernameRequired        = errors.New("username is required")
	ErrInvalidUsername         = errors.New("username must be lowercase letters and numbers only, starting with a letter")
	ErrEmailRequired           = errors.New("email is required")
	ErrPasswordRequired        = errors.New("password is required")
	ErrPasswordTooShort        = errors.New("password must be at least 6 characters")
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
	// CheckUserExists checks if a user has been registered.
	CheckUserExists(ctx context.Context) (bool, error)
	// Register creates a new user (only if none exists).
	Register(ctx context.Context, username, nickname, email, password string) (*AuthResponse, error)
	// Login authenticates a user and returns a JWT token.
	// The identifier can be either username or email.
	Login(ctx context.Context, identifier, password string) (*AuthResponse, error)
	// GetCurrentUser returns the current user info.
	GetCurrentUser(ctx context.Context) (*User, error)
	// ValidateToken validates a JWT token and returns whether it's valid.
	ValidateToken(token string) (bool, error)
	// UpdateProfile updates user nickname, email and/or password.
	// Returns new token when password is changed (old tokens become invalid).
	UpdateProfile(ctx context.Context, nickname, email, currentPassword, newPassword string) (*UpdateProfileResponse, error)
}

// AuthResponse is returned after successful login/register.
type AuthResponse struct {
	Token string `json:"token"`
	User  *User  `json:"user"`
}

// UpdateProfileResponse is returned after updating profile.
// Token is only set when password was changed (old tokens become invalid).
type UpdateProfileResponse struct {
	User  *User   `json:"user"`
	Token *string `json:"token,omitempty"`
}

type authService struct {
	repo repository.SettingsRepository
}

// NewAuthService creates a new auth service.
func NewAuthService(repo repository.SettingsRepository) AuthService {
	return &authService{repo: repo}
}

// CheckUserExists checks if a user has been registered.
func (s *authService) CheckUserExists(ctx context.Context) (bool, error) {
	setting, err := s.repo.Get(ctx, keyUserUsername)
	if err != nil {
		return false, fmt.Errorf("check user exists: %w", err)
	}
	return setting != nil && setting.Value != "", nil
}

// Register creates a new user (only if none exists).
func (s *authService) Register(ctx context.Context, username, nickname, email, password string) (*AuthResponse, error) {
	// Validate input
	username = strings.TrimSpace(strings.ToLower(username))
	nickname = strings.TrimSpace(nickname)
	email = strings.TrimSpace(email)

	if username == "" {
		return nil, ErrUsernameRequired
	}
	if !usernameRegex.MatchString(username) {
		return nil, ErrInvalidUsername
	}
	// Use username as nickname if not provided
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

	// Check if user already exists
	exists, err := s.CheckUserExists(ctx)
	if err != nil {
		return nil, err
	}
	if exists {
		logger.Warn("auth register exists", "module", "service", "action", "create", "resource", "auth", "result", "failed", "actor", username)
		return nil, ErrUserExists
	}

	// Hash password
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	// Generate JWT secret
	jwtSecret := make([]byte, 32)
	if _, err := rand.Read(jwtSecret); err != nil {
		return nil, fmt.Errorf("generate jwt secret: %w", err)
	}
	jwtSecretHex := hex.EncodeToString(jwtSecret)

	// Save user info
	if err := s.repo.Set(ctx, keyUserUsername, username); err != nil {
		return nil, fmt.Errorf("save username: %w", err)
	}
	if err := s.repo.Set(ctx, keyUserNickname, nickname); err != nil {
		return nil, fmt.Errorf("save nickname: %w", err)
	}
	if err := s.repo.Set(ctx, keyUserEmail, email); err != nil {
		return nil, fmt.Errorf("save email: %w", err)
	}
	if err := s.repo.Set(ctx, keyUserPasswordHash, string(hash)); err != nil {
		return nil, fmt.Errorf("save password hash: %w", err)
	}
	if err := s.repo.Set(ctx, keyUserJWTSecret, jwtSecretHex); err != nil {
		return nil, fmt.Errorf("save jwt secret: %w", err)
	}

	// Generate token and return
	token, err := s.generateToken(username, jwtSecretHex)
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

// Login authenticates a user and returns a JWT token.
// The identifier can be either username or email.
func (s *authService) Login(ctx context.Context, identifier, password string) (*AuthResponse, error) {
	identifier = strings.TrimSpace(identifier)

	if identifier == "" {
		return nil, ErrUsernameRequired
	}
	if password == "" {
		return nil, ErrPasswordRequired
	}

	// Get stored username and email
	storedUsername, err := s.getString(ctx, keyUserUsername)
	if err != nil {
		return nil, err
	}
	if storedUsername == "" {
		return nil, ErrUserNotFound
	}

	storedEmail, _ := s.getString(ctx, keyUserEmail)

	// Check if identifier matches username or email
	identifierLower := strings.ToLower(identifier)
	if storedUsername != identifierLower && strings.ToLower(storedEmail) != identifierLower {
		logger.Warn("auth login invalid identifier", "module", "service", "action", "login", "resource", "auth", "result", "failed", "actor", identifier)
		return nil, ErrInvalidPassword
	}

	// Get stored password hash
	storedHash, err := s.getString(ctx, keyUserPasswordHash)
	if err != nil {
		return nil, err
	}

	// Verify password
	if err := bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(password)); err != nil {
		logger.Warn("auth login invalid password", "module", "service", "action", "login", "resource", "auth", "result", "failed", "actor", identifier)
		return nil, ErrInvalidPassword
	}

	// Get nickname and JWT secret
	storedNickname, _ := s.getString(ctx, keyUserNickname)
	if storedNickname == "" {
		storedNickname = storedUsername
	}
	jwtSecret, err := s.getString(ctx, keyUserJWTSecret)
	if err != nil {
		return nil, err
	}

	// Generate token
	token, err := s.generateToken(storedUsername, jwtSecret)
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

// GetCurrentUser returns the current user info.
func (s *authService) GetCurrentUser(ctx context.Context) (*User, error) {
	username, err := s.getString(ctx, keyUserUsername)
	if err != nil {
		return nil, err
	}
	if username == "" {
		return nil, ErrUserNotFound
	}

	nickname, _ := s.getString(ctx, keyUserNickname)
	if nickname == "" {
		nickname = username
	}
	email, _ := s.getString(ctx, keyUserEmail)

	return &User{
		Username:  username,
		Nickname:  nickname,
		Email:     email,
		AvatarURL: gravatarURL(email),
	}, nil
}

// ValidateToken validates a JWT token.
func (s *authService) ValidateToken(tokenString string) (bool, error) {
	jwtSecret, err := s.getString(context.Background(), keyUserJWTSecret)
	if err != nil || jwtSecret == "" {
		return false, ErrInvalidToken
	}

	secretBytes, err := hex.DecodeString(jwtSecret)
	if err != nil {
		return false, ErrInvalidToken
	}

	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
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

// generateToken creates a new JWT token.
func (s *authService) generateToken(username, jwtSecretHex string) (string, error) {
	secretBytes, err := hex.DecodeString(jwtSecretHex)
	if err != nil {
		return "", fmt.Errorf("decode jwt secret: %w", err)
	}

	claims := jwt.MapClaims{
		"sub": username,
		"iat": time.Now().Unix(),
		"exp": time.Now().Add(30 * 24 * time.Hour).Unix(), // 30 days
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(secretBytes)
	if err != nil {
		return "", fmt.Errorf("sign token: %w", err)
	}

	return tokenString, nil
}

// UpdateProfile updates user nickname, email and/or password.
func (s *authService) UpdateProfile(ctx context.Context, nickname, email, currentPassword, newPassword string) (*UpdateProfileResponse, error) {
	// Check if user exists
	username, err := s.getString(ctx, keyUserUsername)
	if err != nil {
		return nil, err
	}
	if username == "" {
		logger.Warn("auth profile update missing user", "module", "service", "action", "update", "resource", "auth", "result", "failed")
		return nil, ErrUserNotFound
	}

	// Get current values
	currentNickname, _ := s.getString(ctx, keyUserNickname)
	if currentNickname == "" {
		currentNickname = username
	}
	currentEmail, _ := s.getString(ctx, keyUserEmail)

	// Update nickname if provided
	nickname = strings.TrimSpace(nickname)
	if nickname != "" && nickname != currentNickname {
		if err := s.repo.Set(ctx, keyUserNickname, nickname); err != nil {
			logger.Warn("auth profile update nickname failed", "module", "service", "action", "update", "resource", "auth", "result", "failed", "actor", username, "error", err)
			return nil, fmt.Errorf("update nickname: %w", err)
		}
		currentNickname = nickname
	}

	// Update email if provided
	email = strings.TrimSpace(email)
	if email != "" && email != currentEmail {
		if err := s.repo.Set(ctx, keyUserEmail, email); err != nil {
			logger.Warn("auth profile update email failed", "module", "service", "action", "update", "resource", "auth", "result", "failed", "actor", username, "error", err)
			return nil, fmt.Errorf("update email: %w", err)
		}
		currentEmail = email
	}

	var newToken *string

	// Update password if provided
	if newPassword != "" {
		if currentPassword == "" {
			logger.Warn("auth profile update missing current password", "module", "service", "action", "update", "resource", "auth", "result", "failed", "actor", username)
			return nil, ErrCurrentPasswordRequired
		}
		if len(newPassword) < 6 {
			logger.Warn("auth profile update password too short", "module", "service", "action", "update", "resource", "auth", "result", "failed", "actor", username)
			return nil, ErrPasswordTooShort
		}

		// Verify current password
		storedHash, err := s.getString(ctx, keyUserPasswordHash)
		if err != nil {
			return nil, err
		}
		if err := bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(currentPassword)); err != nil {
			logger.Warn("auth profile update invalid current password", "module", "service", "action", "update", "resource", "auth", "result", "failed", "actor", username)
			return nil, ErrInvalidPassword
		}

		// Check if new password is different
		if err := bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(newPassword)); err == nil {
			logger.Warn("auth profile update same password", "module", "service", "action", "update", "resource", "auth", "result", "failed", "actor", username)
			return nil, ErrSamePassword
		}

		// Hash and save new password
		hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
		if err != nil {
			return nil, fmt.Errorf("hash password: %w", err)
		}
		if err := s.repo.Set(ctx, keyUserPasswordHash, string(hash)); err != nil {
			logger.Warn("auth profile update password failed", "module", "service", "action", "update", "resource", "auth", "result", "failed", "actor", username, "error", err)
			return nil, fmt.Errorf("update password: %w", err)
		}

		// Regenerate JWT secret to invalidate all existing tokens
		newJwtSecret := make([]byte, 32)
		if _, err := rand.Read(newJwtSecret); err != nil {
			return nil, fmt.Errorf("generate new jwt secret: %w", err)
		}
		jwtSecretHex := hex.EncodeToString(newJwtSecret)
		if err := s.repo.Set(ctx, keyUserJWTSecret, jwtSecretHex); err != nil {
			logger.Warn("auth profile update jwt secret failed", "module", "service", "action", "update", "resource", "auth", "result", "failed", "actor", username, "error", err)
			return nil, fmt.Errorf("update jwt secret: %w", err)
		}

		// Generate new token for the user
		token, err := s.generateToken(username, jwtSecretHex)
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

// getString gets a string value from settings.
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

// gravatarURL generates a Gravatar URL for the given email.
func gravatarURL(email string) string {
	email = strings.ToLower(strings.TrimSpace(email))
	hash := md5.Sum([]byte(email))
	return fmt.Sprintf("https://www.gravatar.com/avatar/%s?d=mp&s=80", hex.EncodeToString(hash[:]))
}
