package anubis_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"gist/backend/internal/model"
	"gist/backend/internal/repository"
	"gist/backend/internal/service/anubis"

	"github.com/stretchr/testify/require"
)

type settingsRepoStub struct {
	data      map[string]string
	getErr    map[string]error
	setErr    map[string]error
	deleteErr map[string]error
}

func newSettingsRepoStub() *settingsRepoStub {
	return &settingsRepoStub{
		data:      make(map[string]string),
		getErr:    make(map[string]error),
		setErr:    make(map[string]error),
		deleteErr: make(map[string]error),
	}
}

func (s *settingsRepoStub) Get(ctx context.Context, key string) (*model.Setting, error) {
	if err := s.getErr[key]; err != nil {
		return nil, err
	}
	val, ok := s.data[key]
	if !ok {
		return nil, nil
	}
	return &model.Setting{Key: key, Value: val, UpdatedAt: time.Now().UTC()}, nil
}

func (s *settingsRepoStub) Set(ctx context.Context, key, value string) error {
	if err := s.setErr[key]; err != nil {
		return err
	}
	s.data[key] = value
	return nil
}

func (s *settingsRepoStub) Delete(ctx context.Context, key string) error {
	if err := s.deleteErr[key]; err != nil {
		return err
	}
	delete(s.data, key)
	return nil
}

func (s *settingsRepoStub) GetByPrefix(ctx context.Context, prefix string) ([]model.Setting, error) {
	settings := make([]model.Setting, 0)
	for key, val := range s.data {
		if len(prefix) == 0 || (len(key) >= len(prefix) && key[:len(prefix)] == prefix) {
			settings = append(settings, model.Setting{Key: key, Value: val, UpdatedAt: time.Now().UTC()})
		}
	}
	return settings, nil
}

func (s *settingsRepoStub) DeleteByPrefix(ctx context.Context, prefix string) (int64, error) {
	var count int64
	for key := range s.data {
		if len(prefix) == 0 || (len(key) >= len(prefix) && key[:len(prefix)] == prefix) {
			delete(s.data, key)
			count++
		}
	}
	return count, nil
}

var _ repository.SettingsRepository = (*settingsRepoStub)(nil)

func TestStore_GetCookie_Valid(t *testing.T) {
	repo := newSettingsRepoStub()
	store := anubis.NewStore(repo)

	host := "example.com"
	repo.data["anubis.cookie."+host+".expires"] = time.Now().Add(1 * time.Hour).Format(time.RFC3339)
	repo.data["anubis.cookie."+host] = "cookie-value"

	cookie, err := store.GetCookie(context.Background(), host)
	require.NoError(t, err)
	require.Equal(t, "cookie-value", cookie)
}

func TestStore_GetCookie_ExpiredDeletes(t *testing.T) {
	repo := newSettingsRepoStub()
	store := anubis.NewStore(repo)

	host := "example.com"
	repo.data["anubis.cookie."+host+".expires"] = time.Now().Add(-1 * time.Hour).Format(time.RFC3339)
	repo.data["anubis.cookie."+host] = "cookie-value"

	cookie, err := store.GetCookie(context.Background(), host)
	require.NoError(t, err)
	require.Empty(t, cookie)
	require.NotContains(t, repo.data, "anubis.cookie."+host)
	require.NotContains(t, repo.data, "anubis.cookie."+host+".expires")
}

func TestStore_GetCookie_InvalidExpiry(t *testing.T) {
	repo := newSettingsRepoStub()
	store := anubis.NewStore(repo)

	host := "example.com"
	repo.data["anubis.cookie."+host+".expires"] = "invalid"
	repo.data["anubis.cookie."+host] = "cookie-value"

	cookie, err := store.GetCookie(context.Background(), host)
	require.NoError(t, err)
	require.Empty(t, cookie)
}

func TestStore_GetCookie_ExpiresReadError(t *testing.T) {
	repo := newSettingsRepoStub()
	store := anubis.NewStore(repo)

	host := "example.com"
	repo.getErr["anubis.cookie."+host+".expires"] = errors.New("read failed")

	_, err := store.GetCookie(context.Background(), host)
	require.Error(t, err)
}

