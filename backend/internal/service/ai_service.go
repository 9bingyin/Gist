package service

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"
	"sync/atomic"

	"gist/backend/internal/model"
	"gist/backend/internal/repository"
	"gist/backend/internal/service/ai"
)

// TranslateBlockResult represents a translated block result.
type TranslateBlockResult struct {
	Index int    `json:"index"`
	HTML  string `json:"html"`
}

// TranslateBlockInfo represents original block info.
type TranslateBlockInfo struct {
	Index         int
	HTML          string
	NeedTranslate bool
}

// BatchArticleInput represents input for batch translation.
type BatchArticleInput struct {
	ID      string
	Title   string
	Summary string
}

// BatchTranslateResult represents a single article's translation result.
type BatchTranslateResult struct {
	ID      string  `json:"id"`
	Title   *string `json:"title"`
	Summary *string `json:"summary"`
	Cached  bool    `json:"cached,omitempty"`
}

// AIService provides AI-related operations like summarization and translation.
type AIService interface {
	// GetCachedSummary returns a cached summary if available.
	GetCachedSummary(ctx context.Context, entryID int64, isReadability bool) (*model.AISummary, error)
	// Summarize generates a summary using AI streaming.
	// Returns channels for text chunks and errors.
	Summarize(ctx context.Context, entryID int64, content, title string, isReadability bool) (<-chan string, <-chan error, error)
	// SaveSummary saves a summary to cache.
	SaveSummary(ctx context.Context, entryID int64, isReadability bool, summary string) error
	// GetSummaryLanguage returns the configured summary language.
	GetSummaryLanguage(ctx context.Context) string

	// GetCachedTranslation returns a cached translation if available.
	GetCachedTranslation(ctx context.Context, entryID int64, isReadability bool) (*model.AITranslation, error)
	// TranslateBlocks parses HTML into blocks and translates them in parallel.
	// Returns block info, a channel of results (in completion order), and an error channel.
	TranslateBlocks(ctx context.Context, entryID int64, content, title string, isReadability bool) ([]TranslateBlockInfo, <-chan TranslateBlockResult, <-chan error, error)
	// SaveTranslation saves a translation to cache.
	SaveTranslation(ctx context.Context, entryID int64, isReadability bool, content string) error
	// TranslateBatch translates multiple articles' titles and summaries.
	// Returns a channel of results and an error channel.
	TranslateBatch(ctx context.Context, articles []BatchArticleInput) (<-chan BatchTranslateResult, <-chan error, error)
}

type aiService struct {
	summaryRepo         repository.AISummaryRepository
	translationRepo     repository.AITranslationRepository
	listTranslationRepo repository.AIListTranslationRepository
	settingsRepo        repository.SettingsRepository
	rateLimiter         *ai.RateLimiter
}

// NewAIService creates a new AI service.
func NewAIService(
	summaryRepo repository.AISummaryRepository,
	translationRepo repository.AITranslationRepository,
	listTranslationRepo repository.AIListTranslationRepository,
	settingsRepo repository.SettingsRepository,
	rateLimiter *ai.RateLimiter,
) AIService {
	return &aiService{
		summaryRepo:         summaryRepo,
		translationRepo:     translationRepo,
		listTranslationRepo: listTranslationRepo,
		settingsRepo:        settingsRepo,
		rateLimiter:         rateLimiter,
	}
}

func (s *aiService) GetCachedSummary(ctx context.Context, entryID int64, isReadability bool) (*model.AISummary, error) {
	language := s.GetSummaryLanguage(ctx)
	return s.summaryRepo.Get(ctx, entryID, isReadability, language)
}

