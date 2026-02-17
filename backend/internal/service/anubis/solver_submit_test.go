package anubis_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Noooste/azuretls-client"
	"github.com/stretchr/testify/require"

	"gist/backend/internal/service/anubis"
	"gist/backend/pkg/network"
)

type stubSession struct {
	mu      sync.Mutex
	lastReq *azuretls.Request
	doFunc  func(*azuretls.Request) (*azuretls.Response, error)
}

func (s *stubSession) Do(req *azuretls.Request, args ...any) (*azuretls.Response, error) {
	s.mu.Lock()
	s.lastReq = req
	s.mu.Unlock()

	if s.doFunc != nil {
		return s.doFunc(req)
	}

	return &azuretls.Response{
		StatusCode: http.StatusFound,
		Cookies:    map[string]string{"techaro.lol-anubis": "cookie-value"},
	}, nil
}

func (s *stubSession) Close() {}

func (s *stubSession) request() *azuretls.Request {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.lastReq
}

func newSolverWithSession(t *testing.T, store *anubis.Store, session anubis.AzureSession) *anubis.Solver {
	t.Helper()
	clientFactory := network.NewClientFactoryForTest(&http.Client{})
	solver := anubis.NewSolver(clientFactory, store)
	anubis.SetNewSessionForTest(solver, func(ctx context.Context, timeout time.Duration) anubis.AzureSession {
		return session
	})
	return solver
}

func buildChallengeBody(algorithm string, difficulty int, id, randomData string) []byte {
	return []byte(fmt.Sprintf(
		`<script id="anubis_challenge" type="application/json">{"rules":{"algorithm":"%s","difficulty":%d},"challenge":{"id":"%s","randomData":"%s"}}</script>`,
		algorithm,
		difficulty,
		id,
		randomData,
	))
}

func sha256Hex(data string) string {
	sum := sha256.Sum256([]byte(data))
	return hex.EncodeToString(sum[:])
}

func findHeader(headers azuretls.OrderedHeaders, key string) (string, bool) {
	for _, header := range headers {
		if len(header) < 2 {
			continue
		}
		if strings.EqualFold(header[0], key) {
			return header[1], true
		}
	}
	return "", false
}

func TestSolveFromBody_NotChallenge(t *testing.T) {
	solver := anubis.NewSolver(nil, nil)
	called := false
	anubis.SetNewSessionForTest(solver, func(ctx context.Context, timeout time.Duration) anubis.AzureSession {
		called = true
		return &stubSession{}
	})

	cookie, err := solver.SolveFromBody(context.Background(), []byte("<html>ok</html>"), "https://example.com", nil)
	require.NoError(t, err)
	require.Empty(t, cookie)
	require.False(t, called)
}

func TestSolveFromBody_ParseError(t *testing.T) {
	solver := anubis.NewSolver(nil, nil)
	called := false
	anubis.SetNewSessionForTest(solver, func(ctx context.Context, timeout time.Duration) anubis.AzureSession {
		called = true
		return &stubSession{}
	})

	body := []byte(`<script id="anubis_challenge" type="application/json">{bad</script>`)
	_, err := solver.SolveFromBody(context.Background(), body, "https://example.com", nil)
	require.Error(t, err)
	require.False(t, called)
}

