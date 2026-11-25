//go:generate mockgen -source=$GOFILE -destination=mock/$GOFILE -package=mock
package service

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"gist/backend/internal/model"
	"gist/backend/internal/repository"
	"gist/backend/internal/service/ai"
	"gist/backend/pkg/logger"
	"gist/backend/pkg/network"
)

const (
	aiRequestTimeout   = 5 * time.Minute
	aiCacheSaveTimeout = 5 * time.Second
)

// SummarizeEvent represents a single text delta or error in a summary stream.
type SummarizeEvent struct {
	Text string
	Err  error
}

// TranslateBlockResult represents a translated block result.
type TranslateBlockResult struct {
	Index int    `json:"index"`
	HTML  string `json:"html"`
}

// TranslateBlockEvent represents an ordered event in a block translation stream.
type TranslateBlockEvent struct {
	Result *TranslateBlockResult
	Err    error
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

// BatchTranslateEvent represents an ordered event in a batch translation stream.
type BatchTranslateEvent struct {
	Result *BatchTranslateResult
	Err    error
}

// AIService provides AI-related operations like summarization and translation.
type AIService interface {
	GetCachedSummary(ctx context.Context, entryID int64, isReadability bool) (*model.AISummary, error)
	Summarize(ctx context.Context, entryID int64, content, title string, isReadability bool) (<-chan SummarizeEvent, error)
	SaveSummary(ctx context.Context, entryID int64, isReadability bool, summary string) error
	GetSummaryLanguage(ctx context.Context) string

	GetCachedTranslation(ctx context.Context, entryID int64, isReadability bool) (*model.AITranslation, error)
	TranslateBlocks(ctx context.Context, entryID int64, content, title string, isReadability bool) ([]TranslateBlockInfo, <-chan TranslateBlockEvent, error)
	SaveTranslation(ctx context.Context, entryID int64, isReadability bool, content string) error
	TranslateBatch(ctx context.Context, articles []BatchArticleInput) (<-chan BatchTranslateEvent, error)
	ClearAllCache(ctx context.Context) (summaries, translations, listTranslations int64, err error)
}

type inflightJob struct {
	done   chan struct{}
	result string
	err    error
}

type aiService struct {
	summaryRepo         repository.AISummaryRepository
	translationRepo     repository.AITranslationRepository
	listTranslationRepo repository.AIListTranslationRepository
	settingsRepo        repository.SettingsRepository
	entryRepo           repository.EntryRepository
	feedRepo            repository.FeedRepository
	rateLimiter         *ai.RateLimiter
	clientFactory       *network.ClientFactory

	inflightMu   sync.Mutex
	inflightJobs map[string]*inflightJob
}

// NewAIService creates a new AI service with full dependencies.
// Optional dependencies (entryRepo, feedRepo, clientFactory) may be nil in unit tests.
func NewAIService(
	summaryRepo repository.AISummaryRepository,
	translationRepo repository.AITranslationRepository,
	listTranslationRepo repository.AIListTranslationRepository,
	settingsRepo repository.SettingsRepository,
	rateLimiter *ai.RateLimiter,
	entryRepo repository.EntryRepository,
	feedRepo repository.FeedRepository,
	clientFactory *network.ClientFactory,
) AIService {
	return &aiService{
		summaryRepo:         summaryRepo,
		translationRepo:     translationRepo,
		listTranslationRepo: listTranslationRepo,
		settingsRepo:        settingsRepo,
		entryRepo:           entryRepo,
		feedRepo:            feedRepo,
		rateLimiter:         rateLimiter,
		clientFactory:       clientFactory,
		inflightJobs:        make(map[string]*inflightJob),
	}
}

func (s *aiService) GetCachedSummary(ctx context.Context, entryID int64, isReadability bool) (*model.AISummary, error) {
	language := s.GetSummaryLanguage(ctx)
	return s.summaryRepo.Get(ctx, entryID, isReadability, language)
}

func (s *aiService) Summarize(ctx context.Context, entryID int64, content, title string, isReadability bool) (<-chan SummarizeEvent, error) {
	// Snapshot language once at request entry so prompt & cache key stay consistent.
	language := s.GetSummaryLanguage(ctx)
	dedupKey := fmt.Sprintf("summary:%d:%t:%s", entryID, isReadability, language)

	// Deduplicate concurrent summary requests for the same (entry, mode, language).
	s.inflightMu.Lock()
	if existing, ok := s.inflightJobs[dedupKey]; ok {
		s.inflightMu.Unlock()
		ch := make(chan SummarizeEvent, 1)
		go func() {
			defer close(ch)
			select {
			case <-ctx.Done():
				return
			case <-existing.done:
				if existing.err != nil {
					ch <- SummarizeEvent{Err: existing.err}
					return
				}
				if existing.result != "" {
					ch <- SummarizeEvent{Text: existing.result}
				}
			}
		}()
		return ch, nil
	}

	cfg, err := s.getAIConfig(ctx)
	if err != nil {
		s.inflightMu.Unlock()
		return nil, err
	}

	provider, err := ai.NewProvider(cfg)
	if err != nil {
		s.inflightMu.Unlock()
		logger.Warn("ai provider create failed", "module", "service", "action", "fetch", "resource", "ai", "result", "failed", "provider", cfg.Provider, "model", cfg.Model, "error", err)
		return nil, fmt.Errorf("create provider: %w", err)
	}

	job := &inflightJob{done: make(chan struct{})}
	s.inflightJobs[dedupKey] = job
	s.inflightMu.Unlock()

	releaseJob := func(result string, jobErr error) {
		job.result = result
		job.err = jobErr
		s.inflightMu.Lock()
		delete(s.inflightJobs, dedupKey)
		s.inflightMu.Unlock()
		close(job.done)
	}

	if err := s.rateLimiter.Wait(ctx); err != nil {
		releaseJob("", fmt.Errorf("rate limit: %w", err))
		logger.Warn("ai rate limit wait failed", "module", "service", "action", "fetch", "resource", "ai", "result", "failed", "error", err)
		return nil, fmt.Errorf("rate limit: %w", err)
	}

	systemPrompt := s.buildSummarizeSystemPromptWithLanguage(ctx, entryID, title, language)
	plainText := ai.HTMLToText(content)
	wrappedInput := ai.WrapInput(plainText)

	upstreamCh := provider.SummarizeStream(ctx, systemPrompt, wrappedInput)
	logger.Info("ai summarize stream started", "module", "service", "action", "fetch", "resource", "ai", "result", "ok", "entry_id", entryID, "provider", cfg.Provider, "model", cfg.Model)

	outCh := make(chan SummarizeEvent, 16)
	go func() {
		defer close(outCh)

		var fullText strings.Builder
		var streamErr error

		for ev := range upstreamCh {
			if ev.Err != nil {
				streamErr = ev.Err
				select {
				case outCh <- SummarizeEvent{Err: ev.Err}:
				case <-ctx.Done():
				}
				break
			}
			if ev.Text != "" {
				fullText.WriteString(ev.Text)
				select {
				case outCh <- SummarizeEvent{Text: ev.Text}:
				case <-ctx.Done():
					streamErr = ctx.Err()
				}
				if streamErr != nil {
					break
				}
			}
		}

		summary := fullText.String()
		if streamErr == nil && ctx.Err() == nil && summary != "" {
			saveCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), aiCacheSaveTimeout)
			if err := s.summaryRepo.Save(saveCtx, entryID, isReadability, language, summary); err != nil {
				logger.Warn("ai summary save failed", "module", "service", "action", "save", "resource", "ai", "result", "failed", "entry_id", entryID, "error", err)
			} else {
				logger.Info("ai summary saved", "module", "service", "action", "save", "resource", "ai", "result", "ok", "entry_id", entryID, "readability", isReadability)
			}
			cancel()
		}

		if streamErr == nil && ctx.Err() != nil {
			streamErr = ctx.Err()
		}
		releaseJob(summary, streamErr)
	}()

	return outCh, nil
}