func (s *aiService) Summarize(ctx context.Context, entryID int64, content, title string, isReadability bool) (<-chan string, <-chan error, error) {
	// Get AI configuration
	cfg, err := s.getAIConfig(ctx)
	if err != nil {
		return nil, nil, err
	}

	// Create provider
	provider, err := ai.NewProvider(cfg)
	if err != nil {
		return nil, nil, fmt.Errorf("create provider: %w", err)
	}

	// Wait for rate limiter
	if err := s.rateLimiter.Wait(ctx); err != nil {
		return nil, nil, fmt.Errorf("rate limit: %w", err)
	}

	// Get language setting
	language := s.GetSummaryLanguage(ctx)

	// Build system prompt
	systemPrompt := ai.GetSummarizePrompt(title, language)

	// Start streaming
	textCh, errCh := provider.SummarizeStream(ctx, systemPrompt, content)

	return textCh, errCh, nil
}

func (s *aiService) SaveSummary(ctx context.Context, entryID int64, isReadability bool, summary string) error {
	language := s.GetSummaryLanguage(ctx)
	return s.summaryRepo.Save(ctx, entryID, isReadability, language, summary)
}

func (s *aiService) GetSummaryLanguage(ctx context.Context) string {
	setting, err := s.settingsRepo.Get(ctx, "ai.summary_language")
	if err != nil || setting == nil || setting.Value == "" {
		return "zh-CN" // default
	}
	return setting.Value
}

func (s *aiService) getAIConfig(ctx context.Context) (ai.Config, error) {
	var cfg ai.Config

	// Get provider
	if setting, err := s.settingsRepo.Get(ctx, "ai.provider"); err == nil && setting != nil {
		cfg.Provider = setting.Value
	}
	if cfg.Provider == "" {
		cfg.Provider = ai.ProviderOpenAI
	}

	// Get API key
	if setting, err := s.settingsRepo.Get(ctx, "ai.api_key"); err == nil && setting != nil {
		cfg.APIKey = setting.Value
	}
	if cfg.APIKey == "" {
		return cfg, fmt.Errorf("AI API key is not configured")
	}

	// Get base URL
	if setting, err := s.settingsRepo.Get(ctx, "ai.base_url"); err == nil && setting != nil {
		cfg.BaseURL = setting.Value
	}

	// Get model
	if setting, err := s.settingsRepo.Get(ctx, "ai.model"); err == nil && setting != nil {
		cfg.Model = setting.Value
	}
	if cfg.Model == "" {
		return cfg, fmt.Errorf("AI model is not configured")
	}

	// Get thinking settings
	if setting, err := s.settingsRepo.Get(ctx, "ai.thinking"); err == nil && setting != nil && setting.Value == "true" {
		cfg.Thinking = true
	}

	if setting, err := s.settingsRepo.Get(ctx, "ai.thinking_budget"); err == nil && setting != nil {
		var budget int
		fmt.Sscanf(setting.Value, "%d", &budget)
		cfg.ThinkingBudget = budget
	}

	if setting, err := s.settingsRepo.Get(ctx, "ai.reasoning_effort"); err == nil && setting != nil {
		cfg.ReasoningEffort = setting.Value
	}

	return cfg, nil
}

func (s *aiService) GetCachedTranslation(ctx context.Context, entryID int64, isReadability bool) (*model.AITranslation, error) {
	language := s.GetSummaryLanguage(ctx)
	return s.translationRepo.Get(ctx, entryID, isReadability, language)
}

func (s *aiService) SaveTranslation(ctx context.Context, entryID int64, isReadability bool, content string) error {
	language := s.GetSummaryLanguage(ctx)
	return s.translationRepo.Save(ctx, entryID, isReadability, language, content)
}