func TestSolveFromBody_SubmitAlgorithms(t *testing.T) {
	cases := []struct {
		name       string
		algorithm  string
		difficulty int
		randomData string
		validate   func(t *testing.T, q url.Values, randomData string)
	}{
		{
			name:       "preact",
			algorithm:  "preact",
			difficulty: 0,
			randomData: "rand-preact",
			validate: func(t *testing.T, q url.Values, randomData string) {
				require.Equal(t, sha256Hex(randomData), q.Get("result"))
				require.Empty(t, q.Get("challenge"))
				require.Empty(t, q.Get("response"))
				require.Empty(t, q.Get("nonce"))
				require.Empty(t, q.Get("elapsedTime"))
			},
		},
		{
			name:       "metarefresh",
			algorithm:  "metarefresh",
			difficulty: 0,
			randomData: "rand-meta",
			validate: func(t *testing.T, q url.Values, randomData string) {
				require.Equal(t, randomData, q.Get("challenge"))
				require.Empty(t, q.Get("result"))
				require.Empty(t, q.Get("response"))
				require.Empty(t, q.Get("nonce"))
				require.Empty(t, q.Get("elapsedTime"))
			},
		},
		{
			name:       "fast",
			algorithm:  "fast",
			difficulty: 0,
			randomData: "rand-fast",
			validate: func(t *testing.T, q url.Values, randomData string) {
				require.Equal(t, sha256Hex(randomData+"0"), q.Get("response"))
				require.Equal(t, "0", q.Get("nonce"))
				elapsed, err := strconv.ParseInt(q.Get("elapsedTime"), 10, 64)
				require.NoError(t, err)
				require.GreaterOrEqual(t, elapsed, int64(0))
				require.Empty(t, q.Get("result"))
				require.Empty(t, q.Get("challenge"))
			},
		},
		{
			name:       "slow",
			algorithm:  "slow",
			difficulty: 0,
			randomData: "rand-slow",
			validate: func(t *testing.T, q url.Values, randomData string) {
				require.Equal(t, sha256Hex(randomData+"0"), q.Get("response"))
				require.Equal(t, "0", q.Get("nonce"))
				elapsed, err := strconv.ParseInt(q.Get("elapsedTime"), 10, 64)
				require.NoError(t, err)
				require.GreaterOrEqual(t, elapsed, int64(0))
				require.Empty(t, q.Get("result"))
				require.Empty(t, q.Get("challenge"))
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := newSettingsRepoStub()
			store := anubis.NewStore(repo)
			session := &stubSession{}
			solver := newSolverWithSession(t, store, session)

			originalURL := "https://example.com/foo?bar=baz"
			initialCookies := []*http.Cookie{
				{Name: "session", Value: "abc"},
				{Name: "other", Value: "xyz"},
			}
			body := buildChallengeBody(tc.algorithm, tc.difficulty, "challenge-id", tc.randomData)

			cookie, err := solver.SolveFromBody(context.Background(), body, originalURL, initialCookies)
			require.NoError(t, err)
			require.Equal(t, "techaro.lol-anubis=cookie-value", cookie)

			req := session.request()
			require.NotNil(t, req)
			require.Equal(t, http.MethodGet, req.Method)
			require.True(t, req.DisableRedirects)

			parsed, err := url.Parse(req.Url)
			require.NoError(t, err)
			require.Equal(t, "example.com", parsed.Host)
			require.Equal(t, "/.within.website/x/cmd/anubis/api/pass-challenge", parsed.Path)

			q := parsed.Query()
			require.Equal(t, "challenge-id", q.Get("id"))
			require.Equal(t, "/foo?bar=baz", q.Get("redir"))

			tc.validate(t, q, tc.randomData)

			cookieHeader, ok := findHeader(req.OrderedHeaders, "cookie")
			require.True(t, ok)
			require.Equal(t, "session=abc; other=xyz", cookieHeader)
		})
	}
}

func TestSolveFromBody_SubmitStatusError(t *testing.T) {
	session := &stubSession{
		doFunc: func(req *azuretls.Request) (*azuretls.Response, error) {
			return &azuretls.Response{
				StatusCode: http.StatusForbidden,
				Body:       []byte("blocked"),
			}, nil
		},
	}
	solver := newSolverWithSession(t, anubis.NewStore(newSettingsRepoStub()), session)
	body := buildChallengeBody("fast", 0, "id", "data")

	_, err := solver.SolveFromBody(context.Background(), body, "https://example.com/a", nil)
	require.Error(t, err)
	require.Contains(t, err.Error(), "submit anubis solution")
}

