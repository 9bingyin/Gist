package anubis

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/Noooste/azuretls-client"

	"gist/backend/internal/config"
	"gist/backend/pkg/logger"
	"gist/backend/pkg/network"
)

const (
	solverTimeout = 30 * time.Second
	logModule     = "service"
	logResource   = "anubis"
)

var submitHeaderOrder = []string{
	"accept",
	"accept-language",
	"accept-encoding",
	"cache-control",
	"pragma",
	"priority",
	"sec-ch-ua",
	"sec-ch-ua-mobile",
	"sec-ch-ua-platform",
	"sec-ch-ua-arch",
	"sec-ch-ua-model",
	"sec-ch-ua-platform-version",
	"sec-fetch-dest",
	"sec-fetch-mode",
	"sec-fetch-site",
	"sec-fetch-user",
	"upgrade-insecure-requests",
	"referer",
	"user-agent",
}

// cookieProfileHeaders are used to namespace cookies by request fingerprint.
// This avoids cookie thrashing when multiple request profiles hit the same host.
var cookieProfileHeaders = []string{
	"user-agent",
	"accept",
	"accept-language",
	"accept-encoding",
	"sec-ch-ua",
	"sec-ch-ua-mobile",
	"sec-ch-ua-platform",
	"sec-ch-ua-arch",
	"sec-ch-ua-model",
	"sec-ch-ua-platform-version",
	"sec-fetch-dest",
	"sec-fetch-mode",
	"sec-fetch-site",
	"sec-fetch-user",
	"upgrade-insecure-requests",
	"priority",
}

// azureSession is an interface for azuretls session to allow testing
type azureSession interface {
	Do(req *azuretls.Request, args ...any) (*azuretls.Response, error)
	Close()
}

// newSessionFunc is a function type for creating new azure sessions
type newSessionFunc func(ctx context.Context, timeout time.Duration) azureSession

// Challenge represents the Anubis challenge structure
type Challenge struct {
	Rules struct {
		Algorithm  string `json:"algorithm"`
		Difficulty int    `json:"difficulty"`
	} `json:"rules"`
	Challenge struct {
		ID         string `json:"id"`
		RandomData string `json:"randomData"`
	} `json:"challenge"`
}

// Solver handles Anubis challenge detection and solving
type Solver struct {
	clientFactory *network.ClientFactory
	store         *Store
	mu            sync.Mutex
	solving       map[string]chan struct{} // cache_key -> done channel (prevents concurrent solving)
	newSession    newSessionFunc           // for testing injection
}

// NewSolver creates a new Anubis solver
func NewSolver(clientFactory *network.ClientFactory, store *Store) *Solver {
	return &Solver{
		clientFactory: clientFactory,
		store:         store,
		solving:       make(map[string]chan struct{}),
	}
}

// IsAnubisPage checks if the response body is any Anubis page (challenge or rejection).
func IsAnubisPage(body []byte) bool {
	return bytes.Contains(body, []byte(`id="anubis_challenge"`))
}

// IsAnubisChallenge checks if the response body is a solvable Anubis challenge.
// Returns false for rejection pages where challenge is null.
func IsAnubisChallenge(body []byte) bool {
	if !IsAnubisPage(body) {
		return false
	}
	// Rejection pages have null challenge, not solvable
	return !nullChallengeRegex.Match(body)
}

// GetCachedCookie returns the cached cookie for the given host if valid
func (s *Solver) GetCachedCookie(ctx context.Context, host string) string {
	return s.GetCachedCookieWithHeaders(ctx, host, nil)
}

