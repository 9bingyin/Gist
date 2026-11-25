//go:generate mockgen -source=$GOFILE -destination=mock/$GOFILE -package=mock
package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"sort"
	"strings"
	"sync"
	"time"

	"gist/backend/internal/model"
	"gist/backend/internal/repository"
	"gist/backend/pkg/logger"
	"gist/backend/pkg/opml"
)

type OPMLService interface {
	Import(ctx context.Context, reader io.Reader, onProgress func(ImportProgress)) (ImportResult, error)
	Export(ctx context.Context) ([]byte, error)
	Shutdown()
}

type ImportResult struct {
	FoldersCreated int `json:"foldersCreated"`
	FoldersSkipped int `json:"foldersSkipped"`
	FeedsCreated   int `json:"feedsCreated"`
	FeedsSkipped   int `json:"feedsSkipped"`
}

type ImportProgress struct {
	Total   int    `json:"total"`
	Current int    `json:"current"`
	Feed    string `json:"feed,omitempty"`
	Status  string `json:"status"` // "started", "importing", "done", "error"
}

type opmlService struct {
	folderService  FolderService
	feedService    FeedService
	refreshService RefreshService
	iconService    IconService
	folders        repository.FolderRepository
	feeds          repository.FeedRepository

	bgCtx    context.Context
	bgCancel context.CancelFunc
	bgWG     sync.WaitGroup
}

func NewOPMLService(
	folderService FolderService,
	feedService FeedService,
	refreshService RefreshService,
	iconService IconService,
	folders repository.FolderRepository,
	feeds repository.FeedRepository,
) OPMLService {
	bgCtx, bgCancel := context.WithCancel(context.Background())
	return &opmlService{
		folderService:  folderService,
		feedService:    feedService,
		refreshService: refreshService,
		iconService:    iconService,
		folders:        folders,
		feeds:          feeds,
		bgCtx:          bgCtx,
		bgCancel:       bgCancel,
	}
}

func (s *opmlService) Shutdown() {
	s.bgCancel()
	s.bgWG.Wait()
}

type importRunner struct {
	svc        *opmlService
	total      int
	current    int
	result     ImportResult
	newFeedIDs []int64
	onProgress func(ImportProgress)
}

func (s *opmlService) Import(ctx context.Context, reader io.Reader, onProgress func(ImportProgress)) (ImportResult, error) {
	doc, err := opml.Parse(reader)
	if err != nil {
		return ImportResult{}, ErrInvalid
	}

	total := countFeeds(doc.Body.Outlines)
	logger.Info("opml import parsed", "module", "service", "action", "import", "resource", "opml", "result", "ok", "count", total)

	if onProgress != nil {
		onProgress(ImportProgress{Total: total, Current: 0, Status: "started"})
	}

	runner := &importRunner{
		svc:        s,
		total:      total,
		onProgress: onProgress,
	}

	for _, outline := range doc.Body.Outlines {
		if err := runner.importOutline(ctx, outline, nil, "article"); err != nil {
			logger.Error("opml import failed", "module", "service", "action", "import", "resource", "opml", "result", "failed", "error", err)
			return runner.result, err
		}
	}

	if len(runner.newFeedIDs) > 0 && s.bgCtx.Err() == nil {
		feedIDs := runner.newFeedIDs
		s.bgWG.Go(func() {
			if s.refreshService != nil {
				_ = s.refreshService.RefreshFeeds(s.bgCtx, feedIDs)
			}
			if s.iconService != nil && s.bgCtx.Err() == nil {
				_ = s.iconService.BackfillIcons(s.bgCtx)
			}
		})
	}

	logger.Info("opml import completed", "module", "service", "action", "import", "resource", "opml", "result", "ok", "folders_created", runner.result.FoldersCreated, "folders_skipped", runner.result.FoldersSkipped, "feeds_created", runner.result.FeedsCreated, "feeds_skipped", runner.result.FeedsSkipped)
	return runner.result, nil
}

func (r *importRunner) importOutline(ctx context.Context, outline opml.Outline, parentID *int64, folderType string) error {
	if ctx.Err() != nil {
		return ctx.Err()
	}

	if isFeedOutline(outline) {
		return r.importFeed(ctx, outline, parentID, folderType)
	}

	folderName := pickOutlineTitle(outline)
	folder, created, err := r.svc.ensureFolder(ctx, folderName, parentID)
	if err != nil {
		return err
	}
	if created {
		r.result.FoldersCreated++
	} else {
		r.result.FoldersSkipped++
	}

	for _, child := range outline.Outlines {
		if err := r.importOutline(ctx, child, &folder.ID, folder.Type); err != nil {
			return err
		}
	}
	return nil
}

func (r *importRunner) importFeed(ctx context.Context, outline opml.Outline, folderID *int64, folderType string) error {
	feedURL := strings.TrimSpace(outline.XMLURL)
	title := strings.TrimSpace(outline.Title)
	if title == "" {
		title = strings.TrimSpace(outline.Text)
	}

	r.current++
	if r.onProgress != nil {
		r.onProgress(ImportProgress{
			Total:   r.total,
			Current: r.current,
			Feed:    title,
			Status:  "importing",
		})
	}

	if feedURL == "" {
		r.result.FeedsSkipped++
		return nil
	}

	feed, isNew, err := r.svc.feedService.AddWithoutFetch(ctx, feedURL, folderID, title, folderType)
	if err != nil {
		return fmt.Errorf("add feed %s: %w", feedURL, err)
	}

	if isNew {
		r.result.FeedsCreated++
		r.newFeedIDs = append(r.newFeedIDs, feed.ID)
	} else {
		r.result.FeedsSkipped++
	}
	return nil
}

