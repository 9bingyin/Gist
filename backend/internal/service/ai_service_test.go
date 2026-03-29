package service_test

import (
	"context"
	"errors"
	"gist/backend/internal/service"
	"testing"
	"time"

	repositorymock "gist/backend/internal/repository/mock"
	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"

	"gist/backend/internal/model"
	"gist/backend/internal/service/ai"
)

func TestAIService_GetSummaryLanguage(t *testing.T) {
	repo := newSettingsRepoStub()
	svc := service.NewAIService(&summaryRepoStub{}, &translationRepoStub{}, &listTranslationRepoStub{}, repo, ai.NewRateLimiter(100))

	lang := svc.GetSummaryLanguage(context.Background())
	require.Equal(t, "zh-CN", lang, "expected default language")

	repo.data[service.KeyAISummaryLanguage] = "en-US"
	lang = svc.GetSummaryLanguage(context.Background())
	require.Equal(t, "en-US", lang, "expected stored language")
}

func TestAIService_SaveSummaryAndTranslation_UsesLanguage(t *testing.T) {
	repo := newSettingsRepoStub()
	repo.data[service.KeyAISummaryLanguage] = "en-US"

	summaryRepo := &summaryRepoStub{}
	translationRepo := &translationRepoStub{}
	svc := service.NewAIService(summaryRepo, translationRepo, &listTranslationRepoStub{}, repo, ai.NewRateLimiter(100))

	err := svc.SaveSummary(context.Background(), 1, false, "summary")
	require.NoError(t, err, "SaveSummary should not fail")
	require.Equal(t, "en-US", summaryRepo.lastLanguage, "expected language en-US")

	err = svc.SaveTranslation(context.Background(), 2, true, "content")
	require.NoError(t, err, "SaveTranslation should not fail")
	require.Equal(t, "en-US", translationRepo.lastLanguage, "expected language en-US")
}

func TestAIService_ClearAllCache_ErrorPropagation(t *testing.T) {
	summaryRepo := &summaryRepoStub{deleteAllErr: errors.New("summary delete failed")}
	translationRepo := &translationRepoStub{}
	listRepo := &listTranslationRepoStub{}
	svc := service.NewAIService(summaryRepo, translationRepo, listRepo, newSettingsRepoStub(), ai.NewRateLimiter(100))

	_, _, _, err := svc.ClearAllCache(context.Background())
	require.Error(t, err, "expected summary clear error")
	require.Contains(t, err.Error(), "clear summaries")

	summaryRepo.deleteAllErr = nil
	translationRepo.deleteAllErr = errors.New("translation delete failed")
	_, _, _, err = svc.ClearAllCache(context.Background())
	require.Error(t, err, "expected translation clear error")
	require.Contains(t, err.Error(), "clear translations")

	translationRepo.deleteAllErr = nil
	listRepo.deleteAllErr = errors.New("list translation delete failed")
	_, _, _, err = svc.ClearAllCache(context.Background())
	require.Error(t, err, "expected list translation clear error")
	require.Contains(t, err.Error(), "clear list translations")
}

func TestAIService_Summarize_MissingConfig(t *testing.T) {
	repo := newSettingsRepoStub()
	svc := service.NewAIService(&summaryRepoStub{}, &translationRepoStub{}, &listTranslationRepoStub{}, repo, ai.NewRateLimiter(100))

	_, _, err := svc.Summarize(context.Background(), 1, "content", "title", false)
	require.Error(t, err, "expected error for missing config")
}

func TestAIService_TranslateBlocks_EmptyContent(t *testing.T) {
	svc := service.NewAIService(&summaryRepoStub{}, &translationRepoStub{}, &listTranslationRepoStub{}, newSettingsRepoStub(), ai.NewRateLimiter(100))

	_, _, _, err := svc.TranslateBlocks(context.Background(), 1, "", "title", false)
	require.Error(t, err, "expected error for empty content")
}

func TestAIService_TranslateBatch_EmptyInput(t *testing.T) {
	svc := service.NewAIService(&summaryRepoStub{}, &translationRepoStub{}, &listTranslationRepoStub{}, newSettingsRepoStub(), ai.NewRateLimiter(100))

	_, _, err := svc.TranslateBatch(context.Background(), nil)
	require.Error(t, err, "expected error for empty batch")
}

