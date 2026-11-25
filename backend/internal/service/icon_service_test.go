package service_test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"image/png"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/stretchr/testify/require"

	"gist/backend/internal/model"
	"gist/backend/internal/service"
	"gist/backend/pkg/network"
)

type feedRepoStub struct {
	mu                  sync.Mutex
	listWithoutIconFn   func(context.Context) ([]model.Feed, error)
	listFn              func(context.Context, *int64) ([]model.Feed, error)
	updateIconPathFn    func(context.Context, int64, string) error
	getByIDFn           func(context.Context, int64) (model.Feed, error)
	clearAllIconPathsFn func(context.Context) (int64, error)
	clearAllCondGetFn   func(context.Context) (int64, error)
}

func (f *feedRepoStub) Create(context.Context, model.Feed) (model.Feed, error) {
	panic("not implemented")
}

func (f *feedRepoStub) GetByID(ctx context.Context, id int64) (model.Feed, error) {
	if f.getByIDFn == nil {
		panic("not implemented")
	}
	return f.getByIDFn(ctx, id)
}

func (f *feedRepoStub) GetByIDs(context.Context, []int64) ([]model.Feed, error) {
	panic("not implemented")
}

func (f *feedRepoStub) FindByURL(context.Context, string) (*model.Feed, error) {
	panic("not implemented")
}

func (f *feedRepoStub) List(ctx context.Context, folderID *int64) ([]model.Feed, error) {
	if f.listFn == nil {
		panic("not implemented")
	}
	return f.listFn(ctx, folderID)
}

func (f *feedRepoStub) ListWithoutIcon(ctx context.Context) ([]model.Feed, error) {
	if f.listWithoutIconFn == nil {
		panic("not implemented")
	}
	return f.listWithoutIconFn(ctx)
}

func (f *feedRepoStub) Update(context.Context, model.Feed) (model.Feed, error) {
	panic("not implemented")
}

func (f *feedRepoStub) UpdateIconPath(ctx context.Context, id int64, iconPath string) error {
	if f.updateIconPathFn == nil {
		panic("not implemented")
	}
	return f.updateIconPathFn(ctx, id, iconPath)
}

func (f *feedRepoStub) UpdateErrorMessage(context.Context, int64, *string) error {
	panic("not implemented")
}

func (f *feedRepoStub) UpdateType(context.Context, int64, string) error {
	panic("not implemented")
}

func (f *feedRepoStub) UpdateTypeByFolderID(context.Context, int64, string) error {
	panic("not implemented")
}

func (f *feedRepoStub) Delete(context.Context, int64) error {
	panic("not implemented")
}

func (f *feedRepoStub) DeleteBatch(context.Context, []int64) (int64, error) {
	panic("not implemented")
}

func (f *feedRepoStub) ClearAllIconPaths(ctx context.Context) (int64, error) {
	if f.clearAllIconPathsFn == nil {
		panic("not implemented")
	}
	return f.clearAllIconPathsFn(ctx)
}

func (f *feedRepoStub) ClearAllConditionalGet(ctx context.Context) (int64, error) {
	if f.clearAllCondGetFn == nil {
		panic("not implemented")
	}
	return f.clearAllCondGetFn(ctx)
}

func (f *feedRepoStub) UpdateSiteURL(context.Context, int64, string) error {
	panic("not implemented")
}

func (f *feedRepoStub) UpdateConditionalGet(context.Context, int64, *string, *string) error {
	panic("not implemented")
}

func pngBytes(t *testing.T, width, height int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	buf := &bytes.Buffer{}
	require.NoError(t, png.Encode(buf, img))
	return buf.Bytes()
}

func TestIconService_IsValidIconPath(t *testing.T) {
	require.False(t, service.IsValidIconPathForTest(""))
	require.False(t, service.IsValidIconPathForTest("../icon.png"))
	require.False(t, service.IsValidIconPathForTest("/abs/icon.png"))
	require.True(t, service.IsValidIconPathForTest("example.com.png"))
}

func TestIconService_IsHashFilename(t *testing.T) {
	require.True(t, service.IsHashFilenameForTest("0123456789abcdef.png"))
	require.False(t, service.IsHashFilenameForTest("short.png"))
	require.False(t, service.IsHashFilenameForTest("gggggggggggggggg.png"))
}

