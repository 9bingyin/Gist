package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"sort"
	"strings"
	"time"

	"gist-backend/internal/model"
	"gist-backend/internal/opml"
	"gist-backend/internal/repository"
)

type OPMLService interface {
	Import(ctx context.Context, reader io.Reader) (ImportResult, error)
	Export(ctx context.Context) ([]byte, error)
}

type ImportResult struct {
	FoldersCreated int `json:"foldersCreated"`
	FoldersSkipped int `json:"foldersSkipped"`
	FeedsCreated   int `json:"feedsCreated"`
	FeedsSkipped   int `json:"feedsSkipped"`
}

type opmlService struct {
	db      *sql.DB
	folders repository.FolderRepository
	feeds   repository.FeedRepository
}

func NewOPMLService(db *sql.DB, folders repository.FolderRepository, feeds repository.FeedRepository) OPMLService {
	return &opmlService{db: db, folders: folders, feeds: feeds}
}

func (s *opmlService) Import(ctx context.Context, reader io.Reader) (ImportResult, error) {
	doc, err := opml.Parse(reader)
	if err != nil {
		return ImportResult{}, ErrInvalid
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return ImportResult{}, fmt.Errorf("begin transaction: %w", err)
	}
	foldersRepo := repository.NewFolderRepository(tx)
	feedsRepo := repository.NewFeedRepository(tx)

	result := ImportResult{}
	for _, outline := range doc.Body.Outlines {
		if err := importOutline(ctx, outline, nil, foldersRepo, feedsRepo, &result); err != nil {
			_ = tx.Rollback()
			return ImportResult{}, err
		}
	}

	if err := tx.Commit(); err != nil {
		return ImportResult{}, fmt.Errorf("commit transaction: %w", err)
	}

	return result, nil
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

func importOutline(
	ctx context.Context,
	outline opml.Outline,
	parentID *int64,
	folders repository.FolderRepository,
	feeds repository.FeedRepository,
	result *ImportResult,
) error {
	if isFeedOutline(outline) {
		return importFeed(ctx, outline, parentID, feeds, result)
	}

	folderName := pickOutlineTitle(outline)
	folder, created, err := ensureFolder(ctx, folderName, parentID, folders)
	if err != nil {
		return err
	}
	if created {
		result.FoldersCreated++
	} else {
		result.FoldersSkipped++
	}

	for _, child := range outline.Outlines {
		if err := importOutline(ctx, child, &folder.ID, folders, feeds, result); err != nil {
			return err
		}
	}

	return nil
}

func ensureFolder(ctx context.Context, name string, parentID *int64, folders repository.FolderRepository) (model.Folder, bool, error) {
	if strings.TrimSpace(name) == "" {
		name = "Untitled"
	}
	if existing, err := folders.FindByName(ctx, name, parentID); err != nil {
		return model.Folder{}, false, fmt.Errorf("find folder: %w", err)
	} else if existing != nil {
		return *existing, false, nil
	}

	folder, err := folders.Create(ctx, name, parentID)
	if err != nil {
		return model.Folder{}, false, fmt.Errorf("create folder: %w", err)
	}
	return folder, true, nil
}

func importFeed(
	ctx context.Context,
	outline opml.Outline,
	folderID *int64,
	feeds repository.FeedRepository,
	result *ImportResult,
) error {
	feedURL := strings.TrimSpace(outline.XMLURL)
	if feedURL == "" {
		result.FeedsSkipped++
		return nil
	}
	if existing, err := feeds.FindByURL(ctx, feedURL); err != nil {
		return fmt.Errorf("check feed url: %w", err)
	} else if existing != nil {
		result.FeedsSkipped++
		return nil
	}

	title := strings.TrimSpace(outline.Title)
	if title == "" {
		title = strings.TrimSpace(outline.Text)
	}
	if title == "" {
		title = feedURL
	}

	feed := model.Feed{
		FolderID:    folderID,
		Title:       title,
		URL:         feedURL,
		SiteURL:     optionalString(outline.HTMLURL),
		Description: nil,
	}
	if _, err := feeds.Create(ctx, feed); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			result.FeedsSkipped++
			return nil
		}
		return fmt.Errorf("create feed: %w", err)
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