func (s *aiService) buildSummarizeSystemPrompt(ctx context.Context, entryID int64, title string) string {
	return s.buildSummarizeSystemPromptWithLanguage(ctx, entryID, title, s.GetSummaryLanguage(ctx))
}

func (s *aiService) buildSummarizeSystemPromptWithLanguage(ctx context.Context, entryID int64, title, language string) string {
	return ai.GetSummarizePrompt(title, language, s.getSummaryPromptReminder(ctx, entryID))
}

func (s *aiService) getSummaryPromptReminder(ctx context.Context, entryID int64) string {
	if s.entryRepo == nil || s.feedRepo == nil {
		return ""
	}

	entry, err := s.entryRepo.GetByID(ctx, entryID)
	if err != nil {
		logger.Warn("ai summarize load entry failed", "module", "service", "action", "fetch", "resource", "ai", "result", "failed", "entry_id", entryID, "error", err)
		return ""
	}

	feed, err := s.feedRepo.GetByID(ctx, entry.FeedID)
	if err != nil {
		logger.Warn("ai summarize load feed failed", "module", "service", "action", "fetch", "resource", "ai", "result", "failed", "entry_id", entryID, "feed_id", entry.FeedID, "error", err)
		return ""
	}

	if feed.SummaryPromptReminder == nil {
		return ""
	}
	return strings.TrimSpace(*feed.SummaryPromptReminder)
}

