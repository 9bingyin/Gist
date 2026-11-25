package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/Noooste/azuretls-client"

	"gist/backend/internal/config"
	"gist/backend/pkg/network"
)

const (
	// Generous OOM circuit-breaker limits for full-body reads (not arbitrary product caps).
	maxFeedBodyBytes   int64 = 50 << 20 // 50 MB for RSS/Atom XML
	maxHTMLBodyBytes   int64 = 50 << 20 // 50 MB for readability HTML
	maxIconBodyBytes   int64 = 20 << 20 // 20 MB for icons
	maxAnubisBodyBytes int64 = 5 << 20  // 5 MB for Anubis challenge HTML
)

var errResponseTooLarge = errors.New("response body exceeds safety limit")

type httpFetchOptions struct {
	URL            string
	Timeout        time.Duration
	MaxBodyBytes   int64
	UserAgent      string
	FallbackUA     func(ctx context.Context) string
	ETag           string
	LastModified   string
	AcceptNotMod   bool
	ClientFactory  *network.ClientFactory
	Anubis         AnubisSolver
	OnFallbackUA   func(statusCode int)
	OnAnubisSolved func(host string)
}

type httpFetchResult struct {
	StatusCode   int
	Body         []byte
	Header       http.Header
	EffectiveURL string
	NotModified  bool
}

// readLimited reads up to limit bytes from r. If r yields more than limit bytes,
// it returns errResponseTooLarge to prevent OOM from malicious/corrupt streams.
func readLimited(r io.Reader, limit int64) ([]byte, error) {
	if limit <= 0 {
		return io.ReadAll(r)
	}
	data, err := io.ReadAll(io.LimitReader(r, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > limit {
		return nil, errResponseTooLarge
	}
	return data, nil
}

// fetchHTTPWithAnubis performs an iterative HTTP GET with optional fallback UA,
// Conditional GET, OOM body cap, and Anubis challenge solving. Each attempt closes
// its response body immediately before any retry.
func fetchHTTPWithAnubis(ctx context.Context, opts httpFetchOptions) (*httpFetchResult, error) {
	if _, err := network.ValidateFetchURL(opts.URL); err != nil {
		return nil, err
	}

	userAgent := opts.UserAgent
	if userAgent == "" {
		userAgent = config.DefaultUserAgent
	}

	cookie := ""
	triedFallback := false
	anubisRetries := 0

	for {
		res, nextUA, nextCookie, retry, err := doSingleHTTPFetch(ctx, opts, userAgent, cookie, triedFallback, anubisRetries)
		if err != nil {
			return nil, err
		}
		if !retry {
			return res, nil
		}
		if nextUA != "" && nextUA != userAgent {
			userAgent = nextUA
			triedFallback = true
		}
		if nextCookie != "" {
			cookie = nextCookie
			anubisRetries++
		}
	}
}

func doSingleHTTPFetch(
	ctx context.Context,
	opts httpFetchOptions,
	userAgent string,
	cookie string,
	triedFallback bool,
	anubisRetries int,
) (res *httpFetchResult, nextUA string, nextCookie string, retry bool, err error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, opts.URL, nil)
	if err != nil {
		return nil, "", "", false, err
	}
	req.Header.Set("User-Agent", userAgent)

	// Conditional GET headers are only sent on the initial non-retry attempt.
	if anubisRetries == 0 && !triedFallback {
		if opts.ETag != "" {
			req.Header.Set("If-None-Match", opts.ETag)
		}
		if opts.LastModified != "" {
			req.Header.Set("If-Modified-Since", opts.LastModified)
		}
	}

	if cookie == "" {
		host := network.ExtractHost(opts.URL)
		if cached := getCachedAnubisCookie(ctx, opts.Anubis, host, req.Header); cached != "" {
			cookie = cached
		}
	}
	if cookie != "" {
		req.Header.Set("Cookie", cookie)
	}

	httpClient := opts.ClientFactory.NewHTTPClient(ctx, opts.Timeout)
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, "", "", false, err
	}
	defer resp.Body.Close()

	effectiveURL := opts.URL
	if resp.Request != nil && resp.Request.URL != nil {
		effectiveURL = resp.Request.URL.String()
	}

	if opts.AcceptNotMod && resp.StatusCode == http.StatusNotModified {
		return &httpFetchResult{
			StatusCode:   resp.StatusCode,
			Header:       resp.Header.Clone(),
			EffectiveURL: effectiveURL,
			NotModified:  true,
		}, "", "", false, nil
	}

	// Read body first (bounded) so Anubis challenge pages served with 4xx/5xx or 200
	// are always detected before failing on status code.
	readLimit := opts.MaxBodyBytes
	if resp.StatusCode >= http.StatusBadRequest && (readLimit <= 0 || readLimit > maxAnubisBodyBytes) {
		readLimit = maxAnubisBodyBytes
	}
	body, readErr := readLimited(resp.Body, readLimit)
	if readErr != nil {
		return nil, "", "", false, readErr
	}

	// Check Anubis challenge before status code rejection.
	if opts.Anubis != nil {
		solvedCookie, anubisErr := trySolveAnubisChallenge(ctx, opts.Anubis, body, effectiveURL, resp.Cookies(), req.Header.Clone(), anubisRetries)
		switch {
		case anubisErr == nil:
			if opts.OnAnubisSolved != nil {
				opts.OnAnubisSolved(network.ExtractHost(effectiveURL))
			}
			return nil, "", solvedCookie, true, nil
		case errors.Is(anubisErr, errAnubisNotPage):
			// Continue normal HTTP handling.
		case errors.Is(anubisErr, errAnubisRejected):
			return nil, "", "", false, ErrUpstreamRejected
		case errors.Is(anubisErr, errAnubisRetryExceeded):
			return nil, "", "", false, fmt.Errorf("anubis challenge persists after %d retries", anubisRetries)
		default:
			return nil, "", "", false, fmt.Errorf("anubis solve failed: %w", anubisErr)
		}
	}

	// On HTTP 4xx/5xx, try fallback UA once if configured.
	if resp.StatusCode >= http.StatusBadRequest && !triedFallback && opts.FallbackUA != nil {
		if fallback := strings.TrimSpace(opts.FallbackUA(ctx)); fallback != "" && fallback != userAgent {
			if opts.OnFallbackUA != nil {
				opts.OnFallbackUA(resp.StatusCode)
			}
			return nil, fallback, "", true, nil
		}
	}

	return &httpFetchResult{
		StatusCode:   resp.StatusCode,
		Body:         body,
		Header:       resp.Header.Clone(),
		EffectiveURL: effectiveURL,
	}, "", "", false, nil
}