// TranslateBlocks parses HTML into blocks and translates them in parallel.
// Returns block info, a channel of results, an error channel, and any initial error.
func (s *aiService) TranslateBlocks(ctx context.Context, entryID int64, content, title string, isReadability bool) ([]TranslateBlockInfo, <-chan TranslateBlockResult, <-chan error, error) {
	// Parse HTML into blocks
	blocks, err := ai.ParseHTMLBlocks(content)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("parse HTML blocks: %w", err)
	}

	if len(blocks) == 0 {
		return nil, nil, nil, fmt.Errorf("no blocks to translate")
	}

	// Build block info for caller
	blockInfos := make([]TranslateBlockInfo, len(blocks))
	for i, b := range blocks {
		blockInfos[i] = TranslateBlockInfo{
			Index:         b.Index,
			HTML:          b.HTML,
			NeedTranslate: b.NeedTranslate,
		}
	}

	// Get AI configuration
	cfg, err := s.getAIConfig(ctx)
	if err != nil {
		return nil, nil, nil, err
	}

	// Get language setting
	language := s.GetSummaryLanguage(ctx)

	// Create channels
	resultCh := make(chan TranslateBlockResult)
	errCh := make(chan error, 1)

	// Start parallel translation
	go func() {
		defer close(resultCh)
		defer close(errCh)

		var wg sync.WaitGroup
		sem := make(chan struct{}, 3) // Limit to 3 concurrent translations

		// Collect results for caching
		var results []TranslateBlockResult
		var resultsMu sync.Mutex
		var hasError atomic.Bool

	blockLoop:
		for _, block := range blocks {
			// Check if context is cancelled before processing each block
			if ctx.Err() != nil {
				break
			}

			if !block.NeedTranslate {
				// No translation needed, add to results for caching
				resultsMu.Lock()
				results = append(results, TranslateBlockResult{
					Index: block.Index,
					HTML:  block.HTML,
				})
				resultsMu.Unlock()
				// Don't send via channel - frontend already has original content
				continue
			}

			wg.Add(1)

			// Acquire semaphore with context cancellation support
			select {
			case sem <- struct{}{}:
			case <-ctx.Done():
				wg.Done()
				break blockLoop
			}

			go func(b ai.Block) {
				defer wg.Done()
				defer func() { <-sem }() // Release semaphore

				// Wait for rate limiter
				if err := s.rateLimiter.Wait(ctx); err != nil {
					select {
					case errCh <- fmt.Errorf("rate limit: %w", err):
						hasError.Store(true)
					default:
					}
					return
				}

				// Create provider for this goroutine
				provider, err := ai.NewProvider(cfg)
				if err != nil {
					select {
					case errCh <- fmt.Errorf("create provider: %w", err):
						hasError.Store(true)
					default:
					}
					return
				}

				// Translate single block using non-streaming Complete
				systemPrompt := ai.GetTranslateBlockPrompt(language)
				translatedHTML, err := provider.Complete(ctx, systemPrompt, b.HTML)
				if err != nil {
					select {
					case errCh <- fmt.Errorf("translate block %d: %w", b.Index, err):
						hasError.Store(true)
					default:
					}
					return
				}

				// Send result
				result := TranslateBlockResult{
					Index: b.Index,
					HTML:  translatedHTML,
				}
				resultsMu.Lock()
				results = append(results, result)
				resultsMu.Unlock()

				select {
				case resultCh <- result:
				case <-ctx.Done():
					return
				}
			}(block)
		}

		wg.Wait()

		// Cache complete result if no errors and not cancelled
		if !hasError.Load() && len(results) > 0 && ctx.Err() == nil {
			// Sort by index
			sort.Slice(results, func(i, j int) bool {
				return results[i].Index < results[j].Index
			})

			// Concatenate all blocks
			var fullHTML strings.Builder
			for _, r := range results {
				fullHTML.WriteString(r.HTML)
			}

			// Save to cache
			_ = s.SaveTranslation(ctx, entryID, isReadability, fullHTML.String())
		}
	}()

	return blockInfos, resultCh, errCh, nil
}