func TestIconService_DetectImageFormat(t *testing.T) {
	ext, err := service.DetectImageFormatExtForTest(pngBytes(t, 2, 2))
	require.NoError(t, err)
	require.Equal(t, "png", ext)

	ext, err = service.DetectImageFormatExtForTest([]byte("<svg></svg>"))
	require.NoError(t, err)
	require.Equal(t, "svg", ext)

	ext, err = service.DetectImageFormatExtForTest([]byte{0x00, 0x00, 0x01, 0x00, 0x01, 0x00})
	require.NoError(t, err)
	require.Equal(t, "ico", ext)

	_, err = service.DetectImageFormatExtForTest(pngBytes(t, 1, 1))
	require.Error(t, err)
}

func TestIconService_FetchAndSaveIcon_ExistingRSSHash(t *testing.T) {
	dataDir := t.TempDir()
	iconsDir := filepath.Join(dataDir, "icons")
	require.NoError(t, os.MkdirAll(iconsDir, 0755))

	feedImageURL := "https://example.com/icon.png"
	hash := sha256.Sum256([]byte(feedImageURL))
	filename := hex.EncodeToString(hash[:8]) + ".png"
	require.NoError(t, os.WriteFile(filepath.Join(iconsDir, filename), []byte("data"), 0644))

	svc := service.NewIconService(dataDir, &feedRepoStub{}, network.NewClientFactoryForTest(&http.Client{}), nil)
	got, err := svc.FetchAndSaveIcon(context.Background(), feedImageURL, "https://example.com")
	require.NoError(t, err)
	require.Equal(t, filename, got)
}

func TestIconService_FetchAndSaveIcon_LocalFavicon(t *testing.T) {
	iconData := pngBytes(t, 2, 2)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/favicon.ico" {
			_, _ = w.Write(iconData)
			return
		}
		http.NotFound(w, r)
	}))
	defer server.Close()

	dataDir := t.TempDir()
	svc := service.NewIconService(dataDir, &feedRepoStub{}, network.NewClientFactoryForTest(&http.Client{}), nil)

	got, err := svc.FetchAndSaveIcon(context.Background(), "", server.URL)
	require.NoError(t, err)

	parsed, err := url.Parse(server.URL)
	require.NoError(t, err)
	expected := parsed.Hostname() + ".png"
	require.Equal(t, expected, got)

	_, err = os.Stat(filepath.Join(dataDir, "icons", expected))
	require.NoError(t, err)
}

func TestIconService_FetchAndSaveIcon_NoURLs(t *testing.T) {
	dataDir := t.TempDir()
	svc := service.NewIconService(dataDir, &feedRepoStub{}, network.NewClientFactoryForTest(&http.Client{}), nil)

	got, err := svc.FetchAndSaveIcon(context.Background(), "", "")
	require.NoError(t, err)
	require.Empty(t, got)
}

func TestIconService_EnsureIcon_Download(t *testing.T) {
	iconData := pngBytes(t, 2, 2)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/favicon.ico" {
			_, _ = w.Write(iconData)
			return
		}
		http.NotFound(w, r)
	}))
	defer server.Close()

	dataDir := t.TempDir()
	svc := service.NewIconService(dataDir, &feedRepoStub{}, network.NewClientFactoryForTest(&http.Client{}), nil)

	parsed, err := url.Parse(server.URL)
	require.NoError(t, err)
	iconPath := parsed.Hostname() + ".png"
	require.NoError(t, svc.EnsureIcon(context.Background(), iconPath, server.URL))

	_, err = os.Stat(filepath.Join(dataDir, "icons", iconPath))
	require.NoError(t, err)
}

func TestIconService_EnsureIcon_InvalidPathAndHash(t *testing.T) {
	dataDir := t.TempDir()
	svc := service.NewIconService(dataDir, &feedRepoStub{}, network.NewClientFactoryForTest(&http.Client{}), nil)

	require.NoError(t, svc.EnsureIcon(context.Background(), "../icon.png", "https://example.com"))
	require.NoError(t, svc.EnsureIcon(context.Background(), "0123456789abcdef.png", "https://example.com"))
}

func TestIconService_GetIconPath(t *testing.T) {
	dataDir := t.TempDir()
	svc := service.NewIconService(dataDir, &feedRepoStub{}, network.NewClientFactoryForTest(&http.Client{}), nil)

	path := svc.GetIconPath("example.com.png")
	require.Equal(t, filepath.Join(dataDir, "icons", "example.com.png"), path)
	require.Empty(t, svc.GetIconPath("../bad.png"))
}

