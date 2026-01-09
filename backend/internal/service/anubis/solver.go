package anubis

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/Noooste/azuretls-client"

	"gist/backend/internal/config"
	"gist/backend/internal/logger"
	"gist/backend/internal/network"
)

const solverTimeout = 30 * time.Second

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
	solving       map[string]chan struct{} // host -> done channel (prevents concurrent solving)
}

// NewSolver creates a new Anubis solver
func NewSolver(clientFactory *network.ClientFactory, store *Store) *Solver {
	return &Solver{
		clientFactory: clientFactory,
		store:         store,
		solving:       make(map[string]chan struct{}),
	}
}

// IsAnubisChallenge checks if the response body is an Anubis challenge page
func IsAnubisChallenge(body []byte) bool {
	return bytes.Contains(body, []byte(`id="anubis_challenge"`))
}

// GetCachedCookie returns the cached cookie for the given host if valid
func (s *Solver) GetCachedCookie(ctx context.Context, host string) string {
	if s.store == nil {
		return ""
	}
	cookie, err := s.store.GetCookie(ctx, host)
	if err != nil {
		return ""
	}
	return cookie
}

// SolveFromBody detects and solves Anubis challenge from response body
// Returns the cookie string if successful, empty string if not an Anubis challenge
// initialCookies are the cookies received from the initial request (needed for session)
func (s *Solver) SolveFromBody(ctx context.Context, body []byte, originalURL string, initialCookies []*http.Cookie) (string, error) {
	if !IsAnubisChallenge(body) {
		return "", nil
	}

	host := extractHost(originalURL)

	// Check if another goroutine is already solving for this host
	s.mu.Lock()
	if ch, ok := s.solving[host]; ok {
		s.mu.Unlock()
		logger.Debug("anubis waiting for ongoing solve", "host", host)
		select {
		case <-ch:
			// Small delay to let the cookie propagate and avoid thundering herd
			time.Sleep(100 * time.Millisecond)
			// Solving completed, get cookie from cache
			if cookie := s.GetCachedCookie(ctx, host); cookie != "" {
				return cookie, nil
			}
			// Cache miss after solve - this shouldn't happen normally
			return "", fmt.Errorf("anubis solve completed but no cookie cached for %s", host)
		case <-ctx.Done():
			return "", ctx.Err()
		}
	}

	// Mark this host as being solved
	done := make(chan struct{})
	s.solving[host] = done
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		delete(s.solving, host)
		close(done) // Notify waiting goroutines
		s.mu.Unlock()
	}()

	// Parse the challenge JSON from HTML
	challenge, err := parseChallenge(body)
	if err != nil {
		return "", fmt.Errorf("parse anubis challenge: %w", err)
	}

	logger.Debug("anubis detected challenge",
		"url", originalURL,
		"algorithm", challenge.Rules.Algorithm,
		"difficulty", challenge.Rules.Difficulty)

	// Solve the challenge based on algorithm type
	result := solveChallenge(challenge)

	// Submit the solution (pass initial cookies for session)
	cookie, expiresAt, err := s.submit(ctx, originalURL, challenge, result, initialCookies)
	if err != nil {
		return "", fmt.Errorf("submit anubis solution: %w", err)
	}

	// Cache the cookie
	if s.store != nil && host != "" {
		if err := s.store.SetCookie(ctx, host, cookie, expiresAt); err != nil {
			logger.Warn("anubis failed to cache cookie", "host", host, "error", err)
		} else {
			logger.Debug("anubis cached cookie", "host", host, "expires", expiresAt.Format(time.RFC3339))
		}
	}

	return cookie, nil
}

// challengeRegex extracts the JSON from the anubis_challenge script tag
var challengeRegex = regexp.MustCompile(`<script id="anubis_challenge" type="application/json">([^<]+)</script>`)

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
func solveChallenge(challenge *Challenge) solveResult {
	randomData := challenge.Challenge.RandomData
	difficulty := challenge.Rules.Difficulty
	algorithm := challenge.Rules.Algorithm

	switch algorithm {
	case "preact":
		return solvePreact(randomData, difficulty)
	case "metarefresh":
		return solveMetaRefresh(randomData, difficulty)
	case "fast", "slow":
		return solveProofOfWork(randomData, difficulty)
	default:
		// Default to preact for unknown algorithms
		logger.Warn("anubis unknown algorithm, using preact", "algorithm", algorithm)
		return solvePreact(randomData, difficulty)
	}
}

// solvePreact implements the preact algorithm: SHA256(randomData) + wait difficulty*80ms
func solvePreact(randomData string, difficulty int) solveResult {
	// Compute simple SHA256(randomData)
	h := sha256.Sum256([]byte(randomData))
	hash := hex.EncodeToString(h[:])

	// Wait required time: difficulty * 80ms (server validates this)
	waitTime := time.Duration(difficulty) * 80 * time.Millisecond
	logger.Debug("anubis preact: waiting", "duration", waitTime)
	time.Sleep(waitTime + 50*time.Millisecond) // Add small buffer

	logger.Debug("anubis preact solved", "hash", truncateForLog(hash))
	return solveResult{Hash: hash}
}

