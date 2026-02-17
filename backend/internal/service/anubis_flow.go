package service

import (
	"context"
	"errors"
	"net/http"
	"sort"
	"strings"

	anubischallenge "gist/backend/internal/service/anubis"
	"github.com/Noooste/azuretls-client"
)

const anubisMaxRetries = 2

var (
	errAnubisNotPage       = errors.New("anubis: not challenge page")
	errAnubisRejected      = errors.New("anubis: upstream rejected")
	errAnubisRetryExceeded = errors.New("anubis: retry exceeded")
)

// AnubisSolver defines the minimal contract service layer needs from the solver.
type AnubisSolver interface {
	GetCachedCookieWithHeaders(ctx context.Context, host string, requestHeaders http.Header) string
	SolveFromBodyWithHeaders(ctx context.Context, body []byte, originalURL string, initialCookies []*http.Cookie, requestHeaders http.Header) (string, error)
}

func getCachedAnubisCookie(ctx context.Context, solver AnubisSolver, host string, headers http.Header) string {
	if solver == nil {
		return ""
	}
	return solver.GetCachedCookieWithHeaders(ctx, host, headers)
}

// trySolveAnubisChallenge centralizes challenge detection and retry guards.
//
// Return contract:
//   - errAnubisNotPage: body is not an Anubis page, caller should continue normal parsing.
//   - errAnubisRejected: body is an Anubis rejection page (challenge is not solvable).
//   - errAnubisRetryExceeded: retry budget exhausted.
//   - nil error with non-empty cookie: challenge solved successfully.
//   - other error: solver failed while solving/submitting.
func trySolveAnubisChallenge(
	ctx context.Context,
	solver AnubisSolver,
	body []byte,
	originalURL string,
	initialCookies []*http.Cookie,
	requestHeaders http.Header,
	retryCount int,
) (string, error) {
	if solver == nil || !anubischallenge.IsAnubisPage(body) {
		return "", errAnubisNotPage
	}
	if !anubischallenge.IsAnubisChallenge(body) {
		return "", errAnubisRejected
	}
	if retryCount >= anubisMaxRetries {
		return "", errAnubisRetryExceeded
	}
	return solver.SolveFromBodyWithHeaders(ctx, body, originalURL, initialCookies, requestHeaders)
}

func orderedHeadersToHTTPHeader(headers azuretls.OrderedHeaders) http.Header {
	result := make(http.Header, len(headers))
	for _, header := range headers {
		if len(header) < 2 {
			continue
		}
		key := strings.TrimSpace(header[0])
		value := strings.TrimSpace(header[1])
		if key == "" || value == "" {
			continue
		}
		result.Add(key, value)
	}
	return result
}

func cookiesFromMap(cookies map[string]string) []*http.Cookie {
	if len(cookies) == 0 {
		return nil
	}
	names := make([]string, 0, len(cookies))
	for name := range cookies {
		names = append(names, name)
	}
	sort.Strings(names)

	result := make([]*http.Cookie, 0, len(names))
	for _, name := range names {
		result = append(result, &http.Cookie{Name: name, Value: cookies[name]})
	}
	return result
}