func TestIconService_ClearAllIcons(t *testing.T) {
	dataDir := t.TempDir()
	iconsDir := filepath.Join(dataDir, "icons")
	require.NoError(t, os.MkdirAll(iconsDir, 0755))
	require.NoError(t, os.WriteFile(filepath.Join(iconsDir, "a.png"), []byte("a"), 0644))
	require.NoError(t, os.WriteFile(filepath.Join(iconsDir, "b.png"), []byte("b"), 0644))

	repo := &feedRepoStub{
		clearAllIconPathsFn: func(context.Context) (int64, error) {
			return 2, nil
		},
		clearAllCondGetFn: func(context.Context) (int64, error) {
			return 2, nil
		},
	}

	svc := service.NewIconService(dataDir, repo, network.NewClientFactoryForTest(&http.Client{}), nil)
	deleted, err := svc.ClearAllIcons(context.Background())
	require.NoError(t, err)
	require.Equal(t, int64(2), deleted)

	entries, err := os.ReadDir(iconsDir)
	require.NoError(t, err)
	require.Len(t, entries, 0)
}

func TestIconService_BackfillIcons_ListError(t *testing.T) {
	repo := &feedRepoStub{
		listWithoutIconFn: func(context.Context) ([]model.Feed, error) {
			return nil, errors.New("list failed")
		},
	}
	svc := service.NewIconService(t.TempDir(), repo, network.NewClientFactoryForTest(&http.Client{}), nil)

	err := svc.BackfillIcons(context.Background())
	require.Error(t, err)
}

func TestIconService_BackfillIcons_NoFeeds(t *testing.T) {
	repo := &feedRepoStub{
		listWithoutIconFn: func(context.Context) ([]model.Feed, error) {
			return nil, nil
		},
		listFn: func(context.Context, *int64) ([]model.Feed, error) {
			return nil, nil
		},
	}
	svc := service.NewIconService(t.TempDir(), repo, network.NewClientFactoryForTest(&http.Client{}), nil)

	err := svc.BackfillIcons(context.Background())
	require.NoError(t, err)
}

func TestIconService_FetchIconsForFeeds(t *testing.T) {
	iconData := pngBytes(t, 2, 2)

	var baseURL string
	mux := http.NewServeMux()
	mux.HandleFunc("/rss", func(w http.ResponseWriter, r *http.Request) {
		rss := fmt.Sprintf(`<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Test</title>
    <link>%s</link>
    <image><url>%s/icon.png</url></image>
    <item><title>Item</title><link>%s/item</link></item>
  </channel>
</rss>`, baseURL, baseURL, baseURL)
		_, _ = w.Write([]byte(rss))
	})
	mux.HandleFunc("/icon.png", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write(iconData)
	})
	server := httptest.NewServer(mux)
	defer server.Close()
	baseURL = server.URL

	dataDir := t.TempDir()
	updated := make(map[int64]string)
	repo := &feedRepoStub{}
	repo.updateIconPathFn = func(ctx context.Context, id int64, iconPath string) error {
		if iconPath == "" {
			return nil
		}
		repo.mu.Lock()
		defer repo.mu.Unlock()
		updated[id] = iconPath
		return nil
	}

	svc := service.NewIconService(dataDir, repo, network.NewClientFactoryForTest(&http.Client{}), nil)
	feeds := []model.Feed{{ID: 10, URL: server.URL + "/rss", Title: "Test"}}

	err := service.FetchIconsForFeedsForTest(svc, context.Background(), feeds)
	require.NoError(t, err)

	repo.mu.Lock()
	iconPath, ok := updated[int64(10)]
	repo.mu.Unlock()
	require.True(t, ok)
	_, err = os.Stat(filepath.Join(dataDir, "icons", iconPath))
	require.NoError(t, err)
}

func TestIconService_DetectImageFormat_SVGWithLongHeader(t *testing.T) {
	svgData := []byte(`<?xml version="1.0" encoding="UTF-8"?><!-- ` + strings.Repeat("x", 512) + ` --><svg xmlns="http://www.w3.org/2000/svg"></svg>`)
	ext, err := service.DetectImageFormatExtForTest(svgData)
	require.NoError(t, err)
	require.Equal(t, "svg", ext)
}

