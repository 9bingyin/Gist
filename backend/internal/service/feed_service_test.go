package service

import (
	"context"
	"database/sql"
	"errors"
	"io"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"gist/backend/internal/config"
	"gist/backend/internal/model"
	"gist/backend/internal/service/testutil"

	"github.com/mmcdole/gofeed"
	ext "github.com/mmcdole/gofeed/extensions"
	"go.uber.org/mock/gomock"
)

const sampleRSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>Test Feed</title>
<link>https://example.com</link>
<description>Desc</description>
<image>
  <url>https://example.com/icon.png</url>
</image>
<item>
  <title>Item 1</title>
  <link>https://example.com/1</link>
  <description>Content 1</description>
  <pubDate>Mon, 02 Jan 2006 15:04:05 GMT</pubDate>
</item>
<item>
  <title>Item 2</title>
  <description>Missing link</description>
</item>
</channel>
</rss>`

func TestFeedService_Add_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	mockFolders := testutil.NewMockFolderRepository(ctrl)
	mockEntries := testutil.NewMockEntryRepository(ctrl)

	feedURL := "https://example.com/rss"
	client := &http.Client{
		Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
			if req.URL.String() != feedURL {
				return nil, errors.New("unexpected feed url")
			}
			header := make(http.Header)
			header.Set("ETag", "etag-value")
			header.Set("Last-Modified", "Mon, 02 Jan 2006 15:04:05 GMT")
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader(sampleRSS)),
				Header:     header,
				Request:    req,
			}, nil
		}),
	}

	folderID := int64(10)
	mockFolders.EXPECT().GetByID(gomock.Any(), folderID).Return(model.Folder{ID: folderID}, nil)

	var createdFeed model.Feed
	mockFeeds.EXPECT().FindByURL(gomock.Any(), feedURL).Return(nil, nil)
	mockFeeds.EXPECT().Create(gomock.Any(), gomock.Any()).DoAndReturn(
		func(_ context.Context, feed model.Feed) (model.Feed, error) {
			createdFeed = feed
			feed.ID = 123
			return feed, nil
		},
	)

	mockEntries.EXPECT().CreateOrUpdate(gomock.Any(), gomock.Any()).DoAndReturn(
		func(_ context.Context, entry model.Entry) error {
			if entry.FeedID != 123 {
				t.Fatalf("unexpected feed id: %d", entry.FeedID)
			}
			if entry.URL == nil || *entry.URL == "" {
				t.Fatalf("expected entry url")
			}
			return nil
		},
	).Times(1)

	svc := NewFeedService(mockFeeds, mockFolders, mockEntries, nil, nil, client, nil)
	feed, err := svc.Add(context.Background(), feedURL, &folderID, "", "article")
	if err != nil {
		t.Fatalf("Add failed: %v", err)
	}
	if feed.ID != 123 {
		t.Fatalf("expected created feed id")
	}
	if createdFeed.Title != "Test Feed" {
		t.Fatalf("expected title from feed, got %s", createdFeed.Title)
	}
	if createdFeed.SiteURL == nil || *createdFeed.SiteURL != "https://example.com" {
		t.Fatalf("expected site url")
	}
	if createdFeed.ETag == nil || *createdFeed.ETag != "etag-value" {
		t.Fatalf("expected etag")
	}
}

func TestFeedService_Add_InvalidURL(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	svc := NewFeedService(testutil.NewMockFeedRepository(ctrl), testutil.NewMockFolderRepository(ctrl), testutil.NewMockEntryRepository(ctrl), nil, nil, nil, nil)
	_, err := svc.Add(context.Background(), "invalid-url", nil, "", "article")
	if !errors.Is(err, ErrInvalid) {
		t.Fatalf("expected ErrInvalid, got %v", err)
	}
}

func TestFeedService_Add_Conflict(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	mockFolders := testutil.NewMockFolderRepository(ctrl)
	mockEntries := testutil.NewMockEntryRepository(ctrl)

	existing := &model.Feed{ID: 1, URL: "https://example.com"}
	mockFeeds.EXPECT().FindByURL(gomock.Any(), "https://example.com").Return(existing, nil)

	svc := NewFeedService(mockFeeds, mockFolders, mockEntries, nil, nil, nil, nil)
	_, err := svc.Add(context.Background(), "https://example.com", nil, "", "article")
	var conflict *FeedConflictError
	if err == nil || !errors.As(err, &conflict) {
		t.Fatalf("expected FeedConflictError, got %v", err)
	}
	if conflict.ExistingFeed.ID != 1 {
		t.Fatalf("expected existing feed info")
	}
}

func TestFeedService_Add_FetchErrorCreatesFeed(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	mockFolders := testutil.NewMockFolderRepository(ctrl)
	mockEntries := testutil.NewMockEntryRepository(ctrl)

	feedURL := "https://example.com/invalid"
	client := &http.Client{
		Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
			if req.URL.String() != feedURL {
				return nil, errors.New("unexpected feed url")
			}
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader("not a feed")),
				Header:     make(http.Header),
				Request:    req,
			}, nil
		}),
	}

	mockFeeds.EXPECT().FindByURL(gomock.Any(), feedURL).Return(nil, nil)
	mockFeeds.EXPECT().Create(gomock.Any(), gomock.Any()).DoAndReturn(
		func(_ context.Context, feed model.Feed) (model.Feed, error) {
			if feed.ErrorMessage == nil || *feed.ErrorMessage == "" {
				t.Fatalf("expected error message to be set")
			}
			if feed.Title != "Custom" {
				t.Fatalf("expected title override")
			}
			feed.ID = 99
			return feed, nil
		},
	)

	svc := NewFeedService(mockFeeds, mockFolders, mockEntries, nil, nil, client, nil)
	_, err := svc.Add(context.Background(), feedURL, nil, "Custom", "article")
	if err != nil {
		t.Fatalf("expected add to succeed with error feed, got %v", err)
	}
}

func TestFeedService_AddWithoutFetch(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	mockFolders := testutil.NewMockFolderRepository(ctrl)
	mockEntries := testutil.NewMockEntryRepository(ctrl)

	mockFeeds.EXPECT().FindByURL(gomock.Any(), "https://example.com").Return(&model.Feed{ID: 1, URL: "https://example.com"}, nil)

	svc := NewFeedService(mockFeeds, mockFolders, mockEntries, nil, nil, nil, nil)
	feed, isNew, err := svc.AddWithoutFetch(context.Background(), "https://example.com", nil, "", "article")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if isNew {
		t.Fatalf("expected existing feed to return isNew=false")
	}
	if feed.ID != 1 {
		t.Fatalf("expected existing feed")
	}
}

func TestFeedService_Preview_WithFallbackUserAgent(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	fallbackUA := "UA-Test"
	settings := &settingsServiceStub{fallbackUserAgent: fallbackUA}

	seenUAs := make([]string, 0, 2)
	var mu sync.Mutex
	feedURL := "https://example.com/preview"
	client := &http.Client{
		Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
			mu.Lock()
			seenUAs = append(seenUAs, req.Header.Get("User-Agent"))
			mu.Unlock()
			status := http.StatusOK
			body := sampleRSS
			if req.Header.Get("User-Agent") == config.DefaultUserAgent {
				status = http.StatusBadRequest
				body = ""
			}
			return &http.Response{
				StatusCode: status,
				Body:       io.NopCloser(strings.NewReader(body)),
				Header:     make(http.Header),
				Request:    req,
			}, nil
		}),
	}

	svc := NewFeedService(testutil.NewMockFeedRepository(ctrl), testutil.NewMockFolderRepository(ctrl), testutil.NewMockEntryRepository(ctrl), nil, settings, client, nil)
	_, err := svc.Preview(context.Background(), feedURL)
	if err != nil {
		t.Fatalf("Preview failed: %v", err)
	}
	mu.Lock()
	defer mu.Unlock()
	if len(seenUAs) < 2 {
		t.Fatalf("expected fallback request, got %v", seenUAs)
	}
	if seenUAs[0] != config.DefaultUserAgent || seenUAs[1] != fallbackUA {
		t.Fatalf("unexpected user agents: %v", seenUAs)
	}
}

func TestFeedService_Update_Delete_UpdateType_DeleteBatch(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	mockFolders := testutil.NewMockFolderRepository(ctrl)
	mockEntries := testutil.NewMockEntryRepository(ctrl)

	svc := NewFeedService(mockFeeds, mockFolders, mockEntries, nil, nil, nil, nil)

	if _, err := svc.Update(context.Background(), 1, "", nil); !errors.Is(err, ErrInvalid) {
		t.Fatalf("expected ErrInvalid, got %v", err)
	}

	folderID := int64(10)
	mockFolders.EXPECT().GetByID(gomock.Any(), folderID).Return(model.Folder{}, errors.New("db"))
	if _, err := svc.Update(context.Background(), 1, "Title", &folderID); err == nil {
		t.Fatalf("expected error when folder check fails")
	}

	mockFolders.EXPECT().GetByID(gomock.Any(), folderID).Return(model.Folder{ID: folderID}, nil)
	mockFeeds.EXPECT().GetByID(gomock.Any(), int64(1)).Return(model.Feed{}, sql.ErrNoRows)
	_, err := svc.Update(context.Background(), 1, "Title", &folderID)
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}

	mockFeeds.EXPECT().GetByID(gomock.Any(), int64(2)).Return(model.Feed{ID: 2, Title: "Old"}, nil)
	mockFeeds.EXPECT().Update(gomock.Any(), gomock.Any()).DoAndReturn(
		func(_ context.Context, feed model.Feed) (model.Feed, error) {
			if feed.Title != "New" {
				t.Fatalf("expected updated title")
			}
			return feed, nil
		},
	)
	if _, err := svc.Update(context.Background(), 2, "New", nil); err != nil {
		t.Fatalf("unexpected update error: %v", err)
	}

	mockFeeds.EXPECT().GetByID(gomock.Any(), int64(3)).Return(model.Feed{}, sql.ErrNoRows)
	if err := svc.Delete(context.Background(), 3); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}

	mockFeeds.EXPECT().GetByID(gomock.Any(), int64(4)).Return(model.Feed{ID: 4}, nil)
	mockFeeds.EXPECT().Delete(gomock.Any(), int64(4)).Return(nil)
	if err := svc.Delete(context.Background(), 4); err != nil {
		t.Fatalf("unexpected delete error: %v", err)
	}

	mockFeeds.EXPECT().GetByID(gomock.Any(), int64(5)).Return(model.Feed{}, sql.ErrNoRows)
	if err := svc.UpdateType(context.Background(), 5, "picture"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}

	mockFeeds.EXPECT().GetByID(gomock.Any(), int64(6)).Return(model.Feed{ID: 6}, nil)
	mockFeeds.EXPECT().UpdateType(gomock.Any(), int64(6), "picture").Return(nil)
	if err := svc.UpdateType(context.Background(), 6, "picture"); err != nil {
		t.Fatalf("unexpected update type error: %v", err)
	}

	if err := svc.DeleteBatch(context.Background(), nil); err != nil {
		t.Fatalf("unexpected delete batch error: %v", err)
	}

	mockFeeds.EXPECT().DeleteBatch(gomock.Any(), []int64{1, 2}).Return(int64(1), nil)
	if err := svc.DeleteBatch(context.Background(), []int64{1, 2}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound for partial delete")
	}

	mockFeeds.EXPECT().DeleteBatch(gomock.Any(), []int64{3}).Return(int64(1), nil)
	if err := svc.DeleteBatch(context.Background(), []int64{3}); err != nil {
		t.Fatalf("unexpected delete batch error: %v", err)
	}
}

func TestFeedService_HelperFunctions(t *testing.T) {
	if !isValidURL("https://example.com/feed") {
		t.Fatalf("expected valid url")
	}
	if isValidURL("ftp://example.com") {
		t.Fatalf("expected invalid scheme")
	}
	if isValidURL("http://") {
		t.Fatalf("expected invalid host")
	}

	if extractFeedHost("http://example.com/path") != "example.com" {
		t.Fatalf("unexpected host")
	}
	if extractFeedHost("://invalid") != "" {
		t.Fatalf("expected empty host for invalid url")
	}

	t1 := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	items := []*gofeed.Item{{UpdatedParsed: &t1}, {UpdatedParsed: &t1}}
	if !hasDynamicTime(items) {
		t.Fatalf("expected dynamic time when updates are identical")
	}
	items[1].UpdatedParsed = func() *time.Time { t2 := t1.Add(time.Hour); return &t2 }()
	if hasDynamicTime(items) {
		t.Fatalf("expected non-dynamic time for different updates")
	}

	date := extractDateFromSummary("Filed: 2025-12-17")
	if date == nil || date.Format("2006-01-02") != "2025-12-17" {
		t.Fatalf("expected parsed date")
	}

	published := time.Date(2025, 1, 2, 3, 4, 5, 0, time.UTC)
	item := &gofeed.Item{Description: "Filed: 2025-12-17", PublishedParsed: &published}
	if got := extractPublishedAt(item, false); got == nil || got.Format("2006-01-02") != "2025-12-17" {
		t.Fatalf("expected summary date to take precedence")
	}

	thumbItem := &gofeed.Item{
		Image: &gofeed.Image{URL: "https://example.com/img.png"},
	}
	if url := extractThumbnail(thumbItem); url == nil || *url != "https://example.com/img.png" {
		t.Fatalf("expected image thumbnail")
	}

	enclosureItem := &gofeed.Item{
		Enclosures: []*gofeed.Enclosure{{URL: "https://example.com/e.jpg", Type: "image/jpeg"}},
	}
	if url := extractThumbnail(enclosureItem); url == nil || *url != "https://example.com/e.jpg" {
		t.Fatalf("expected enclosure thumbnail")
	}

	mediaItem := &gofeed.Item{Extensions: ext.Extensions{
		"media": {
			"thumbnail": []ext.Extension{{Attrs: map[string]string{"url": "https://example.com/t.png"}}},
		},
	}}
	if url := extractThumbnail(mediaItem); url == nil || *url != "https://example.com/t.png" {
		t.Fatalf("expected media thumbnail")
	}

	if optionalString("  ") != nil {
		t.Fatalf("expected nil for blank optional string")
	}
}

// settingsServiceStub is a minimal SettingsService implementation for tests.
type settingsServiceStub struct {
	fallbackUserAgent string
}

type roundTripperFunc func(*http.Request) (*http.Response, error)

func (f roundTripperFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func (s *settingsServiceStub) GetAISettings(ctx context.Context) (*AISettings, error) {
	return nil, nil
}

func (s *settingsServiceStub) SetAISettings(ctx context.Context, settings *AISettings) error {
	return nil
}

func (s *settingsServiceStub) TestAI(ctx context.Context, provider, apiKey, baseURL, model string, thinking bool, thinkingBudget int, reasoningEffort string) (string, error) {
	return "", nil
}

func (s *settingsServiceStub) GetGeneralSettings(ctx context.Context) (*GeneralSettings, error) {
	return nil, nil
}

func (s *settingsServiceStub) SetGeneralSettings(ctx context.Context, settings *GeneralSettings) error {
	return nil
}

func (s *settingsServiceStub) GetFallbackUserAgent(ctx context.Context) string {
	return s.fallbackUserAgent
}

func (s *settingsServiceStub) ClearAnubisCookies(ctx context.Context) (int64, error) {
	return 0, nil
}
