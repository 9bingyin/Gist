package service

import (
	"context"
	"fmt"

	"gist/backend/internal/model"
)

// IsHashFilenameForTest exposes hash filename check for tests.
func IsHashFilenameForTest(filename string) bool {
	return isHashFilename(filename)
}

// IsValidIconPathForTest exposes icon path validation for tests.
func IsValidIconPathForTest(iconPath string) bool {
	return isValidIconPath(iconPath)
}

// DetectImageFormatExtForTest exposes image format detection for tests.
func DetectImageFormatExtForTest(data []byte) (string, error) {
	format, err := detectImageFormat(data)
	if err != nil {
		return "", err
	}
	return format.ext, nil
}

// FetchIconsForFeedsForTest exposes icon fetching for feeds in tests.
func FetchIconsForFeedsForTest(svc IconService, ctx context.Context, feeds []model.Feed) error {
	impl, ok := svc.(*iconService)
	if !ok {
		return fmt.Errorf("invalid icon service")
	}
	impl.fetchIconsForFeeds(ctx, feeds, false)
	return nil
}

// BuildDDGFaviconURLForTest exposes the DuckDuckGo favicon URL builder for tests.
func BuildDDGFaviconURLForTest(svc IconService, siteURL string) string {
	impl, ok := svc.(*iconService)
	if !ok {
		return ""
	}
	return impl.buildDDGFaviconURL(siteURL)
}

// BuildLocalFaviconURLForTest exposes the local favicon URL builder for tests.
func BuildLocalFaviconURLForTest(svc IconService, siteURL string) string {
	impl, ok := svc.(*iconService)
	if !ok {
		return ""
	}
	return impl.buildLocalFaviconURL(siteURL)
}

// BuildFaviconURLForTest exposes the Google favicon URL builder for tests.
func BuildFaviconURLForTest(svc IconService, siteURL string) string {
	impl, ok := svc.(*iconService)
	if !ok {
		return ""
	}
	return impl.buildFaviconURL(siteURL)
}
