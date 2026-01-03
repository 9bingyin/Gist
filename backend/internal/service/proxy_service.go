package service

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"github.com/Noooste/azuretls-client"

	"gist/backend/internal/config"
	"gist/backend/internal/service/anubis"
)

const proxyTimeout = 15 * time.Second

var (
	ErrInvalidURL      = fmt.Errorf("invalid URL")
	ErrInvalidProtocol = fmt.Errorf("invalid protocol")
	ErrRequestTimeout  = fmt.Errorf("request timeout")
	ErrFetchFailed     = fmt.Errorf("fetch failed")
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
	session *azuretls.Session
	anubis  *anubis.Solver
}

func NewProxyService(anubisSolver *anubis.Solver) ProxyService {
	session := azuretls.NewSession()
	session.Browser = azuretls.Chrome
	session.SetTimeout(proxyTimeout)

	return &proxyService{
		session: session,
		anubis:  anubisSolver,
	}
}

func (s *proxyService) Close() {
	if s.session != nil {
		s.session.Close()
	}
}

func (s *proxyService) FetchImage(ctx context.Context, imageURL, refererURL string) (*ProxyResult, error) {
	return s.fetchImageWithCookie(ctx, imageURL, refererURL, "")
}

func (s *proxyService) fetchImageWithCookie(ctx context.Context, imageURL, refererURL, cookie string) (*ProxyResult, error) {
	// Validate URL
	parsedURL, err := url.Parse(imageURL)
	if err != nil {
		return nil, ErrInvalidURL
	}

	// Only allow http/https
	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return nil, ErrInvalidProtocol
	}

	// Build Referer: prefer article URL (for CDN anti-hotlinking), fallback to image URL host
	var referer string
	if refererURL != "" {
		if parsed, err := url.Parse(refererURL); err == nil {
			referer = parsed.Scheme + "://" + parsed.Host + "/"
		}
	}
	if referer == "" {
		referer = parsedURL.Scheme + "://" + parsedURL.Host + "/"
	}

	// Build ordered headers matching Chrome
	headers := azuretls.OrderedHeaders{
		{"accept", "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"},
		{"accept-language", "zh-CN,zh;q=0.9"},
		{"referer", referer},
		{"sec-ch-ua", `"Google Chrome";v="135", "Chromium";v="135", "Not-A.Brand";v="8"`},
		{"sec-ch-ua-mobile", "?0"},
		{"sec-ch-ua-platform", `"Windows"`},
		{"sec-fetch-dest", "image"},
		{"sec-fetch-mode", "no-cors"},
		{"sec-fetch-site", "cross-site"},
		{"user-agent", config.ChromeUserAgent},
	}

	// Add cookie (either provided or from cache)
	if cookie != "" {
		headers = append(headers, []string{"cookie", cookie})
	} else if s.anubis != nil {
		if cachedCookie := s.anubis.GetCachedCookie(ctx, parsedURL.Host); cachedCookie != "" {
			headers = append(headers, []string{"cookie", cachedCookie})
		}
	}

	resp, err := s.session.Do(&azuretls.Request{
		Method:         http.MethodGet,
		Url:            imageURL,
		OrderedHeaders: headers,
	})
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrFetchFailed, err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%w: %d", ErrFetchFailed, resp.StatusCode)
	}

	data := resp.Body

	// Check if response is Anubis challenge (HTML instead of image)
	if s.anubis != nil && cookie == "" && anubis.IsAnubisChallenge(data) {
		var initialCookies []*http.Cookie
		for name, value := range resp.Cookies {
			initialCookies = append(initialCookies, &http.Cookie{Name: name, Value: value})
		}
		newCookie, solveErr := s.anubis.SolveFromBody(ctx, data, imageURL, initialCookies)
		if solveErr != nil {
			return nil, ErrFetchFailed
		}
		// Retry with the new cookie
		return s.fetchImageWithCookie(ctx, imageURL, refererURL, newCookie)
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