func TestSolveFromBody_SubmitNoCookies(t *testing.T) {
	session := &stubSession{
		doFunc: func(req *azuretls.Request) (*azuretls.Response, error) {
			return &azuretls.Response{
				StatusCode: http.StatusFound,
				Cookies:    map[string]string{"other": "value"},
			}, nil
		},
	}
	solver := newSolverWithSession(t, anubis.NewStore(newSettingsRepoStub()), session)
	body := buildChallengeBody("fast", 0, "id", "data")

	_, err := solver.SolveFromBody(context.Background(), body, "https://example.com/a", nil)
	require.Error(t, err)
	require.Contains(t, err.Error(), "no auth cookies")
}

func TestSolveFromBody_WaitForOngoingSolve(t *testing.T) {
	repo := newSettingsRepoStub()
	store := anubis.NewStore(repo)

	started := make(chan struct{})
	proceed := make(chan struct{})
	session := &stubSession{
		doFunc: func(req *azuretls.Request) (*azuretls.Response, error) {
			close(started)
			<-proceed
			return &azuretls.Response{
				StatusCode: http.StatusFound,
				Cookies:    map[string]string{"techaro.lol-anubis": "cookie-value"},
			}, nil
		},
	}

	solver := newSolverWithSession(t, store, session)
	body := buildChallengeBody("fast", 0, "id", "data")
	originalURL := "https://example.com/a"

	var wg sync.WaitGroup
	wg.Add(2)

	var firstCookie string
	var firstErr error
	go func() {
		defer wg.Done()
		firstCookie, firstErr = solver.SolveFromBody(context.Background(), body, originalURL, nil)
	}()

	<-started

	var secondCookie string
	var secondErr error
	go func() {
		defer wg.Done()
		secondCookie, secondErr = solver.SolveFromBody(context.Background(), body, originalURL, nil)
	}()

	// Give second goroutine time to start waiting
	time.Sleep(50 * time.Millisecond)
	close(proceed)
	wg.Wait()

	require.NoError(t, firstErr)
	require.NoError(t, secondErr)
	require.Equal(t, "techaro.lol-anubis=cookie-value", firstCookie)
	require.Equal(t, firstCookie, secondCookie)
}

func TestSolveFromBody_WaitMissingCache(t *testing.T) {
	started := make(chan struct{})
	proceed := make(chan struct{})
	session := &stubSession{
		doFunc: func(req *azuretls.Request) (*azuretls.Response, error) {
			close(started)
			<-proceed
			return &azuretls.Response{
				StatusCode: http.StatusFound,
				Cookies:    map[string]string{"techaro.lol-anubis": "cookie-value"},
			}, nil
		},
	}

	solver := newSolverWithSession(t, nil, session)
	body := buildChallengeBody("fast", 0, "id", "data")
	originalURL := "https://example.com/a"

	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		_, _ = solver.SolveFromBody(context.Background(), body, originalURL, nil)
	}()

	<-started

	var secondErr error
	go func() {
		defer wg.Done()
		_, secondErr = solver.SolveFromBody(context.Background(), body, originalURL, nil)
	}()

	// Give second goroutine time to start waiting
	time.Sleep(50 * time.Millisecond)
	close(proceed)
	wg.Wait()

	require.Error(t, secondErr)
	require.Contains(t, secondErr.Error(), "no cookie cached")
}

func TestSolveFromBody_WaitContextCanceled(t *testing.T) {
	repo := newSettingsRepoStub()
	store := anubis.NewStore(repo)

	started := make(chan struct{})
	proceed := make(chan struct{})
	session := &stubSession{
		doFunc: func(req *azuretls.Request) (*azuretls.Response, error) {
			close(started)
			<-proceed
			return &azuretls.Response{
				StatusCode: http.StatusFound,
				Cookies:    map[string]string{"techaro.lol-anubis": "cookie-value"},
			}, nil
		},
	}

	solver := newSolverWithSession(t, store, session)
	body := buildChallengeBody("fast", 0, "id", "data")
	originalURL := "https://example.com/a"

	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		_, _ = solver.SolveFromBody(context.Background(), body, originalURL, nil)
	}()

	<-started

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	var secondErr error
	go func() {
		defer wg.Done()
		_, secondErr = solver.SolveFromBody(ctx, body, originalURL, nil)
	}()

	// Give second goroutine time to start waiting and see cancelled context
	time.Sleep(50 * time.Millisecond)
	close(proceed)
	wg.Wait()

	require.ErrorIs(t, secondErr, context.Canceled)
}

