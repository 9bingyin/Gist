package service

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"

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
	// TranslateSync generates a translation and returns the full result.
	TranslateSync(ctx context.Context, entryID int64, content, title string, isReadability bool) (string, error)
	// TranslateBlocks parses HTML into blocks and translates them in parallel.
	// Returns block info, a channel of results (in completion order), and an error channel.
	TranslateBlocks(ctx context.Context, entryID int64, content, title string, isReadability bool) ([]TranslateBlockInfo, <-chan TranslateBlockResult, <-chan error, error)
	// SaveTranslation saves a translation to cache.
	SaveTranslation(ctx context.Context, entryID int64, isReadability bool, content string) error
}

type aiService struct {
	summaryRepo     repository.AISummaryRepository
	translationRepo repository.AITranslationRepository
	settingsRepo    repository.SettingsRepository
}

// NewAIService creates a new AI service.
func NewAIService(summaryRepo repository.AISummaryRepository, translationRepo repository.AITranslationRepository, settingsRepo repository.SettingsRepository) AIService {
	return &aiService{
		summaryRepo:     summaryRepo,
		translationRepo: translationRepo,
		settingsRepo:    settingsRepo,
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

func (s *aiService) TranslateSync(ctx context.Context, entryID int64, content, title string, isReadability bool) (string, error) {
	// Get AI configuration
	cfg, err := s.getAIConfig(ctx)
	if err != nil {
		return "", err
	}

	// Create provider
	provider, err := ai.NewProvider(cfg)
	if err != nil {
		return "", fmt.Errorf("create provider: %w", err)
	}

	// Get language setting
	language := s.GetSummaryLanguage(ctx)

	// Build system prompt
	systemPrompt := ai.GetTranslatePrompt(title, language)

	// Stream and collect all chunks
	textCh, errCh := provider.SummarizeStream(ctx, systemPrompt, content)

	var result string
	for {
		select {
		case text, ok := <-textCh:
			if !ok {
				// Channel closed, check for errors
				select {
				case err := <-errCh:
					if err != nil {
						return "", err
					}
				default:
				}
				return result, nil
			}
			result += text
		case err := <-errCh:
			if err != nil {
				return "", err
			}
		case <-ctx.Done():
			return "", ctx.Err()
		}
	}
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
		var hasError bool

		for _, block := range blocks {
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
			sem <- struct{}{} // Acquire semaphore

			go func(b ai.Block) {
				defer wg.Done()
				defer func() { <-sem }() // Release semaphore

				// Create provider for this goroutine
				provider, err := ai.NewProvider(cfg)
				if err != nil {
					select {
					case errCh <- fmt.Errorf("create provider: %w", err):
						hasError = true
					default:
					}
					return
				}

				// Translate single block
				systemPrompt := ai.GetTranslateBlockPrompt(language)
				textCh, blockErrCh := provider.SummarizeStream(ctx, systemPrompt, b.HTML)

				var translatedHTML strings.Builder
				for {
					select {
					case text, ok := <-textCh:
						if !ok {
							// Channel closed, check for errors
							select {
							case err := <-blockErrCh:
								if err != nil {
									select {
									case errCh <- fmt.Errorf("translate block %d: %w", b.Index, err):
										hasError = true
									default:
									}
									return
								}
							default:
							}

							// Send result
							result := TranslateBlockResult{
								Index: b.Index,
								HTML:  translatedHTML.String(),
							}
							resultsMu.Lock()
							results = append(results, result)
							resultsMu.Unlock()

							select {
							case resultCh <- result:
							case <-ctx.Done():
								return
							}
							return
						}
						translatedHTML.WriteString(text)
					case err := <-blockErrCh:
						if err != nil {
							select {
							case errCh <- fmt.Errorf("translate block %d: %w", b.Index, err):
								hasError = true
							default:
							}
							return
						}
					case <-ctx.Done():
						return
					}
				}
			}(block)
		}

		wg.Wait()

		// Cache complete result if no errors
		if !hasError && len(results) > 0 {
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
