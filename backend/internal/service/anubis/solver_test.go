package anubis_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"
	"testing"
	"time"

	"gist/backend/internal/service/anubis"

	"github.com/stretchr/testify/require"
)

func TestIsAnubisPageAndChallenge(t *testing.T) {
	nonAnubis := []byte(`<html>ok</html>`)
	require.False(t, anubis.IsAnubisPage(nonAnubis))
	require.False(t, anubis.IsAnubisChallenge(nonAnubis))

	reject := []byte(`<script id="anubis_challenge" type="application/json">null</script>`)
	require.True(t, anubis.IsAnubisPage(reject))
	require.False(t, anubis.IsAnubisChallenge(reject))

	// Attributes in arbitrary order and whitespace should still be parsed by HTML tokenizer.
	challenge := []byte(`<script type="application/json" id="anubis_challenge" data-v="1">{"rules":{"algorithm":"preact","difficulty":0},"challenge":{"id":"id","randomData":"data"}}</script>`)
	require.True(t, anubis.IsAnubisPage(challenge))
	require.True(t, anubis.IsAnubisChallenge(challenge))
}

func TestParseChallenge_Success(t *testing.T) {
	html := []byte(`<html><script type="application/json" id="anubis_challenge">{"rules":{"algorithm":"preact","difficulty":0},"challenge":{"id":"id","randomData":"data"}}</script></html>`)
	ch, err := anubis.ParseChallenge(html)
	require.NoError(t, err)
	require.Equal(t, "preact", ch.Rules.Algorithm)
	require.Equal(t, 0, ch.Rules.Difficulty)
	require.Equal(t, "id", ch.Challenge.ID)
	require.Equal(t, "data", ch.Challenge.RandomData)
}

func TestParseChallenge_Errors(t *testing.T) {
	_, err := anubis.ParseChallenge([]byte(`<html></html>`))
	require.Error(t, err)

	_, err = anubis.ParseChallenge([]byte(`<script id="anubis_challenge" type="application/json">{invalid}</script>`))
	require.Error(t, err)

	html := []byte(`<script id="anubis_challenge" type="application/json">{"rules":{"algorithm":"preact","difficulty":0},"challenge":{"id":"id","randomData":""}}</script>`)
	_, err = anubis.ParseChallenge(html)
	require.Error(t, err)
}

func TestSolveDifficultyBounds(t *testing.T) {
	_, err := anubis.SolveProofOfWork(context.Background(), "data", -1)
	require.Error(t, err)

	_, err = anubis.SolveProofOfWork(context.Background(), "data", 65)
	require.Error(t, err)

	_, err = anubis.SolvePreact(context.Background(), "data", -1)
	require.Error(t, err)

	_, err = anubis.SolveMetaRefresh(context.Background(), "data", -1)
	require.Error(t, err)

	// Wait time exceeding ctx deadline should fail immediately instead of sleeping.
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	start := time.Now()
	_, err = anubis.SolveMetaRefresh(ctx, "data", 10)
	require.ErrorIs(t, err, context.DeadlineExceeded)
	require.Less(t, time.Since(start), 200*time.Millisecond)
}

func TestSolvePreact(t *testing.T) {
	ctx := context.Background()
	result, err := anubis.SolvePreact(ctx, "data", 0)
	require.NoError(t, err)

	sum := sha256.Sum256([]byte("data"))
	require.Equal(t, hex.EncodeToString(sum[:]), result.Hash)
}

func TestSolveMetaRefresh(t *testing.T) {
	ctx := context.Background()
	result, err := anubis.SolveMetaRefresh(ctx, "data", 0)
	require.NoError(t, err)
	require.Equal(t, "data", result.Hash)
}

func TestSolveProofOfWork(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	result, err := anubis.SolveProofOfWork(ctx, "data", 1)
	require.NoError(t, err)
	require.True(t, strings.HasPrefix(result.Hash, "0"))

	resultOdd, err := anubis.SolveProofOfWork(ctx, "data", 3)
	require.NoError(t, err)
	require.True(t, strings.HasPrefix(resultOdd.Hash, "000"))
}

func TestSolvePreact_ContextCanceled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := anubis.SolvePreact(ctx, "data", 1)
	require.ErrorIs(t, err, context.Canceled)
}

func TestSolveMetaRefresh_ContextCanceled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := anubis.SolveMetaRefresh(ctx, "data", 1)
	require.ErrorIs(t, err, context.Canceled)
}

func TestSolveProofOfWork_ContextCanceled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := anubis.SolveProofOfWork(ctx, "data", 2)
	require.ErrorIs(t, err, context.Canceled)
}

func TestSolveChallenge_UnknownAlgorithmDefaults(t *testing.T) {
	ch := &anubis.Challenge{}
	ch.Rules.Algorithm = "unknown"
	ch.Rules.Difficulty = 0
	ch.Challenge.RandomData = "data"

	result, err := anubis.SolveChallenge(context.Background(), ch)
	require.NoError(t, err)

	sum := sha256.Sum256([]byte("data"))
	require.Equal(t, hex.EncodeToString(sum[:]), result.Hash)
}

func TestGetCachedCookie_NoStore(t *testing.T) {
	solver := anubis.NewSolver(nil, nil)
	cookie := solver.GetCachedCookie(context.Background(), "example.com")
	require.Empty(t, cookie)
}

func TestGetCachedCookie_StoreError(t *testing.T) {
	repo := newSettingsRepoStub()
	host := "example.com"
	repo.getErr["anubis.cookie."+host] = errors.New("read failed")

	store := anubis.NewStore(repo)
	solver := anubis.NewSolver(nil, store)

	cookie := solver.GetCachedCookie(context.Background(), host)
	require.Empty(t, cookie)
}

func TestParseAuthCookieExpiry(t *testing.T) {
	headers := http.Header{
		"Set-Cookie": []string{
			"techaro.lol-anubis=abc; Path=/; Max-Age=3600",
			"other=xyz; Max-Age=10",
		},
	}
	exp := anubis.ParseAuthCookieExpiry(headers)
	remaining := time.Until(exp)
	require.Greater(t, remaining, 55*time.Minute)
	require.Less(t, remaining, 65*time.Minute)
}

func TestTruncateForLog(t *testing.T) {
	require.Equal(t, "short", anubis.TruncateForLog("short"))
	require.Equal(t, "0123456789abcdef...", anubis.TruncateForLog("0123456789abcdefXXXX"))
}