// solveMetaRefresh implements the metarefresh algorithm: return randomData + wait difficulty*800ms
func solveMetaRefresh(randomData string, difficulty int) solveResult {
	// Wait required time: difficulty * 800ms (server validates this)
	waitTime := time.Duration(difficulty) * 800 * time.Millisecond
	logger.Debug("anubis metarefresh: waiting", "duration", waitTime)
	time.Sleep(waitTime + 100*time.Millisecond) // Add buffer

	// metarefresh returns randomData directly, not a hash
	logger.Debug("anubis metarefresh solved", "data", truncateForLog(randomData))
	return solveResult{Hash: randomData}
}

// solveProofOfWork implements the proofofwork algorithm: iterate until enough leading zeros
func solveProofOfWork(randomData string, difficulty int) solveResult {
	startTime := time.Now()
	prefix := strings.Repeat("0", difficulty)

	for nonce := 0; ; nonce++ {
		input := fmt.Sprintf("%s%d", randomData, nonce)
		h := sha256.Sum256([]byte(input))
		hashHex := hex.EncodeToString(h[:])

		if strings.HasPrefix(hashHex, prefix) {
			elapsed := time.Since(startTime).Milliseconds()
			logger.Debug("anubis PoW solved",
				"difficulty", difficulty,
				"nonce", nonce,
				"elapsed_ms", elapsed,
				"hash", truncateForLog(hashHex))
			return solveResult{
				Hash:    hashHex,
				Nonce:   nonce,
				Elapsed: elapsed,
			}
		}
	}
}

// submit sends the solution to Anubis and retrieves the cookie
func (s *Solver) submit(ctx context.Context, originalURL string, challenge *Challenge, result solveResult, initialCookies []*http.Cookie) (string, time.Time, error) {
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
	session := s.clientFactory.NewAzureSession(ctx, solverTimeout)
	defer session.Close()

	// Build Chrome headers
	headers := azuretls.OrderedHeaders{
		{"accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7"},
		{"accept-language", "zh-CN,zh;q=0.9"},
		{"cache-control", "max-age=0"},
		{"sec-ch-ua", config.ChromeSecChUa},
		{"sec-ch-ua-mobile", "?0"},
		{"sec-ch-ua-platform", `"Windows"`},
		{"sec-fetch-dest", "document"},
		{"sec-fetch-mode", "navigate"},
		{"sec-fetch-site", "none"},
		{"sec-fetch-user", "?1"},
		{"upgrade-insecure-requests", "1"},
		{"user-agent", config.ChromeUserAgent},
	}

	// Add initial cookies from the challenge request (required for session)
	if len(initialCookies) > 0 {
		var cookieParts []string
		for _, c := range initialCookies {
			cookieParts = append(cookieParts, fmt.Sprintf("%s=%s", c.Name, c.Value))
		}
		headers = append(headers, []string{"cookie", strings.Join(cookieParts, "; ")})
	}

	logger.Debug("anubis submitting solution", "url", submitURL)

	// Send request with redirect disabled to capture Set-Cookie header
	resp, err := session.Do(&azuretls.Request{
		Method:           http.MethodGet,
		Url:              submitURL,
		OrderedHeaders:   headers,
		DisableRedirects: true,
	})
	if err != nil {
		logger.Debug("anubis submit request failed", "error", err)
		return "", time.Time{}, fmt.Errorf("submit request: %w", err)
	}

	logger.Debug("anubis submit response", "status", resp.StatusCode, "cookies", len(resp.Cookies))

	// Expected: 302 redirect with Set-Cookie
	if resp.StatusCode != http.StatusFound && resp.StatusCode != http.StatusOK {
		logger.Debug("anubis unexpected status", "status", resp.StatusCode, "body", string(resp.Body))
		return "", time.Time{}, fmt.Errorf("unexpected status %d: %s", resp.StatusCode, string(resp.Body))
	}

	// Extract cookies from response (azuretls uses map[string]string)
	var anubisCookieParts []string
	for name, value := range resp.Cookies {
		if strings.HasPrefix(name, "techaro.lol-anubis") {
			anubisCookieParts = append(anubisCookieParts, fmt.Sprintf("%s=%s", name, value))
		}
	}

	if len(anubisCookieParts) == 0 {
		logger.Debug("anubis no cookies found", "allCookies", resp.Cookies)
		return "", time.Time{}, fmt.Errorf("no anubis cookies in response")
	}

	// Default expiry (7 days) - azuretls cookies map doesn't include expiry info
	expiresAt := time.Now().Add(7 * 24 * time.Hour)

	cookie := strings.Join(anubisCookieParts, "; ")
	return cookie, expiresAt, nil
}

// extractHost returns the host from a URL string
func extractHost(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}
	return u.Host
}

// truncateForLog safely truncates a string for logging purposes
func truncateForLog(s string) string {
	if len(s) <= 16 {
		return s
	}
	return s[:16] + "..."
}