func TestSolveFromBody_SubmitUnknownAlgorithm(t *testing.T) {
	repo := newSettingsRepoStub()
	store := anubis.NewStore(repo)
	session := &stubSession{}
	solver := newSolverWithSession(t, store, session)

	// Unknown algorithm should default to preact-style submission
	body := buildChallengeBody("unknown-algo", 0, "challenge-id", "random-data")
	originalURL := "https://example.com/test"

	cookie, err := solver.SolveFromBody(context.Background(), body, originalURL, nil)
	require.NoError(t, err)
	require.Equal(t, "techaro.lol-anubis=cookie-value", cookie)

	req := session.request()
	require.NotNil(t, req)

	parsed, err := url.Parse(req.Url)
	require.NoError(t, err)
	q := parsed.Query()

	// Unknown algorithm uses preact-style 'result' parameter
	require.NotEmpty(t, q.Get("result"))
	require.Equal(t, sha256Hex("random-data"), q.Get("result"))
}

func TestSolveFromBody_SubmitRequestError(t *testing.T) {
	session := &stubSession{
		doFunc: func(req *azuretls.Request) (*azuretls.Response, error) {
			return nil, fmt.Errorf("network error")
		},
	}
	solver := newSolverWithSession(t, anubis.NewStore(newSettingsRepoStub()), session)
	body := buildChallengeBody("fast", 0, "id", "data")

	_, err := solver.SolveFromBody(context.Background(), body, "https://example.com/a", nil)
	require.Error(t, err)
	require.Contains(t, err.Error(), "submit request")
}

func TestSolveFromBody_SubmitStatusOK(t *testing.T) {
	// Some servers may return 200 OK instead of 302 Found
	session := &stubSession{
		doFunc: func(req *azuretls.Request) (*azuretls.Response, error) {
			return &azuretls.Response{
				StatusCode: http.StatusOK,
				Cookies:    map[string]string{"techaro.lol-anubis": "cookie-value"},
			}, nil
		},
	}
	solver := newSolverWithSession(t, anubis.NewStore(newSettingsRepoStub()), session)
	body := buildChallengeBody("fast", 0, "id", "data")

	cookie, err := solver.SolveFromBody(context.Background(), body, "https://example.com/a", nil)
	require.NoError(t, err)
	require.Equal(t, "techaro.lol-anubis=cookie-value", cookie)
}

func TestSolveFromBody_MultipleAnubisCookies(t *testing.T) {
	session := &stubSession{
		doFunc: func(req *azuretls.Request) (*azuretls.Response, error) {
			return &azuretls.Response{
				StatusCode: http.StatusFound,
				Cookies: map[string]string{
					"techaro.lol-anubis":      "value1",
					"techaro.lol-anubis-test": "value2",
					"other-cookie":            "ignored",
				},
			}, nil
		},
	}
	solver := newSolverWithSession(t, anubis.NewStore(newSettingsRepoStub()), session)
	body := buildChallengeBody("fast", 0, "id", "data")

	cookie, err := solver.SolveFromBody(context.Background(), body, "https://example.com/a", nil)
	require.NoError(t, err)
	// Should contain both anubis cookies
	require.Contains(t, cookie, "techaro.lol-anubis=value1")
	require.Contains(t, cookie, "techaro.lol-anubis-test=value2")
	require.NotContains(t, cookie, "other-cookie")
}

func TestSolveFromBody_SubmitCustomAuthCookieName(t *testing.T) {
	session := &stubSession{
		doFunc: func(req *azuretls.Request) (*azuretls.Response, error) {
			return &azuretls.Response{
				StatusCode: http.StatusFound,
				Cookies: map[string]string{
					"custom-prefix-auth":                "auth-value",
					"custom-prefix-cookie-verification": "test-value",
				},
			}, nil
		},
	}
	solver := newSolverWithSession(t, anubis.NewStore(newSettingsRepoStub()), session)
	body := buildChallengeBody("fast", 0, "id", "data")

	cookie, err := solver.SolveFromBody(context.Background(), body, "https://example.com/a", nil)
	require.NoError(t, err)
	require.Equal(t, "custom-prefix-auth=auth-value", cookie)
}

