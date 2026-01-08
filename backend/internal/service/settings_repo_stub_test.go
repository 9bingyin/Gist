package service

import (
	"context"
	"sort"
	"strings"
	"sync"
	"time"

	"gist/backend/internal/model"
)

type settingsRepoStub struct {
	mu                sync.Mutex
	data              map[string]string
	getErr            map[string]error
	setErr            map[string]error
	deleteErr         map[string]error
	deleteByPrefixErr error
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
	defer s.mu.Unlock()

	if err := s.getErr[key]; err != nil {
		return nil, err
	}
	val, ok := s.data[key]
	if !ok {
		return nil, nil
	}
	return &model.Setting{
		Key:       key,
		Value:     val,
		UpdatedAt: time.Now().UTC(),
	}, nil
}

func (s *settingsRepoStub) Set(ctx context.Context, key, value string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := s.setErr[key]; err != nil {
		return err
	}
	s.data[key] = value
	return nil
}

func (s *settingsRepoStub) GetByPrefix(ctx context.Context, prefix string) ([]model.Setting, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	keys := make([]string, 0, len(s.data))
	for key := range s.data {
		if strings.HasPrefix(key, prefix) {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)

	settings := make([]model.Setting, 0, len(keys))
	for _, key := range keys {
		settings = append(settings, model.Setting{
			Key:       key,
			Value:     s.data[key],
			UpdatedAt: time.Now().UTC(),
		})
	}

	return settings, nil
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

func (s *settingsRepoStub) DeleteByPrefix(ctx context.Context, prefix string) (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.deleteByPrefixErr != nil {
		return 0, s.deleteByPrefixErr
	}
	var count int64
	for key := range s.data {
		if strings.HasPrefix(key, prefix) {
			delete(s.data, key)
			count++
		}
	}
	return count, nil
}
