package anubis_test

import (
	"context"
	"encoding/json"
	"errors"
	"maps"
	"sync"
	"testing"
	"time"

	"gist/backend/internal/model"
	"gist/backend/internal/repository"
	"gist/backend/internal/service/anubis"

	"github.com/stretchr/testify/require"
)

type settingsRepoStub struct {
	mu                   sync.Mutex
	data                 map[string]string
	getCount             int
	getErr               map[string]error
	setErr               map[string]error
	deleteErr            map[string]error
	beforeDeleteByPrefix func()
	afterGet             func()
	afterSet             func(key string)
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
	s.mu.Lock()
	s.getCount++
	err := s.getErr[key]
	val, ok := s.data[key]
	afterGet := s.afterGet
	s.mu.Unlock()

	if afterGet != nil {
		afterGet()
	}
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, nil
	}
	return &model.Setting{Key: key, Value: val, UpdatedAt: time.Now().UTC()}, nil
}

func (s *settingsRepoStub) Set(ctx context.Context, key, value string) error {
	s.mu.Lock()
	if err := s.setErr[key]; err != nil {
		s.mu.Unlock()
		return err
	}
	s.data[key] = value
	hook := s.afterSet
	s.mu.Unlock()

	if hook != nil {
		hook(key)
	}
	return nil
}

func (s *settingsRepoStub) SetMany(ctx context.Context, values map[string]string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for key := range values {
		if err := s.setErr[key]; err != nil {
			return err
		}
	}
	maps.Copy(s.data, values)
	return nil
}

func (s *settingsRepoStub) Delete(ctx context.Context, key string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.deleteErr[key]; err != nil {
		return err
	}
	delete(s.data, key)
	return nil
}

func (s *settingsRepoStub) GetByPrefix(ctx context.Context, prefix string) ([]model.Setting, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	settings := make([]model.Setting, 0)
	for key, val := range s.data {
		if len(prefix) == 0 || (len(key) >= len(prefix) && key[:len(prefix)] == prefix) {
			settings = append(settings, model.Setting{Key: key, Value: val, UpdatedAt: time.Now().UTC()})
		}
	}
	return settings, nil
}

