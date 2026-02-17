package service

import (
	"context"
	"errors"
	"net/http"

	anubischallenge "gist/backend/internal/service/anubis"
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

func cookiesFromMap(cookies map[string]string) []*http.Cookie {
	if len(cookies) == 0 {
		return nil
	}
	result := make([]*http.Cookie, 0, len(cookies))
	for name, value := range cookies {
		result = append(result, &http.Cookie{Name: name, Value: value})
	}
	return result
}
