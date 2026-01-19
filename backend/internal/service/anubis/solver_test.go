package anubis_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
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

	challenge := []byte(`<script id="anubis_challenge" type="application/json">{"rules":{"algorithm":"preact","difficulty":0},"challenge":{"id":"id","randomData":"data"}}</script>`)
	require.True(t, anubis.IsAnubisPage(challenge))
	require.True(t, anubis.IsAnubisChallenge(challenge))
}

func TestParseChallenge_Success(t *testing.T) {
	html := []byte(`<html><script id="anubis_challenge" type="application/json">{"rules":{"algorithm":"preact","difficulty":0},"challenge":{"id":"id","randomData":"data"}}</script></html>`)
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
	repo.getErr["anubis.cookie."+host+".expires"] = errors.New("read failed")

	store := anubis.NewStore(repo)
	solver := anubis.NewSolver(nil, store)

	cookie := solver.GetCachedCookie(context.Background(), host)
	require.Empty(t, cookie)
}

func TestExtractHostAndTruncate(t *testing.T) {
	require.Equal(t, "example.com", anubis.ExtractHost("https://example.com/path"))
	require.Equal(t, "", anubis.ExtractHost("://invalid"))

	require.Equal(t, "short", anubis.TruncateForLog("short"))
	require.Equal(t, "0123456789abcdef...", anubis.TruncateForLog("0123456789abcdefXXXX"))
}