// GetCachedCookieWithHeaders returns cached cookie scoped by host and request fingerprint.
func (s *Solver) GetCachedCookieWithHeaders(ctx context.Context, host string, requestHeaders http.Header) string {
	if s.store == nil {
		return ""
	}

	normalizedHost := normalizeHost(host)
	cacheKey := buildCookieCacheKey(normalizedHost, requestHeaders)

	if cacheKey != "" && cacheKey != normalizedHost {
		cookie, err := s.store.GetCookie(ctx, cacheKey)
		if err == nil && cookie != "" {
			logger.Debug("anubis cookie cache hit",
				"module", logModule,
				"action", "fetch",
				"resource", logResource,
				"result", "ok",
				"host", normalizedHost,
				"scope", "profile",
			)
			return cookie
		}
	}

	cookie, err := s.store.GetCookie(ctx, normalizedHost)
	if err == nil && cookie != "" {
		logger.Debug("anubis cookie cache hit",
			"module", logModule,
			"action", "fetch",
			"resource", logResource,
			"result", "ok",
			"host", normalizedHost,
			"scope", "host",
		)
		return cookie
	}

	logger.Debug("anubis cookie cache miss",
		"module", logModule,
		"action", "fetch",
		"resource", logResource,
		"result", "skipped",
		"host", normalizedHost,
	)
	return ""
}

// SolveFromBody detects and solves Anubis challenge from response body
// Returns the cookie string if successful, empty string if not an Anubis challenge
// initialCookies are the cookies received from the initial request (needed for session)
func (s *Solver) SolveFromBody(ctx context.Context, body []byte, originalURL string, initialCookies []*http.Cookie) (string, error) {
	return s.SolveFromBodyWithHeaders(ctx, body, originalURL, initialCookies, nil)
}

// SolveFromBodyWithHeaders detects and solves Anubis challenge from response body.
// requestHeaders should be the original request headers that triggered the challenge.
func (s *Solver) SolveFromBodyWithHeaders(ctx context.Context, body []byte, originalURL string, initialCookies []*http.Cookie, requestHeaders http.Header) (string, error) {
	if !IsAnubisChallenge(body) {
		return "", nil
	}

	host := normalizeHost(extractHost(originalURL))
	cacheKey := buildCookieCacheKey(host, requestHeaders)
	if cacheKey == "" {
		cacheKey = host
	}

	// Check if another goroutine is already solving for this request profile.
	s.mu.Lock()
	if ch, ok := s.solving[cacheKey]; ok {
		s.mu.Unlock()
		logger.Debug("anubis waiting for ongoing solve",
			"module", "service",
			"action", "solve",
			"resource", "anubis",
			"result", "ok",
			"host", host,
		)
		select {
		case <-ch:
			// Small delay to let the cookie propagate and avoid thundering herd
			time.Sleep(100 * time.Millisecond)
			// Solving completed, get cookie from cache
			if cookie := s.GetCachedCookieWithHeaders(ctx, host, requestHeaders); cookie != "" {
				return cookie, nil
			}
			// Cache miss after solve - this shouldn't happen normally
			return "", fmt.Errorf("anubis solve completed but no cookie cached for %s", host)
		case <-ctx.Done():
			return "", ctx.Err()
		}
	}

	// Mark this profile as being solved
	done := make(chan struct{})
	s.solving[cacheKey] = done
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		delete(s.solving, cacheKey)
		close(done) // Notify waiting goroutines
		s.mu.Unlock()
	}()

	// Parse the challenge JSON from HTML
	challenge, err := parseChallenge(body)
	if err != nil {
		return "", fmt.Errorf("parse anubis challenge: %w", err)
	}

	logger.Debug("anubis detected challenge",
		"module", "service",
		"action", "solve",
		"resource", "anubis",
		"result", "ok",
		"host", extractHost(originalURL),
		"algorithm", challenge.Rules.Algorithm,
		"difficulty", challenge.Rules.Difficulty,
	)

	// Solve the challenge based on algorithm type
	result, err := solveChallenge(ctx, challenge)
	if err != nil {
		return "", fmt.Errorf("solve anubis challenge: %w", err)
	}

	// Submit the solution (pass initial cookies for session)
	cookie, expiresAt, err := s.submit(ctx, originalURL, challenge, result, initialCookies, requestHeaders)
	if err != nil {
		return "", fmt.Errorf("submit anubis solution: %w", err)
	}

	s.cacheSolvedCookie(ctx, host, cacheKey, cookie, expiresAt)

	return cookie, nil
}

