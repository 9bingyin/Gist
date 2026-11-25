package anubis

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/Noooste/azuretls-client"
	"golang.org/x/net/html"
	"golang.org/x/sync/singleflight"

	"gist/backend/internal/config"
	"gist/backend/pkg/logger"
	"gist/backend/pkg/network"
)

const (
	solverTimeout      = 30 * time.Second
	defaultCookieTTL   = 7 * 24 * time.Hour
	maxPoWDifficulty   = 64 // SHA-256 hex length
	maxErrorBodyLogLen = 256
	logModule          = "service"
	logResource        = "anubis"
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

// azureSession is an interface for azuretls session to allow testing.
type azureSession interface {
	Do(req *azuretls.Request, args ...any) (*azuretls.Response, error)
	Close()
}

// newSessionFunc is a function type for creating new azure sessions.
type newSessionFunc func(ctx context.Context, timeout time.Duration) (azureSession, error)

// Challenge represents the Anubis challenge structure.
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

// Solver handles Anubis challenge detection and solving.
type Solver struct {
	clientFactory *network.ClientFactory
	store         *Store
	sf            singleflight.Group
	newSession    newSessionFunc // for testing injection
}

// NewSolver creates a new Anubis solver.
func NewSolver(clientFactory *network.ClientFactory, store *Store) *Solver {
	return &Solver{
		clientFactory: clientFactory,
		store:         store,
	}
}

// extractChallengeScriptText uses an HTML tokenizer to find the text inside
// <script id="anubis_challenge">...</script>.
func extractChallengeScriptText(body []byte) (string, bool) {
	if !bytes.Contains(body, []byte("anubis_challenge")) {
		return "", false
	}

	tokenizer := html.NewTokenizer(bytes.NewReader(body))
	for {
		tt := tokenizer.Next()
		if tt == html.ErrorToken {
			if tokenizer.Err() == io.EOF {
				return "", false
			}
			return "", false
		}
		if tt != html.StartTagToken {
			continue
		}

		tagName, hasAttr := tokenizer.TagName()
		if !bytes.EqualFold(tagName, []byte("script")) || !hasAttr {
			continue
		}

		isChallengeTag := false
		for {
			key, val, more := tokenizer.TagAttr()
			if bytes.EqualFold(key, []byte("id")) && string(val) == "anubis_challenge" {
				isChallengeTag = true
			}
			if !more {
				break
			}
		}
		if !isChallengeTag {
			continue
		}

		var content strings.Builder
		for {
			next := tokenizer.Next()
			switch next {
			case html.TextToken:
				content.Write(tokenizer.Text())
			case html.EndTagToken, html.ErrorToken:
				return strings.TrimSpace(content.String()), true
			}
		}
	}
}

// IsAnubisPage checks if the response body is any Anubis page (challenge or rejection).
func IsAnubisPage(body []byte) bool {
	_, found := extractChallengeScriptText(body)
	return found
}

// IsAnubisChallenge checks if the response body is a solvable Anubis challenge.
// Returns false for rejection pages where challenge is null.
func IsAnubisChallenge(body []byte) bool {
	text, found := extractChallengeScriptText(body)
	if !found || text == "" {
		return false
	}
	return text != "null"
}

// GetCachedCookie returns the cached cookie for the given host if valid.
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

// InvalidateCookie removes stale cached cookies for the host and request profile.
func (s *Solver) InvalidateCookie(ctx context.Context, host string, requestHeaders http.Header) {
	if s.store == nil {
		return
	}
	normalizedHost := normalizeHost(host)
	if normalizedHost == "" {
		return
	}
	cacheKey := buildCookieCacheKey(normalizedHost, requestHeaders)
	if cacheKey != "" && cacheKey != normalizedHost {
		_ = s.store.DeleteCookie(ctx, cacheKey)
	}
	_ = s.store.DeleteCookie(ctx, normalizedHost)
}

// SolveFromBody detects and solves Anubis challenge from response body.
func (s *Solver) SolveFromBody(ctx context.Context, body []byte, originalURL string, initialCookies []*http.Cookie) (string, error) {
	return s.SolveFromBodyWithHeaders(ctx, body, originalURL, initialCookies, nil)
}

// SolveFromBodyWithHeaders detects and solves Anubis challenge from response body.
// Concurrent requests for the same host+profile deduplicate via singleflight while
// allowing each caller to cancel independently without aborting peers.
func (s *Solver) SolveFromBodyWithHeaders(ctx context.Context, body []byte, originalURL string, initialCookies []*http.Cookie, requestHeaders http.Header) (string, error) {
	if !IsAnubisChallenge(body) {
		return "", nil
	}
	if err := ctx.Err(); err != nil {
		return "", err
	}

	host := normalizeHost(network.ExtractHost(originalURL))
	cacheKey := buildCookieCacheKey(host, requestHeaders)
	if cacheKey == "" {
		cacheKey = host
	}

	// Parse challenge eagerly so invalid payloads fail fast without entering singleflight.
	challenge, err := parseChallenge(body)
	if err != nil {
		return "", fmt.Errorf("parse anubis challenge: %w", err)
	}

	// Copy headers so the leader goroutine does not race with caller mutations.
	var headersCopy http.Header
	if requestHeaders != nil {
		headersCopy = requestHeaders.Clone()
	}

	ch := s.sf.DoChan(cacheKey, func() (any, error) {
		// Protect the shared solve from a single caller cancelling its request,
		// while still bounding total execution time.
		leaderCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), solverTimeout)
		defer cancel()

		logger.Debug("anubis detected challenge",
			"module", logModule,
			"action", "solve",
			"resource", logResource,
			"result", "ok",
			"host", host,
			"algorithm", challenge.Rules.Algorithm,
			"difficulty", challenge.Rules.Difficulty,
		)

		result, err := solveChallenge(leaderCtx, challenge)
		if err != nil {
			return "", fmt.Errorf("solve anubis challenge: %w", err)
		}

		cookie, expiresAt, err := s.submit(leaderCtx, originalURL, challenge, result, initialCookies, headersCopy)
		if err != nil {
			return "", fmt.Errorf("submit anubis solution: %w", err)
		}

		s.cacheSolvedCookie(leaderCtx, host, cacheKey, cookie, expiresAt)
		return cookie, nil
	})

	select {
	case <-ctx.Done():
		return "", ctx.Err()
	case res := <-ch:
		if res.Err != nil {
			return "", res.Err
		}
		cookie, _ := res.Val.(string)
		return cookie, nil
	}
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
		"expires", expiresAt.UTC().Format(time.RFC3339),
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

