package ai_test

import (
	"testing"

	"gist/backend/internal/service/ai"

	"github.com/stretchr/testify/require"
)

func TestNewProvider_Errors(t *testing.T) {
	_, err := ai.NewProvider(ai.Config{})
	require.ErrorIs(t, err, ai.ErrMissingAPIKey)

	_, err = ai.NewProvider(ai.Config{APIKey: "key"})
	require.ErrorIs(t, err, ai.ErrMissingModel)

	_, err = ai.NewProvider(ai.Config{APIKey: "key", Model: "model", Provider: "unknown"})
	require.ErrorIs(t, err, ai.ErrInvalidProvider)

	_, err = ai.NewProvider(ai.Config{APIKey: "key", Model: "model", Provider: ai.ProviderCompatible})
	require.ErrorIs(t, err, ai.ErrMissingBaseURL)
}

func TestNewProvider_OpenAI(t *testing.T) {
	provider, err := ai.NewProvider(ai.Config{
		Provider: ai.ProviderOpenAI,
		APIKey:   "key",
		Model:    "gpt-4",
	})
	require.NoError(t, err)
	require.Equal(t, ai.ProviderOpenAI, provider.Name())
}

func TestNewProvider_Compatible(t *testing.T) {
	provider, err := ai.NewProvider(ai.Config{
		Provider: ai.ProviderCompatible,
		APIKey:   "key",
		Model:    "model",
		BaseURL:  "https://example.com",
	})
	require.NoError(t, err)
	require.Equal(t, ai.ProviderCompatible, provider.Name())
}
