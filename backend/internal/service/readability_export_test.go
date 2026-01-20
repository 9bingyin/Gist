package service

import (
	"bytes"
	"context"
	"net/url"
	"strings"

	readability "codeberg.org/readeck/go-readability/v2"
)

// RemoveMetadataElementsForTest exposes removeMetadataElements for tests.
func RemoveMetadataElementsForTest(htmlContent []byte) string {
	return removeMetadataElements(htmlContent)
}

// FixLazyImagesForTest exposes fixLazyImages for tests.
func FixLazyImagesForTest(htmlContent []byte) []byte {
	return fixLazyImages(htmlContent)
}

// ParseHTMLForTest exposes the readability parsing logic for tests.
// This tests that KeepClasses=true is set correctly.
func ParseHTMLForTest(htmlContent string, pageURL string) (string, error) {
	parsedURL, err := url.Parse(pageURL)
	if err != nil {
		return "", err
	}

	parser := readability.NewParser()
	parser.KeepClasses = true // Must match the setting in FetchReadableContent
	article, err := parser.Parse(strings.NewReader(htmlContent), parsedURL)
	if err != nil {
		return "", err
	}

	var buf bytes.Buffer
	if err := article.RenderHTML(&buf); err != nil {
		return "", err
	}
	return buf.String(), nil
}

// ReadabilityFetchWithChromeForTest exposes fetchWithChrome for tests.
func ReadabilityFetchWithChromeForTest(svc ReadabilityService, ctx context.Context, targetURL, cookie string, retryCount int) ([]byte, error) {
	impl, ok := svc.(*readabilityService)
	if !ok {
		return nil, ErrInvalid
	}
	return impl.fetchWithChrome(ctx, targetURL, cookie, retryCount)
}

// ReadabilityFetchWithFreshSessionForTest exposes fetchWithFreshSession for tests.
func ReadabilityFetchWithFreshSessionForTest(svc ReadabilityService, ctx context.Context, targetURL, cookie string, retryCount int) ([]byte, error) {
	impl, ok := svc.(*readabilityService)
	if !ok {
		return nil, ErrInvalid
	}
	return impl.fetchWithFreshSession(ctx, targetURL, cookie, retryCount)
}

// ReadabilityDoFetchForTest exposes doFetch for tests.
func ReadabilityDoFetchForTest(svc ReadabilityService, ctx context.Context, targetURL, cookie string, retryCount int, isFresh bool) ([]byte, error) {
	impl, ok := svc.(*readabilityService)
	if !ok {
		return nil, ErrInvalid
	}
	session := impl.clientFactory.NewAzureSession(ctx, readabilityTimeout)
	defer session.Close()
	return impl.doFetch(ctx, session, targetURL, cookie, retryCount, isFresh)
}