func (s *aiService) SaveSummary(ctx context.Context, entryID int64, isReadability bool, summary string) error {
	language := s.GetSummaryLanguage(ctx)
	if err := s.summaryRepo.Save(ctx, entryID, isReadability, language, summary); err != nil {
		logger.Warn("ai summary save failed", "module", "service", "action", "save", "resource", "ai", "result", "failed", "entry_id", entryID, "error", err)
		return err
	}
	logger.Info("ai summary saved", "module", "service", "action", "save", "resource", "ai", "result", "ok", "entry_id", entryID, "readability", isReadability)
	return nil
}

func (s *aiService) GetSummaryLanguage(ctx context.Context) string {
	setting, err := s.settingsRepo.Get(ctx, "ai.summary_language")
	if err != nil || setting == nil || setting.Value == "" {
		return "zh-CN"
	}
	return setting.Value
}

func (s *aiService) getAIConfig(ctx context.Context) (ai.Config, error) {
	var cfg ai.Config

	settings, err := s.settingsRepo.GetByPrefix(ctx, "ai.")
	if err != nil {
		return cfg, fmt.Errorf("get AI settings: %w", err)
	}

	settingsMap := make(map[string]string, len(settings))
	for _, setting := range settings {
		settingsMap[setting.Key] = setting.Value
	}

	cfg.Provider = settingsMap["ai.provider"]
	if cfg.Provider == "" {
		cfg.Provider = ai.ProviderOpenAI
	}

	cfg.APIKey = settingsMap["ai.api_key"]
	if cfg.APIKey == "" {
		return cfg, fmt.Errorf("AI API key is not configured")
	}

	cfg.BaseURL = settingsMap["ai.base_url"]

	cfg.Model = settingsMap["ai.model"]
	if cfg.Model == "" {
		return cfg, fmt.Errorf("AI model is not configured")
	}

	if val := settingsMap["ai.request_options"]; val != "" {
		var requestOptions map[string]any
		if err := json.Unmarshal([]byte(val), &requestOptions); err != nil {
			return cfg, fmt.Errorf("parse request options: %w", err)
		}
		cfg.RequestOptions = requestOptions
	}

	if s.clientFactory != nil {
		cfg.HTTPClient = s.clientFactory.NewHTTPClient(ctx, aiRequestTimeout)
	}

	return cfg, nil
}