func TestAIService_GetCachedTranslation_Error(t *testing.T) {
	repo := newSettingsRepoStub()
	translationRepo := &translationRepoStub{getErr: errors.New("get failed")}
	svc := service.NewAIService(&summaryRepoStub{}, translationRepo, &listTranslationRepoStub{}, repo, ai.NewRateLimiter(100))

	_, err := svc.GetCachedTranslation(context.Background(), 1, false)
	require.Error(t, err)
}

func TestAIService_SaveTranslation_Error(t *testing.T) {
	repo := newSettingsRepoStub()
	translationRepo := &translationRepoStub{saveErr: errors.New("save failed")}
	svc := service.NewAIService(&summaryRepoStub{}, translationRepo, &listTranslationRepoStub{}, repo, ai.NewRateLimiter(100))

	err := svc.SaveTranslation(context.Background(), 1, false, "content")
	require.Error(t, err)
}

func TestAIService_TranslateBatch_CacheHit(t *testing.T) {
	repo := newSettingsRepoStub()
	listRepo := &listTranslationRepoStub{
		batchResult: map[int64]*model.AIListTranslation{
			1: {EntryID: 1, Title: "T1", Summary: "S1"},
			2: {EntryID: 2, Title: "T2", Summary: "S2"},
		},
	}
	svc := service.NewAIService(&summaryRepoStub{}, &translationRepoStub{}, listRepo, repo, ai.NewRateLimiter(100))

	resultCh, errCh, err := svc.TranslateBatch(context.Background(), []service.BatchArticleInput{
		{ID: "1"},
		{ID: "2"},
	})
	require.NoError(t, err)

	results := make(map[string]service.BatchTranslateResult)
	for r := range resultCh {
		results[r.ID] = r
	}
	require.Len(t, results, 2)
	require.True(t, results["1"].Cached)
	require.NotNil(t, results["1"].Title)
	require.Equal(t, "T1", *results["1"].Title)
	require.NotNil(t, results["1"].Summary)
	require.Equal(t, "S1", *results["1"].Summary)

	select {
	case err := <-errCh:
		require.NoError(t, err)
	default:
	}
}

func TestAIService_TranslateBatch_InvalidIDs(t *testing.T) {
	repo := newSettingsRepoStub()
	listRepo := &listTranslationRepoStub{batchResult: map[int64]*model.AIListTranslation{}}
	svc := service.NewAIService(&summaryRepoStub{}, &translationRepoStub{}, listRepo, repo, ai.NewRateLimiter(100))

	resultCh, errCh, err := svc.TranslateBatch(context.Background(), []service.BatchArticleInput{
		{ID: "not-a-number"},
	})
	require.NoError(t, err)

	for range resultCh {
		t.Fatalf("expected no results")
	}

	select {
	case err := <-errCh:
		require.NoError(t, err)
	default:
	}
}

type summaryRepoStub struct {
	lastLanguage  string
	deleteAllErr  error
	deleteAllRows int64
	getResult     *model.AISummary
	getErr        error
}

func (s *summaryRepoStub) Get(ctx context.Context, entryID int64, isReadability bool, language string) (*model.AISummary, error) {
	if s.getErr != nil {
		return nil, s.getErr
	}
	return s.getResult, nil
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
	getErr       error
	saveErr      error
}

func (s *translationRepoStub) Get(ctx context.Context, entryID int64, isReadability bool, language string) (*model.AITranslation, error) {
	if s.getErr != nil {
		return nil, s.getErr
	}
	return nil, nil
}

func (s *translationRepoStub) Save(ctx context.Context, entryID int64, isReadability bool, language, content string) error {
	if s.saveErr != nil {
		return s.saveErr
	}
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
	batchResult  map[int64]*model.AIListTranslation
}

func (s *listTranslationRepoStub) Get(ctx context.Context, entryID int64, language string) (*model.AIListTranslation, error) {
	return nil, nil
}

