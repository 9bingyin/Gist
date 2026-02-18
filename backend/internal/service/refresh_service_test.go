package service_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"gist/backend/internal/model"
	"gist/backend/internal/repository/mock"
	"gist/backend/internal/service"
	servicemock "gist/backend/internal/service/mock"
	"gist/backend/pkg/network"

	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"
)

func TestRefreshService_RefreshAll_AlreadyRefreshing(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	svc := service.NewRefreshService(
		mock.NewMockFeedRepository(ctrl),
		mock.NewMockEntryRepository(ctrl),
		nil,
		nil,
		network.NewClientFactoryForTest(&http.Client{}),
		nil,
		nil,
	)
	service.SetRefreshServiceRefreshing(svc, true)

	err := svc.RefreshAll(context.Background())
	require.ErrorIs(t, err, service.ErrAlreadyRefreshing)
}

func TestRefreshService_RefreshAll_ListError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFeeds.EXPECT().List(gomock.Any(), (*int64)(nil)).Return(nil, errors.New("list failed"))

	svc := service.NewRefreshService(
		mockFeeds,
		mock.NewMockEntryRepository(ctrl),
		nil,
		nil,
		network.NewClientFactoryForTest(&http.Client{}),
		nil,
		nil,
	)

	err := svc.RefreshAll(context.Background())
	require.Error(t, err)
	require.False(t, svc.IsRefreshing())
}

func TestRefreshService_RefreshFeed_NotModified(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockEntries := mock.NewMockEntryRepository(ctrl)

	feed := model.Feed{ID: 1, URL: "https://example.com/rss", Title: "Feed"}
	mockFeeds.EXPECT().GetByID(gomock.Any(), int64(1)).Return(feed, nil)
	mockFeeds.EXPECT().UpdateErrorMessage(gomock.Any(), int64(1), nil).Return(nil)

	client := &http.Client{
		Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusNotModified,
				Body:       http.NoBody,
				Header:     make(http.Header),
				Request:    req,
			}, nil
		}),
	}

	svc := service.NewRefreshService(
		mockFeeds,
		mockEntries,
		nil,
		nil,
		network.NewClientFactoryForTest(client),
		nil,
		nil,
	)

	err := svc.RefreshFeed(context.Background(), 1)
	require.NoError(t, err)
}

func TestRefreshService_RefreshFeed_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockIcons := servicemock.NewMockIconService(ctrl)

	feed := model.Feed{ID: 10, URL: "https://example.com/rss", Title: "Feed"}
	mockFeeds.EXPECT().GetByID(gomock.Any(), int64(10)).Return(feed, nil)
	mockFeeds.EXPECT().UpdateErrorMessage(gomock.Any(), int64(10), nil).Return(nil)

	mockFeeds.EXPECT().Update(gomock.Any(), gomock.Any()).DoAndReturn(
		func(_ context.Context, updated model.Feed) (model.Feed, error) {
			require.NotNil(t, updated.ETag)
			require.NotNil(t, updated.LastModified)
			return updated, nil
		},
	)
	mockFeeds.EXPECT().UpdateSiteURL(gomock.Any(), int64(10), "https://example.com").Return(nil)
	mockIcons.EXPECT().FetchAndSaveIcon(gomock.Any(), "https://example.com/icon.png", "https://example.com").Return("example.com.png", nil)
	mockFeeds.EXPECT().UpdateIconPath(gomock.Any(), int64(10), "example.com.png").Return(nil)

	mockEntries.EXPECT().ExistsByHash(gomock.Any(), int64(10), hashString("https://example.com/1")).Return(false, nil)
	mockEntries.EXPECT().ExistsByLegacyURL(gomock.Any(), int64(10), "https://example.com/1", hashString("https://example.com/1")).Return(false, nil)
	mockEntries.EXPECT().CreateOrUpdate(gomock.Any(), gomock.Any()).Return(nil)

	client := &http.Client{
		Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
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

	svc := service.NewRefreshService(
		mockFeeds,
		mockEntries,
		nil,
		mockIcons,
		network.NewClientFactoryForTest(client),
		nil,
		nil,
	)

	err := svc.RefreshFeed(context.Background(), 10)
	require.NoError(t, err)
}