func countFeeds(outlines []opml.Outline) int {
	count := 0
	for _, outline := range outlines {
		if isFeedOutline(outline) {
			count++
		} else {
			count += countFeeds(outline.Outlines)
		}
	}
	return count
}

func (s *opmlService) Export(ctx context.Context) ([]byte, error) {
	folders, err := s.folders.List(ctx)
	if err != nil {
		logger.Error("opml export list folders failed", "module", "service", "action", "export", "resource", "opml", "result", "failed", "error", err)
		return nil, fmt.Errorf("list folders: %w", err)
	}
	feeds, err := s.feeds.List(ctx, nil)
	if err != nil {
		logger.Error("opml export list feeds failed", "module", "service", "action", "export", "resource", "opml", "result", "failed", "error", err)
		return nil, fmt.Errorf("list feeds: %w", err)
	}

	rootOutlines := buildExportOutlines(folders, feeds)
	date := time.Now().UTC().Format(time.RFC1123Z)
	doc := opml.Document{
		Version: "2.0",
		Head: opml.Head{
			Title:        "Gist Subscriptions",
			DateCreated:  date,
			DateModified: date,
		},
		Body: opml.Body{Outlines: rootOutlines},
	}

	payload, err := opml.Encode(doc)
	if err != nil {
		logger.Error("opml export encode failed", "module", "service", "action", "export", "resource", "opml", "result", "failed", "error", err)
		return nil, fmt.Errorf("encode opml: %w", err)
	}
	logger.Info("opml export completed", "module", "service", "action", "export", "resource", "opml", "result", "ok", "folders", len(folders), "feeds", len(feeds))
	return payload, nil
}

func (s *opmlService) ensureFolder(ctx context.Context, name string, parentID *int64) (model.Folder, bool, error) {
	if strings.TrimSpace(name) == "" {
		name = "Untitled"
	}

	if existing, err := s.folders.FindByName(ctx, name, parentID); err != nil {
		return model.Folder{}, false, fmt.Errorf("find folder: %w", err)
	} else if existing != nil {
		return *existing, false, nil
	}

	folder, err := s.folderService.Create(ctx, name, parentID, "article")
	if err != nil {
		if errors.Is(err, ErrConflict) {
			if existing, findErr := s.folders.FindByName(ctx, name, parentID); findErr == nil && existing != nil {
				return *existing, false, nil
			}
		}
		return model.Folder{}, false, fmt.Errorf("create folder: %w", err)
	}
	return folder, true, nil
}

func isFeedOutline(outline opml.Outline) bool {
	if strings.TrimSpace(outline.XMLURL) != "" {
		return true
	}
	feedType := strings.ToLower(strings.TrimSpace(outline.Type))
	return feedType == "rss" || feedType == "atom" || feedType == "feed"
}

func pickOutlineTitle(outline opml.Outline) string {
	if strings.TrimSpace(outline.Title) != "" {
		return outline.Title
	}
	return outline.Text
}

type folderNode struct {
	folder model.Folder
	child  []*folderNode
	feeds  []model.Feed
}

func buildExportOutlines(folders []model.Folder, feeds []model.Feed) []opml.Outline {
	nodeByID := make(map[int64]*folderNode)
	for _, folder := range folders {
		nodeByID[folder.ID] = &folderNode{folder: folder}
	}

	var roots []*folderNode
	for _, node := range nodeByID {
		if node.folder.ParentID == nil {
			roots = append(roots, node)
			continue
		}
		parent := nodeByID[*node.folder.ParentID]
		if parent == nil {
			roots = append(roots, node)
			continue
		}
		parent.child = append(parent.child, node)
	}

	var rootFeeds []model.Feed
	for _, feed := range feeds {
		if feed.FolderID == nil {
			rootFeeds = append(rootFeeds, feed)
			continue
		}
		parent := nodeByID[*feed.FolderID]
		if parent == nil {
			rootFeeds = append(rootFeeds, feed)
			continue
		}
		parent.feeds = append(parent.feeds, feed)
	}

	sort.Slice(roots, func(i, j int) bool {
		return strings.ToLower(roots[i].folder.Name) < strings.ToLower(roots[j].folder.Name)
	})
	sort.Slice(rootFeeds, func(i, j int) bool {
		return strings.ToLower(rootFeeds[i].Title) < strings.ToLower(rootFeeds[j].Title)
	})

	var outlines []opml.Outline
	for _, node := range roots {
		outlines = append(outlines, buildFolderOutline(node))
	}
	for _, feed := range rootFeeds {
		outlines = append(outlines, buildFeedOutline(feed))
	}
	return outlines
}

func buildFolderOutline(node *folderNode) opml.Outline {
	sort.Slice(node.child, func(i, j int) bool {
		return strings.ToLower(node.child[i].folder.Name) < strings.ToLower(node.child[j].folder.Name)
	})
	sort.Slice(node.feeds, func(i, j int) bool {
		return strings.ToLower(node.feeds[i].Title) < strings.ToLower(node.feeds[j].Title)
	})

	outline := opml.Outline{
		Text:  node.folder.Name,
		Title: node.folder.Name,
	}
	for _, child := range node.child {
		outline.Outlines = append(outline.Outlines, buildFolderOutline(child))
	}
	for _, feed := range node.feeds {
		outline.Outlines = append(outline.Outlines, buildFeedOutline(feed))
	}
	return outline
}

func buildFeedOutline(feed model.Feed) opml.Outline {
	outline := opml.Outline{
		Text:   feed.Title,
		Title:  feed.Title,
		Type:   "rss",
		XMLURL: feed.URL,
	}
	if feed.SiteURL != nil {
		outline.HTMLURL = *feed.SiteURL
	}
	return outline
}
