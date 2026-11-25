//go:generate mockgen -source=$GOFILE -destination=mock/$GOFILE -package=mock
package service

import (
	"bytes"
	"context"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/Noooste/azuretls-client"
	"github.com/gabriel-vasile/mimetype"

	"gist/backend/internal/config"
	"gist/backend/pkg/logger"
	"gist/backend/pkg/network"
)

const (
	proxyTimeout     = 30 * time.Second
	proxySniffBytes  = 4096
	proxyMaxSVGProbe = 256 << 10 // 256 KB probe for XML/SVG with long headers
)

var (
	ErrInvalidURL       = fmt.Errorf("invalid URL")
	ErrInvalidProtocol  = fmt.Errorf("invalid protocol")
	ErrRequestTimeout   = fmt.Errorf("request timeout")
	ErrFetchFailed      = fmt.Errorf("fetch failed")
	ErrUpstreamRejected = fmt.Errorf("upstream rejected")
	ErrInvalidImage     = fmt.Errorf("invalid image")
)

type ProxyResult struct {
	Data        []byte
	Body        io.ReadCloser
	ContentType string
}

type ProxyService interface {
	FetchImage(ctx context.Context, imageURL, refererURL string) (*ProxyResult, error)
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

type sessionStreamCloser struct {
	reader  io.Reader
	rawBody io.Closer
	session *azuretls.Session
}

func (s *sessionStreamCloser) Read(p []byte) (int, error) {
	return s.reader.Read(p)
}

func (s *sessionStreamCloser) Close() error {
	var err error
	if s.rawBody != nil {
		err = s.rawBody.Close()
	}
	if s.session != nil {
		s.session.Close()
	}
	return err
}

func (s *proxyService) FetchImage(ctx context.Context, imageURL, refererURL string) (*ProxyResult, error) {
	parsedURL, err := validateProxyImageURL(imageURL)
	if err != nil {
		return nil, err
	}

	referer := buildReferer(refererURL, parsedURL)
	baseHeaders := azuretls.OrderedHeaders{
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

	cookie := ""
	for retryCount := 0; ; {
		result, nextCookie, retry, err := s.doFetchOnce(ctx, imageURL, parsedURL.Host, baseHeaders, cookie, retryCount)
		if err != nil {
			return nil, err
		}
		if !retry {
			return result, nil
		}
		cookie = nextCookie
		retryCount++
	}
}

func validateProxyImageURL(imageURL string) (*url.URL, error) {
	trimmed := strings.TrimSpace(imageURL)
	if trimmed == "" {
		return nil, ErrInvalidURL
	}
	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Host == "" {
		return nil, ErrInvalidURL
	}
	scheme := strings.ToLower(parsed.Scheme)
	if scheme != "http" && scheme != "https" {
		return nil, ErrInvalidProtocol
	}
	if _, err := network.ValidateFetchURL(trimmed); err != nil {
		if errors.Is(err, network.ErrBlockedAddress) {
			return nil, fmt.Errorf("%w: %v", ErrInvalidURL, err)
		}
		return nil, ErrInvalidURL
	}
	return parsed, nil
}

func (s *proxyService) doFetchOnce(
	ctx context.Context,
	imageURL string,
	host string,
	baseHeaders azuretls.OrderedHeaders,
	cookie string,
	retryCount int,
) (*ProxyResult, string, bool, error) {
	session, err := s.clientFactory.NewAzureSession(ctx, proxyTimeout)
	if err != nil {
		return nil, "", false, fmt.Errorf("%w: %v", ErrFetchFailed, err)
	}
	keepSessionOpen := false
	defer func() {
		if !keepSessionOpen {
			session.Close()
		}
	}()

	headers := make(azuretls.OrderedHeaders, len(baseHeaders), len(baseHeaders)+1)
	copy(headers, baseHeaders)
	requestHeaders := orderedHeadersToHTTPHeader(headers)

	if cookie != "" {
		headers = append(headers, []string{"cookie", cookie})
	} else if cached := getCachedAnubisCookie(ctx, s.anubis, host, requestHeaders); cached != "" {
		headers = append(headers, []string{"cookie", cached})
	}

	resp, err := session.Do(&azuretls.Request{
		Method:         http.MethodGet,
		Url:            imageURL,
		OrderedHeaders: headers,
		IgnoreBody:     true,
	})
	if err != nil {
		if errors.Is(err, network.ErrBlockedAddress) || errors.Is(err, network.ErrInvalidURL) {
			return nil, "", false, fmt.Errorf("%w: %v", ErrInvalidURL, err)
		}
		if isTimeoutError(err) {
			logger.Warn("proxy fetch timeout", "module", "service", "action", "fetch", "resource", "proxy", "result", "failed", "host", host, "error", err)
			return nil, "", false, fmt.Errorf("%w: %v", ErrRequestTimeout, err)
		}
		logger.Warn("proxy fetch failed", "module", "service", "action", "fetch", "resource", "proxy", "result", "failed", "host", host, "error", err)
		return nil, "", false, fmt.Errorf("%w: %v", ErrFetchFailed, err)
	}

	closeResp := true
	defer func() {
		if closeResp {
			_ = resp.CloseBody()
		}
	}()

	effectiveURL := imageURL
	if strings.TrimSpace(resp.Url) != "" {
		if _, vErr := network.ValidateFetchURL(resp.Url); vErr != nil {
			return nil, "", false, fmt.Errorf("%w: %v", ErrInvalidURL, vErr)
		}
		effectiveURL = resp.Url
	}

	upstreamCT := strings.ToLower(resp.Header.Get("Content-Type"))

	// If response looks like HTML or a non-200 error, read a bounded buffer to check for Anubis first.
	isLikelyHTML := strings.Contains(upstreamCT, "text/html") || strings.Contains(upstreamCT, "application/xhtml")
	if resp.StatusCode != http.StatusOK || (isLikelyHTML && s.anubis != nil) {
		var body []byte
		if resp.RawBody != nil {
			body, err = readLimited(resp.RawBody, maxAnubisBodyBytes)
			if err != nil {
				return nil, "", false, fmt.Errorf("%w: %v", ErrFetchFailed, err)
			}
		} else {
			body = resp.Body
		}

		if s.anubis != nil {
			newCookie, anubisErr := trySolveAnubisChallenge(ctx, s.anubis, body, effectiveURL, cookiesFromMap(resp.Cookies), requestHeaders, retryCount)
			switch {
			case anubisErr == nil:
				return nil, newCookie, true, nil
			case errors.Is(anubisErr, errAnubisNotPage):
			case errors.Is(anubisErr, errAnubisRejected):
				logger.Warn("proxy upstream rejected", "module", "service", "action", "fetch", "resource", "proxy", "result", "failed", "host", host)
				return nil, "", false, ErrUpstreamRejected
			case errors.Is(anubisErr, errAnubisRetryExceeded):
				logger.Warn("proxy anubis persists", "module", "service", "action", "fetch", "resource", "proxy", "result", "failed", "host", host, "retry_count", retryCount)
				return nil, "", false, fmt.Errorf("%w: anubis challenge persists after %d retries", ErrFetchFailed, retryCount)
			default:
				logger.Warn("proxy anubis solve failed", "module", "service", "action", "fetch", "resource", "proxy", "result", "failed", "host", host, "error", anubisErr)
				return nil, "", false, ErrFetchFailed
			}
		}

		if resp.StatusCode != http.StatusOK {
			logger.Error("proxy http error", "module", "service", "action", "fetch", "resource", "proxy", "result", "failed", "host", host, "status_code", resp.StatusCode)
			return nil, "", false, fmt.Errorf("%w: %d", ErrFetchFailed, resp.StatusCode)
		}

		contentType, err := detectProxyImageContentType(body)
		if err != nil {
			logger.Warn("proxy invalid image", "module", "service", "action", "fetch", "resource", "proxy", "result", "failed", "host", host, "error", err)
			return nil, "", false, err
		}
		return &ProxyResult{
			Data:        body,
			Body:        io.NopCloser(bytes.NewReader(body)),
			ContentType: contentType,
		}, "", false, nil
	}

	// Streaming path for normal 200 image responses: sniff only the header prefix and stream the rest.
	var src io.Reader
	if resp.RawBody != nil {
		src = resp.RawBody
	} else {
		src = bytes.NewReader(resp.Body)
	}

	prefix, err := readAtMost(src, proxySniffBytes)
	if err != nil {
		return nil, "", false, fmt.Errorf("%w: %v", ErrFetchFailed, err)
	}

	// Check for Anubis when server omitted Content-Type on an HTML challenge page.
	if s.anubis != nil && bytes.Contains(prefix, []byte("anubis_challenge")) {
		rest, err := readLimited(src, maxAnubisBodyBytes-int64(len(prefix)))
		if err != nil {
			return nil, "", false, fmt.Errorf("%w: %v", ErrFetchFailed, err)
		}
		fullBody := append(prefix, rest...)
		newCookie, anubisErr := trySolveAnubisChallenge(ctx, s.anubis, fullBody, effectiveURL, cookiesFromMap(resp.Cookies), requestHeaders, retryCount)
		switch {
		case anubisErr == nil:
			return nil, newCookie, true, nil
		case errors.Is(anubisErr, errAnubisNotPage):
			prefix = fullBody
			src = bytes.NewReader(nil)
		case errors.Is(anubisErr, errAnubisRejected):
			logger.Warn("proxy upstream rejected", "module", "service", "action", "fetch", "resource", "proxy", "result", "failed", "host", host)
			return nil, "", false, ErrUpstreamRejected
		case errors.Is(anubisErr, errAnubisRetryExceeded):
			logger.Warn("proxy anubis persists", "module", "service", "action", "fetch", "resource", "proxy", "result", "failed", "host", host, "retry_count", retryCount)
			return nil, "", false, fmt.Errorf("%w: anubis challenge persists after %d retries", ErrFetchFailed, retryCount)
		default:
			logger.Warn("proxy anubis solve failed", "module", "service", "action", "fetch", "resource", "proxy", "result", "failed", "host", host, "error", anubisErr)
			return nil, "", false, ErrFetchFailed
		}
	}

	contentType, err := detectProxyImageContentType(prefix)
	if err != nil && looksLikeXML(prefix, upstreamCT) {
		// SVG files with long XML comments/headers may need a larger probe window.
		more, readErr := readAtMost(src, proxyMaxSVGProbe-len(prefix))
		if readErr == nil && len(more) > 0 {
			prefix = append(prefix, more...)
			contentType, err = detectProxyImageContentType(prefix)
		}
	}
	if err != nil {
		logger.Warn("proxy invalid image", "module", "service", "action", "fetch", "resource", "proxy", "result", "failed", "host", host, "error", err)
		return nil, "", false, err
	}

	// Hand ownership of resp.RawBody and session to the caller via ProxyResult.Body.
	closeResp = false
	keepSessionOpen = true

	stream := &sessionStreamCloser{
		reader:  io.MultiReader(bytes.NewReader(prefix), src),
		rawBody: resp.RawBody,
		session: session,
	}

	return &ProxyResult{
		Body:        stream,
		ContentType: contentType,
	}, "", false, nil
}

func readAtMost(r io.Reader, n int) ([]byte, error) {
	if n <= 0 {
		return nil, nil
	}
	return io.ReadAll(io.LimitReader(r, int64(n)))
}

func looksLikeXML(prefix []byte, upstreamCT string) bool {
	if strings.Contains(upstreamCT, "xml") || strings.Contains(upstreamCT, "svg") {
		return true
	}
	trimmed := bytes.TrimSpace(prefix)
	return bytes.HasPrefix(trimmed, []byte("<?xml")) ||
		bytes.HasPrefix(trimmed, []byte("<!DOCTYPE")) ||
		bytes.HasPrefix(trimmed, []byte("<!--")) ||
		bytes.HasPrefix(trimmed, []byte("<svg"))
}

func detectProxyImageContentType(data []byte) (string, error) {
	mtype := mimetype.Detect(data)
	contentType := strings.ToLower(mtype.String())
	if strings.HasPrefix(contentType, "image/") {
		return contentType, nil
	}
	if isSVGDocument(data) {
		return "image/svg+xml", nil
	}
	return "", fmt.Errorf("%w: %s", ErrInvalidImage, contentType)
}

func isSVGDocument(data []byte) bool {
	decoder := xml.NewDecoder(bytes.NewReader(data))
	for {
		token, err := decoder.Token()
		if err != nil {
			return false
		}
		if start, ok := token.(xml.StartElement); ok {
			return strings.EqualFold(start.Name.Local, "svg")
		}
	}
}

// buildReferer constructs a valid HTTP(S) origin Referer header value.
func buildReferer(refererURL string, parsedURL *url.URL) string {
	if refererURL != "" {
		if parsed, err := url.Parse(refererURL); err == nil {
			scheme := strings.ToLower(parsed.Scheme)
			if (scheme == "http" || scheme == "https") && parsed.Host != "" {
				return scheme + "://" + parsed.Host + "/"
			}
		}
	}
	return parsedURL.Scheme + "://" + parsedURL.Host + "/"
}