// TranslateBatch translates multiple articles' titles and summaries concurrently.
// It first checks cache and only translates articles that don't have cached results.
func (s *aiService) TranslateBatch(ctx context.Context, articles []BatchArticleInput) (<-chan BatchTranslateResult, <-chan error, error) {
	if len(articles) == 0 {
		return nil, nil, fmt.Errorf("no articles to translate")
	}

	// Get language setting
	language := s.GetSummaryLanguage(ctx)

	// Collect entry IDs for batch cache lookup
	entryIDs := make([]int64, 0, len(articles))
	articleMap := make(map[int64]BatchArticleInput)
	for _, a := range articles {
		entryID, err := parseEntryID(a.ID)
		if err != nil {
			continue
		}
		entryIDs = append(entryIDs, entryID)
		articleMap[entryID] = a
	}

	// Batch fetch cached translations
	cachedMap, err := s.listTranslationRepo.GetBatch(ctx, entryIDs, language)
	if err != nil {
		// Log error but continue without cache
		cachedMap = make(map[int64]*model.AIListTranslation)
	}

	// Get AI configuration (only needed if there are uncached articles)
	var cfg ai.Config
	needsTranslation := false
	for _, entryID := range entryIDs {
		if _, ok := cachedMap[entryID]; !ok {
			needsTranslation = true
			break
		}
	}

	if needsTranslation {
		cfg, err = s.getAIConfig(ctx)
		if err != nil {
			return nil, nil, err
		}
	}

	// Create channels
	resultCh := make(chan BatchTranslateResult)
	errCh := make(chan error, len(articles))

	go func() {
		defer close(resultCh)
		defer close(errCh)

		var wg sync.WaitGroup
		sem := make(chan struct{}, 5) // Limit to 5 concurrent translations

	articleLoop:
		for _, entryID := range entryIDs {
			if ctx.Err() != nil {
				break
			}

			article := articleMap[entryID]

			// Check cache first
			if cached, ok := cachedMap[entryID]; ok {
				result := BatchTranslateResult{
					ID:     article.ID,
					Title:  &cached.Title,
					Summary: &cached.Summary,
					Cached: true,
				}
				select {
				case resultCh <- result:
				case <-ctx.Done():
					break articleLoop
				}
				continue
			}

			wg.Add(1)

			// Acquire semaphore
			select {
			case sem <- struct{}{}:
			case <-ctx.Done():
				wg.Done()
				break articleLoop
			}

			go func(a BatchArticleInput, eID int64) {
				defer wg.Done()
				defer func() { <-sem }()

				// Create provider for this goroutine
				provider, err := ai.NewProvider(cfg)
				if err != nil {
					select {
					case errCh <- fmt.Errorf("create provider: %w", err):
					default:
					}
					return
				}

				// Translate title
				var translatedTitle *string
				titleStr := ""
				if a.Title != "" {
					// Wait for rate limiter
					if err := s.rateLimiter.Wait(ctx); err != nil {
						select {
						case errCh <- fmt.Errorf("rate limit: %w", err):
						default:
						}
						return
					}
					titlePrompt := ai.GetTranslateTextPrompt("title", language)
					translated, err := provider.Complete(ctx, titlePrompt, a.Title)
					if err != nil {
						select {
						case errCh <- fmt.Errorf("translate title for %s: %w", a.ID, err):
						default:
						}
						return
					}
					translatedTitle = &translated
					titleStr = translated
				}

				// Translate summary
				var translatedSummary *string
				summaryStr := ""
				if a.Summary != "" {
					// Wait for rate limiter
					if err := s.rateLimiter.Wait(ctx); err != nil {
						select {
						case errCh <- fmt.Errorf("rate limit: %w", err):
						default:
						}
						return
					}
					summaryPrompt := ai.GetTranslateTextPrompt("summary", language)
					translated, err := provider.Complete(ctx, summaryPrompt, a.Summary)
					if err != nil {
						select {
						case errCh <- fmt.Errorf("translate summary for %s: %w", a.ID, err):
						default:
						}
						return
					}
					translatedSummary = &translated
					summaryStr = translated
				}

				// Save to cache
				if titleStr != "" || summaryStr != "" {
					_ = s.listTranslationRepo.Save(ctx, eID, language, titleStr, summaryStr)
				}

				// Send result
				result := BatchTranslateResult{
					ID:      a.ID,
					Title:   translatedTitle,
					Summary: translatedSummary,
				}

				select {
				case resultCh <- result:
				case <-ctx.Done():
				}
			}(article, entryID)
		}

		wg.Wait()
	}()

	return resultCh, errCh, nil
}

func parseEntryID(id string) (int64, error) {
	var entryID int64
	_, err := fmt.Sscanf(id, "%d", &entryID)
	return entryID, err
}