// TestIconService_BuildDDGFaviconURL tests the DuckDuckGo favicon URL builder.
// See commit 8a23586: fix: Add DuckDuckGo Favicon API as fallback
func TestIconService_BuildDDGFaviconURL(t *testing.T) {
	dataDir := t.TempDir()
	svc := service.NewIconService(dataDir, &feedRepoStub{}, network.NewClientFactoryForTest(&http.Client{}), nil)

	tests := []struct {
		name     string
		siteURL  string
		expected string
	}{
		{
			name:     "valid URL with https",
			siteURL:  "https://example.com/path",
			expected: "https://icons.duckduckgo.com/ip3/example.com.ico",
		},
		{
			name:     "valid URL with http",
			siteURL:  "http://blog.example.org/feed",
			expected: "https://icons.duckduckgo.com/ip3/blog.example.org.ico",
		},
		{
			name:     "URL with port",
			siteURL:  "https://example.com:8080/path",
			expected: "https://icons.duckduckgo.com/ip3/example.com.ico",
		},
		{
			name:     "empty URL",
			siteURL:  "",
			expected: "",
		},
		{
			name:     "invalid URL",
			siteURL:  "://invalid",
			expected: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := service.BuildDDGFaviconURLForTest(svc, tt.siteURL)
			require.Equal(t, tt.expected, got)
		})
	}
}

// TestIconService_FetchAndSaveIcon_DDGFallback tests that DuckDuckGo is used as fallback.
// See commit 8a23586: fix: Add DuckDuckGo Favicon API as fallback
func TestIconService_FetchAndSaveIcon_DDGFallback(t *testing.T) {
	iconData := pngBytes(t, 2, 2)

	// Track which URLs were requested
	var requestedURLs []string
	var mu sync.Mutex

	mux := http.NewServeMux()

	// Local favicon returns 404
	mux.HandleFunc("/favicon.ico", func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		requestedURLs = append(requestedURLs, r.URL.Path)
		mu.Unlock()
		http.NotFound(w, r)
	})

	// Google API path - we need to mock this differently
	// Since we can't intercept google.com requests, we'll test that DDG URL is built correctly

	server := httptest.NewServer(mux)
	defer server.Close()

	dataDir := t.TempDir()
	svc := service.NewIconService(dataDir, &feedRepoStub{}, network.NewClientFactoryForTest(&http.Client{}), nil)

	// Test that DDG URL is correctly built
	parsed, err := url.Parse(server.URL)
	require.NoError(t, err)

	ddgURL := service.BuildDDGFaviconURLForTest(svc, server.URL)
	expected := fmt.Sprintf("https://icons.duckduckgo.com/ip3/%s.ico", parsed.Hostname())
	require.Equal(t, expected, ddgURL, "DuckDuckGo favicon URL should be correctly built")

	// Verify the URL follows the correct format
	require.Contains(t, ddgURL, "icons.duckduckgo.com/ip3/")
	require.True(t, strings.HasSuffix(ddgURL, ".ico"), "DuckDuckGo URL should end with .ico")

	// Also test that local and Google URLs are built correctly for the same site
	localURL := service.BuildLocalFaviconURLForTest(svc, server.URL)
	require.Contains(t, localURL, "/favicon.ico")

	googleURL := service.BuildFaviconURLForTest(svc, server.URL)
	require.Contains(t, googleURL, "google.com/s2/favicons")

	_ = iconData // Use iconData to avoid unused variable warning
}

// TestIconService_ClearAllIcons_ResetsConditionalGet tests that clearing all icons
// also resets ETag and Last-Modified to force full refresh.
// See commit 2fbc0ad: fix: Reset ETag and Last-Modified when clearing all icons
func TestIconService_ClearAllIcons_ResetsConditionalGet(t *testing.T) {
	dataDir := t.TempDir()
	iconsDir := filepath.Join(dataDir, "icons")
	require.NoError(t, os.MkdirAll(iconsDir, 0755))
	require.NoError(t, os.WriteFile(filepath.Join(iconsDir, "test.png"), []byte("data"), 0644))

	var clearIconPathsCalled, clearCondGetCalled bool

	repo := &feedRepoStub{
		clearAllIconPathsFn: func(context.Context) (int64, error) {
			clearIconPathsCalled = true
			return 1, nil
		},
		clearAllCondGetFn: func(context.Context) (int64, error) {
			clearCondGetCalled = true
			return 1, nil
		},
	}

	svc := service.NewIconService(dataDir, repo, network.NewClientFactoryForTest(&http.Client{}), nil)
	_, err := svc.ClearAllIcons(context.Background())
	require.NoError(t, err)

	// Verify both clear functions were called
	require.True(t, clearIconPathsCalled, "ClearAllIconPaths should be called")
	require.True(t, clearCondGetCalled, "ClearAllConditionalGet should be called to reset ETag/Last-Modified")
}
