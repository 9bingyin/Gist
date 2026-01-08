package service

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"gist/backend/internal/model"
	"gist/backend/internal/opml"
	"gist/backend/internal/service/testutil"

	"go.uber.org/mock/gomock"
)

const sampleOPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Tech">
      <outline text="Feed A" xmlUrl="https://a.com/rss" />
    </outline>
    <outline text="Feed B" xmlUrl="https://b.com/rss" />
  </body>
</opml>`

func TestOPMLService_Import_Invalid(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	svc := NewOPMLService(nil, nil, nil, nil, testutil.NewMockFolderRepository(ctrl), testutil.NewMockFeedRepository(ctrl))
	_, err := svc.Import(context.Background(), strings.NewReader("<invalid"), nil)
	if !errors.Is(err, ErrInvalid) {
		t.Fatalf("expected ErrInvalid, got %v", err)
	}
}

func TestOPMLService_Import_CreatesFoldersAndFeeds(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	folderRepo := testutil.NewMockFolderRepository(ctrl)
	folderService := &folderServiceStub{nextID: 10}
	feedService := &feedServiceStub{nextID: 100}
	refreshSvc := &refreshServiceStub{done: make(chan []int64, 1)}
	iconSvc := &iconServiceStub{done: make(chan struct{}, 1)}

	folderRepo.EXPECT().FindByName(gomock.Any(), "Tech", (*int64)(nil)).Return(nil, nil)

	progressEvents := make([]ImportProgress, 0, 3)
	onProgress := func(p ImportProgress) {
		progressEvents = append(progressEvents, p)
	}

	svc := NewOPMLService(folderService, feedService, refreshSvc, iconSvc, folderRepo, nil)
	result, err := svc.Import(context.Background(), strings.NewReader(sampleOPML), onProgress)
	if err != nil {
		t.Fatalf("Import failed: %v", err)
	}
	if result.FoldersCreated != 1 || result.FeedsCreated != 2 {
		t.Fatalf("unexpected import result: %+v", result)
	}
	if len(progressEvents) < 3 {
		t.Fatalf("expected progress events, got %d", len(progressEvents))
	}
	if progressEvents[0].Status != "started" || progressEvents[0].Total != 2 {
		t.Fatalf("unexpected start progress: %+v", progressEvents[0])
	}

	if len(feedService.calls) != 2 {
		t.Fatalf("expected 2 feed imports, got %d", len(feedService.calls))
	}
	if feedService.calls[0].url != "https://a.com/rss" || feedService.calls[1].url != "https://b.com/rss" {
		t.Fatalf("unexpected feed urls: %+v", feedService.calls)
	}
	if feedService.calls[0].folderID == nil || *feedService.calls[0].folderID != 10 {
		t.Fatalf("expected folder id for Feed A")
	}
	if feedService.calls[1].folderID != nil {
		t.Fatalf("expected root feed to have nil folder id")
	}

	select {
	case ids := <-refreshSvc.done:
		if len(ids) != 2 {
			t.Fatalf("expected 2 refresh ids, got %v", ids)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatal("expected refresh to run")
	}

	select {
	case <-iconSvc.done:
	default:
		t.Fatal("expected icon backfill to run")
	}
}

func TestOPMLService_Import_EmptyFolderNameUsesUntitled(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	folderRepo := testutil.NewMockFolderRepository(ctrl)
	folderService := &folderServiceStub{nextID: 1}
	feedService := &feedServiceStub{nextID: 1}

	folderRepo.EXPECT().FindByName(gomock.Any(), "Untitled", (*int64)(nil)).Return(nil, nil)

	input := `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline>
      <outline text="Feed" xmlUrl="https://a.com/rss" />
    </outline>
  </body>