func (s *aiService) GetCachedTranslation(ctx context.Context, entryID int64, isReadability bool) (*model.AITranslation, error) {
	language := s.GetSummaryLanguage(ctx)
	translation, err := s.translationRepo.Get(ctx, entryID, isReadability, language)
	if err != nil {
		logger.Warn("ai translation cache lookup failed", "module", "service", "action", "fetch", "resource", "ai", "result", "failed", "entry_id", entryID, "error", err)
		return nil, err
	}
	return translation, nil
}

func (s *aiService) SaveTranslation(ctx context.Context, entryID int64, isReadability bool, content string) error {
	language := s.GetSummaryLanguage(ctx)
	if err := s.translationRepo.Save(ctx, entryID, isReadability, language, content); err != nil {
		logger.Warn("ai translation save failed", "module", "service", "action", "save", "resource", "ai", "result", "failed", "entry_id", entryID, "error", err)
		return err
	}
	logger.Info("ai translation saved", "module", "service", "action", "save", "resource", "ai", "result", "ok", "entry_id", entryID, "readability", isReadability)
	return nil
}

// TranslateBlocks parses HTML into blocks and translates them in parallel over a single ordered event channel.
func (s *aiService) TranslateBlocks(ctx context.Context, entryID int64, content, title string, isReadability bool) ([]TranslateBlockInfo, <-chan TranslateBlockEvent, error) {
	blocks, err := ai.ParseHTMLBlocks(content)
	if err != nil {
		logger.Warn("ai translate parse blocks failed", "module", "service", "action", "fetch", "resource", "ai", "result", "failed", "entry_id", entryID, "error", err)
		return nil, nil, fmt.Errorf("parse HTML blocks: %w", err)
	}
	if len(blocks) == 0 {
		logger.Warn("ai translate no blocks", "module", "service", "action", "fetch", "resource", "ai", "result", "failed", "entry_id", entryID)
		return nil, nil, fmt.Errorf("no blocks to translate")
	}

	blockInfos := make([]TranslateBlockInfo, len(blocks))
	for i, b := range blocks {
		blockInfos[i] = TranslateBlockInfo{
			Index:         b.Index,
			HTML:          b.HTML,
			NeedTranslate: b.NeedTranslate,
		}
	}

	language := s.GetSummaryLanguage(ctx)
	dedupKey := fmt.Sprintf("translate:%d:%t:%s", entryID, isReadability, language)

	// Deduplicate concurrent translation requests for the same (entry, mode, language).
	s.inflightMu.Lock()
	if existing, ok := s.inflightJobs[dedupKey]; ok {
		s.inflightMu.Unlock()
		ch := make(chan TranslateBlockEvent, 1)
		go func() {
			defer close(ch)
			select {
			case <-ctx.Done():
				return
			case <-existing.done:
				if existing.err != nil {
					ch <- TranslateBlockEvent{Err: existing.err}
					return
				}
				if existing.result != "" {
					if translatedBlocks, pErr := ai.ParseHTMLBlocks(existing.result); pErr == nil && len(translatedBlocks) == len(blockInfos) {
						for i, tb := range translatedBlocks {
							if !blockInfos[i].NeedTranslate {
								continue
							}
							res := TranslateBlockResult{Index: blockInfos[i].Index, HTML: tb.HTML}
							select {
							case ch <- TranslateBlockEvent{Result: &res}:
							case <-ctx.Done():
								return
							}
						}
					}
				}
			}
		}()
		return blockInfos, ch, nil
	}

	cfg, err := s.getAIConfig(ctx)
	if err != nil {
		s.inflightMu.Unlock()
		logger.Warn("ai translate get config failed", "module", "service", "action", "fetch", "resource", "ai", "result", "failed", "entry_id", entryID, "error", err)
		return nil, nil, err
	}

	// Create and validate the provider once before spawning worker goroutines.
	provider, err := ai.NewProvider(cfg)
	if err != nil {
		s.inflightMu.Unlock()
		logger.Warn("ai translate create provider failed", "module", "service", "action", "fetch", "resource", "ai", "result", "failed", "entry_id", entryID, "error", err)
		return nil, nil, fmt.Errorf("create provider: %w", err)
	}

	job := &inflightJob{done: make(chan struct{})}
	s.inflightJobs[dedupKey] = job
	s.inflightMu.Unlock()

	eventCh := make(chan TranslateBlockEvent, 16)
	systemPrompt := ai.GetTranslateBlockPrompt(title, language)

	go func() {
		defer close(eventCh)

		var wg sync.WaitGroup
		sem := make(chan struct{}, 3)

		var results []TranslateBlockResult
		var resultsMu sync.Mutex
		var hasError atomic.Bool
		var firstErr error
		var firstErrOnce sync.Once

	blockLoop:
		for _, block := range blocks {
			if ctx.Err() != nil {
				break
			}

			if !block.NeedTranslate {
				resultsMu.Lock()
				results = append(results, TranslateBlockResult{
					Index: block.Index,
					HTML:  block.HTML,
				})
				resultsMu.Unlock()
				continue
			}

			wg.Add(1)
			select {
			case sem <- struct{}{}:
			case <-ctx.Done():
				wg.Done()
				break blockLoop
			}

			go func(b ai.Block) {
				defer wg.Done()
				defer func() { <-sem }()

				if err := s.rateLimiter.Wait(ctx); err != nil {
					hasError.Store(true)
					errWrapped := fmt.Errorf("rate limit: %w", err)
					firstErrOnce.Do(func() { firstErr = errWrapped })
					select {
					case eventCh <- TranslateBlockEvent{Err: errWrapped}:
					case <-ctx.Done():
					}
					return
				}

				htmlForTranslation, mediaElements := ai.ReplaceMediaWithPlaceholders(b.HTML)
				wrappedInput := ai.WrapInput(htmlForTranslation)

				translatedHTML, err := provider.Complete(ctx, systemPrompt, wrappedInput)
				if err != nil {
					hasError.Store(true)
					errWrapped := fmt.Errorf("translate block %d: %w", b.Index, err)
					firstErrOnce.Do(func() { firstErr = errWrapped })
					select {
					case eventCh <- TranslateBlockEvent{Err: errWrapped}:
					case <-ctx.Done():
					}
					return
				}

				translatedHTML = ai.RestoreMediaFromPlaceholders(translatedHTML, mediaElements)

				result := TranslateBlockResult{
					Index: b.Index,
					HTML:  translatedHTML,
				}
				resultsMu.Lock()
				results = append(results, result)
				resultsMu.Unlock()

				select {
				case eventCh <- TranslateBlockEvent{Result: &result}:
				case <-ctx.Done():
				}
			}(block)
		}

		wg.Wait()

		var fullContent string
		if !hasError.Load() && len(results) > 0 && ctx.Err() == nil {
			sort.Slice(results, func(i, j int) bool {
				return results[i].Index < results[j].Index
			})

			var fullHTML strings.Builder
			for _, r := range results {
				fullHTML.WriteString(r.HTML)
			}
			fullContent = fullHTML.String()

			saveCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), aiCacheSaveTimeout)
			if err := s.translationRepo.Save(saveCtx, entryID, isReadability, language, fullContent); err != nil {
				logger.Warn("ai translate cache save failed", "module", "service", "action", "save", "resource", "ai", "result", "failed", "entry_id", entryID, "error", err)
			} else {
				logger.Info("ai translation saved", "module", "service", "action", "save", "resource", "ai", "result", "ok", "entry_id", entryID, "readability", isReadability)
			}
			cancel()
		}

		job.result = fullContent
		if firstErr != nil {
			job.err = firstErr
		} else if ctx.Err() != nil {
			job.err = ctx.Err()
		}
		s.inflightMu.Lock()
		delete(s.inflightJobs, dedupKey)
		s.inflightMu.Unlock()
		close(job.done)
	}()

	return blockInfos, eventCh, nil
}