// parseChallenge extracts the Anubis challenge from HTML body.
func parseChallenge(body []byte) (*Challenge, error) {
	raw, found := extractChallengeScriptText(body)
	if !found || raw == "" || raw == "null" {
		return nil, fmt.Errorf("challenge JSON not found in response")
	}

	var challenge Challenge
	if err := json.Unmarshal([]byte(raw), &challenge); err != nil {
		return nil, fmt.Errorf("unmarshal challenge: %w", err)
	}

	if challenge.Challenge.RandomData == "" {
		return nil, fmt.Errorf("challenge randomData is empty")
	}

	return &challenge, nil
}

// solveResult holds the result of solving an Anubis challenge.
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

	if difficulty < 0 {
		return solveResult{}, fmt.Errorf("invalid negative difficulty: %d", difficulty)
	}

	switch algorithm {
	case "preact":
		return solvePreact(ctx, randomData, difficulty)
	case "metarefresh":
		return solveMetaRefresh(ctx, randomData, difficulty)
	case "fast", "slow":
		return solveProofOfWork(ctx, randomData, difficulty)
	default:
		logger.Warn("anubis unknown algorithm, using preact",
			"module", logModule,
			"action", "solve",
			"resource", logResource,
			"result", "failed",
			"algorithm", algorithm,
		)
		return solvePreact(ctx, randomData, difficulty)
	}
}

func waitWithContext(ctx context.Context, d time.Duration) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if d <= 0 {
		return nil
	}
	if deadline, ok := ctx.Deadline(); ok && time.Until(deadline) < d {
		return context.DeadlineExceeded
	}
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// solvePreact implements the preact algorithm: SHA256(randomData) + wait difficulty*80ms.
func solvePreact(ctx context.Context, randomData string, difficulty int) (solveResult, error) {
	if difficulty < 0 {
		return solveResult{}, fmt.Errorf("invalid negative difficulty: %d", difficulty)
	}

	h := sha256.Sum256([]byte(randomData))
	hash := hex.EncodeToString(h[:])

	waitTime := time.Duration(difficulty)*80*time.Millisecond + 50*time.Millisecond
	logger.Debug("anubis preact: waiting",
		"module", logModule,
		"action", "solve",
		"resource", logResource,
		"result", "ok",
		"duration_ms", waitTime.Milliseconds(),
	)

	if err := waitWithContext(ctx, waitTime); err != nil {
		return solveResult{}, err
	}

	logger.Debug("anubis preact solved",
		"module", logModule,
		"action", "solve",
		"resource", logResource,
		"result", "ok",
		"hash", truncateForLog(hash),
	)
	return solveResult{Hash: hash}, nil
}