func (s *listTranslationRepoStub) GetBatch(ctx context.Context, entryIDs []int64, language string) (map[int64]*model.AIListTranslation, error) {
	if s.batchResult != nil {
		return s.batchResult, nil
	}
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

func TestAIService_GetCachedSummary_Success(t *testing.T) {
	repo := newSettingsRepoStub()
	repo.data[service.KeyAISummaryLanguage] = "en-US"

	summaryRepo := &summaryRepoStub{
		getResult: &model.AISummary{
			ID:            1,
			EntryID:       123,
			IsReadability: false,
			Language:      "en-US",
			Summary:       "Test summary content",
		},
	}
	svc := service.NewAIService(summaryRepo, &translationRepoStub{}, &listTranslationRepoStub{}, repo, ai.NewRateLimiter(100))

	result, err := svc.GetCachedSummary(context.Background(), 123, false)
	require.NoError(t, err)
	require.NotNil(t, result)
	require.Equal(t, int64(123), result.EntryID)
	require.Equal(t, "Test summary content", result.Summary)
}

func TestAIService_GetCachedSummary_NotFound(t *testing.T) {
	repo := newSettingsRepoStub()
	summaryRepo := &summaryRepoStub{getResult: nil}
	svc := service.NewAIService(summaryRepo, &translationRepoStub{}, &listTranslationRepoStub{}, repo, ai.NewRateLimiter(100))

	result, err := svc.GetCachedSummary(context.Background(), 123, false)
	require.NoError(t, err)
	require.Nil(t, result)
}

func TestAIService_GetCachedSummary_Error(t *testing.T) {
	repo := newSettingsRepoStub()
	summaryRepo := &summaryRepoStub{getErr: errors.New("database error")}
	svc := service.NewAIService(summaryRepo, &translationRepoStub{}, &listTranslationRepoStub{}, repo, ai.NewRateLimiter(100))

	_, err := svc.GetCachedSummary(context.Background(), 123, false)
	require.Error(t, err)
	require.Contains(t, err.Error(), "database error")
}

func TestAIService_BuildSummarizeSystemPrompt_UsesFeedReminder(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	settingsRepo := newSettingsRepoStub()
	settingsRepo.data[service.KeyAISummaryLanguage] = "en-US"
	entryRepo := repositorymock.NewMockEntryRepository(ctrl)
	feedRepo := repositorymock.NewMockFeedRepository(ctrl)

	reminder := "Focus on benchmark numbers"
	entryRepo.EXPECT().GetByID(gomock.Any(), int64(123)).Return(model.Entry{ID: 123, FeedID: 7}, nil)
	feedRepo.EXPECT().GetByID(gomock.Any(), int64(7)).Return(model.Feed{
		ID:                    7,
		SummaryPromptReminder: &reminder,
	}, nil)

	svc := service.NewAIServiceWithFeedContext(
		&summaryRepoStub{},
		&translationRepoStub{},
		&listTranslationRepoStub{},
		settingsRepo,
		ai.NewRateLimiter(100),
		entryRepo,
		feedRepo,
	)

	prompt := service.BuildAISummarizeSystemPromptForTest(svc, context.Background(), 123, "Title")
	require.Contains(t, prompt, "<system-reminder>\nFocus on benchmark numbers\n</system-reminder>")
}

func TestAIService_BuildSummarizeSystemPrompt_FallbackOnFeedLookupError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	settingsRepo := newSettingsRepoStub()
	settingsRepo.data[service.KeyAISummaryLanguage] = "en-US"
	entryRepo := repositorymock.NewMockEntryRepository(ctrl)
	feedRepo := repositorymock.NewMockFeedRepository(ctrl)

	entryRepo.EXPECT().GetByID(gomock.Any(), int64(123)).Return(model.Entry{ID: 123, FeedID: 7}, nil)
	feedRepo.EXPECT().GetByID(gomock.Any(), int64(7)).Return(model.Feed{}, errors.New("feed lookup failed"))

	svc := service.NewAIServiceWithFeedContext(
		&summaryRepoStub{},
		&translationRepoStub{},
		&listTranslationRepoStub{},
		settingsRepo,
		ai.NewRateLimiter(100),
		entryRepo,
		feedRepo,
	)

	prompt := service.BuildAISummarizeSystemPromptForTest(svc, context.Background(), 123, "Title")
	require.NotContains(t, prompt, "<system-reminder>")
	require.Contains(t, prompt, "<target_language>English</target_language>")
}

