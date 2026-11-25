package service

import (
	"bytes"
	"context"
	"net/url"
	"strings"

	readability "codeberg.org/readeck/go-readability/v2"
	"golang.org/x/net/html"
)

// CleanReadabilityHTMLForTest parses HTML, runs cleanReadabilityTree, and returns the rendered HTML.
func CleanReadabilityHTMLForTest(htmlContent []byte) string {
	doc, err := html.Parse(bytes.NewReader(htmlContent))
	if err != nil {
		return string(htmlContent)
	}
	cleanReadabilityTree(doc)
	var buf bytes.Buffer
	if err := html.Render(&buf, doc); err != nil {
		return string(htmlContent)
	}
	return buf.String()
}

// ParseAndCleanReadabilityForTest exposes parseAndCleanReadability for tests.
func ParseAndCleanReadabilityForTest(htmlContent []byte, pageURL string) (string, error) {
	parsedURL, err := url.Parse(pageURL)
	if err != nil {
		return "", err
	}
	return parseAndCleanReadability(htmlContent, parsedURL)
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
func ReadabilityFetchWithChromeForTest(svc ReadabilityService, ctx context.Context, targetURL string) ([]byte, error) {
	impl, ok := svc.(*readabilityService)
	if !ok {
		return nil, ErrInvalid
	}
	return impl.fetchWithChrome(ctx, targetURL)
}
