package service_test

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"gist/backend/internal/service"
	"gist/backend/internal/service/anubis"
	"gist/backend/pkg/network"

	"github.com/stretchr/testify/require"
)

var testPNGData = []byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}

func readProxyResult(t *testing.T, res *service.ProxyResult) []byte {
	t.Helper()
	if res.Body != nil {
		defer res.Body.Close()
		data, err := io.ReadAll(res.Body)
		require.NoError(t, err)
		return data
	}
	return res.Data
}

func TestBuildReferer(t *testing.T) {
	parsed, _ := http.NewRequest(http.MethodGet, "https://example.com/img.png", nil)
	referer := service.BuildReferer("https://example.com/article?id=1", parsed.URL)
	require.Equal(t, "https://example.com/", referer)

	referer = service.BuildReferer("http://[::1", parsed.URL)
	require.Equal(t, "https://example.com/", referer)

	// Relative or scheme-less referer should fall back to image origin
	referer = service.BuildReferer("/relative/path", parsed.URL)
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
		_, _ = w.Write(testPNGData)
	}))
	defer server.Close()

	clientFactory := network.NewClientFactoryForTest(&http.Client{})
	svc := service.NewProxyService(clientFactory, nil)

	result, err := svc.FetchImage(context.Background(), server.URL+"/img.png", "")
	require.NoError(t, err)
	require.Equal(t, "image/png", result.ContentType)
	require.Equal(t, testPNGData, readProxyResult(t, result))
}

func TestProxyService_FetchImage_InvalidImage(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("data"))
	}))
	defer server.Close()

	clientFactory := network.NewClientFactoryForTest(&http.Client{})
	svc := service.NewProxyService(clientFactory, nil)

	_, err := svc.FetchImage(context.Background(), server.URL+"/img.png", "")
	require.ErrorIs(t, err, service.ErrInvalidImage)
}

func TestProxyService_FetchImage_SVG(t *testing.T) {
	svgData := []byte(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>`)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/svg+xml")
		_, _ = w.Write(svgData)
	}))
	defer server.Close()

	clientFactory := network.NewClientFactoryForTest(&http.Client{})
	svc := service.NewProxyService(clientFactory, nil)

	result, err := svc.FetchImage(context.Background(), server.URL+"/img.svg", "")
	require.NoError(t, err)
	require.Equal(t, "image/svg+xml", result.ContentType)
	require.Equal(t, svgData, readProxyResult(t, result))
}

func TestProxyService_FetchImage_SVGWithLongPrefixFallback(t *testing.T) {
	svgData := []byte(`<?xml version="1.0"?><!DOCTYPE svg><!-- ` + strings.Repeat("prefix", 700) + ` --><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>`)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/xml")
		_, _ = w.Write(svgData)
	}))
	defer server.Close()

	clientFactory := network.NewClientFactoryForTest(&http.Client{})
	svc := service.NewProxyService(clientFactory, nil)

	result, err := svc.FetchImage(context.Background(), server.URL+"/img.svg", "")
	require.NoError(t, err)
	require.Equal(t, "image/svg+xml", result.ContentType)
	require.Equal(t, svgData, readProxyResult(t, result))
}

func TestProxyService_FetchImage_UpstreamRejected(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`<script id="anubis_challenge" type="application/json">null</script>`))
	}))
	defer server.Close()

	clientFactory := network.NewClientFactoryForTest(&http.Client{})
	anubisSolver := anubis.NewSolver(clientFactory, nil)
	svc := service.NewProxyService(clientFactory, anubisSolver)

	_, err := svc.FetchImage(context.Background(), server.URL+"/img.png", "")
	require.ErrorIs(t, err, service.ErrUpstreamRejected)
}

func TestProxyService_FetchImage_Timeout(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-time.After(2 * time.Second):
		case <-r.Context().Done():
		}
	}))
	defer server.Close()

	clientFactory := network.NewClientFactoryForTest(&http.Client{})
	svc := service.NewProxyService(clientFactory, nil)

	ctx, cancel := context.WithTimeout(context.Background(), 80*time.Millisecond)
	defer cancel()

	_, err := svc.FetchImage(ctx, server.URL+"/slow.png", "")
	require.ErrorIs(t, err, service.ErrRequestTimeout)
}