func TestRefreshService_RefreshFeed_FallbackUserAgent(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockEntries := mock.NewMockEntryRepository(ctrl)

	feed := model.Feed{ID: 2, URL: "https://example.com/rss", Title: "Feed"}
	mockFeeds.EXPECT().GetByID(gomock.Any(), int64(2)).Return(feed, nil)
	mockFeeds.EXPECT().UpdateErrorMessage(gomock.Any(), int64(2), nil).Return(nil)
	mockFeeds.EXPECT().UpdateSiteURL(gomock.Any(), int64(2), "https://example.com").Return(nil)

	settings := &settingsServiceStub{fallbackUserAgent: "UA-Test"}

	client := &http.Client{
		Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
			if req.Header.Get("User-Agent") == settings.fallbackUserAgent {
				return &http.Response{
					StatusCode: http.StatusOK,
					Body:       io.NopCloser(strings.NewReader(sampleRSS)),
					Header:     make(http.Header),
					Request:    req,
				}, nil
			}
			return &http.Response{
				StatusCode: http.StatusBadRequest,
				Body:       http.NoBody,
				Header:     make(http.Header),
				Request:    req,
			}, nil
		}),
	}

	mockEntries.EXPECT().ExistsByHash(gomock.Any(), int64(2), hashString("https://example.com/1")).Return(false, nil)
	mockEntries.EXPECT().ExistsByLegacyURL(gomock.Any(), int64(2), "https://example.com/1", hashString("https://example.com/1")).Return(false, nil)
	mockEntries.EXPECT().CreateOrUpdate(gomock.Any(), gomock.Any()).Return(nil)

	svc := service.NewRefreshService(
		mockFeeds,
		mockEntries,
		settings,
		nil,
		network.NewClientFactoryForTest(client),
		nil,
		nil,
	)

	err := svc.RefreshFeed(context.Background(), 2)
	require.NoError(t, err)
}

func TestRefreshService_RefreshFeeds_Empty(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	svc := service.NewRefreshService(
		mock.NewMockFeedRepository(ctrl),
		mock.NewMockEntryRepository(ctrl),
		nil,
		nil,
		network.NewClientFactoryForTest(&http.Client{}),
		nil,
		nil,
	)

	err := svc.RefreshFeeds(context.Background(), nil)
	require.NoError(t, err)
}

func TestRefreshService_RefreshFeeds_GetByIDsError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockFeeds.EXPECT().GetByIDs(gomock.Any(), []int64{1, 2}).Return(nil, errors.New("db error"))

	svc := service.NewRefreshService(
		mockFeeds,
		mock.NewMockEntryRepository(ctrl),
		nil,
		nil,
		network.NewClientFactoryForTest(&http.Client{}),
		nil,
		nil,
	)

	err := svc.RefreshFeeds(context.Background(), []int64{1, 2})
	require.Error(t, err)
}