// solveMetaRefresh implements the metarefresh algorithm: return randomData + wait difficulty*800ms.
func solveMetaRefresh(ctx context.Context, randomData string, difficulty int) (solveResult, error) {
	if difficulty < 0 {
		return solveResult{}, fmt.Errorf("invalid negative difficulty: %d", difficulty)
	}

	waitTime := time.Duration(difficulty)*800*time.Millisecond + 100*time.Millisecond
	logger.Debug("anubis metarefresh: waiting",
		"module", logModule,
		"action", "solve",
		"resource", logResource,
		"result", "ok",
		"duration_ms", waitTime.Milliseconds(),
	)

	if err := waitWithContext(ctx, waitTime); err != nil {
		return solveResult{}, err
	}

	logger.Debug("anubis metarefresh solved",
		"module", logModule,
		"action", "solve",
		"resource", logResource,
		"result", "ok",
		"data", truncateForLog(randomData),
	)
	return solveResult{Hash: randomData}, nil
}

// solveProofOfWork implements the proofofwork algorithm with minimal allocations.
// Protocol hard bounds: 0 <= difficulty <= 64 (SHA-256 hex length). Total runtime
// is bounded by ctx cancellation/timeout rather than an arbitrary difficulty cap.
func solveProofOfWork(ctx context.Context, randomData string, difficulty int) (solveResult, error) {
	if difficulty < 0 || difficulty > maxPoWDifficulty {
		return solveResult{}, fmt.Errorf("invalid proof-of-work difficulty %d (must be 0..%d)", difficulty, maxPoWDifficulty)
	}

	startTime := time.Now()
	prefixLen := len(randomData)
	buf := make([]byte, prefixLen, prefixLen+24)
	copy(buf, randomData)

	fullBytes := difficulty / 2
	hasOddNibble := difficulty%2 == 1

	for nonce := 0; ; nonce++ {
		if nonce&0x3fff == 0 {
			if err := ctx.Err(); err != nil {
				return solveResult{}, err
			}
		}

		input := strconv.AppendInt(buf[:prefixLen], int64(nonce), 10)
		sum := sha256.Sum256(input)

		if hasLeadingZeroNibbles(sum, fullBytes, hasOddNibble) {
			hashHex := hex.EncodeToString(sum[:])
			elapsed := time.Since(startTime).Milliseconds()
			logger.Debug("anubis PoW solved",
				"module", logModule,
				"action", "solve",
				"resource", logResource,
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

func hasLeadingZeroNibbles(sum [32]byte, fullBytes int, hasOddNibble bool) bool {
	for i := range fullBytes {
		if sum[i] != 0 {
			return false
		}
	}
	if hasOddNibble && sum[fullBytes]&0xf0 != 0 {
		return false
	}
	return true
}

// submit sends the solution to Anubis and retrieves the cookie.
func (s *Solver) submit(ctx context.Context, originalURL string, challenge *Challenge, result solveResult, initialCookies []*http.Cookie, requestHeaders http.Header) (string, time.Time, error) {
	parsed, err := network.ValidateFetchURL(originalURL)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("validate url: %w", err)
	}
	baseURL := fmt.Sprintf("%s://%s", parsed.Scheme, parsed.Host)

	var submitURL string
	switch challenge.Rules.Algorithm {
	case "metarefresh":
		submitURL = fmt.Sprintf("%s/.within.website/x/cmd/anubis/api/pass-challenge?id=%s&redir=%s&challenge=%s",
			baseURL,
			url.QueryEscape(challenge.Challenge.ID),
			url.QueryEscape(parsed.RequestURI()),
			url.QueryEscape(result.Hash),
		)
	case "fast", "slow":
		submitURL = fmt.Sprintf("%s/.within.website/x/cmd/anubis/api/pass-challenge?id=%s&response=%s&nonce=%d&redir=%s&elapsedTime=%d",
			baseURL,
			url.QueryEscape(challenge.Challenge.ID),
			url.QueryEscape(result.Hash),
			result.Nonce,
			url.QueryEscape(parsed.RequestURI()),
			result.Elapsed,
		)
	default:
		// preact and unknown algorithms default to preact format.
		submitURL = fmt.Sprintf("%s/.within.website/x/cmd/anubis/api/pass-challenge?id=%s&redir=%s&result=%s",
			baseURL,
			url.QueryEscape(challenge.Challenge.ID),
			url.QueryEscape(parsed.RequestURI()),
			url.QueryEscape(result.Hash),
		)
	}

	var session azureSession
	if s.newSession != nil {
		session, err = s.newSession(ctx, solverTimeout)
	} else if s.clientFactory != nil {
		session, err = s.clientFactory.NewAzureSession(ctx, solverTimeout)
	} else {
		return "", time.Time{}, errors.New("clientFactory is nil")
	}
	if err != nil {
		return "", time.Time{}, fmt.Errorf("create azure session: %w", err)
	}
	defer session.Close()

	headers := buildSubmitHeaders(requestHeaders)
	if cookieHeader := formatCookieHeader(initialCookies); cookieHeader != "" {
		headers = upsertOrderedHeader(headers, "cookie", cookieHeader)
	}

	logger.Debug("anubis submitting solution",
		"module", logModule,
		"action", "submit",
		"resource", logResource,
		"result", "ok",
		"host", network.ExtractHost(submitURL),
	)

	resp, err := session.Do(&azuretls.Request{
		Method:           http.MethodGet,
		Url:              submitURL,
		OrderedHeaders:   headers,
		DisableRedirects: true,
	})
	if err != nil {
		logger.Debug("anubis submit request failed",
			"module", logModule,
			"action", "submit",
			"resource", logResource,
			"result", "failed",
			"error", err,
		)
		return "", time.Time{}, fmt.Errorf("submit request: %w", err)
	}

	logger.Debug("anubis submit response",
		"module", logModule,
		"action", "submit",
		"resource", logResource,
		"result", "ok",
		"status_code", resp.StatusCode,
		"cookies", len(resp.Cookies),
	)

	if resp.StatusCode != http.StatusFound && resp.StatusCode != http.StatusOK {
		logger.Debug("anubis unexpected status",
			"module", logModule,
			"action", "submit",
			"resource", logResource,
			"result", "failed",
			"status_code", resp.StatusCode,
		)
		return "", time.Time{}, fmt.Errorf("unexpected status %d: %s", resp.StatusCode, truncateBodyForError(resp.Body))
	}

	authCookieParts := extractAuthCookieParts(resp.Cookies)
	if len(authCookieParts) == 0 {
		cookieNames := make([]string, 0, len(resp.Cookies))
		for name := range resp.Cookies {
			cookieNames = append(cookieNames, name)
		}
		sort.Strings(cookieNames)
		logger.Debug("anubis no cookies found",
			"module", logModule,
			"action", "submit",
			"resource", logResource,
			"result", "failed",
			"cookie_names", cookieNames,
		)
		return "", time.Time{}, fmt.Errorf("no auth cookies in response")
	}

	expiresAt := parseAuthCookieExpiry(resp.Header)
	cookie := strings.Join(authCookieParts, "; ")
	return cookie, expiresAt, nil
}

func parseAuthCookieExpiry(headers map[string][]string) time.Time {
	now := time.Now().UTC()
	var earliest time.Time

	for key, values := range headers {
		if !strings.EqualFold(key, "Set-Cookie") {
			continue
		}
		for _, raw := range values {
			c, err := http.ParseSetCookie(raw)
			if err != nil || !isAuthCookieName(c.Name) {
				continue
			}
			var exp time.Time
			switch {
			case c.MaxAge > 0:
				exp = now.Add(time.Duration(c.MaxAge) * time.Second)
			case !c.Expires.IsZero() && c.Expires.After(now):
				exp = c.Expires.UTC()
			}
			if !exp.IsZero() && (earliest.IsZero() || exp.Before(earliest)) {
				earliest = exp
			}
		}
	}

	if !earliest.IsZero() {
		return earliest
	}
	return now.Add(defaultCookieTTL)
}

func isAuthCookieName(name string) bool {
	lowerName := strings.ToLower(name)
	if strings.Contains(lowerName, "cookie-verification") {
		return false
	}
	return strings.HasSuffix(lowerName, "-auth") || strings.Contains(lowerName, "anubis")
}

func truncateBodyForError(body []byte) string {
	s := strings.TrimSpace(string(body))
	if len(s) <= maxErrorBodyLogLen {
		return s
	}
	return s[:maxErrorBodyLogLen] + "..."
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
		if value == "" || !isAuthCookieName(name) {
			continue
		}
		parts = append(parts, fmt.Sprintf("%s=%s", name, value))
	}
	sort.Strings(parts)
	return parts
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
	return host + "|" + hex.EncodeToString(sum[:8])
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

	if strings.Contains(host, ":") {
		if splitHost, _, err := net.SplitHostPort(host); err == nil {
			host = splitHost
		} else if strings.HasPrefix(host, "[") && strings.HasSuffix(host, "]") {
			host = strings.TrimPrefix(strings.TrimSuffix(host, "]"), "[")
		}
	}

	return strings.ToLower(host) + cacheSuffix
}

// truncateForLog safely truncates a string for logging purposes.
func truncateForLog(s string) string {
	if len(s) <= 16 {
		return s
	}
	return s[:16] + "..."
}