</opml>`

	svc := NewOPMLService(folderService, feedService, nil, nil, folderRepo, nil)
	_, err := svc.Import(context.Background(), strings.NewReader(input), nil)
	if err != nil {
		t.Fatalf("Import failed: %v", err)
	}
	if len(folderService.created) == 0 || folderService.created[0].Name != "Untitled" {
		t.Fatalf("expected Untitled folder, got %+v", folderService.created)
	}
}

func TestOPMLService_Export_SortsAndBuildsOutlines(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	folderRepo := testutil.NewMockFolderRepository(ctrl)
	feedRepo := testutil.NewMockFeedRepository(ctrl)

	folders := []model.Folder{
		{ID: 1, Name: "B Folder"},
		{ID: 2, Name: "a folder"},
	}
	feeds := []model.Feed{
		{ID: 10, Title: "Z Feed", URL: "https://z.com/rss"},
		{ID: 11, Title: "A Feed", URL: "https://a.com/rss"},
		{ID: 12, Title: "Child", URL: "https://c.com/rss", FolderID: int64Ptr(1), SiteURL: strPtr("https://c.com")},
	}

	folderRepo.EXPECT().List(gomock.Any()).Return(folders, nil)
	feedRepo.EXPECT().List(gomock.Any(), (*int64)(nil)).Return(feeds, nil)

	svc := NewOPMLService(nil, nil, nil, nil, folderRepo, feedRepo)
	data, err := svc.Export(context.Background())
	if err != nil {
		t.Fatalf("Export failed: %v", err)
	}

	doc, err := opml.Parse(bytes.NewReader(data))
	if err != nil {
		t.Fatalf("failed to parse exported opml: %v", err)
	}

	if len(doc.Body.Outlines) != 4 {
		t.Fatalf("expected 4 outlines, got %d", len(doc.Body.Outlines))
	}
	if doc.Body.Outlines[0].Text != "a folder" || doc.Body.Outlines[1].Text != "B Folder" {
		t.Fatalf("unexpected folder order")
	}
	if doc.Body.Outlines[2].Text != "A Feed" || doc.Body.Outlines[3].Text != "Z Feed" {
		t.Fatalf("unexpected feed order")
	}

	child := doc.Body.Outlines[1].Outlines
	if len(child) != 1 || child[0].XMLURL != "https://c.com/rss" || child[0].HTMLURL != "https://c.com" {
		t.Fatalf("unexpected child feed outline")
	}
}

type folderServiceStub struct {
	nextID  int64
	created []model.Folder
}

func (s *folderServiceStub) Create(ctx context.Context, name string, parentID *int64, folderType string) (model.Folder, error) {
	folder := model.Folder{ID: s.nextID, Name: name, ParentID: parentID, Type: folderType}
	s.nextID++
	s.created = append(s.created, folder)
	return folder, nil
}

func (s *folderServiceStub) List(ctx context.Context) ([]model.Folder, error) {
	return nil, nil
}

func (s *folderServiceStub) Update(ctx context.Context, id int64, name string, parentID *int64) (model.Folder, error) {
	return model.Folder{}, nil
}

func (s *folderServiceStub) UpdateType(ctx context.Context, id int64, folderType string) error {
	return nil
}

func (s *folderServiceStub) Delete(ctx context.Context, id int64) error {
	return nil
}

type feedServiceStub struct {
	nextID int64
	calls  []feedAddCall
}

type feedAddCall struct {
	url      string
	folderID *int64
}

func (s *feedServiceStub) Add(ctx context.Context, feedURL string, folderID *int64, titleOverride string, feedType string) (model.Feed, error) {
	return model.Feed{}, nil
}

func (s *feedServiceStub) AddWithoutFetch(ctx context.Context, feedURL string, folderID *int64, titleOverride string, feedType string) (model.Feed, bool, error) {
	s.calls = append(s.calls, feedAddCall{url: feedURL, folderID: folderID})
	feed := model.Feed{ID: s.nextID, URL: feedURL, FolderID: folderID, Title: titleOverride, Type: feedType}
	s.nextID++
	return feed, true, nil
}

func (s *feedServiceStub) Preview(ctx context.Context, feedURL string) (FeedPreview, error) {
	return FeedPreview{}, nil
}

func (s *feedServiceStub) List(ctx context.Context, folderID *int64) ([]model.Feed, error) {
	return nil, nil
}

func (s *feedServiceStub) Update(ctx context.Context, id int64, title string, folderID *int64) (model.Feed, error) {
	return model.Feed{}, nil
}

func (s *feedServiceStub) UpdateType(ctx context.Context, id int64, feedType string) error {
	return nil
}

func (s *feedServiceStub) Delete(ctx context.Context, id int64) error {
	return nil
}

func (s *feedServiceStub) DeleteBatch(ctx context.Context, ids []int64) error {
	return nil
}

type refreshServiceStub struct {
	done chan []int64
}

func (s *refreshServiceStub) RefreshAll(ctx context.Context) error {
	return nil
}

func (s *refreshServiceStub) RefreshFeed(ctx context.Context, feedID int64) error {
	return nil
}

func (s *refreshServiceStub) RefreshFeeds(ctx context.Context, feedIDs []int64) error {
	select {
	case s.done <- append([]int64(nil), feedIDs...):
	default:
	}
	return nil
}

func (s *refreshServiceStub) IsRefreshing() bool {
	return false
}

type iconServiceStub struct {
	done chan struct{}
}

func (s *iconServiceStub) FetchAndSaveIcon(ctx context.Context, feedImageURL, siteURL string) (string, error) {
	return "", nil
}

func (s *iconServiceStub) EnsureIcon(ctx context.Context, iconPath, siteURL string) error {
	return nil
}

func (s *iconServiceStub) EnsureIconByFeedID(ctx context.Context, feedID int64, iconPath string) error {
	return nil
}

func (s *iconServiceStub) BackfillIcons(ctx context.Context) error {
	select {
	case s.done <- struct{}{}:
	default:
	}
	return nil
}

func (s *iconServiceStub) GetIconPath(filename string) string {
	return ""
}

func (s *iconServiceStub) ClearAllIcons(ctx context.Context) (int64, error) {
	return 0, nil
}

func int64Ptr(value int64) *int64 {
	return &value
}

func strPtr(value string) *string {
	return &value
}

// Ensure we satisfy the io.Reader interface import when not used in build tags.