func TestSolveFromBodyWithHeaders_ReuseRequestFingerprint(t *testing.T) {
	session := &stubSession{}
	solver := newSolverWithSession(t, anubis.NewStore(newSettingsRepoStub()), session)
	body := buildChallengeBody("fast", 0, "id", "data")

	headers := http.Header{
		"User-Agent":     {"GistFetcher/1.0"},
		"Accept":         {"application/rss+xml,application/xml;q=0.9,*/*;q=0.8"},
		"Sec-Fetch-Site": {"cross-site"},
	}

	_, err := solver.SolveFromBodyWithHeaders(context.Background(), body, "https://example.com/a", nil, headers)
	require.NoError(t, err)

	req := session.request()
	require.NotNil(t, req)

	userAgent, ok := findHeader(req.OrderedHeaders, "user-agent")
	require.True(t, ok)
	require.Equal(t, "GistFetcher/1.0", userAgent)

	accept, ok := findHeader(req.OrderedHeaders, "accept")
	require.True(t, ok)
	require.Equal(t, "application/rss+xml,application/xml;q=0.9,*/*;q=0.8", accept)

	site, ok := findHeader(req.OrderedHeaders, "sec-fetch-site")
	require.True(t, ok)
	require.Equal(t, "cross-site", site)
}

func TestSolveFromBodyWithHeaders_SubmitPrefersInitialCookies(t *testing.T) {
	session := &stubSession{}
	solver := newSolverWithSession(t, anubis.NewStore(newSettingsRepoStub()), session)
	body := buildChallengeBody("fast", 0, "id", "data")

	headers := http.Header{
		"User-Agent": {"Profile-A/1.0"},
		"Cookie":     {"stale-auth=old"},
	}
	initialCookies := []*http.Cookie{
		{Name: "challenge-session", Value: "new"},
	}

	_, err := solver.SolveFromBodyWithHeaders(context.Background(), body, "https://example.com/a", initialCookies, headers)
	require.NoError(t, err)

	req := session.request()
	require.NotNil(t, req)

	cookie, ok := findHeader(req.OrderedHeaders, "cookie")
	require.True(t, ok)
	require.Equal(t, "challenge-session=new", cookie)
}

func TestSolveFromBodyWithHeaders_CacheScopedByFingerprint(t *testing.T) {
	session := &stubSession{
		doFunc: func(req *azuretls.Request) (*azuretls.Response, error) {
			userAgent, _ := findHeader(req.OrderedHeaders, "user-agent")
			value := "default"
			switch userAgent {
			case "Profile-A/1.0":
				value = "cookie-a"
			case "Profile-B/1.0":
				value = "cookie-b"
			}
			return &azuretls.Response{
				StatusCode: http.StatusFound,
				Cookies:    map[string]string{"techaro.lol-anubis": value},
			}, nil
		},
	}

	store := anubis.NewStore(newSettingsRepoStub())
	solver := newSolverWithSession(t, store, session)

	bodyA := buildChallengeBody("fast", 0, "id-a", "data-a")
	bodyB := buildChallengeBody("fast", 0, "id-b", "data-b")

	headersA := http.Header{
		"User-Agent":     {"Profile-A/1.0"},
		"Sec-Fetch-Site": {"same-origin"},
	}
	headersB := http.Header{
		"User-Agent":     {"Profile-B/1.0"},
		"Sec-Fetch-Site": {"cross-site"},
	}

	_, err := solver.SolveFromBodyWithHeaders(context.Background(), bodyA, "https://example.com/a", nil, headersA)
	require.NoError(t, err)

	_, err = solver.SolveFromBodyWithHeaders(context.Background(), bodyB, "https://example.com/b", nil, headersB)
	require.NoError(t, err)

	cookieA := solver.GetCachedCookieWithHeaders(context.Background(), "example.com", headersA)
	cookieB := solver.GetCachedCookieWithHeaders(context.Background(), "example.com", headersB)

	require.Equal(t, "techaro.lol-anubis=cookie-a", cookieA)
	require.Equal(t, "techaro.lol-anubis=cookie-b", cookieB)
}