// TranslateBatch translates multiple articles' titles and summaries concurrently over a single event channel.
func (s *aiService) TranslateBatch(ctx context.Context, articles []BatchArticleInput) (<-chan BatchTranslateEvent, error) {
	if len(articles) == 0 {
		logger.Warn("ai batch translate empty input", "module", "service", "action", "fetch", "resource", "ai", "result", "failed")
		return nil, fmt.Errorf("no articles to translate")
	}

	language := s.GetSummaryLanguage(ctx)

	entryIDs := make([]int64, 0, len(articles))
	articleMap := make(map[int64]BatchArticleInput, len(articles))
	for _, a := range articles {
		entryID, err := strconv.ParseInt(strings.TrimSpace(a.ID), 10, 64)
		if err != nil {
			continue
		}
		if _, exists := articleMap[entryID]; exists {
			continue
		}
		entryIDs = append(entryIDs, entryID)
		articleMap[entryID] = a
	}

	cachedMap, err := s.listTranslationRepo.GetBatch(ctx, entryIDs, language)
	if err != nil {
		logger.Warn("ai batch translate cache lookup failed", "module", "service", "action", "fetch", "resource", "ai", "result", "failed", "error", err)
		cachedMap = make(map[int64]*model.AIListTranslation)
	}

	needsTranslation := false
	for _, entryID := range entryIDs {
		if _, ok := cachedMap[entryID]; !ok {
			needsTranslation = true
			break
		}
	}

	var provider ai.Provider
	if needsTranslation {
		cfg, err := s.getAIConfig(ctx)
		if err != nil {
			logger.Warn("ai batch translate get config failed", "module", "service", "action", "fetch", "resource", "ai", "result", "failed", "error", err)
			return nil, err
		}
		// Create and validate provider once before spawning goroutines.
		provider, err = ai.NewProvider(cfg)
		if err != nil {
			logger.Warn("ai batch translate provider create failed", "module", "service", "action", "fetch", "resource", "ai", "result", "failed", "provider", cfg.Provider, "model", cfg.Model, "error", err)
			return nil, fmt.Errorf("create provider: %w", err)
		}
	}

	eventCh := make(chan BatchTranslateEvent, 16)
	titlePrompt := ai.GetTranslateTextPrompt("title", language)
	summaryPrompt := ai.GetTranslateTextPrompt("summary", language)

	go func() {
		defer close(eventCh)

		var wg sync.WaitGroup
		sem := make(chan struct{}, 5)

	articleLoop:
		for _, entryID := range entryIDs {
			if ctx.Err() != nil {
				break
			}

			article := articleMap[entryID]

			if cached, ok := cachedMap[entryID]; ok {
				result := BatchTranslateResult{
					ID:      article.ID,
					Title:   &cached.Title,
					Summary: &cached.Summary,
					Cached:  true,
				}
				select {
				case eventCh <- BatchTranslateEvent{Result: &result}:
				case <-ctx.Done():
					break articleLoop
				}
				logger.Debug("ai batch translate cache hit", "module", "service", "action", "fetch", "resource", "ai", "result", "ok", "entry_id", entryID, "cache", "hit")
				continue
			}

			wg.Add(1)
			select {
			case sem <- struct{}{}:
			case <-ctx.Done():
				wg.Done()
				break articleLoop
			}

			go func(a BatchArticleInput, eID int64) {
				defer wg.Done()
				defer func() { <-sem }()

				var translatedTitle *string
				titleStr := ""
				if a.Title != "" {
					if err := s.rateLimiter.Wait(ctx); err != nil {
						select {
						case eventCh <- BatchTranslateEvent{Err: fmt.Errorf("rate limit: %w", err)}:
						case <-ctx.Done():
						}
						return
					}
					translated, err := provider.Complete(ctx, titlePrompt, ai.WrapInput(a.Title))
					if err != nil {
						select {
						case eventCh <- BatchTranslateEvent{Err: fmt.Errorf("translate title for %s: %w", a.ID, err)}:
						case <-ctx.Done():
						}
						return
					}
					translatedTitle = &translated
					titleStr = translated
				}

				var translatedSummary *string
				summaryStr := ""
				if a.Summary != "" {
					if err := s.rateLimiter.Wait(ctx); err != nil {
						// Preserve already translated title even if summary translation fails.
						if translatedTitle != nil {
							s.emitBatchPartialResult(ctx, eventCh, eID, language, a.ID, translatedTitle, titleStr, nil, "")
						}
						select {
						case eventCh <- BatchTranslateEvent{Err: fmt.Errorf("rate limit: %w", err)}:
						case <-ctx.Done():
						}
						return
					}
					translated, err := provider.Complete(ctx, summaryPrompt, ai.WrapInput(a.Summary))
					if err != nil {
						// Preserve already translated title when summary fails.
						if translatedTitle != nil {
							s.emitBatchPartialResult(ctx, eventCh, eID, language, a.ID, translatedTitle, titleStr, nil, "")
						}
						select {
						case eventCh <- BatchTranslateEvent{Err: fmt.Errorf("translate summary for %s: %w", a.ID, err)}:
						case <-ctx.Done():
						}
						return
					}
					translatedSummary = &translated
					summaryStr = translated
				}

				s.emitBatchPartialResult(ctx, eventCh, eID, language, a.ID, translatedTitle, titleStr, translatedSummary, summaryStr)
			}(article, entryID)
		}

		wg.Wait()
	}()

	return eventCh, nil
}