func (s *settingsRepoStub) DeleteByPrefix(ctx context.Context, prefix string) (int64, error) {
	s.mu.Lock()
	hook := s.beforeDeleteByPrefix
	s.mu.Unlock()
	if hook != nil {
		hook()
	}

	s.mu.Lock()
	defer s.mu.Unlock()
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

func TestStore_SetAndGet_SingleKeyJSONAndMemoryCache(t *testing.T) {
	repo := newSettingsRepoStub()
	store := anubis.NewStore(repo)

	host := "example.com"
	expires := time.Now().Add(1 * time.Hour).UTC().Truncate(time.Second)

	err := store.SetCookie(context.Background(), host, "cookie-value", expires)
	require.NoError(t, err)
	require.Contains(t, repo.data, "anubis.cookie."+host)
	require.NotContains(t, repo.data, "anubis.cookie."+host+".expires")

	var stored map[string]any
	require.NoError(t, json.Unmarshal([]byte(repo.data["anubis.cookie."+host]), &stored))
	require.Equal(t, "cookie-value", stored["cookie"])

	// Subsequent reads hit in-memory cache without touching DB.
	cookie, err := store.GetCookie(context.Background(), host)
	require.NoError(t, err)
	require.Equal(t, "cookie-value", cookie)
	require.Equal(t, 0, repo.getCount)

	// New store instance loads from DB once, then serves from memory.
	store2 := anubis.NewStore(repo)
	cookie, err = store2.GetCookie(context.Background(), host)
	require.NoError(t, err)
	require.Equal(t, "cookie-value", cookie)
	require.Equal(t, 1, repo.getCount)

	cookie, err = store2.GetCookie(context.Background(), host)
	require.NoError(t, err)
	require.Equal(t, "cookie-value", cookie)
	require.Equal(t, 1, repo.getCount)
}

func TestStore_GetCookie_LegacyTwoKeyCompat(t *testing.T) {
	repo := newSettingsRepoStub()
	store := anubis.NewStore(repo)

	host := "example.com"
	repo.data["anubis.cookie."+host+".expires"] = time.Now().Add(1 * time.Hour).Format(time.RFC3339)
	repo.data["anubis.cookie."+host] = "legacy-cookie"

	cookie, err := store.GetCookie(context.Background(), host)
	require.NoError(t, err)
	require.Equal(t, "legacy-cookie", cookie)
}

func TestStore_GetCookie_ExpiredDeletes(t *testing.T) {
	repo := newSettingsRepoStub()
	store := anubis.NewStore(repo)

	host := "example.com"
	require.NoError(t, store.SetCookie(context.Background(), host, "cookie-value", time.Now().Add(-1*time.Hour)))

	cookie, err := store.GetCookie(context.Background(), host)
	require.NoError(t, err)
	require.Empty(t, cookie)
	require.NotContains(t, repo.data, "anubis.cookie."+host)
}

func TestStore_ErrorsAndNilSettings(t *testing.T) {
	repo := newSettingsRepoStub()
	store := anubis.NewStore(repo)
	host := "example.com"

	repo.getErr["anubis.cookie."+host] = errors.New("read failed")
	_, err := store.GetCookie(context.Background(), host)
	require.Error(t, err)

	repo.setErr["anubis.cookie."+host] = errors.New("set failed")
	err = store.SetCookie(context.Background(), host, "val", time.Now().Add(time.Hour))
	require.Error(t, err)

	repo.deleteErr["anubis.cookie."+host] = errors.New("delete failed")
	err = store.DeleteCookie(context.Background(), host)
	require.Error(t, err)

	nilStore := anubis.NewStore(nil)
	require.NoError(t, nilStore.SetCookie(context.Background(), host, "mem-only", time.Now().Add(time.Hour)))
	got, err := nilStore.GetCookie(context.Background(), host)
	require.NoError(t, err)
	require.Equal(t, "mem-only", got)
	require.NoError(t, nilStore.DeleteCookie(context.Background(), host))
}

func TestStore_ClearAll_ConcurrentGetCookieDoesNotLeaveStaleCache(t *testing.T) {
	ctx := context.Background()
	repo := newSettingsRepoStub()
	store := anubis.NewStore(repo)
	host := "race.example.com"

	require.NoError(t, store.SetCookie(ctx, host, "stale-cookie", time.Now().Add(time.Hour)))

	deleteEntered := make(chan struct{})
	releaseDelete := make(chan struct{})
	repo.beforeDeleteByPrefix = func() {
		close(deleteEntered)
		<-releaseDelete
	}

	clearDone := make(chan error, 1)
	go func() {
		_, err := store.ClearAll(ctx)
		clearDone <- err
	}()

	// Wait until ClearAll has cleared memory cache and is paused before DB deletion.
	<-deleteEntered

	// Scenario A: GetCookie reads old DB row and completes while DeleteByPrefix is paused.
	staleVal, err := store.GetCookie(ctx, host)
	require.NoError(t, err)
	require.Equal(t, "stale-cookie", staleVal)

	// Scenario B: Another GetCookie reads old DB row, then blocks before repopulating cache
	// until after ClearAll finishes.
	staleReadDone := make(chan struct{})
	releaseStaleRepopulate := make(chan struct{})
	var afterGetOnce sync.Once
	repo.mu.Lock()
	repo.afterGet = func() {
		afterGetOnce.Do(func() {
			close(staleReadDone)
			<-releaseStaleRepopulate
		})
	}
	repo.mu.Unlock()

	// Seed a second host directly in DB (not in memory cache) so Scenario B performs a DB read.
	host2 := "race2.example.com"
	payload, err := json.Marshal(map[string]any{
		"cookie":     "stale-cookie-2",
		"expires_at": time.Now().Add(time.Hour).UTC(),
	})
	require.NoError(t, err)
	require.NoError(t, repo.Set(ctx, "anubis.cookie."+host2, string(payload)))

	inFlightGetDone := make(chan error, 1)
	go func() {
		_, gErr := store.GetCookie(ctx, host2)
		inFlightGetDone <- gErr
	}()
	<-staleReadDone

	// Release ClearAll DB deletion and wait for ClearAll to complete.
	close(releaseDelete)
	require.NoError(t, <-clearDone)

	// Now let the in-flight GetCookie attempt to repopulate cache.
	close(releaseStaleRepopulate)
	require.NoError(t, <-inFlightGetDone)

	repo.mu.Lock()
	repo.afterGet = nil
	repo.mu.Unlock()

	// Neither host nor host2 may return stale cookies from memory after ClearAll completed.
	got1, err := store.GetCookie(ctx, host)
	require.NoError(t, err)
	require.Empty(t, got1)

	got2, err := store.GetCookie(ctx, host2)
	require.NoError(t, err)
	require.Empty(t, got2)
}

func TestStore_WriteSerialization_SetClearDeleteAndOverwrite(t *testing.T) {
	ctx := context.Background()

	t.Run("SetCookie paused after DB write interleaved with ClearAll", func(t *testing.T) {
		repo := newSettingsRepoStub()
		store := anubis.NewStore(repo)
		host := "clear-race.example.com"

		setPersisted := make(chan struct{})
		releaseSet := make(chan struct{})
		var once sync.Once
		repo.afterSet = func(string) {
			once.Do(func() {
				close(setPersisted)
				<-releaseSet
			})
		}

		setDone := make(chan error, 1)
		go func() {
			setDone <- store.SetCookie(ctx, host, "cookie-v1", time.Now().Add(time.Hour))
		}()

		<-setPersisted

		clearDone := make(chan struct {
			deleted int64
			err     error
		}, 1)
		go func() {
			deleted, err := store.ClearAll(ctx)
			clearDone <- struct {
				deleted int64
				err     error
			}{deleted: deleted, err: err}
		}()

		// ClearAll must wait until SetCookie finishes updating memory before deleting.
		select {
		case res := <-clearDone:
			t.Fatalf("ClearAll finished while SetCookie was still in flight (deleted=%d, err=%v)", res.deleted, res.err)
		case <-time.After(25 * time.Millisecond):
		}

		close(releaseSet)
		require.NoError(t, <-setDone)

		res := <-clearDone
		require.NoError(t, res.err)
		require.Equal(t, int64(1), res.deleted)

		got, err := store.GetCookie(ctx, host)
		require.NoError(t, err)
		require.Empty(t, got)
	})

	t.Run("SetCookie paused after DB write interleaved with DeleteCookie", func(t *testing.T) {
		repo := newSettingsRepoStub()
		store := anubis.NewStore(repo)
		host := "delete-race.example.com"

		setPersisted := make(chan struct{})
		releaseSet := make(chan struct{})
		var once sync.Once
		repo.afterSet = func(string) {
			once.Do(func() {
				close(setPersisted)
				<-releaseSet
			})
		}

		setDone := make(chan error, 1)
		go func() {
			setDone <- store.SetCookie(ctx, host, "cookie-v1", time.Now().Add(time.Hour))
		}()

		<-setPersisted

		delDone := make(chan error, 1)
		go func() {
			delDone <- store.DeleteCookie(ctx, host)
		}()

		close(releaseSet)
		require.NoError(t, <-setDone)
		require.NoError(t, <-delDone)

		got, err := store.GetCookie(ctx, host)
		require.NoError(t, err)
		require.Empty(t, got)
	})

	t.Run("Concurrent SetCookie writes keep memory consistent with DB", func(t *testing.T) {
		repo := newSettingsRepoStub()
		store := anubis.NewStore(repo)
		host := "overwrite-race.example.com"

		v1Persisted := make(chan struct{})
		releaseV1 := make(chan struct{})
		var once sync.Once
		repo.afterSet = func(string) {
			once.Do(func() {
				close(v1Persisted)
				<-releaseV1
			})
		}

		v1Done := make(chan error, 1)
		go func() {
			v1Done <- store.SetCookie(ctx, host, "cookie-v1", time.Now().Add(time.Hour))
		}()

		<-v1Persisted

		v2Done := make(chan error, 1)
		go func() {
			v2Done <- store.SetCookie(ctx, host, "cookie-v2", time.Now().Add(time.Hour))
		}()

		close(releaseV1)
		require.NoError(t, <-v1Done)
		require.NoError(t, <-v2Done)

		// Memory value must match persisted DB value (cookie-v2).
		gotMem, err := store.GetCookie(ctx, host)
		require.NoError(t, err)
		require.Equal(t, "cookie-v2", gotMem)

		freshStore := anubis.NewStore(repo)
		gotDB, err := freshStore.GetCookie(ctx, host)
		require.NoError(t, err)
		require.Equal(t, "cookie-v2", gotDB)
	})
}
