package service_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"gist/backend/internal/service"
	"gist/backend/internal/service/anubis"
	"gist/backend/pkg/network"

	"github.com/stretchr/testify/require"
)

func TestBuildReferer(t *testing.T) {
	parsed, _ := http.NewRequest(http.MethodGet, "https://example.com/img.png", nil)
	referer := service.BuildReferer("https://example.com/article?id=1", parsed.URL)
	require.Equal(t, "https://example.com/", referer)

	referer = service.BuildReferer("http://[::1", parsed.URL)
	require.Equal(t, "https://example.com/", referer)
}

func TestProxyService_FetchImage_InvalidURL(t *testing.T) {
	clientFactory := network.NewClientFactoryForTest(&http.Client{})
	svc := service.NewProxyService(clientFactory, nil)

	_, err := svc.FetchImage(context.Background(), "://invalid", "")
	require.ErrorIs(t, err, service.ErrInvalidURL)
}

func TestProxyService_FetchImage_InvalidProtocol(t *testing.T) {
	clientFactory := network.NewClientFactoryForTest(&http.Client{})
	svc := service.NewProxyService(clientFactory, nil)

	_, err := svc.FetchImage(context.Background(), "ftp://example.com/a.png", "")
	require.ErrorIs(t, err, service.ErrInvalidProtocol)
}

func TestProxyService_FetchImage_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write([]byte("image-data"))
	}))
	defer server.Close()

	clientFactory := network.NewClientFactoryForTest(&http.Client{})
	svc := service.NewProxyService(clientFactory, nil)

	result, err := svc.FetchImage(context.Background(), server.URL+"/img.png", "")
	require.NoError(t, err)
	require.Equal(t, "image/png", result.ContentType)
	require.Equal(t, []byte("image-data"), result.Data)
}

func TestProxyService_FetchImage_DefaultContentType(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("data"))
	}))
	defer server.Close()

	clientFactory := network.NewClientFactoryForTest(&http.Client{})
	svc := service.NewProxyService(clientFactory, nil)

	result, err := svc.FetchImage(context.Background(), server.URL+"/img.png", "")
	require.NoError(t, err)
	require.Equal(t, "application/octet-stream", result.ContentType)
}

func TestProxyService_FetchImage_UpstreamRejected(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`<script id="anubis_challenge" type="application/json">null</script>`))
	}))
	defer server.Close()

	clientFactory := network.NewClientFactoryForTest(&http.Client{})
	anubisSolver := anubis.NewSolver(clientFactory, nil)
	svc := service.NewProxyService(clientFactory, anubisSolver)

	_, err := svc.FetchImage(context.Background(), server.URL+"/img.png", "")
	require.ErrorIs(t, err, service.ErrUpstreamRejected)
}

func TestProxyService_Close(t *testing.T) {
	clientFactory := network.NewClientFactoryForTest(&http.Client{})
	svc := service.NewProxyService(clientFactory, nil)
	svc.Close()
}

func TestProxyService_FetchWithFreshSession_InvalidURL(t *testing.T) {
	clientFactory := network.NewClientFactoryForTest(&http.Client{})
	svc := service.NewProxyService(clientFactory, nil)

	_, err := service.ProxyFetchWithFreshSessionForTest(svc, context.Background(), "://bad", "", "", 0)
	require.ErrorIs(t, err, service.ErrInvalidURL)
}
