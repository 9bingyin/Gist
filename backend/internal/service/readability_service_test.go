package service_test

import (
	"bytes"
	"context"
	"database/sql"
	"net/http"
	"strings"
	"testing"

	"gist/backend/internal/model"
	"gist/backend/internal/repository/mock"
	"gist/backend/internal/service"
	"gist/backend/pkg/network"

	"golang.org/x/net/html"

	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"
)

func TestReadabilityService_FetchReadableContent_NotFound(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockEntries.EXPECT().GetByID(gomock.Any(), int64(1)).Return(model.Entry{}, sql.ErrNoRows)

	svc := service.NewReadabilityService(mockEntries, nil, nil)
	_, err := svc.FetchReadableContent(context.Background(), 1)
	require.ErrorIs(t, err, service.ErrNotFound)
}

func TestReadabilityService_FetchReadableContent_CacheHit(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	readable := "<article>cached</article>"
	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockEntries.EXPECT().GetByID(gomock.Any(), int64(1)).Return(model.Entry{
		ID:              1,
		ReadableContent: &readable,
	}, nil)

	svc := service.NewReadabilityService(mockEntries, nil, nil)
	got, err := svc.FetchReadableContent(context.Background(), 1)
	require.NoError(t, err)
	require.Equal(t, readable, got)
}

func TestReadabilityService_FetchReadableContent_InvalidURL(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockEntries.EXPECT().GetByID(gomock.Any(), int64(1)).Return(model.Entry{ID: 1}, nil)

	svc := service.NewReadabilityService(mockEntries, nil, nil)
	_, err := svc.FetchReadableContent(context.Background(), 1)
	require.ErrorIs(t, err, service.ErrInvalid)
}

func TestProcessLazyImages_UpdatesSources(t *testing.T) {
	input := []byte(`<html><body>
		<img src="data:image/svg+xml" data-src="real.png" data-srcset="real-2x.png 2x">
		<img data-lazy-src="lazy.png">
		<img data-original="orig.png">
	</body></html>`)

	output := service.ProcessLazyImages(input)
	outStr := string(output)

	require.Contains(t, outStr, `src="real.png"`)
	require.Contains(t, outStr, `srcset="real-2x.png 2x"`)
	require.Contains(t, outStr, `src="lazy.png"`)
	require.Contains(t, outStr, `src="orig.png"`)
}

func TestProcessLazyImages_UnwrapNoscript(t *testing.T) {
	input := []byte(`<html><body>
		<noscript><img src="real.png"></noscript>
	</body></html>`)

	output := service.ProcessLazyImages(input)
	outStr := string(output)
	require.Contains(t, outStr, `src="real.png"`)
	require.NotContains(t, outStr, "<noscript>")
}

func TestProcessLazyImages_RemovesPlaceholders(t *testing.T) {
	input := []byte(`<html><body>
		<img src="data:image/svg+xml">
	</body></html>`)
	output := service.ProcessLazyImages(input)
	outStr := string(output)
	require.NotContains(t, outStr, "<img")
}

func TestHasRealImageInNodes(t *testing.T) {
	doc, err := html.Parse(strings.NewReader(`<html><body><img src="real.png"></body></html>`))
	require.NoError(t, err)

	var body *html.Node
	service.WalkTree(doc, func(n *html.Node) {
		if n.Data == "body" {
			body = n
		}
	})
	require.NotNil(t, body)

	nodes := []*html.Node{body}
	require.True(t, service.HasRealImageInNodes(nodes))
}

func TestIsRealImage(t *testing.T) {
	doc, err := html.Parse(strings.NewReader(`<img src="real.png">`))
	require.NoError(t, err)

	var img *html.Node
	service.WalkTree(doc, func(n *html.Node) {
		if n.Data == "img" {
			img = n
		}
	})
	require.NotNil(t, img)
	require.True(t, service.IsRealImage(img))

	buf := &bytes.Buffer{}
	_ = html.Render(buf, img)
	require.Contains(t, buf.String(), "real.png")
}

func TestReadabilityService_Close(t *testing.T) {
	svc := service.NewReadabilityService(nil, network.NewClientFactoryForTest(&http.Client{}), nil)
	svc.Close()
}

func TestReadabilityService_FetchWithChrome_InvalidURL(t *testing.T) {
	svc := service.NewReadabilityService(nil, network.NewClientFactoryForTest(&http.Client{}), nil)

	_, err := service.ReadabilityFetchWithChromeForTest(svc, context.Background(), "http://[::1", "", 0)
	require.ErrorIs(t, err, service.ErrFeedFetch)
}

func TestReadabilityService_FetchWithFreshSession_InvalidScheme(t *testing.T) {
	svc := service.NewReadabilityService(nil, network.NewClientFactoryForTest(&http.Client{}), nil)

	_, err := service.ReadabilityFetchWithFreshSessionForTest(svc, context.Background(), "file:///etc/passwd", "", 0)
	require.ErrorIs(t, err, service.ErrInvalid)
}

func TestReadabilityService_DoFetch_InvalidURL(t *testing.T) {
	svc := service.NewReadabilityService(nil, network.NewClientFactoryForTest(&http.Client{}), nil)

	_, err := service.ReadabilityDoFetchForTest(svc, context.Background(), "http://[::1", "", 0, false)
	require.ErrorIs(t, err, service.ErrFeedFetch)
}
