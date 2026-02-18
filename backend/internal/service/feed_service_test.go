package service_test

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
	"gist/backend/internal/repository/mock"
	"gist/backend/internal/service"
	servicemock "gist/backend/internal/service/mock"
	"gist/backend/pkg/network"

	"github.com/mmcdole/gofeed"
	ext "github.com/mmcdole/gofeed/extensions"
	"github.com/stretchr/testify/require"
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

const sampleRSSNoTitle = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title></title>
<link>https://example.com</link>
<description>Desc</description>
</channel>
</rss>`

func TestFeedService_Add_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockEntries := mock.NewMockEntryRepository(ctrl)

	feedURL := "https://example.com/rss"
	client := &http.Client{
		Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
			require.Equal(t, feedURL, req.URL.String())
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
	mockFolders.EXPECT().GetByID(gomock.Any(), folderID).Return(model.Folder{ID: folderID, Type: "article"}, nil)

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
			require.Equal(t, int64(123), entry.FeedID)
			require.NotEmpty(t, *entry.URL)
			return nil
		},
	).Times(1)

	clientFactory := network.NewClientFactoryForTest(client)
	svc := service.NewFeedService(mockFeeds, mockFolders, mockEntries, nil, nil, clientFactory, nil)
	feed, err := svc.Add(context.Background(), feedURL, &folderID, "", "article")
	require.NoError(t, err)
	require.Equal(t, int64(123), feed.ID)
	require.Equal(t, "Test Feed", createdFeed.Title)
	require.Equal(t, "https://example.com", *createdFeed.SiteURL)
	require.Equal(t, "etag-value", *createdFeed.ETag)
}

func TestFeedService_Add_InvalidURL(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	svc := service.NewFeedService(mock.NewMockFeedRepository(ctrl), mock.NewMockFolderRepository(ctrl), mock.NewMockEntryRepository(ctrl), nil, nil, nil, nil)
	_, err := svc.Add(context.Background(), "invalid-url", nil, "", "article")
	require.ErrorIs(t, err, service.ErrInvalid)
}

func TestFeedService_Add_FolderNotFound(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockEntries := mock.NewMockEntryRepository(ctrl)

	feedURL := "https://example.com/rss"
	folderID := int64(10)

	mockFeeds.EXPECT().FindByURL(gomock.Any(), feedURL).Return(nil, nil)
	mockFolders.EXPECT().GetByID(gomock.Any(), folderID).Return(model.Folder{}, sql.ErrNoRows)

	svc := service.NewFeedService(mockFeeds, mockFolders, mockEntries, nil, nil, nil, nil)
	_, err := svc.Add(context.Background(), feedURL, &folderID, "", "article")
	require.ErrorIs(t, err, service.ErrNotFound)
}

func TestFeedService_Add_FindByURLError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockEntries := mock.NewMockEntryRepository(ctrl)

	feedURL := "https://example.com/rss"
	dbErr := errors.New("db error")

	mockFeeds.EXPECT().FindByURL(gomock.Any(), feedURL).Return(nil, dbErr)

	svc := service.NewFeedService(mockFeeds, mockFolders, mockEntries, nil, nil, nil, nil)
	_, err := svc.Add(context.Background(), feedURL, nil, "", "article")
	require.Error(t, err)
	require.Contains(t, err.Error(), "check feed url")
}

func TestFeedService_Add_Conflict(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockEntries := mock.NewMockEntryRepository(ctrl)

	existing := &model.Feed{ID: 1, URL: "https://example.com"}
	mockFeeds.EXPECT().FindByURL(gomock.Any(), "https://example.com").Return(existing, nil)

	svc := service.NewFeedService(mockFeeds, mockFolders, mockEntries, nil, nil, nil, nil)
	_, err := svc.Add(context.Background(), "https://example.com", nil, "", "article")
	var conflict *service.FeedConflictError
	require.ErrorAs(t, err, &conflict)
	require.Equal(t, int64(1), conflict.ExistingFeed.ID)
}

func TestFeedService_Add_FetchErrorCreatesFeed(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockEntries := mock.NewMockEntryRepository(ctrl)

	feedURL := "https://example.com/invalid"
	client := &http.Client{
		Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
			require.Equal(t, feedURL, req.URL.String())
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
			require.NotEmpty(t, *feed.ErrorMessage)
			require.Equal(t, "Custom", feed.Title)
			feed.ID = 99
			return feed, nil
		},
	)

	clientFactory := network.NewClientFactoryForTest(client)
	svc := service.NewFeedService(mockFeeds, mockFolders, mockEntries, nil, nil, clientFactory, nil)
	_, err := svc.Add(context.Background(), feedURL, nil, "Custom", "article")
	require.NoError(t, err)
}

func TestFeedService_Add_EntryCreateErrorIgnored(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockEntries := mock.NewMockEntryRepository(ctrl)

	feedURL := "https://example.com/rss"
	client := &http.Client{
		Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
			require.Equal(t, feedURL, req.URL.String())
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader(sampleRSS)),
				Header:     make(http.Header),
				Request:    req,
			}, nil
		}),
	}

	mockFeeds.EXPECT().FindByURL(gomock.Any(), feedURL).Return(nil, nil)
	mockFeeds.EXPECT().Create(gomock.Any(), gomock.Any()).DoAndReturn(
		func(_ context.Context, feed model.Feed) (model.Feed, error) {
			feed.ID = 123
			return feed, nil
		},
	)

	mockEntries.EXPECT().CreateOrUpdate(gomock.Any(), gomock.Any()).Return(errors.New("entry error")).Times(1)

	clientFactory := network.NewClientFactoryForTest(client)
	svc := service.NewFeedService(mockFeeds, mockFolders, mockEntries, nil, nil, clientFactory, nil)
	feed, err := svc.Add(context.Background(), feedURL, nil, "", "article")
	require.NoError(t, err)
	require.Equal(t, int64(123), feed.ID)
}

func TestFeedService_Add_IconFetchUpdatesPath(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockIcons := servicemock.NewMockIconService(ctrl)

	feedURL := "https://example.com/rss"
	client := &http.Client{
		Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader(sampleRSS)),
				Header:     make(http.Header),
				Request:    req,
			}, nil
		}),
	}

	mockFeeds.EXPECT().FindByURL(gomock.Any(), feedURL).Return(nil, nil)
	mockFeeds.EXPECT().Create(gomock.Any(), gomock.Any()).DoAndReturn(
		func(_ context.Context, feed model.Feed) (model.Feed, error) {
			feed.ID = 123
			return feed, nil
		},
	)

	mockIcons.EXPECT().
		FetchAndSaveIcon(gomock.Any(), "https://example.com/icon.png", "https://example.com").
		Return("example.com.png", nil)
	mockFeeds.EXPECT().
		UpdateIconPath(gomock.Any(), int64(123), "example.com.png").
		Return(nil)

	mockEntries.EXPECT().CreateOrUpdate(gomock.Any(), gomock.Any()).Return(nil).Times(1)

	clientFactory := network.NewClientFactoryForTest(client)
	svc := service.NewFeedService(mockFeeds, mockFolders, mockEntries, mockIcons, nil, clientFactory, nil)
	feed, err := svc.Add(context.Background(), feedURL, nil, "", "article")
	require.NoError(t, err)
	require.NotNil(t, feed.IconPath)
	require.Equal(t, "example.com.png", *feed.IconPath)
}

func TestFeedService_AddWithoutFetch(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockEntries := mock.NewMockEntryRepository(ctrl)

	mockFeeds.EXPECT().FindByURL(gomock.Any(), "https://example.com").Return(&model.Feed{ID: 1, URL: "https://example.com"}, nil)

	svc := service.NewFeedService(mockFeeds, mockFolders, mockEntries, nil, nil, nil, nil)
	feed, isNew, err := svc.AddWithoutFetch(context.Background(), "https://example.com", nil, "", "article")
	require.NoError(t, err)
	require.False(t, isNew)
	require.Equal(t, int64(1), feed.ID)
}

func TestFeedService_AddWithoutFetch_NewFeed(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockEntries := mock.NewMockEntryRepository(ctrl)

	feedURL := "https://example.com/rss"

	mockFeeds.EXPECT().FindByURL(gomock.Any(), feedURL).Return(nil, nil)
	mockFeeds.EXPECT().Create(gomock.Any(), gomock.Any()).DoAndReturn(
		func(_ context.Context, feed model.Feed) (model.Feed, error) {
			require.Equal(t, feedURL, feed.URL)
			feed.ID = 456
			return feed, nil
		},
	)

	svc := service.NewFeedService(mockFeeds, mockFolders, mockEntries, nil, nil, nil, nil)
	feed, isNew, err := svc.AddWithoutFetch(context.Background(), feedURL, nil, "", "article")
	require.NoError(t, err)
	require.True(t, isNew)
	require.Equal(t, int64(456), feed.ID)
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

	clientFactory := network.NewClientFactoryForTest(client)
	svc := service.NewFeedService(mock.NewMockFeedRepository(ctrl), mock.NewMockFolderRepository(ctrl), mock.NewMockEntryRepository(ctrl), nil, settings, clientFactory, nil)
	_, err := svc.Preview(context.Background(), feedURL)
	require.NoError(t, err)
	mu.Lock()
	defer mu.Unlock()
	require.GreaterOrEqual(t, len(seenUAs), 2)
	require.Equal(t, config.DefaultUserAgent, seenUAs[0])
	require.Equal(t, fallbackUA, seenUAs[1])
}

func TestFeedService_Preview_InvalidURL(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	svc := service.NewFeedService(mock.NewMockFeedRepository(ctrl), mock.NewMockFolderRepository(ctrl), mock.NewMockEntryRepository(ctrl), nil, nil, nil, nil)
	_, err := svc.Preview(context.Background(), "invalid-url")
	require.ErrorIs(t, err, service.ErrInvalid)
}

func TestFeedService_Preview_EmptyTitleFallback(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	feedURL := "https://example.com/rss"
	client := &http.Client{
		Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader(sampleRSSNoTitle)),
				Header:     make(http.Header),
				Request:    req,
			}, nil
		}),
	}

	clientFactory := network.NewClientFactoryForTest(client)
	svc := service.NewFeedService(mock.NewMockFeedRepository(ctrl), mock.NewMockFolderRepository(ctrl), mock.NewMockEntryRepository(ctrl), nil, nil, clientFactory, nil)
	preview, err := svc.Preview(context.Background(), feedURL)
	require.NoError(t, err)
	require.Equal(t, feedURL, preview.Title)
}

func TestFeedService_Update_Delete_UpdateType_DeleteBatch(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockEntries := mock.NewMockEntryRepository(ctrl)

	svc := service.NewFeedService(mockFeeds, mockFolders, mockEntries, nil, nil, nil, nil)

	_, err := svc.Update(context.Background(), 1, "", nil)
	require.ErrorIs(t, err, service.ErrInvalid)

	folderID := int64(10)
	// 先获取 feed
	mockFeeds.EXPECT().GetByID(gomock.Any(), int64(1)).Return(model.Feed{ID: 1, Title: "Old", Type: "article"}, nil)
	// 然后获取 folder 失败
	mockFolders.EXPECT().GetByID(gomock.Any(), folderID).Return(model.Folder{}, errors.New("db"))
	_, err = svc.Update(context.Background(), 1, "Title", &folderID)
	require.Error(t, err)

	// feed 不存在
	mockFeeds.EXPECT().GetByID(gomock.Any(), int64(1)).Return(model.Feed{}, sql.ErrNoRows)
	_, err = svc.Update(context.Background(), 1, "Title", &folderID)
	require.ErrorIs(t, err, service.ErrNotFound)

	mockFeeds.EXPECT().GetByID(gomock.Any(), int64(2)).Return(model.Feed{ID: 2, Title: "Old"}, nil)
	mockFeeds.EXPECT().Update(gomock.Any(), gomock.Any()).DoAndReturn(
		func(_ context.Context, feed model.Feed) (model.Feed, error) {
			require.Equal(t, "New", feed.Title)
			return feed, nil
		},
	)
	_, err = svc.Update(context.Background(), 2, "New", nil)
	require.NoError(t, err)

	mockFeeds.EXPECT().GetByID(gomock.Any(), int64(3)).Return(model.Feed{}, sql.ErrNoRows)
	err = svc.Delete(context.Background(), 3)
	require.ErrorIs(t, err, service.ErrNotFound)

	mockFeeds.EXPECT().GetByID(gomock.Any(), int64(4)).Return(model.Feed{ID: 4}, nil)
	mockFeeds.EXPECT().Delete(gomock.Any(), int64(4)).Return(nil)
	err = svc.Delete(context.Background(), 4)
	require.NoError(t, err)

	mockFeeds.EXPECT().GetByID(gomock.Any(), int64(5)).Return(model.Feed{}, sql.ErrNoRows)
	err = svc.UpdateType(context.Background(), 5, "picture")
	require.ErrorIs(t, err, service.ErrNotFound)

	mockFeeds.EXPECT().GetByID(gomock.Any(), int64(6)).Return(model.Feed{ID: 6}, nil)
	mockFeeds.EXPECT().UpdateType(gomock.Any(), int64(6), "picture").Return(nil)
	err = svc.UpdateType(context.Background(), 6, "picture")
	require.NoError(t, err)

	err = svc.DeleteBatch(context.Background(), nil)
	require.NoError(t, err)

	mockFeeds.EXPECT().DeleteBatch(gomock.Any(), []int64{1, 2}).Return(int64(1), nil)
	err = svc.DeleteBatch(context.Background(), []int64{1, 2})
	require.ErrorIs(t, err, service.ErrNotFound)

	mockFeeds.EXPECT().DeleteBatch(gomock.Any(), []int64{3}).Return(int64(1), nil)
	err = svc.DeleteBatch(context.Background(), []int64{3})
	require.NoError(t, err)
}

func TestFeedService_DeleteBatch_RepositoryError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockEntries := mock.NewMockEntryRepository(ctrl)

	dbErr := errors.New("delete batch failed")
	mockFeeds.EXPECT().DeleteBatch(gomock.Any(), []int64{1, 2}).Return(int64(0), dbErr)

	svc := service.NewFeedService(mockFeeds, mockFolders, mockEntries, nil, nil, nil, nil)
	err := svc.DeleteBatch(context.Background(), []int64{1, 2})
	require.ErrorIs(t, err, dbErr)
}

func TestFeedService_HelperFunctions(t *testing.T) {
	require.True(t, service.IsValidURL("https://example.com/feed"))
	require.False(t, service.IsValidURL("ftp://example.com"))
	require.False(t, service.IsValidURL("http://"))

	require.Equal(t, "example.com", network.ExtractHost("http://example.com/path"))
	require.Empty(t, network.ExtractHost("://invalid"))

	t1 := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	items := []*gofeed.Item{{UpdatedParsed: &t1}, {UpdatedParsed: &t1}}
	require.True(t, service.HasDynamicTime(items))
	items[1].UpdatedParsed = func() *time.Time { t2 := t1.Add(time.Hour); return &t2 }()
	require.False(t, service.HasDynamicTime(items))

	date := service.ExtractDateFromSummary("Filed: 2025-12-17")
	require.NotNil(t, date)
	require.Equal(t, "2025-12-17", date.Format("2006-01-02"))

	published := time.Date(2025, 1, 2, 3, 4, 5, 0, time.UTC)
	item := &gofeed.Item{Description: "Filed: 2025-12-17", PublishedParsed: &published}
	got := service.ExtractPublishedAt(item, false)
	require.NotNil(t, got)
	require.Equal(t, "2025-12-17", got.Format("2006-01-02"))

	thumbItem := &gofeed.Item{
		Image: &gofeed.Image{URL: "https://example.com/img.png"},
	}
	url := service.ExtractThumbnail(thumbItem)
	require.NotNil(t, url)
	require.Equal(t, "https://example.com/img.png", *url)

	enclosureItem := &gofeed.Item{
		Enclosures: []*gofeed.Enclosure{{URL: "https://example.com/e.jpg", Type: "image/jpeg"}},
	}
	url = service.ExtractThumbnail(enclosureItem)
	require.NotNil(t, url)
	require.Equal(t, "https://example.com/e.jpg", *url)

	mediaItem := &gofeed.Item{Extensions: ext.Extensions{
		"media": {
			"thumbnail": []ext.Extension{{Attrs: map[string]string{"url": "https://example.com/t.png"}}},
		},
	}}
	url = service.ExtractThumbnail(mediaItem)
	require.NotNil(t, url)
	require.Equal(t, "https://example.com/t.png", *url)

	require.Nil(t, service.OptionalString("  "))
}

func TestComputeEntryHash_PrioritizesGUID(t *testing.T) {
	item := &gofeed.Item{
		GUID: " stable-guid ",
		Link: "https://example.com/post#reply10",
	}
	hash := service.ComputeEntryHash(item, "title", "content")
	require.Equal(t, hashString("stable-guid"), hash)
	require.Len(t, hash, 64)
}

func TestComputeEntryHash_FallbackToLink(t *testing.T) {
	item := &gofeed.Item{
		Link: " https://example.com/post?a=1#reply10 ",
	}
	hash := service.ComputeEntryHash(item, "title", "content")
	require.Equal(t, hashString("https://example.com/post?a=1#reply10"), hash)
	require.Len(t, hash, 64)
}

func TestComputeEntryHash_FallbackToTitleAndContent(t *testing.T) {
	item := &gofeed.Item{}
	hash := service.ComputeEntryHash(item, " title ", " content ")
	require.Equal(t, hashString("titlecontent"), hash)
	require.Len(t, hash, 64)
}

// TestExtractPublishedAt_FallbackToCurrentTime tests the BUG fix:
// When an RSS item has no pubDate (PublishedParsed) and no UpdatedParsed,
// extractPublishedAt should return the current time instead of nil.
// See commit 4e2de23: fix: RSS entries without pubDate should use current time as default
func TestExtractPublishedAt_FallbackToCurrentTime(t *testing.T) {
	// Item with no date fields at all
	item := &gofeed.Item{
		Title:       "Test Item",
		Description: "No date provided",
	}

	before := time.Now().UTC()
	got := service.ExtractPublishedAt(item, false)
	after := time.Now().UTC()

	require.NotNil(t, got, "extractPublishedAt should return a non-nil time when no date is available")
	require.True(t, got.After(before.Add(-time.Second)) && got.Before(after.Add(time.Second)),
		"returned time should be approximately the current time")
}

// TestExtractPublishedAt_UsesPublishedParsed verifies that PublishedParsed is used when available
func TestExtractPublishedAt_UsesPublishedParsed(t *testing.T) {
	published := time.Date(2025, 3, 15, 10, 30, 0, 0, time.UTC)
	item := &gofeed.Item{
		Title:           "Test Item",
		PublishedParsed: &published,
	}

	got := service.ExtractPublishedAt(item, false)
	require.NotNil(t, got)
	require.Equal(t, published.Format(time.RFC3339), got.UTC().Format(time.RFC3339))
}

// TestExtractPublishedAt_UsesUpdatedParsedWhenNoPublished verifies UpdatedParsed is used as fallback
func TestExtractPublishedAt_UsesUpdatedParsedWhenNoPublished(t *testing.T) {
	updated := time.Date(2025, 3, 15, 10, 30, 0, 0, time.UTC)
	item := &gofeed.Item{
		Title:         "Test Item",
		UpdatedParsed: &updated,
	}

	got := service.ExtractPublishedAt(item, false)
	require.NotNil(t, got)
	require.Equal(t, updated.Format(time.RFC3339), got.UTC().Format(time.RFC3339))
}

// TestExtractPublishedAt_IgnoresDynamicTimeWhenSet verifies that dynamic time is ignored
func TestExtractPublishedAt_IgnoresDynamicTimeWhenSet(t *testing.T) {
	updated := time.Date(2025, 3, 15, 10, 30, 0, 0, time.UTC)
	item := &gofeed.Item{
		Title:         "Test Item",
		UpdatedParsed: &updated,
	}

	// When ignoreDynamicTime is true, UpdatedParsed should be ignored
	// and the function should fallback to current time
	before := time.Now().UTC()
	got := service.ExtractPublishedAt(item, true)
	after := time.Now().UTC()

	require.NotNil(t, got)
	// Should be approximately current time, not the updated time
	require.True(t, got.After(before.Add(-time.Second)) && got.Before(after.Add(time.Second)),
		"returned time should be approximately the current time when ignoring dynamic time")
}

// settingsServiceStub is a minimal SettingsService implementation for tests.
type settingsServiceStub struct {
	fallbackUserAgent string
	proxyURL          string
}

type roundTripperFunc func(*http.Request) (*http.Response, error)

func (f roundTripperFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func (s *settingsServiceStub) GetAISettings(ctx context.Context) (*service.AISettings, error) {
	return nil, nil
}

func (s *settingsServiceStub) SetAISettings(ctx context.Context, settings *service.AISettings) error {
	return nil
}

func (s *settingsServiceStub) TestAI(ctx context.Context, provider, apiKey, baseURL, model, endpoint string, thinking bool, thinkingBudget int, reasoningEffort string) (string, error) {
	return "", nil
}

func (s *settingsServiceStub) GetGeneralSettings(ctx context.Context) (*service.GeneralSettings, error) {
	return nil, nil
}

func (s *settingsServiceStub) SetGeneralSettings(ctx context.Context, settings *service.GeneralSettings) error {
	return nil
}

func (s *settingsServiceStub) GetFallbackUserAgent(ctx context.Context) string {
	return s.fallbackUserAgent
}

func (s *settingsServiceStub) ClearAnubisCookies(ctx context.Context) (int64, error) {
	return 0, nil
}

func (s *settingsServiceStub) GetNetworkSettings(ctx context.Context) (*service.NetworkSettings, error) {
	return &service.NetworkSettings{}, nil
}

func (s *settingsServiceStub) SetNetworkSettings(ctx context.Context, settings *service.NetworkSettings) error {
	return nil
}

func (s *settingsServiceStub) GetProxyURL(ctx context.Context) string {
	return s.proxyURL
}

func (s *settingsServiceStub) GetIPStack(ctx context.Context) string {
	return "default"
}

func (s *settingsServiceStub) GetAppearanceSettings(ctx context.Context) (*service.AppearanceSettings, error) {
	return &service.AppearanceSettings{ContentTypes: append([]string(nil), service.DefaultAppearanceContentTypes...)}, nil
}

func (s *settingsServiceStub) SetAppearanceSettings(ctx context.Context, settings *service.AppearanceSettings) error {
	return nil
}

func TestFeedService_List_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)

	feeds := []model.Feed{
		{ID: 1, Title: "Feed 1"},
		{ID: 2, Title: "Feed 2"},
	}
	mockFeeds.EXPECT().List(gomock.Any(), (*int64)(nil)).Return(feeds, nil)

	svc := service.NewFeedService(mockFeeds, nil, nil, nil, nil, nil, nil)
	result, err := svc.List(context.Background(), nil)
	require.NoError(t, err)
	require.Len(t, result, 2)
	require.Equal(t, int64(1), result[0].ID)
}

func TestFeedService_List_WithFolderID(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)

	folderID := int64(10)
	feeds := []model.Feed{{ID: 1, Title: "Feed 1"}}
	mockFeeds.EXPECT().List(gomock.Any(), &folderID).Return(feeds, nil)

	svc := service.NewFeedService(mockFeeds, nil, nil, nil, nil, nil, nil)
	result, err := svc.List(context.Background(), &folderID)
	require.NoError(t, err)
	require.Len(t, result, 1)
}

func TestFeedService_List_Error(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)

	dbErr := errors.New("db list error")
	mockFeeds.EXPECT().List(gomock.Any(), (*int64)(nil)).Return(nil, dbErr)

	svc := service.NewFeedService(mockFeeds, nil, nil, nil, nil, nil, nil)
	_, err := svc.List(context.Background(), nil)
	require.ErrorIs(t, err, dbErr)
}

func TestFeedService_Add_FolderGetByIDError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)

	feedURL := "https://example.com/rss"
	folderID := int64(10)
	dbErr := errors.New("db error")

	mockFeeds.EXPECT().FindByURL(gomock.Any(), feedURL).Return(nil, nil)
	mockFolders.EXPECT().GetByID(gomock.Any(), folderID).Return(model.Folder{}, dbErr)

	svc := service.NewFeedService(mockFeeds, mockFolders, nil, nil, nil, nil, nil)
	_, err := svc.Add(context.Background(), feedURL, &folderID, "", "article")
	require.Error(t, err)
	require.Contains(t, err.Error(), "check folder")
}

func TestFeedService_Add_CreateError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockEntries := mock.NewMockEntryRepository(ctrl)

	feedURL := "https://example.com/rss"
	client := &http.Client{
		Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader(sampleRSS)),
				Header:     make(http.Header),
				Request:    req,
			}, nil
		}),
	}

	mockFeeds.EXPECT().FindByURL(gomock.Any(), feedURL).Return(nil, nil)
	mockFeeds.EXPECT().Create(gomock.Any(), gomock.Any()).Return(model.Feed{}, errors.New("create error"))

	clientFactory := network.NewClientFactoryForTest(client)
	svc := service.NewFeedService(mockFeeds, mockFolders, mockEntries, nil, nil, clientFactory, nil)
	_, err := svc.Add(context.Background(), feedURL, nil, "", "article")
	require.Error(t, err)
}

func TestFeedService_Add_TitleOverride(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockEntries := mock.NewMockEntryRepository(ctrl)

	feedURL := "https://example.com/rss"
	client := &http.Client{
		Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader(sampleRSS)),
				Header:     make(http.Header),
				Request:    req,
			}, nil
		}),
	}

	mockFeeds.EXPECT().FindByURL(gomock.Any(), feedURL).Return(nil, nil)
	mockFeeds.EXPECT().Create(gomock.Any(), gomock.Any()).DoAndReturn(
		func(_ context.Context, feed model.Feed) (model.Feed, error) {
			require.Equal(t, "Custom Title", feed.Title)
			feed.ID = 123
			return feed, nil
		},
	)
	mockEntries.EXPECT().CreateOrUpdate(gomock.Any(), gomock.Any()).Return(nil).AnyTimes()

	clientFactory := network.NewClientFactoryForTest(client)
	svc := service.NewFeedService(mockFeeds, mockFolders, mockEntries, nil, nil, clientFactory, nil)
	feed, err := svc.Add(context.Background(), feedURL, nil, "Custom Title", "article")
	require.NoError(t, err)
	require.Equal(t, int64(123), feed.ID)
}

func TestFeedService_AddWithoutFetch_InvalidURL(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	svc := service.NewFeedService(nil, nil, nil, nil, nil, nil, nil)
	_, _, err := svc.AddWithoutFetch(context.Background(), "invalid", nil, "", "article")
	require.ErrorIs(t, err, service.ErrInvalid)
}

func TestFeedService_AddWithoutFetch_FindByURLError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)

	feedURL := "https://example.com/rss"
	mockFeeds.EXPECT().FindByURL(gomock.Any(), feedURL).Return(nil, errors.New("db error"))

	svc := service.NewFeedService(mockFeeds, nil, nil, nil, nil, nil, nil)
	_, _, err := svc.AddWithoutFetch(context.Background(), feedURL, nil, "", "article")
	require.Error(t, err)
	require.Contains(t, err.Error(), "check feed url")
}

func TestFeedService_AddWithoutFetch_FolderNotFound(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)

	feedURL := "https://example.com/rss"
	folderID := int64(10)

	mockFeeds.EXPECT().FindByURL(gomock.Any(), feedURL).Return(nil, nil)
	mockFolders.EXPECT().GetByID(gomock.Any(), folderID).Return(model.Folder{}, sql.ErrNoRows)

	svc := service.NewFeedService(mockFeeds, mockFolders, nil, nil, nil, nil, nil)
	_, _, err := svc.AddWithoutFetch(context.Background(), feedURL, &folderID, "", "article")
	require.ErrorIs(t, err, service.ErrNotFound)
}

func TestFeedService_AddWithoutFetch_FolderGetByIDError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)

	feedURL := "https://example.com/rss"
	folderID := int64(10)

	mockFeeds.EXPECT().FindByURL(gomock.Any(), feedURL).Return(nil, nil)
	mockFolders.EXPECT().GetByID(gomock.Any(), folderID).Return(model.Folder{}, errors.New("db error"))

	svc := service.NewFeedService(mockFeeds, mockFolders, nil, nil, nil, nil, nil)
	_, _, err := svc.AddWithoutFetch(context.Background(), feedURL, &folderID, "", "article")
	require.Error(t, err)
	require.Contains(t, err.Error(), "check folder")
}

func TestFeedService_AddWithoutFetch_CreateError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)

	feedURL := "https://example.com/rss"

	mockFeeds.EXPECT().FindByURL(gomock.Any(), feedURL).Return(nil, nil)
	mockFeeds.EXPECT().Create(gomock.Any(), gomock.Any()).Return(model.Feed{}, errors.New("create error"))

	svc := service.NewFeedService(mockFeeds, nil, nil, nil, nil, nil, nil)
	_, _, err := svc.AddWithoutFetch(context.Background(), feedURL, nil, "", "article")
	require.Error(t, err)
}

func TestFeedService_Update_GetByIDError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)

	mockFeeds.EXPECT().GetByID(gomock.Any(), int64(1)).Return(model.Feed{}, errors.New("db error"))

	svc := service.NewFeedService(mockFeeds, nil, nil, nil, nil, nil, nil)
	_, err := svc.Update(context.Background(), 1, "Title", nil)
	require.Error(t, err)
	require.Contains(t, err.Error(), "get feed")
}

func TestFeedService_Update_UpdateError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)

	mockFeeds.EXPECT().GetByID(gomock.Any(), int64(1)).Return(model.Feed{ID: 1, Title: "Old"}, nil)
	mockFeeds.EXPECT().Update(gomock.Any(), gomock.Any()).Return(model.Feed{}, errors.New("update error"))

	svc := service.NewFeedService(mockFeeds, nil, nil, nil, nil, nil, nil)
	_, err := svc.Update(context.Background(), 1, "New Title", nil)
	require.Error(t, err)
}

func TestFeedService_Update_FolderNotFound(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)

	folderID := int64(10)
	// 先获取 feed
	mockFeeds.EXPECT().GetByID(gomock.Any(), int64(1)).Return(model.Feed{ID: 1, Title: "Title", Type: "article"}, nil)
	// 然后获取 folder 失败
	mockFolders.EXPECT().GetByID(gomock.Any(), folderID).Return(model.Folder{}, sql.ErrNoRows)

	svc := service.NewFeedService(mockFeeds, mockFolders, nil, nil, nil, nil, nil)
	_, err := svc.Update(context.Background(), 1, "Title", &folderID)
	require.ErrorIs(t, err, service.ErrNotFound)
}

func TestFeedService_Delete_GetByIDError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)

	mockFeeds.EXPECT().GetByID(gomock.Any(), int64(1)).Return(model.Feed{}, errors.New("db error"))

	svc := service.NewFeedService(mockFeeds, nil, nil, nil, nil, nil, nil)
	err := svc.Delete(context.Background(), 1)
	require.Error(t, err)
	require.Contains(t, err.Error(), "get feed")
}

func TestFeedService_Delete_DeleteError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)

	mockFeeds.EXPECT().GetByID(gomock.Any(), int64(1)).Return(model.Feed{ID: 1}, nil)
	mockFeeds.EXPECT().Delete(gomock.Any(), int64(1)).Return(errors.New("delete error"))

	svc := service.NewFeedService(mockFeeds, nil, nil, nil, nil, nil, nil)
	err := svc.Delete(context.Background(), 1)
	require.Error(t, err)
}

func TestFeedService_UpdateType_GetByIDError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)

	mockFeeds.EXPECT().GetByID(gomock.Any(), int64(1)).Return(model.Feed{}, errors.New("db error"))

	svc := service.NewFeedService(mockFeeds, nil, nil, nil, nil, nil, nil)
	err := svc.UpdateType(context.Background(), 1, "picture")
	require.Error(t, err)
	require.Contains(t, err.Error(), "get feed")
}

func TestFeedService_UpdateType_UpdateTypeError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)

	mockFeeds.EXPECT().GetByID(gomock.Any(), int64(1)).Return(model.Feed{ID: 1}, nil)
	mockFeeds.EXPECT().UpdateType(gomock.Any(), int64(1), "picture").Return(errors.New("update type error"))

	svc := service.NewFeedService(mockFeeds, nil, nil, nil, nil, nil, nil)
	err := svc.UpdateType(context.Background(), 1, "picture")
	require.Error(t, err)
}

func TestFeedService_Preview_HTTPError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	feedURL := "https://example.com/rss"
	client := &http.Client{
		Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusInternalServerError,
				Body:       io.NopCloser(strings.NewReader("")),
				Header:     make(http.Header),
				Request:    req,
			}, nil
		}),
	}

	clientFactory := network.NewClientFactoryForTest(client)
	svc := service.NewFeedService(nil, nil, nil, nil, nil, clientFactory, nil)
	_, err := svc.Preview(context.Background(), feedURL)
	require.ErrorIs(t, err, service.ErrFeedFetch)
}

func TestFeedService_Preview_NetworkError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	feedURL := "https://example.com/rss"
	client := &http.Client{
		Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
			return nil, errors.New("network error")
		}),
	}

	clientFactory := network.NewClientFactoryForTest(client)
	svc := service.NewFeedService(nil, nil, nil, nil, nil, clientFactory, nil)
	_, err := svc.Preview(context.Background(), feedURL)
	require.ErrorIs(t, err, service.ErrFeedFetch)
}

func TestFeedService_Preview_ParseError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	feedURL := "https://example.com/rss"
	client := &http.Client{
		Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader("not valid rss")),
				Header:     make(http.Header),
				Request:    req,
			}, nil
		}),
	}

	clientFactory := network.NewClientFactoryForTest(client)
	svc := service.NewFeedService(nil, nil, nil, nil, nil, clientFactory, nil)
	_, err := svc.Preview(context.Background(), feedURL)
	require.ErrorIs(t, err, service.ErrFeedFetch)
}

func TestFeedService_Add_IconFetchError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockIcons := servicemock.NewMockIconService(ctrl)

	feedURL := "https://example.com/rss"
	client := &http.Client{
		Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader(sampleRSS)),
				Header:     make(http.Header),
				Request:    req,
			}, nil
		}),
	}

	mockFeeds.EXPECT().FindByURL(gomock.Any(), feedURL).Return(nil, nil)
	mockFeeds.EXPECT().Create(gomock.Any(), gomock.Any()).DoAndReturn(
		func(_ context.Context, feed model.Feed) (model.Feed, error) {
			feed.ID = 123
			return feed, nil
		},
	)

	mockIcons.EXPECT().
		FetchAndSaveIcon(gomock.Any(), "https://example.com/icon.png", "https://example.com").
		Return("", errors.New("icon fetch error"))

	mockEntries.EXPECT().CreateOrUpdate(gomock.Any(), gomock.Any()).Return(nil).AnyTimes()

	clientFactory := network.NewClientFactoryForTest(client)
	svc := service.NewFeedService(mockFeeds, nil, mockEntries, mockIcons, nil, clientFactory, nil)
	feed, err := svc.Add(context.Background(), feedURL, nil, "", "article")
	require.NoError(t, err)
	require.Nil(t, feed.IconPath)
}

// BUG 回测：跨视图文件夹类型一致性检查
// 验证创建订阅时，feed 类型必须与 folder 类型匹配
func TestFeedService_Add_TypeMismatch(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockEntries := mock.NewMockEntryRepository(ctrl)

	feedURL := "https://example.com/rss"
	folderID := int64(10)

	client := &http.Client{
		Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
			require.Equal(t, feedURL, req.URL.String())
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader(sampleRSS)),
				Header:     make(http.Header),
				Request:    req,
			}, nil
		}),
	}

	mockFeeds.EXPECT().FindByURL(gomock.Any(), feedURL).Return(nil, nil)
	// Folder 是 picture 类型，但 feed 是 article 类型
	mockFolders.EXPECT().GetByID(gomock.Any(), folderID).Return(model.Folder{ID: folderID, Type: "picture"}, nil)

	clientFactory := network.NewClientFactoryForTest(client)
	svc := service.NewFeedService(mockFeeds, mockFolders, mockEntries, nil, nil, clientFactory, nil)
	_, err := svc.Add(context.Background(), feedURL, &folderID, "", "article")
	require.ErrorIs(t, err, service.ErrInvalid)
}

// BUG 回测：AddWithoutFetch 方法也必须检查类型一致性
func TestFeedService_AddWithoutFetch_TypeMismatch(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)

	feedURL := "https://example.com/rss"
	folderID := int64(10)

	mockFeeds.EXPECT().FindByURL(gomock.Any(), feedURL).Return(nil, nil)
	// Folder 是 article 类型，但 feed 是 picture 类型
	mockFolders.EXPECT().GetByID(gomock.Any(), folderID).Return(model.Folder{ID: folderID, Type: "article"}, nil)

	svc := service.NewFeedService(mockFeeds, mockFolders, nil, nil, nil, nil, nil)
	_, _, err := svc.AddWithoutFetch(context.Background(), feedURL, &folderID, "", "picture")
	require.ErrorIs(t, err, service.ErrInvalid)
}

// BUG 回测：更新订阅的文件夹时必须检查类型一致性
func TestFeedService_Update_TypeMismatch(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)

	newFolderID := int64(20)

	// 获取目标文件夹
	mockFolders.EXPECT().GetByID(gomock.Any(), newFolderID).Return(model.Folder{ID: newFolderID, Type: "picture"}, nil)
	// 获取当前 feed
	mockFeeds.EXPECT().GetByID(gomock.Any(), int64(1)).Return(model.Feed{ID: 1, Title: "Feed Title", Type: "article"}, nil)

	svc := service.NewFeedService(mockFeeds, mockFolders, nil, nil, nil, nil, nil)
	_, err := svc.Update(context.Background(), 1, "Feed Title", &newFolderID)
	require.ErrorIs(t, err, service.ErrInvalid)
}

// BUG 回测：更新到同类型文件夹应该成功
func TestFeedService_Update_SameTypeSucceeds(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)

	newFolderID := int64(20)

	// 获取目标文件夹
	mockFolders.EXPECT().GetByID(gomock.Any(), newFolderID).Return(model.Folder{ID: newFolderID, Type: "article"}, nil)
	// 获取当前 feed
	mockFeeds.EXPECT().GetByID(gomock.Any(), int64(1)).Return(model.Feed{ID: 1, Title: "Feed Title", Type: "article"}, nil)
	// 更新
	mockFeeds.EXPECT().Update(gomock.Any(), gomock.Any()).DoAndReturn(
		func(_ context.Context, feed model.Feed) (model.Feed, error) {
			require.Equal(t, "Feed Title", feed.Title)
			require.Equal(t, &newFolderID, feed.FolderID)
			return feed, nil
		},
	)

	svc := service.NewFeedService(mockFeeds, mockFolders, nil, nil, nil, nil, nil)
	feed, err := svc.Update(context.Background(), 1, "Feed Title", &newFolderID)
	require.NoError(t, err)
	require.Equal(t, &newFolderID, feed.FolderID)
}

// BUG 回测：更新到相同文件夹应该不触发类型检查（指针值比较）
func TestFeedService_Update_SameFolderNoTypeCheck(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)

	folderID := int64(20)
	existingFolderID := int64(20) // 相同值但不同指针

	// 获取当前 feed，已经在这个文件夹中
	mockFeeds.EXPECT().GetByID(gomock.Any(), int64(1)).Return(model.Feed{
		ID:       1,
		Title:    "Feed Title",
		Type:     "article",
		FolderID: &existingFolderID,
	}, nil)

	// 不应该调用 GetByID 查询文件夹（因为 folderID 没变）
	// mockFolders.EXPECT().GetByID(...) - 不应该被调用

	// 应该直接更新
	mockFeeds.EXPECT().Update(gomock.Any(), gomock.Any()).DoAndReturn(
		func(_ context.Context, feed model.Feed) (model.Feed, error) {
			require.Equal(t, "New Title", feed.Title)
			require.Equal(t, &folderID, feed.FolderID)
			return feed, nil
		},
	)

	svc := service.NewFeedService(mockFeeds, mockFolders, nil, nil, nil, nil, nil)
	feed, err := svc.Update(context.Background(), 1, "New Title", &folderID)
	require.NoError(t, err)
	require.Equal(t, &folderID, feed.FolderID)
}

// BUG 回测：从无文件夹移动到文件夹应该触发类型检查
func TestFeedService_Update_FromNullToFolder(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)

	folderID := int64(20)

	// 获取当前 feed，没有文件夹
	mockFeeds.EXPECT().GetByID(gomock.Any(), int64(1)).Return(model.Feed{
		ID:       1,
		Title:    "Feed Title",
		Type:     "article",
		FolderID: nil,
	}, nil)

	// 应该查询目标文件夹并验证类型
	mockFolders.EXPECT().GetByID(gomock.Any(), folderID).Return(model.Folder{ID: folderID, Type: "article"}, nil)

	mockFeeds.EXPECT().Update(gomock.Any(), gomock.Any()).DoAndReturn(
		func(_ context.Context, feed model.Feed) (model.Feed, error) {
			return feed, nil
		},
	)

	svc := service.NewFeedService(mockFeeds, mockFolders, nil, nil, nil, nil, nil)
	_, err := svc.Update(context.Background(), 1, "Feed Title", &folderID)
	require.NoError(t, err)
}

// BUG 回测：从文件夹移动到无文件夹不应该触发类型检查
func TestFeedService_Update_FromFolderToNull(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)

	existingFolderID := int64(20)

	// 获取当前 feed，在文件夹中
	mockFeeds.EXPECT().GetByID(gomock.Any(), int64(1)).Return(model.Feed{
		ID:       1,
		Title:    "Feed Title",
		Type:     "article",
		FolderID: &existingFolderID,
	}, nil)

	// 不应该查询文件夹（因为移动到 nil）
	// mockFolders.EXPECT().GetByID(...) - 不应该被调用

	mockFeeds.EXPECT().Update(gomock.Any(), gomock.Any()).DoAndReturn(
		func(_ context.Context, feed model.Feed) (model.Feed, error) {
			require.Nil(t, feed.FolderID)
			return feed, nil
		},
	)

	svc := service.NewFeedService(mockFeeds, mockFolders, nil, nil, nil, nil, nil)
	_, err := svc.Update(context.Background(), 1, "Feed Title", nil)
	require.NoError(t, err)
}

// BUG 回测：添加到同类型文件夹应该成功
func TestFeedService_Add_SameTypeSucceeds(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFolders := mock.NewMockFolderRepository(ctrl)
	mockEntries := mock.NewMockEntryRepository(ctrl)

	feedURL := "https://example.com/rss"
	client := &http.Client{
		Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
			require.Equal(t, feedURL, req.URL.String())
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
	// Folder 是 picture 类型，feed 也是 picture 类型
	mockFolders.EXPECT().GetByID(gomock.Any(), folderID).Return(model.Folder{ID: folderID, Type: "picture"}, nil)

	var createdFeed model.Feed
	mockFeeds.EXPECT().FindByURL(gomock.Any(), feedURL).Return(nil, nil)
	mockFeeds.EXPECT().Create(gomock.Any(), gomock.Any()).DoAndReturn(
		func(_ context.Context, feed model.Feed) (model.Feed, error) {
			createdFeed = feed
			require.Equal(t, "picture", feed.Type)
			require.Equal(t, &folderID, feed.FolderID)
			feed.ID = 123
			return feed, nil
		},
	)

	mockEntries.EXPECT().CreateOrUpdate(gomock.Any(), gomock.Any()).Return(nil).AnyTimes()

	clientFactory := network.NewClientFactoryForTest(client)
	svc := service.NewFeedService(mockFeeds, mockFolders, mockEntries, nil, nil, clientFactory, nil)
	feed, err := svc.Add(context.Background(), feedURL, &folderID, "", "picture")
	require.NoError(t, err)
	require.Equal(t, int64(123), feed.ID)
	require.Equal(t, "picture", createdFeed.Type)
}