func (s *Solver) cacheSolvedCookie(ctx context.Context, host, cacheKey, cookie string, expiresAt time.Time) {
	if s.store == nil || cacheKey == "" {
		return
	}

	if err := s.store.SetCookie(ctx, cacheKey, cookie, expiresAt); err != nil {
		logger.Warn("anubis failed to cache cookie",
			"module", logModule,
			"action", "save",
			"resource", logResource,
			"result", "failed",
			"host", host,
			"error", err,
		)
		return
	}

	logger.Debug("anubis cached cookie",
		"module", logModule,
		"action", "save",
		"resource", logResource,
		"result", "ok",
		"host", host,
		"expires", expiresAt.Format(time.RFC3339),
	)

	// Keep a host-level fallback entry for callers without a stable header profile.
	if host == "" || cacheKey == host {
		return
	}

	if err := s.store.SetCookie(ctx, host, cookie, expiresAt); err != nil {
		logger.Warn("anubis failed to cache host fallback",
			"module", logModule,
			"action", "save",
			"resource", logResource,
			"result", "failed",
			"host", host,
			"error", err,
		)
	}
}

// challengeRegex extracts the JSON from the anubis_challenge script tag
var challengeRegex = regexp.MustCompile(`<script id="anubis_challenge" type="application/json">([^<]+)</script>`)

var nullChallengeRegex = regexp.MustCompile(`(?s)<script id="anubis_challenge" type="application/json">\s*null\s*</script>`)

// parseChallenge extracts the Anubis challenge from HTML body
func parseChallenge(body []byte) (*Challenge, error) {
	matches := challengeRegex.FindSubmatch(body)
	if len(matches) < 2 {
		return nil, fmt.Errorf("challenge JSON not found in response")
	}

	var challenge Challenge
	if err := json.Unmarshal(matches[1], &challenge); err != nil {
		return nil, fmt.Errorf("unmarshal challenge: %w", err)
	}

	if challenge.Challenge.RandomData == "" {
		return nil, fmt.Errorf("challenge randomData is empty")
	}

	return &challenge, nil
}

// solveResult holds the result of solving an Anubis challenge
type solveResult struct {
	Hash    string // The computed hash
	Nonce   int    // Nonce (only for proofofwork algorithms)
	Elapsed int64  // Elapsed time in milliseconds (only for proofofwork)
}

// solveChallenge solves the Anubis challenge based on algorithm type.
// - preact: SHA256(randomData) + wait difficulty*80ms, param: result
// - metarefresh: return randomData + wait difficulty*800ms, param: challenge
// - fast/slow (proofofwork): iterate SHA256(randomData+nonce), params: response, nonce, elapsedTime
func solveChallenge(ctx context.Context, challenge *Challenge) (solveResult, error) {
	randomData := challenge.Challenge.RandomData
	difficulty := challenge.Rules.Difficulty
	algorithm := challenge.Rules.Algorithm

	switch algorithm {
	case "preact":
		return solvePreact(ctx, randomData, difficulty)
	case "metarefresh":
		return solveMetaRefresh(ctx, randomData, difficulty)
	case "fast", "slow":
		return solveProofOfWork(ctx, randomData, difficulty)
	default:
		// Default to preact for unknown algorithms
		logger.Warn("anubis unknown algorithm, using preact",
			"module", "service",
			"action", "solve",
			"resource", "anubis",
			"result", "failed",
			"algorithm", algorithm,
		)
		return solvePreact(ctx, randomData, difficulty)
	}
}

// solvePreact implements the preact algorithm: SHA256(randomData) + wait difficulty*80ms
func solvePreact(ctx context.Context, randomData string, difficulty int) (solveResult, error) {
	// Compute simple SHA256(randomData)
	h := sha256.Sum256([]byte(randomData))
	hash := hex.EncodeToString(h[:])

	// Wait required time: difficulty * 80ms (server validates this)
	waitTime := time.Duration(difficulty)*80*time.Millisecond + 50*time.Millisecond
	logger.Debug("anubis preact: waiting",
		"module", "service",
		"action", "solve",
		"resource", "anubis",
		"result", "ok",
		"duration_ms", waitTime.Milliseconds(),
	)

	select {
	case <-time.After(waitTime):
		logger.Debug("anubis preact solved",
			"module", "service",
			"action", "solve",
			"resource", "anubis",
			"result", "ok",
			"hash", truncateForLog(hash),
		)
		return solveResult{Hash: hash}, nil
	case <-ctx.Done():
		return solveResult{}, ctx.Err()
	}
}

