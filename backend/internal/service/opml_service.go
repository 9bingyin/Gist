package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"sort"
	"strings"
	"time"

	"gist/backend/internal/model"
	"gist/backend/internal/opml"
	"gist/backend/internal/repository"
)

type OPMLService interface {
	Import(ctx context.Context, reader io.Reader, onProgress func(ImportProgress)) (ImportResult, error)
	Export(ctx context.Context) ([]byte, error)
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
	folderService FolderService
	feedService   FeedService
	folders       repository.FolderRepository
	feeds         repository.FeedRepository
}

func NewOPMLService(
	folderService FolderService,
	feedService FeedService,
	folders repository.FolderRepository,
	feeds repository.FeedRepository,
) OPMLService {
	return &opmlService{
		folderService: folderService,
		feedService:   feedService,
		folders:       folders,
		feeds:         feeds,
	}
}

func (s *opmlService) Import(ctx context.Context, reader io.Reader, onProgress func(ImportProgress)) (ImportResult, error) {
	doc, err := opml.Parse(reader)
	if err != nil {
		return ImportResult{}, ErrInvalid
	}

	// Count total feeds
	total := countFeeds(doc.Body.Outlines)

	// Send started progress
	if onProgress != nil {
		onProgress(ImportProgress{Total: total, Current: 0, Status: "started"})
	}

	result := ImportResult{}
	current := 0
	for _, outline := range doc.Body.Outlines {
		if err := s.importOutline(ctx, outline, nil, "article", &result, &current, total, onProgress); err != nil {
			return result, err
		}
	}

	return result, nil
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
		return nil, fmt.Errorf("list folders: %w", err)
	}
	feeds, err := s.feeds.List(ctx, nil)
	if err != nil {
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
		return nil, fmt.Errorf("encode opml: %w", err)
	}
	return payload, nil
}

func (s *opmlService) importOutline(
	ctx context.Context,
	outline opml.Outline,
	parentID *int64,
	folderType string,
	result *ImportResult,
	current *int,
	total int,
	onProgress func(ImportProgress),
) error {
	// Check if context is cancelled
	if ctx.Err() != nil {
		return ctx.Err()
	}

	if isFeedOutline(outline) {
		return s.importFeed(ctx, outline, parentID, folderType, result, current, total, onProgress)
	}

	folderName := pickOutlineTitle(outline)
	folder, created, err := s.ensureFolder(ctx, folderName, parentID)
	if err != nil {
		return err
	}
	if created {
		result.FoldersCreated++
	} else {
		result.FoldersSkipped++
	}

	for _, child := range outline.Outlines {
		// Use the folder's actual type (may differ from parent if folder already existed)
		if err := s.importOutline(ctx, child, &folder.ID, folder.Type, result, current, total, onProgress); err != nil {
			return err
		}
	}

	return nil
}

func (s *opmlService) ensureFolder(ctx context.Context, name string, parentID *int64) (model.Folder, bool, error) {
	if strings.TrimSpace(name) == "" {
		name = "Untitled"
	}

	// Try to find existing folder first
	if existing, err := s.folders.FindByName(ctx, name, parentID); err != nil {
		return model.Folder{}, false, fmt.Errorf("find folder: %w", err)
	} else if existing != nil {
		return *existing, false, nil
	}

	// Create new folder using FolderService
	folder, err := s.folderService.Create(ctx, name, parentID, "article")
	if err != nil {
		if errors.Is(err, ErrConflict) {
			// Race condition: folder was created between check and create
			if existing, findErr := s.folders.FindByName(ctx, name, parentID); findErr == nil && existing != nil {
				return *existing, false, nil
			}
		}
		return model.Folder{}, false, fmt.Errorf("create folder: %w", err)
	}
	return folder, true, nil
}

func (s *opmlService) importFeed(
	ctx context.Context,
	outline opml.Outline,
	folderID *int64,
	folderType string,
	result *ImportResult,
	current *int,
	total int,
	onProgress func(ImportProgress),
) error {
	feedURL := strings.TrimSpace(outline.XMLURL)
	title := strings.TrimSpace(outline.Title)
	if title == "" {
		title = strings.TrimSpace(outline.Text)
	}

	// Send progress before importing
	*current++
	if onProgress != nil {
		onProgress(ImportProgress{
			Total:   total,
			Current: *current,
			Feed:    title,
			Status:  "importing",
		})
	}

	if feedURL == "" {
		result.FeedsSkipped++
		return nil
	}

	// Use FeedService.Add to create feed (will fetch and refresh automatically)
	// Feed inherits type from its parent folder
	_, err := s.feedService.Add(ctx, feedURL, folderID, title, folderType)
	if err != nil {
		if errors.Is(err, ErrConflict) {
			// Feed already exists
			result.FeedsSkipped++
			return nil
		}
		return fmt.Errorf("add feed %s: %w", feedURL, err)
	}

	result.FeedsCreated++
	return nil
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
