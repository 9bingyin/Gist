package network

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

type mockProvider struct {
	proxyURL string
	ipStack  string
}

func (p *mockProvider) GetProxyURL(ctx context.Context) string {
	return p.proxyURL
}

func (p *mockProvider) GetIPStack(ctx context.Context) string {
	return p.ipStack
}

func TestClientFactory_NewHTTPClient(t *testing.T) {
	provider := &mockProvider{ipStack: "default"}
	factory := NewClientFactory(provider, provider)
	ctx := context.Background()

	client := factory.NewHTTPClient(ctx, 5*time.Second)
	require.NotNil(t, client)
	require.Equal(t, 5*time.Second, client.Timeout)
}

func TestClientFactory_NewClientFactoryForTest(t *testing.T) {
	expected := &http.Client{}
	factory := NewClientFactoryForTest(expected)

	client := factory.NewHTTPClient(context.Background(), 5*time.Second)
	require.Equal(t, expected, client)
}

func TestClientFactory_TestProxy(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	provider := &mockProvider{ipStack: "default"}
	factory := NewClientFactory(provider, provider)
	ctx := context.Background()

	err := factory.TestProxy(ctx, server.URL)
	require.NoError(t, err)
}

func TestClientFactory_TestProxyWithConfig(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	provider := &mockProvider{ipStack: "default"}
	factory := NewClientFactory(provider, provider)
	ctx := context.Background()

	err := factory.TestProxyWithConfig(ctx, "", server.URL)
	require.NoError(t, err)
}

func TestClientFactory_GetProxyURL(t *testing.T) {
	provider := &mockProvider{proxyURL: "http://proxy.local:8080", ipStack: "default"}
	factory := NewClientFactory(provider, provider)

	require.Equal(t, "http://proxy.local:8080", factory.GetProxyURL(context.Background()))
}

func TestClientFactory_NewHTTPTransport_Proxy(t *testing.T) {
	provider := &mockProvider{proxyURL: "http://proxy.local:8080", ipStack: "default"}
	factory := NewClientFactory(provider, provider)

	tr := factory.NewHTTPTransport(context.Background())
	require.NotNil(t, tr)
	require.NotNil(t, tr.Proxy)

	req := httptest.NewRequest(http.MethodGet, "http://example.com", nil)
	pu, err := tr.Proxy(req)
	require.NoError(t, err)
	require.Equal(t, "http://proxy.local:8080", pu.String())
}

func TestClientFactory_NewHTTPTransport_InvalidProxy(t *testing.T) {
	provider := &mockProvider{proxyURL: "://bad", ipStack: "default"}
	factory := NewClientFactory(provider, provider)

	tr := factory.NewHTTPTransport(context.Background())
	require.NotNil(t, tr)
	require.Nil(t, tr.Proxy)
}

func TestClientFactory_NewHTTPTransport_SOCKS(t *testing.T) {
	provider := &mockProvider{proxyURL: "socks5://user:pass@localhost:1080", ipStack: "default"}
	factory := NewClientFactory(provider, provider)

	tr := factory.NewHTTPTransport(context.Background())
	require.NotNil(t, tr)
	require.Nil(t, tr.Proxy)
}

func TestClientFactory_NewAzureSession(t *testing.T) {
	provider := &mockProvider{proxyURL: "", ipStack: "default"}
	factory := NewClientFactory(provider, provider)

	session := factory.NewAzureSession(context.Background(), time.Second)
	require.NotNil(t, session)
	session.Close()
}

func TestExtractHost(t *testing.T) {
	tests := []struct {
		url  string
		want string
	}{
		{"https://example.com/path", "example.com"},
		{"http://sub.test.org:8080/rss", "sub.test.org:8080"},
		{"invalid-url", ""},
		{"", ""},
	}

	for _, tt := range tests {
		require.Equal(t, tt.want, ExtractHost(tt.url))
	}
}

func TestDialWithIPStack_Default(t *testing.T) {
	// Just test that it doesn't panic and returns a dialer function
	provider := &mockProvider{ipStack: "default"}
	factory := NewClientFactory(provider, provider)
	dialFunc := factory.makeDialFunc("default")
	require.NotNil(t, dialFunc)
}