func (s *aiService) emitBatchPartialResult(
	ctx context.Context,
	eventCh chan<- BatchTranslateEvent,
	entryID int64,
	language string,
	articleID string,
	translatedTitle *string,
	titleStr string,
	translatedSummary *string,
	summaryStr string,
) {
	if titleStr != "" || summaryStr != "" {
		saveCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), aiCacheSaveTimeout)
		if err := s.listTranslationRepo.Save(saveCtx, entryID, language, titleStr, summaryStr); err != nil {
			logger.Warn("ai batch translate cache save failed", "module", "service", "action", "save", "resource", "ai", "result", "failed", "entry_id", entryID, "error", err)
		}
		cancel()
	}

	result := BatchTranslateResult{
		ID:      articleID,
		Title:   translatedTitle,
		Summary: translatedSummary,
	}
	select {
	case eventCh <- BatchTranslateEvent{Result: &result}:
	case <-ctx.Done():
	}
}

func (s *aiService) ClearAllCache(ctx context.Context) (summaries, translations, listTranslations int64, err error) {
	summaries, err = s.summaryRepo.DeleteAll(ctx)
	if err != nil {
		return 0, 0, 0, fmt.Errorf("clear summaries: %w", err)
	}

	translations, err = s.translationRepo.DeleteAll(ctx)
	if err != nil {
		return summaries, 0, 0, fmt.Errorf("clear translations: %w", err)
	}

	listTranslations, err = s.listTranslationRepo.DeleteAll(ctx)
	if err != nil {
		return summaries, translations, 0, fmt.Errorf("clear list translations: %w", err)
	}

	logger.Info("ai cache cleared", "module", "service", "action", "clear", "resource", "ai", "result", "ok", "summaries", summaries, "translations", translations, "list_translations", listTranslations)
	return summaries, translations, listTranslations, nil
}
