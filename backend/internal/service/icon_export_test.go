package service

import (
	"context"
	"fmt"

	"github.com/mmcdole/gofeed"

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
func FetchIconsForFeedsForTest(svc IconService, ctx context.Context, parser *gofeed.Parser, feeds []model.Feed) error {
	impl, ok := svc.(*iconService)
	if !ok {
		return fmt.Errorf("invalid icon service")
	}
	impl.fetchIconsForFeeds(ctx, parser, feeds)
	return nil
}

// DownloadIconWithFreshClientForTest exposes fresh-client download for tests.
func DownloadIconWithFreshClientForTest(svc IconService, ctx context.Context, iconURL, cookie string, retryCount int) error {
	impl, ok := svc.(*iconService)
	if !ok {
		return fmt.Errorf("invalid icon service")
	}
	_, err := impl.downloadIconWithFreshClient(ctx, iconURL, cookie, retryCount)
	return err
}