func TestSolveFromBodyWithHeaders_WritesHostFallbackCache(t *testing.T) {
	store := anubis.NewStore(newSettingsRepoStub())
	solver := newSolverWithSession(t, store, &stubSession{})
	body := buildChallengeBody("fast", 0, "id", "data")

	headers := http.Header{
		"User-Agent":     {"Profile-A/1.0"},
		"Sec-Fetch-Site": {"same-origin"},
	}

	cookie, err := solver.SolveFromBodyWithHeaders(context.Background(), body, "https://example.com/a", nil, headers)
	require.NoError(t, err)
	require.Equal(t, "techaro.lol-anubis=cookie-value", cookie)

	hostCookie := solver.GetCachedCookie(context.Background(), "example.com")
	require.Equal(t, "techaro.lol-anubis=cookie-value", hostCookie)
}

func TestSolveFromBody_NoCookiesInInitialRequest(t *testing.T) {
	repo := newSettingsRepoStub()
	store := anubis.NewStore(repo)
	session := &stubSession{}
	solver := newSolverWithSession(t, store, session)

	body := buildChallengeBody("fast", 0, "id", "data")
	originalURL := "https://example.com/test"

	// No initial cookies provided
	cookie, err := solver.SolveFromBody(context.Background(), body, originalURL, nil)
	require.NoError(t, err)
	require.NotEmpty(t, cookie)

	req := session.request()
	require.NotNil(t, req)

	// Should NOT have cookie header when no initial cookies
	_, hasCookie := findHeader(req.OrderedHeaders, "cookie")
	require.False(t, hasCookie)
}

func TestSolveProofOfWork_HigherDifficulty(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Test with difficulty=2 (hash must start with "00")
	result, err := anubis.SolveProofOfWork(ctx, "test-data", 2)
	require.NoError(t, err)
	require.True(t, strings.HasPrefix(result.Hash, "00"))
	require.GreaterOrEqual(t, result.Nonce, 0) // Nonce can be 0 if first hash matches
	require.GreaterOrEqual(t, result.Elapsed, int64(0))

	// Verify the hash is correct
	expectedInput := fmt.Sprintf("%s%d", "test-data", result.Nonce)
	expectedHash := sha256Hex(expectedInput)
	require.Equal(t, expectedHash, result.Hash)
}

func TestSolveFromBody_StoreCacheError(t *testing.T) {
	// Test that cookie caching error doesn't fail the overall solve
	repo := newSettingsRepoStub()
	repo.setErr["anubis.cookie.example.com"] = fmt.Errorf("cache write failed")
	store := anubis.NewStore(repo)
	session := &stubSession{}
	solver := newSolverWithSession(t, store, session)

	body := buildChallengeBody("fast", 0, "id", "data")
	originalURL := "https://example.com/test"

	// Should still return cookie even if caching fails
	cookie, err := solver.SolveFromBody(context.Background(), body, originalURL, nil)
	require.NoError(t, err)
	require.NotEmpty(t, cookie)
}

func TestSolveFromBody_SolveContextCanceled(t *testing.T) {
	// Test context canceled during solve (not during wait)
	ctx, cancel := context.WithCancel(context.Background())

	solver := anubis.NewSolver(nil, nil)
	anubis.SetNewSessionForTest(solver, func(ctx context.Context, timeout time.Duration) anubis.AzureSession {
		return &stubSession{}
	})

	// Use preact algorithm with difficulty > 0 to ensure some wait time
	body := buildChallengeBody("preact", 1, "id", "data")
	originalURL := "https://example.com/test"

	// Cancel context immediately
	cancel()

	_, err := solver.SolveFromBody(ctx, body, originalURL, nil)
	require.Error(t, err)
	require.ErrorIs(t, err, context.Canceled)
}
