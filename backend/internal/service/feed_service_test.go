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
	"gist/backend/pkg/network"
	"gist/backend/internal/service"
	"gist/backend/internal/repository/mock"

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
	mockFolders.EXPECT().GetByID(gomock.Any(), folderID).Return(model.Folder{}, errors.New("db"))
	_, err = svc.Update(context.Background(), 1, "Title", &folderID)
	require.Error(t, err)

	mockFolders.EXPECT().GetByID(gomock.Any(), folderID).Return(model.Folder{ID: folderID}, nil)
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
