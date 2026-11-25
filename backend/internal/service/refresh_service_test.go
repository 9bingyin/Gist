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

	mockFeeds.EXPECT().UpdateConditionalGet(gomock.Any(), int64(10), gomock.Any(), gomock.Any()).DoAndReturn(
		func(_ context.Context, _ int64, etag, lastMod *string) error {
			require.NotNil(t, etag)
			require.Equal(t, "etag-value", *etag)
			require.NotNil(t, lastMod)
			return nil
		},
	)
	mockFeeds.EXPECT().UpdateSiteURL(gomock.Any(), int64(10), "https://example.com").Return(nil)
	mockIcons.EXPECT().FetchAndSaveIcon(gomock.Any(), "https://example.com/icon.png", "https://example.com").Return("example.com.png", nil)
	mockFeeds.EXPECT().UpdateIconPath(gomock.Any(), int64(10), "example.com.png").Return(nil)

	mockEntries.EXPECT().GetExistingHashes(gomock.Any(), int64(10), []string{hashString("https://example.com/1")}).Return(map[string]struct{}{}, nil)
	mockEntries.EXPECT().CreateOrUpdateBatch(gomock.Any(), gomock.Any()).Return(nil)

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

	mockEntries.EXPECT().GetExistingHashes(gomock.Any(), int64(2), []string{hashString("https://example.com/1")}).Return(map[string]struct{}{}, nil)
	mockEntries.EXPECT().CreateOrUpdateBatch(gomock.Any(), gomock.Any()).Return(nil)

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

	seen := make(map[string]struct{})
	existsResults := make([]bool, 0, 2)
	mockEntries.EXPECT().GetExistingHashes(gomock.Any(), int64(20), []string{hashString("v2ex-guid-1")}).DoAndReturn(
		func(_ context.Context, _ int64, hashes []string) (map[string]struct{}, error) {
			out := make(map[string]struct{})
			for _, h := range hashes {
				if _, ok := seen[h]; ok {
					out[h] = struct{}{}
				}
			}
			_, existed := out[hashString("v2ex-guid-1")]
			existsResults = append(existsResults, existed)
			return out, nil
		},
	).Times(2)
	mockEntries.EXPECT().CreateOrUpdateBatch(gomock.Any(), gomock.Any()).DoAndReturn(
		func(_ context.Context, entries []model.Entry) error {
			for _, e := range entries {
				seen[e.Hash] = struct{}{}
			}
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

func (r *rateLimitStub) SetInterval(ctx context.Context, host string, seconds int) (model.DomainRateLimit, error) {
	return model.DomainRateLimit{Host: host, IntervalSeconds: seconds}, nil
}

func (r *rateLimitStub) DeleteInterval(ctx context.Context, host string) error {
	return nil
}

func (r *rateLimitStub) List(ctx context.Context) ([]model.DomainRateLimit, error) {
	if r.interval <= 0 {
		return nil, nil
	}
	return []model.DomainRateLimit{{ID: 1, Host: "example.com", IntervalSeconds: 0}}, nil
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

func TestRefreshService_RefreshFeed_HTTPError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockEntries := mock.NewMockEntryRepository(ctrl)

	feed := model.Feed{ID: 5, URL: "https://example.com/rss", Title: "Feed"}
	mockFeeds.EXPECT().GetByID(gomock.Any(), int64(5)).Return(feed, nil)
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

	err := svc.RefreshFeed(context.Background(), 5)
	require.NoError(t, err)
}

func TestRefreshService_RefreshFeed_BatchWriteError_DoesNotAdvanceETag(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockFeeds := mock.NewMockFeedRepository(ctrl)
	mockEntries := mock.NewMockEntryRepository(ctrl)

	feed := model.Feed{ID: 6, URL: "https://example.com/rss", Title: "Feed"}
	writeErr := errors.New("sqlite disk full")

	mockFeeds.EXPECT().GetByID(gomock.Any(), int64(6)).Return(feed, nil)
	mockEntries.EXPECT().GetExistingHashes(gomock.Any(), int64(6), gomock.Any()).Return(map[string]struct{}{}, nil)
	mockEntries.EXPECT().CreateOrUpdateBatch(gomock.Any(), gomock.Any()).Return(writeErr)
	mockFeeds.EXPECT().UpdateErrorMessage(gomock.Any(), int64(6), gomock.Any()).DoAndReturn(
		func(_ context.Context, _ int64, msg *string) error {
			require.NotNil(t, msg)
			require.Contains(t, *msg, "sqlite disk full")
			return nil
		},
	)
	// UpdateConditionalGet MUST NOT be called when CreateOrUpdateBatch fails.

	const rssBody = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Feed</title><link>https://example.com</link>
<item><title>Item 1</title><guid>g1</guid><link>https://example.com/1</link></item>
</channel></rss>`

	client := &http.Client{
		Transport: roundTripperFunc(func(req *http.Request) (*http.Response, error) {
			hdr := make(http.Header)
			hdr.Set("ETag", `"etag-new"`)
			hdr.Set("Last-Modified", "Wed, 21 Oct 2026 07:28:00 GMT")
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader(rssBody)),
				Header:     hdr,
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

	err := svc.RefreshFeed(context.Background(), 6)
	require.ErrorIs(t, err, writeErr)
}