type azureFetchOptions struct {
	URL           string
	Timeout       time.Duration
	MaxBodyBytes  int64
	Headers       azuretls.OrderedHeaders
	ClientFactory *network.ClientFactory
	Anubis        AnubisSolver
}

type azureFetchResult struct {
	StatusCode   int
	Body         []byte
	EffectiveURL string
}

// fetchAzureWithAnubis performs an iterative Chrome-fingerprinted GET via azuretls
// with OOM protection, Anubis detection before status-code rejection, and immediate
// session cleanup per attempt.
func fetchAzureWithAnubis(ctx context.Context, opts azureFetchOptions) (*azureFetchResult, error) {
	parsedURL, err := network.ValidateFetchURL(opts.URL)
	if err != nil {
		return nil, err
	}

	cookie := ""
	for anubisRetries := 0; ; {
		res, nextCookie, retry, err := doSingleAzureFetch(ctx, opts, parsedURL.Host, cookie, anubisRetries)
		if err != nil {
			return nil, err
		}
		if !retry {
			return res, nil
		}
		cookie = nextCookie
		anubisRetries++
	}
}

func doSingleAzureFetch(
	ctx context.Context,
	opts azureFetchOptions,
	host string,
	cookie string,
	anubisRetries int,
) (*azureFetchResult, string, bool, error) {
	session, err := opts.ClientFactory.NewAzureSession(ctx, opts.Timeout)
	if err != nil {
		return nil, "", false, err
	}
	defer session.Close()

	headers := make(azuretls.OrderedHeaders, len(opts.Headers), len(opts.Headers)+1)
	copy(headers, opts.Headers)
	requestHeaders := orderedHeadersToHTTPHeader(headers)

	if cookie != "" {
		headers = append(headers, []string{"cookie", cookie})
	} else if cached := getCachedAnubisCookie(ctx, opts.Anubis, host, requestHeaders); cached != "" {
		headers = append(headers, []string{"cookie", cached})
	}

	resp, err := session.Do(&azuretls.Request{
		Method:         http.MethodGet,
		Url:            opts.URL,
		OrderedHeaders: headers,
		IgnoreBody:     true,
	})
	if err != nil {
		return nil, "", false, err
	}
	defer resp.CloseBody()

	effectiveURL := opts.URL
	if strings.TrimSpace(resp.Url) != "" {
		if _, vErr := network.ValidateFetchURL(resp.Url); vErr != nil {
			return nil, "", false, vErr
		}
		effectiveURL = resp.Url
	}

	readLimit := opts.MaxBodyBytes
	if resp.StatusCode != http.StatusOK && (readLimit <= 0 || readLimit > maxAnubisBodyBytes) {
		readLimit = maxAnubisBodyBytes
	}

	var body []byte
	if resp.RawBody != nil {
		body, err = readLimited(resp.RawBody, readLimit)
		if err != nil {
			return nil, "", false, err
		}
	} else {
		body = resp.Body
	}

	// Detect Anubis before failing on status code.
	if opts.Anubis != nil {
		solvedCookie, anubisErr := trySolveAnubisChallenge(ctx, opts.Anubis, body, effectiveURL, cookiesFromMap(resp.Cookies), requestHeaders, anubisRetries)
		switch {
		case anubisErr == nil:
			return nil, solvedCookie, true, nil
		case errors.Is(anubisErr, errAnubisNotPage):
			// Continue normal response handling.
		case errors.Is(anubisErr, errAnubisRejected):
			return nil, "", false, ErrUpstreamRejected
		case errors.Is(anubisErr, errAnubisRetryExceeded):
			return nil, "", false, fmt.Errorf("anubis challenge persists after %d retries", anubisRetries)
		default:
			return nil, "", false, fmt.Errorf("anubis solve failed: %w", anubisErr)
		}
	}

	return &azureFetchResult{
		StatusCode:   resp.StatusCode,
		Body:         body,
		EffectiveURL: effectiveURL,
	}, "", false, nil
}

func isTimeoutError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}
	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return true
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "timeout") || strings.Contains(msg, "deadline exceeded")
}