// solveMetaRefresh implements the metarefresh algorithm: return randomData + wait difficulty*800ms
func solveMetaRefresh(ctx context.Context, randomData string, difficulty int) (solveResult, error) {
	// Wait required time: difficulty * 800ms (server validates this)
	waitTime := time.Duration(difficulty)*800*time.Millisecond + 100*time.Millisecond
	logger.Debug("anubis metarefresh: waiting",
		"module", "service",
		"action", "solve",
		"resource", "anubis",
		"result", "ok",
		"duration_ms", waitTime.Milliseconds(),
	)

	select {
	case <-time.After(waitTime):
		// metarefresh returns randomData directly, not a hash
		logger.Debug("anubis metarefresh solved",
			"module", "service",
			"action", "solve",
			"resource", "anubis",
			"result", "ok",
			"data", truncateForLog(randomData),
		)
		return solveResult{Hash: randomData}, nil
	case <-ctx.Done():
		return solveResult{}, ctx.Err()
	}
}

// solveProofOfWork implements the proofofwork algorithm: iterate until enough leading zeros
func solveProofOfWork(ctx context.Context, randomData string, difficulty int) (solveResult, error) {
	startTime := time.Now()
	prefix := strings.Repeat("0", difficulty)

	for nonce := 0; ; nonce++ {
		// Check context cancellation periodically to avoid blocking
		if nonce%10000 == 0 {
			select {
			case <-ctx.Done():
				return solveResult{}, ctx.Err()
			default:
			}
		}

		input := fmt.Sprintf("%s%d", randomData, nonce)
		h := sha256.Sum256([]byte(input))
		hashHex := hex.EncodeToString(h[:])

		if strings.HasPrefix(hashHex, prefix) {
			elapsed := time.Since(startTime).Milliseconds()
			logger.Debug("anubis PoW solved",
				"module", "service",
				"action", "solve",
				"resource", "anubis",
				"result", "ok",
				"difficulty", difficulty,
				"nonce", nonce,
				"elapsed_ms", elapsed,
				"hash", truncateForLog(hashHex),
			)
			return solveResult{
				Hash:    hashHex,
				Nonce:   nonce,
				Elapsed: elapsed,
			}, nil
		}
	}
}