func TestRefreshService_RefreshFeed_SameGUIDDifferentURL_SecondRefreshCountsAsUpdate(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockEntries := mock.NewMockEntryRepository(ctrl)

	feed := model.Feed{ID: 20, URL: "https://example.com/rss", Title: "Feed"}
	mockFeeds.EXPECT().GetByID(gomock.Any(), int64(20)).Return(feed, nil).Times(2)
	mockFeeds.EXPECT().UpdateErrorMessage(gomock.Any(), int64(20), nil).Return(nil).Times(2)
	mockFeeds.EXPECT().UpdateSiteURL(gomock.Any(), int64(20), "https://example.com").Return(nil).Times(2)

	var call int
	const rssTemplate = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>Test Feed</title>
<link>https://example.com</link>
<description>Desc</description>
<item>
  <title>Item 1</title>
  <guid>v2ex-guid-1</guid>
  <link>%s</link>
  <description>Content 1</description>
</item>
</channel>
</rss>`

	client := &http.Client{
		Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
			call++
			link := "https://www.v2ex.com/t/1193191#reply10"
			if call == 2 {
				link = "https://www.v2ex.com/t/1193191#reply20"
			}
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader(fmt.Sprintf(rssTemplate, link))),
				Header:     make(http.Header),
				Request:    req,
			}, nil
		}),
	}

	seen := make(map[string]bool)
	existsResults := make([]bool, 0, 2)
	mockEntries.EXPECT().ExistsByHash(gomock.Any(), int64(20), hashString("v2ex-guid-1")).DoAndReturn(
		func(_ context.Context, _ int64, hash string) (bool, error) {
			exists := seen[hash]
			existsResults = append(existsResults, exists)
			return exists, nil
		},
	).Times(2)
	mockEntries.EXPECT().ExistsByLegacyURL(gomock.Any(), int64(20), "https://www.v2ex.com/t/1193191#reply10", hashString("v2ex-guid-1")).Return(false, nil).Times(1)
	mockEntries.EXPECT().CreateOrUpdate(gomock.Any(), gomock.Any()).DoAndReturn(
		func(_ context.Context, entry model.Entry) error {
			seen[entry.Hash] = true
			return nil
		},
	).Times(2)

	svc := service.NewRefreshService(
		mockFeeds,
		mockEntries,
		nil,
		nil,
		network.NewClientFactoryForTest(client),
		nil,
		nil,
	)

	err := svc.RefreshFeed(context.Background(), 20)
	require.NoError(t, err)
	err = svc.RefreshFeed(context.Background(), 20)
	require.NoError(t, err)
	require.Equal(t, []bool{false, true}, existsResults)
}

type rateLimitStub struct {
	interval time.Duration
}

func (r *rateLimitStub) GetInterval(ctx context.Context, host string) int {
	return int(r.interval.Seconds())
}

func hashString(input string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(input)))
	return hex.EncodeToString(sum[:])
}

func (r *rateLimitStub) GetIntervalDuration(ctx context.Context, host string) time.Duration {
	return r.interval
}

func (r *rateLimitStub) SetInterval(ctx context.Context, host string, seconds int) error {
	return nil
}

func (r *rateLimitStub) DeleteInterval(ctx context.Context, host string) error {
	return nil
}

func (r *rateLimitStub) List(ctx context.Context) ([]service.DomainRateLimitDTO, error) {
	return nil, nil
}

func TestRefreshService_RefreshFeeds_WithRateLimit(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockEntries := mock.NewMockEntryRepository(ctrl)

	feeds := []model.Feed{
		{ID: 1, URL: "https://example.com/rss", Title: "Feed 1"},
		{ID: 2, URL: "https://example.com/rss", Title: "Feed 2"},
	}

	mockFeeds.EXPECT().GetByIDs(gomock.Any(), []int64{1, 2}).Return(feeds, nil)
	mockFeeds.EXPECT().UpdateErrorMessage(gomock.Any(), int64(1), nil).Return(nil)
	mockFeeds.EXPECT().UpdateErrorMessage(gomock.Any(), int64(2), nil).Return(nil)

	client := &http.Client{
		Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusNotModified,
				Body:       http.NoBody,
				Header:     make(http.Header),
				Request:    req,
			}, nil
		}),
	}

	svc := service.NewRefreshService(
		mockFeeds,
		mockEntries,
		nil,
		nil,
		network.NewClientFactoryForTest(client),
		nil,
		&rateLimitStub{interval: 5 * time.Millisecond},
	)

	err := svc.RefreshFeeds(context.Background(), []int64{1, 2})
	require.NoError(t, err)
}

func TestRefreshService_RefreshFeedWithFreshClient_HTTPError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockEntries := mock.NewMockEntryRepository(ctrl)

	feed := model.Feed{ID: 5, URL: "https://example.com/rss", Title: "Feed"}
	mockFeeds.EXPECT().UpdateErrorMessage(gomock.Any(), int64(5), gomock.Any()).DoAndReturn(
		func(_ context.Context, _ int64, msg *string) error {
			require.NotNil(t, msg)
			require.Equal(t, "HTTP 500", *msg)
			return nil
		},
	)

	client := &http.Client{
		Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusInternalServerError,
				Body:       http.NoBody,
				Header:     make(http.Header),
				Request:    req,
			}, nil
		}),
	}

	svc := service.NewRefreshService(
		mockFeeds,
		mockEntries,
		nil,
		nil,
		network.NewClientFactoryForTest(client),
		nil,
		nil,
	)

	err := service.RefreshFeedWithFreshClientForTest(svc, context.Background(), feed, "UA-Test", "", 0)
	require.NoError(t, err)
}