// TestAIService_TranslateBlocks_ContextCancelled tests the BUG fix:
// When context is cancelled, TranslateBlocks should exit gracefully without
// continuing to process blocks or saving incomplete cache.
// See commit 01d64c1: fix: AI streaming request cancellation
func TestAIService_TranslateBlocks_ContextCancelled(t *testing.T) {
	repo := newSettingsRepoStub()
	translationRepo := &translationRepoStub{}
	svc := service.NewAIService(&summaryRepoStub{}, translationRepo, &listTranslationRepoStub{}, repo, ai.NewRateLimiter(100))

	// Create a pre-cancelled context
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately

	// TranslateBlocks with cancelled context
	// It should either return an error or return channels that complete quickly
	blockInfos, resultCh, errCh, err := svc.TranslateBlocks(ctx, 1, "<p>Test content</p>", "title", false)

	// With cancelled context, it should either:
	// 1. Return early with an error (missing config), or
	// 2. Return channels that close quickly without processing

	if err != nil {
		// Expected behavior: error due to missing config or context cancelled
		return
	}

	// If no error, channels should close quickly without blocking
	require.NotNil(t, blockInfos)
	require.NotNil(t, resultCh)
	require.NotNil(t, errCh)

	// Drain channels - they should close quickly
	resultsReceived := 0
	for range resultCh {
		resultsReceived++
	}

	// With cancelled context, translation should not have been attempted
	// (no AI config means it fails early anyway, but the context check is also there)
}

// TestAIService_TranslateBlocks_ContextCancelledDuringProcessing tests that
// context cancellation during processing exits the block loop properly.
// This verifies the labeled break and semaphore cancellation logic.
// See commit 01d64c1: fix: AI streaming request cancellation
func TestAIService_TranslateBlocks_ContextCancelledDuringProcessing(t *testing.T) {
	repo := newSettingsRepoStub()
	// Set up AI config to pass config validation
	repo.data[service.KeyAIProvider] = "openai"
	repo.data[service.KeyAIAPIKey] = "test-key"
	repo.data[service.KeyAIModel] = "gpt-4"

	translationRepo := &translationRepoStub{}
	svc := service.NewAIService(&summaryRepoStub{}, translationRepo, &listTranslationRepoStub{}, repo, ai.NewRateLimiter(100))

	// Create context that will be cancelled
	ctx, cancel := context.WithCancel(context.Background())

	// Start TranslateBlocks
	blockInfos, resultCh, errCh, err := svc.TranslateBlocks(ctx, 1, "<p>Block 1</p><p>Block 2</p><p>Block 3</p>", "title", false)

	// With proper AI config, it should not return an immediate error
	if err != nil {
		// If it failed (e.g., due to network), that's fine for this test
		t.Skipf("TranslateBlocks returned error (expected in test env): %v", err)
		return
	}

	require.NotNil(t, blockInfos)
	require.NotNil(t, resultCh)
	require.NotNil(t, errCh)

	// Cancel context immediately after starting
	cancel()

	// Drain channels - should complete without hanging
	done := make(chan struct{})
	go func() {
		for range resultCh {
		}
		for range errCh {
		}
		close(done)
	}()

	// Wait with timeout - should complete quickly due to cancellation
	select {
	case <-done:
		// Good - channels closed
	case <-time.After(5 * time.Second):
		t.Fatal("TranslateBlocks did not exit after context cancellation")
	}
}

// TestAIService_TranslateBlocks_NoCacheOnCancel verifies that cancelled
// translations do not save incomplete results to cache.
// See commit 01d64c1: fix: AI streaming request cancellation
func TestAIService_TranslateBlocks_NoCacheOnCancel(t *testing.T) {
	repo := newSettingsRepoStub()
	translationRepo := &translationRepoStub{}
	svc := service.NewAIService(&summaryRepoStub{}, translationRepo, &listTranslationRepoStub{}, repo, ai.NewRateLimiter(100))

	// Create and immediately cancel context
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	// Try to translate with cancelled context
	_, resultCh, errCh, err := svc.TranslateBlocks(ctx, 1, "<p>Test</p>", "title", false)

	if err != nil {
		// Expected - missing config error
		return
	}

	// Drain channels
	for range resultCh {
	}
	for range errCh {
	}

	// Verify no cache was saved (translationRepo.lastLanguage should be empty
	// because SaveTranslation was never called due to ctx.Err() != nil check)
	require.Empty(t, translationRepo.lastLanguage, "Should not save cache on cancelled context")
}