// submit sends the solution to Anubis and retrieves the cookie
func (s *Solver) submit(ctx context.Context, originalURL string, challenge *Challenge, result solveResult, initialCookies []*http.Cookie, requestHeaders http.Header) (string, time.Time, error) {
	// Parse the original URL to get the base
	parsed, err := url.Parse(originalURL)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("parse url: %w", err)
	}
	baseURL := fmt.Sprintf("%s://%s", parsed.Scheme, parsed.Host)

	// Build submission URL based on algorithm type
	var submitURL string
	algorithm := challenge.Rules.Algorithm

	switch algorithm {
	case "preact":
		// preact: uses 'result' parameter (SHA256 hash), no nonce/elapsedTime
		submitURL = fmt.Sprintf("%s/.within.website/x/cmd/anubis/api/pass-challenge?id=%s&redir=%s&result=%s",
			baseURL,
			url.QueryEscape(challenge.Challenge.ID),
			url.QueryEscape(parsed.RequestURI()),
			url.QueryEscape(result.Hash),
		)
	case "metarefresh":
		// metarefresh: uses 'challenge' parameter (raw randomData), no nonce/elapsedTime
		submitURL = fmt.Sprintf("%s/.within.website/x/cmd/anubis/api/pass-challenge?id=%s&redir=%s&challenge=%s",
			baseURL,
			url.QueryEscape(challenge.Challenge.ID),
			url.QueryEscape(parsed.RequestURI()),
			url.QueryEscape(result.Hash), // Hash field contains randomData for metarefresh
		)
	case "fast", "slow":
		// proofofwork: uses 'response', 'nonce', 'elapsedTime' parameters
		submitURL = fmt.Sprintf("%s/.within.website/x/cmd/anubis/api/pass-challenge?id=%s&response=%s&nonce=%d&redir=%s&elapsedTime=%d",
			baseURL,
			url.QueryEscape(challenge.Challenge.ID),
			url.QueryEscape(result.Hash),
			result.Nonce,
			url.QueryEscape(parsed.RequestURI()),
			result.Elapsed,
		)
	default:
		// Default to preact format
		submitURL = fmt.Sprintf("%s/.within.website/x/cmd/anubis/api/pass-challenge?id=%s&redir=%s&result=%s",
			baseURL,
			url.QueryEscape(challenge.Challenge.ID),
			url.QueryEscape(parsed.RequestURI()),
			url.QueryEscape(result.Hash),
		)
	}

	// Create azuretls session with Chrome fingerprint
	var session azureSession
	if s.newSession != nil {
		session = s.newSession(ctx, solverTimeout)
	} else {
		session = s.clientFactory.NewAzureSession(ctx, solverTimeout)
	}
	defer session.Close()

	// Reuse the original request fingerprint to avoid policyRule drift.
	headers := buildSubmitHeaders(requestHeaders)

	// Add initial cookies from the challenge request (required for session)
	if cookieHeader := formatCookieHeader(initialCookies); cookieHeader != "" {
		headers = upsertOrderedHeader(headers, "cookie", cookieHeader)
	}

	logger.Debug("anubis submitting solution",
		"module", "service",
		"action", "submit",
		"resource", "anubis",
		"result", "ok",
		"host", extractHost(submitURL),
	)

	// Send request with redirect disabled to capture Set-Cookie header
	resp, err := session.Do(&azuretls.Request{
		Method:           http.MethodGet,
		Url:              submitURL,
		OrderedHeaders:   headers,
		DisableRedirects: true,
	})
	if err != nil {
		logger.Debug("anubis submit request failed",
			"module", "service",
			"action", "submit",
			"resource", "anubis",
			"result", "failed",
			"error", err,
		)
		return "", time.Time{}, fmt.Errorf("submit request: %w", err)
	}

	logger.Debug("anubis submit response",
		"module", "service",
		"action", "submit",
		"resource", "anubis",
		"result", "ok",
		"status_code", resp.StatusCode,
		"cookies", len(resp.Cookies),
	)

	// Expected: 302 redirect with Set-Cookie
	if resp.StatusCode != http.StatusFound && resp.StatusCode != http.StatusOK {
		logger.Debug("anubis unexpected status",
			"module", "service",
			"action", "submit",
			"resource", "anubis",
			"result", "failed",
			"status_code", resp.StatusCode,
		)
		return "", time.Time{}, fmt.Errorf("unexpected status %d: %s", resp.StatusCode, string(resp.Body))
	}

	// Extract auth cookies from response (azuretls uses map[string]string)
	authCookieParts := extractAuthCookieParts(resp.Cookies)

	if len(authCookieParts) == 0 {
		logger.Debug("anubis no cookies found",
			"module", "service",
			"action", "submit",
			"resource", "anubis",
			"result", "failed",
			"all_cookies", resp.Cookies,
		)
		return "", time.Time{}, fmt.Errorf("no auth cookies in response")
	}
	sort.Strings(authCookieParts)

	// Default expiry (7 days) - azuretls cookies map doesn't include expiry info
	expiresAt := time.Now().Add(7 * 24 * time.Hour)

	cookie := strings.Join(authCookieParts, "; ")
	return cookie, expiresAt, nil
}

func buildSubmitHeaders(requestHeaders http.Header) azuretls.OrderedHeaders {
	if len(requestHeaders) == 0 {
		return defaultSubmitHeaders()
	}

	headers := make(azuretls.OrderedHeaders, 0, len(submitHeaderOrder))
	for _, key := range submitHeaderOrder {
		value := strings.TrimSpace(requestHeaders.Get(key))
		if value == "" {
			continue
		}
		headers = append(headers, []string{key, value})
	}

	if !hasOrderedHeader(headers, "user-agent") {
		headers = append(headers, []string{"user-agent", config.ChromeUserAgent})
	}

	if len(headers) == 0 {
		return defaultSubmitHeaders()
	}
	return headers
}

func hasOrderedHeader(headers azuretls.OrderedHeaders, key string) bool {
	for _, header := range headers {
		if len(header) < 2 {
			continue
		}
		if strings.EqualFold(header[0], key) {
			return true
		}
	}
	return false
}