func TestStore_SetCookie_StoresValues(t *testing.T) {
	repo := newSettingsRepoStub()
	store := anubis.NewStore(repo)

	host := "example.com"
	expires := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)

	err := store.SetCookie(context.Background(), host, "cookie-value", expires)
	require.NoError(t, err)
	require.Equal(t, "cookie-value", repo.data["anubis.cookie."+host])
	require.Equal(t, expires.Format(time.RFC3339), repo.data["anubis.cookie."+host+".expires"])
}

func TestStore_DeleteCookie_Errors(t *testing.T) {
	repo := newSettingsRepoStub()
	store := anubis.NewStore(repo)

	host := "example.com"
	repo.deleteErr["anubis.cookie."+host] = errors.New("delete failed")

	err := store.DeleteCookie(context.Background(), host)
	require.Error(t, err)
}

func TestStore_DeleteCookie_ExpiresError(t *testing.T) {
	repo := newSettingsRepoStub()
	store := anubis.NewStore(repo)

	host := "example.com"
	// Cookie delete succeeds but expires delete fails
	repo.data["anubis.cookie."+host] = "cookie-value"
	repo.data["anubis.cookie."+host+".expires"] = time.Now().Add(1 * time.Hour).Format(time.RFC3339)
	repo.deleteErr["anubis.cookie."+host+".expires"] = errors.New("expires delete failed")

	err := store.DeleteCookie(context.Background(), host)
	require.Error(t, err)
	require.Contains(t, err.Error(), "delete expires")
}

func TestStore_SetCookie_CookieError(t *testing.T) {
	repo := newSettingsRepoStub()
	store := anubis.NewStore(repo)

	host := "example.com"
	repo.setErr["anubis.cookie."+host] = errors.New("set cookie failed")

	err := store.SetCookie(context.Background(), host, "cookie-value", time.Now().Add(1*time.Hour))
	require.Error(t, err)
	require.Contains(t, err.Error(), "set cookie")
}

func TestStore_SetCookie_ExpiresError(t *testing.T) {
	repo := newSettingsRepoStub()
	store := anubis.NewStore(repo)

	host := "example.com"
	// Cookie set succeeds but expires set fails
	repo.setErr["anubis.cookie."+host+".expires"] = errors.New("set expires failed")

	err := store.SetCookie(context.Background(), host, "cookie-value", time.Now().Add(1*time.Hour))
	require.Error(t, err)
	require.Contains(t, err.Error(), "set expires")
}

func TestStore_GetCookie_CookieReadError(t *testing.T) {
	repo := newSettingsRepoStub()
	store := anubis.NewStore(repo)

	host := "example.com"
	// Expires read succeeds but cookie read fails
	repo.data["anubis.cookie."+host+".expires"] = time.Now().Add(1 * time.Hour).Format(time.RFC3339)
	repo.getErr["anubis.cookie."+host] = errors.New("cookie read failed")

	_, err := store.GetCookie(context.Background(), host)
	require.Error(t, err)
	require.Contains(t, err.Error(), "get cookie")
}

func TestStore_GetCookie_NilSettings(t *testing.T) {
	store := anubis.NewStore(nil)

	cookie, err := store.GetCookie(context.Background(), "example.com")
	require.NoError(t, err)
	require.Empty(t, cookie)
}

func TestStore_SetCookie_NilSettings(t *testing.T) {
	store := anubis.NewStore(nil)

	err := store.SetCookie(context.Background(), "example.com", "value", time.Now())
	require.NoError(t, err)
}

func TestStore_DeleteCookie_NilSettings(t *testing.T) {
	store := anubis.NewStore(nil)

	err := store.DeleteCookie(context.Background(), "example.com")
	require.NoError(t, err)
}

func TestStore_GetCookie_NotFound(t *testing.T) {
	repo := newSettingsRepoStub()
	store := anubis.NewStore(repo)

	// No data set - should return empty without error
	cookie, err := store.GetCookie(context.Background(), "nonexistent.com")
	require.NoError(t, err)
	require.Empty(t, cookie)
}

func TestStore_GetCookie_ExpiresFoundButCookieNotFound(t *testing.T) {
	repo := newSettingsRepoStub()
	store := anubis.NewStore(repo)

	host := "example.com"
	// Expires exists but cookie doesn't
	repo.data["anubis.cookie."+host+".expires"] = time.Now().Add(1 * time.Hour).Format(time.RFC3339)

	cookie, err := store.GetCookie(context.Background(), host)
	require.NoError(t, err)
	require.Empty(t, cookie)
}
