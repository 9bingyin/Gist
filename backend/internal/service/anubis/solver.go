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

	logger.Debug("anubis detected challenge", "url", originalURL, "difficulty", challenge.Rules.Difficulty)

	// Solve the challenge
	result := solveChallenge(challenge)

	// Submit the solution (pass initial cookies for session)
	cookie, expiresAt, err := s.submit(ctx, originalURL, challenge.Challenge.ID, result, initialCookies)
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

// solveChallenge computes the solution for the Anubis challenge
func solveChallenge(challenge *Challenge) string {
	// 1. Compute sha256 of randomData
	hash := sha256.Sum256([]byte(challenge.Challenge.RandomData))
	result := hex.EncodeToString(hash[:])

	// 2. Wait for the required time (add 100ms buffer for safety)
	waitTime := time.Duration(challenge.Rules.Difficulty)*125*time.Millisecond + 100*time.Millisecond
	time.Sleep(waitTime)

	return result
}

// submit sends the solution to Anubis and retrieves the cookie
func (s *Solver) submit(ctx context.Context, originalURL, challengeID, result string, initialCookies []*http.Cookie) (string, time.Time, error) {
	// Parse the original URL to get the base
	parsed, err := url.Parse(originalURL)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("parse url: %w", err)
	}
	baseURL := fmt.Sprintf("%s://%s", parsed.Scheme, parsed.Host)

	// Build the submission URL (order matters: id, redir, result)
	submitURL := fmt.Sprintf("%s/.within.website/x/cmd/anubis/api/pass-challenge?id=%s&redir=%s&result=%s",
		baseURL,
		url.QueryEscape(challengeID),
		parsed.RequestURI(), // Don't encode the path
		url.QueryEscape(result),
	)

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

	// Send request with redirect disabled to capture Set-Cookie header
	resp, err := session.Do(&azuretls.Request{
		Method:           http.MethodGet,
		Url:              submitURL,
		OrderedHeaders:   headers,
		DisableRedirects: true,
	})
	if err != nil {
		return "", time.Time{}, fmt.Errorf("submit request: %w", err)
	}

	// Expected: 302 redirect with Set-Cookie
	if resp.StatusCode != http.StatusFound && resp.StatusCode != http.StatusOK {
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