func defaultSubmitHeaders() azuretls.OrderedHeaders {
	return azuretls.OrderedHeaders{
		{"accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7"},
		{"accept-language", "zh-CN,zh;q=0.9"},
		{"cache-control", "max-age=0"},
		{"sec-ch-ua", config.ChromeSecChUa},
		{"sec-ch-ua-mobile", "?0"},
		{"sec-ch-ua-platform", `"Windows"`},
		{"sec-fetch-dest", "document"},
		{"sec-fetch-mode", "navigate"},
		{"sec-fetch-site", "same-origin"},
		{"sec-fetch-user", "?1"},
		{"upgrade-insecure-requests", "1"},
		{"user-agent", config.ChromeUserAgent},
	}
}

func upsertOrderedHeader(headers azuretls.OrderedHeaders, key, value string) azuretls.OrderedHeaders {
	for i := range headers {
		if len(headers[i]) < 2 {
			continue
		}
		if strings.EqualFold(headers[i][0], key) {
			headers[i][1] = value
			return headers
		}
	}
	return append(headers, []string{key, value})
}

func formatCookieHeader(cookies []*http.Cookie) string {
	if len(cookies) == 0 {
		return ""
	}

	parts := make([]string, 0, len(cookies))
	for _, c := range cookies {
		if c == nil || strings.TrimSpace(c.Name) == "" {
			continue
		}
		parts = append(parts, fmt.Sprintf("%s=%s", c.Name, c.Value))
	}
	return strings.Join(parts, "; ")
}

func extractAuthCookieParts(cookies map[string]string) []string {
	parts := make([]string, 0, len(cookies))
	for name, value := range cookies {
		lowerName := strings.ToLower(name)
		if value == "" || strings.Contains(lowerName, "cookie-verification") {
			continue
		}
		if strings.HasSuffix(lowerName, "-auth") || strings.Contains(lowerName, "anubis") {
			parts = append(parts, fmt.Sprintf("%s=%s", name, value))
		}
	}
	sort.Strings(parts)
	return parts
}

// OrderedHeadersToHTTPHeader converts azuretls ordered headers to canonical http headers.
func OrderedHeadersToHTTPHeader(headers azuretls.OrderedHeaders) http.Header {
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

func buildCookieCacheKey(host string, requestHeaders http.Header) string {
	host = normalizeHost(host)
	if host == "" {
		return ""
	}
	if len(requestHeaders) == 0 {
		return host
	}

	var keyBuilder strings.Builder
	for _, key := range cookieProfileHeaders {
		value := strings.TrimSpace(requestHeaders.Get(key))
		if value == "" {
			continue
		}
		keyBuilder.WriteString(key)
		keyBuilder.WriteString("=")
		keyBuilder.WriteString(value)
		keyBuilder.WriteString("\n")
	}

	if keyBuilder.Len() == 0 {
		return host
	}

	sum := sha256.Sum256([]byte(keyBuilder.String()))
	// First 8 bytes are enough as a stable bucket key while keeping settings keys short.
	return host + "|" + hex.EncodeToString(sum[:8])
}

// extractHost returns the host from a URL string
func extractHost(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}
	return u.Host
}

func normalizeHost(host string) string {
	host = strings.TrimSpace(host)
	if host == "" {
		return ""
	}

	cacheSuffix := ""
	if parts := strings.SplitN(host, "|", 2); len(parts) == 2 {
		host = parts[0]
		cacheSuffix = "|" + parts[1]
	}

	host = strings.TrimSuffix(host, ".")

	// If host contains a port, split it safely.
	if strings.Contains(host, ":") {
		if splitHost, _, err := net.SplitHostPort(host); err == nil {
			host = splitHost
		} else if strings.HasPrefix(host, "[") && strings.HasSuffix(host, "]") {
			host = strings.TrimPrefix(strings.TrimSuffix(host, "]"), "[")
		}
	}

	return strings.ToLower(host) + cacheSuffix
}

// truncateForLog safely truncates a string for logging purposes
func truncateForLog(s string) string {
	if len(s) <= 16 {
		return s
	}
	return s[:16] + "..."
}
