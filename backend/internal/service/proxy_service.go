//go:generate mockgen -source=$GOFILE -destination=mock/$GOFILE -package=mock
package service

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"github.com/Noooste/azuretls-client"

	"gist/backend/internal/config"
	"gist/backend/pkg/logger"
	"gist/backend/pkg/network"
)

const proxyTimeout = 30 * time.Second

var (
	ErrInvalidURL       = fmt.Errorf("invalid URL")
	ErrInvalidProtocol  = fmt.Errorf("invalid protocol")
	ErrRequestTimeout   = fmt.Errorf("request timeout")
	ErrFetchFailed      = fmt.Errorf("fetch failed")
	ErrUpstreamRejected = fmt.Errorf("upstream rejected")
)

type ProxyResult struct {
	Data        []byte
	ContentType string
}

type ProxyService interface {
	FetchImage(ctx context.Context, imageURL, refererURL string) (*ProxyResult, error)
	Close()
}

type proxyService struct {
	clientFactory *network.ClientFactory
	anubis        AnubisSolver
}

func NewProxyService(clientFactory *network.ClientFactory, anubisSolver AnubisSolver) ProxyService {
	return &proxyService{
		clientFactory: clientFactory,
		anubis:        anubisSolver,
	}
}

func (s *proxyService) Close() {
	// No persistent resources to release
}

func (s *proxyService) FetchImage(ctx context.Context, imageURL, refererURL string) (*ProxyResult, error) {
	return s.fetchImageWithRetry(ctx, imageURL, refererURL, "", 0)
}

func (s *proxyService) fetchImageWithRetry(ctx context.Context, imageURL, refererURL, cookie string, retryCount int) (*ProxyResult, error) {
	session := s.clientFactory.NewAzureSession(ctx, proxyTimeout)
	defer session.Close()
	return s.doFetch(ctx, session, imageURL, refererURL, cookie, retryCount)
}

// fetchWithFreshSession creates a new azuretls session to avoid connection reuse after Anubis
func (s *proxyService) fetchWithFreshSession(ctx context.Context, imageURL, refererURL, cookie string, retryCount int) (*ProxyResult, error) {
	session := s.clientFactory.NewAzureSession(ctx, proxyTimeout)
	defer session.Close()
	return s.doFetch(ctx, session, imageURL, refererURL, cookie, retryCount)
}

// doFetch performs the actual HTTP request with the given session
func (s *proxyService) doFetch(ctx context.Context, session *azuretls.Session, imageURL, refererURL, cookie string, retryCount int) (*ProxyResult, error) {
	parsedURL, err := url.Parse(imageURL)
	if err != nil {
		return nil, ErrInvalidURL
	}

	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return nil, ErrInvalidProtocol
	}

	// Build Referer
	referer := buildReferer(refererURL, parsedURL)

	// Build headers
	headers := azuretls.OrderedHeaders{
		{"accept", "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"},
		{"accept-language", "zh-CN,zh;q=0.9"},
		{"referer", referer},
		{"sec-ch-ua", config.ChromeSecChUa},
		{"sec-ch-ua-mobile", "?0"},
		{"sec-ch-ua-platform", `"Windows"`},
		{"sec-fetch-dest", "image"},
		{"sec-fetch-mode", "no-cors"},
		{"sec-fetch-site", "cross-site"},
		{"user-agent", config.ChromeUserAgent},
	}

	// Add cookie
	requestHeaders := orderedHeadersToHTTPHeader(headers)
	if cookie != "" {
		headers = append(headers, []string{"cookie", cookie})
	} else {
		if cachedCookie := getCachedAnubisCookie(ctx, s.anubis, parsedURL.Host, requestHeaders); cachedCookie != "" {
			headers = append(headers, []string{"cookie", cachedCookie})
		}
	}

	resp, err := session.Do(&azuretls.Request{
		Method:         http.MethodGet,
		Url:            imageURL,
		OrderedHeaders: headers,
	})
	if err != nil {
		logger.Warn("proxy fetch failed", "module", "service", "action", "fetch", "resource", "proxy", "result", "failed", "host", parsedURL.Host, "error", err)
		return nil, fmt.Errorf("%w: %v", ErrFetchFailed, err)
	}

	if resp.StatusCode != http.StatusOK {
		logger.Error("proxy http error", "module", "service", "action", "fetch", "resource", "proxy", "result", "failed", "host", parsedURL.Host, "status_code", resp.StatusCode)
		return nil, fmt.Errorf("%w: %d", ErrFetchFailed, resp.StatusCode)
	}

	data := resp.Body

	newCookie, anubisErr := trySolveAnubisChallenge(ctx, s.anubis, data, imageURL, cookiesFromMap(resp.Cookies), requestHeaders, retryCount)
	switch {
	case anubisErr == nil:
		return s.fetchWithFreshSession(ctx, imageURL, refererURL, newCookie, retryCount+1)
	case errors.Is(anubisErr, errAnubisNotPage):
		// Not an Anubis page; continue normal proxy response handling.
	case errors.Is(anubisErr, errAnubisRejected):
		logger.Warn("proxy upstream rejected", "module", "service", "action", "fetch", "resource", "proxy", "result", "failed", "host", parsedURL.Host)
		return nil, ErrUpstreamRejected
	case errors.Is(anubisErr, errAnubisRetryExceeded):
		logger.Warn("proxy anubis persists", "module", "service", "action", "fetch", "resource", "proxy", "result", "failed", "host", parsedURL.Host, "retry_count", retryCount)
		return nil, fmt.Errorf("%w: anubis challenge persists after %d retries", ErrFetchFailed, retryCount)
	default:
		logger.Warn("proxy anubis solve failed", "module", "service", "action", "fetch", "resource", "proxy", "result", "failed", "host", parsedURL.Host, "error", anubisErr)
		return nil, ErrFetchFailed
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	return &ProxyResult{
		Data:        data,
		ContentType: contentType,
	}, nil
}

// buildReferer constructs the Referer header value
func buildReferer(refererURL string, parsedURL *url.URL) string {
	if refererURL != "" {
		if parsed, err := url.Parse(refererURL); err == nil {
			return parsed.Scheme + "://" + parsed.Host + "/"
		}
	}
	return parsedURL.Scheme + "://" + parsedURL.Host + "/"
}
