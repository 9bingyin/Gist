package service

import (
	"context"
	"errors"
	"strings"
	"testing"

	"gist/backend/internal/model"
	"gist/backend/internal/service/ai"
)

func TestAIService_GetSummaryLanguage(t *testing.T) {
	repo := newSettingsRepoStub()
	svc := NewAIService(&summaryRepoStub{}, &translationRepoStub{}, &listTranslationRepoStub{}, repo, ai.NewRateLimiter(100))

	if lang := svc.GetSummaryLanguage(context.Background()); lang != "zh-CN" {
		t.Fatalf("expected default language, got %s", lang)
	}

	repo.data[keyAISummaryLanguage] = "en-US"
	if lang := svc.GetSummaryLanguage(context.Background()); lang != "en-US" {
		t.Fatalf("expected stored language, got %s", lang)
	}
}

func TestAIService_SaveSummaryAndTranslation_UsesLanguage(t *testing.T) {
	repo := newSettingsRepoStub()
	repo.data[keyAISummaryLanguage] = "en-US"

	summaryRepo := &summaryRepoStub{}
	translationRepo := &translationRepoStub{}
	svc := NewAIService(summaryRepo, translationRepo, &listTranslationRepoStub{}, repo, ai.NewRateLimiter(100))

	if err := svc.SaveSummary(context.Background(), 1, false, "summary"); err != nil {
		t.Fatalf("SaveSummary failed: %v", err)
	}
	if summaryRepo.lastLanguage != "en-US" {
		t.Fatalf("expected language en-US, got %s", summaryRepo.lastLanguage)
	}

	if err := svc.SaveTranslation(context.Background(), 2, true, "content"); err != nil {
		t.Fatalf("SaveTranslation failed: %v", err)
	}
	if translationRepo.lastLanguage != "en-US" {
		t.Fatalf("expected language en-US, got %s", translationRepo.lastLanguage)
	}
}

func TestAIService_ClearAllCache_ErrorPropagation(t *testing.T) {
	summaryRepo := &summaryRepoStub{deleteAllErr: errors.New("summary delete failed")}
	translationRepo := &translationRepoStub{}
	listRepo := &listTranslationRepoStub{}
	svc := NewAIService(summaryRepo, translationRepo, listRepo, newSettingsRepoStub(), ai.NewRateLimiter(100))

	_, _, _, err := svc.ClearAllCache(context.Background())
	if err == nil || !strings.Contains(err.Error(), "clear summaries") {
		t.Fatalf("expected summary clear error, got %v", err)
	}

	summaryRepo.deleteAllErr = nil
	translationRepo.deleteAllErr = errors.New("translation delete failed")
	_, _, _, err = svc.ClearAllCache(context.Background())
	if err == nil || !strings.Contains(err.Error(), "clear translations") {
		t.Fatalf("expected translation clear error, got %v", err)
	}

	translationRepo.deleteAllErr = nil
	listRepo.deleteAllErr = errors.New("list translation delete failed")
	_, _, _, err = svc.ClearAllCache(context.Background())
	if err == nil || !strings.Contains(err.Error(), "clear list translations") {
		t.Fatalf("expected list translation clear error, got %v", err)
	}
}

func TestAIService_Summarize_MissingConfig(t *testing.T) {
	repo := newSettingsRepoStub()
	svc := NewAIService(&summaryRepoStub{}, &translationRepoStub{}, &listTranslationRepoStub{}, repo, ai.NewRateLimiter(100))

	_, _, err := svc.Summarize(context.Background(), 1, "content", "title", false)
	if err == nil {
		t.Fatalf("expected error for missing config")
	}
}

func TestAIService_TranslateBlocks_EmptyContent(t *testing.T) {
	svc := NewAIService(&summaryRepoStub{}, &translationRepoStub{}, &listTranslationRepoStub{}, newSettingsRepoStub(), ai.NewRateLimiter(100))

	_, _, _, err := svc.TranslateBlocks(context.Background(), 1, "", "title", false)
	if err == nil {
		t.Fatalf("expected error for empty content")
	}
}

func TestAIService_TranslateBatch_EmptyInput(t *testing.T) {
	svc := NewAIService(&summaryRepoStub{}, &translationRepoStub{}, &listTranslationRepoStub{}, newSettingsRepoStub(), ai.NewRateLimiter(100))

	_, _, err := svc.TranslateBatch(context.Background(), nil)
	if err == nil {
		t.Fatalf("expected error for empty batch")
	}
}

type summaryRepoStub struct {
	lastLanguage  string
	deleteAllErr  error
	deleteAllRows int64
}

func (s *summaryRepoStub) Get(ctx context.Context, entryID int64, isReadability bool, language string) (*model.AISummary, error) {
	return nil, nil
}

func (s *summaryRepoStub) Save(ctx context.Context, entryID int64, isReadability bool, language, summary string) error {
	s.lastLanguage = language
	return nil
}

func (s *summaryRepoStub) DeleteByEntryID(ctx context.Context, entryID int64) error {
	return nil
}

func (s *summaryRepoStub) DeleteAll(ctx context.Context) (int64, error) {
	if s.deleteAllErr != nil {
		return 0, s.deleteAllErr
	}
	return s.deleteAllRows, nil
}

type translationRepoStub struct {
	lastLanguage string
	deleteAllErr error
}

func (s *translationRepoStub) Get(ctx context.Context, entryID int64, isReadability bool, language string) (*model.AITranslation, error) {
	return nil, nil
}

func (s *translationRepoStub) Save(ctx context.Context, entryID int64, isReadability bool, language, content string) error {
	s.lastLanguage = language
	return nil
}

func (s *translationRepoStub) DeleteByEntryID(ctx context.Context, entryID int64) error {
	return nil
}

func (s *translationRepoStub) DeleteAll(ctx context.Context) (int64, error) {
	if s.deleteAllErr != nil {
		return 0, s.deleteAllErr
	}
	return 0, nil
}

type listTranslationRepoStub struct {
	deleteAllErr error
}

func (s *listTranslationRepoStub) Get(ctx context.Context, entryID int64, language string) (*model.AIListTranslation, error) {
	return nil, nil
}

func (s *listTranslationRepoStub) GetBatch(ctx context.Context, entryIDs []int64, language string) (map[int64]*model.AIListTranslation, error) {
	return make(map[int64]*model.AIListTranslation), nil
}

func (s *listTranslationRepoStub) Save(ctx context.Context, entryID int64, language, title, summary string) error {
	return nil
}

func (s *listTranslationRepoStub) DeleteByEntryID(ctx context.Context, entryID int64) error {
	return nil
}

func (s *listTranslationRepoStub) DeleteAll(ctx context.Context) (int64, error) {
	if s.deleteAllErr != nil {
		return 0, s.deleteAllErr
	}
	return 0, nil
}
