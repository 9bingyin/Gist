package network_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"gist/backend/pkg/network"

	"github.com/stretchr/testify/require"
)

type mockProvider struct {
	proxyURL string
	ipStack  string
}

func (p *mockProvider) GetProxyURL(context.Context) string {
	return p.proxyURL
}

func (p *mockProvider) GetIPStack(context.Context) string {
	return p.ipStack
}

func TestClientFactory_NewHTTPClient_ReusesPooledTransport(t *testing.T) {
	provider := &mockProvider{ipStack: "default"}
	factory := network.NewClientFactory(provider, provider)
	ctx := context.Background()

	client1 := factory.NewHTTPClient(ctx, 5*time.Second)
	client2 := factory.NewHTTPClient(ctx, 10*time.Second)
	require.NotNil(t, client1)
	require.Equal(t, 5*time.Second, client1.Timeout)
	require.Equal(t, 10*time.Second, client2.Timeout)

	tr1, ok := client1.Transport.(*http.Transport)
	require.True(t, ok)
	require.False(t, tr1.DisableKeepAlives)
	require.True(t, tr1.ForceAttemptHTTP2)

	tr2, ok := client2.Transport.(*http.Transport)
	require.True(t, ok)
	require.Same(t, tr1, tr2)

	factory.InvalidateTransports()
	client3 := factory.NewHTTPClient(ctx, 5*time.Second)
	tr3, ok := client3.Transport.(*http.Transport)
	require.True(t, ok)
	require.NotSame(t, tr1, tr3)
}

func TestClientFactory_NilProviders(t *testing.T) {
	factory := network.NewClientFactory(nil, nil)
	client := factory.NewHTTPClient(context.Background(), 5*time.Second)
	require.NotNil(t, client)

	session, err := factory.NewAzureSession(context.Background(), time.Second)
	require.NoError(t, err)
	require.NotNil(t, session)
	session.Close()
}

func TestClientFactory_NewClientFactoryForTest(t *testing.T) {
	expected := &http.Client{}
	factory := network.NewClientFactoryForTest(expected)

	client := factory.NewHTTPClient(context.Background(), 5*time.Second)
	require.Equal(t, expected, client)
}

func TestClientFactory_InvalidProxyDoesNotFallbackDirect(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	tests := []struct {
		name     string
		proxyURL string
	}{
		{name: "malformed URL", proxyURL: "://bad"},
		{name: "unsupported scheme socks4", proxyURL: "socks4://127.0.0.1:1080"},
		{name: "missing host", proxyURL: "http://"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			provider := &mockProvider{proxyURL: tt.proxyURL, ipStack: "default"}
			factory := network.NewClientFactory(provider, provider)
			client := factory.NewHTTPClient(context.Background(), 2*time.Second)

			resp, err := client.Get(server.URL)
			require.Error(t, err)
			require.Nil(t, resp)

			err = factory.TestProxyWithConfig(context.Background(), tt.proxyURL, server.URL)
			require.Error(t, err)
		})
	}
}

func TestClientFactory_HTTPAndSOCKS5Proxy(t *testing.T) {
	httpProvider := &mockProvider{proxyURL: "http://proxy.local:8080", ipStack: "default"}
	httpFactory := network.NewClientFactory(httpProvider, httpProvider)
	httpClient := httpFactory.NewHTTPClient(context.Background(), 5*time.Second)
	tr, ok := httpClient.Transport.(*http.Transport)
	require.True(t, ok)
	require.NotNil(t, tr.Proxy)
	pu, err := tr.Proxy(httptest.NewRequest(http.MethodGet, "http://example.com", nil))
	require.NoError(t, err)
	require.Equal(t, "http://proxy.local:8080", pu.String())

	socksProvider := &mockProvider{proxyURL: "socks5://user:pass@localhost:1080", ipStack: "default"}
	socksFactory := network.NewClientFactory(socksProvider, socksProvider)
	socksClient := socksFactory.NewHTTPClient(context.Background(), 5*time.Second)
	socksTr, ok := socksClient.Transport.(*http.Transport)
	require.True(t, ok)
	require.Nil(t, socksTr.Proxy)
	require.NotNil(t, socksTr.DialContext)
}

func TestClientFactory_TestProxyWithConfig(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	provider := &mockProvider{ipStack: "default"}
	factory := network.NewClientFactory(provider, provider)

	err := factory.TestProxyWithConfig(context.Background(), "", server.URL)
	require.NoError(t, err)
}

func TestClientFactory_NewAzureSession(t *testing.T) {
	provider := &mockProvider{proxyURL: "", ipStack: "default"}
	factory := network.NewClientFactory(provider, provider)

	session, err := factory.NewAzureSession(context.Background(), time.Second)
	require.NoError(t, err)
	require.NotNil(t, session)
	require.NotNil(t, session.CheckRedirect)
	session.Close()
}

func TestClientFactory_NewAzureSession_PerHopRedirectValidation(t *testing.T) {
	var targetHits int
	allowedTarget := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		targetHits++
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
	defer allowedTarget.Close()

	redirector := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/to-metadata":
			http.Redirect(w, r, "http://169.254.169.254/latest/meta-data/", http.StatusFound)
		case "/to-file":
			http.Redirect(w, r, "file:///etc/passwd", http.StatusFound)
		case "/to-local":
			http.Redirect(w, r, allowedTarget.URL, http.StatusFound)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer redirector.Close()

	provider := &mockProvider{proxyURL: "", ipStack: "default"}
	factory := network.NewClientFactory(provider, provider)

	t.Run("blocks metadata redirect before sending", func(t *testing.T) {
		session, err := factory.NewAzureSession(context.Background(), 2*time.Second)
		require.NoError(t, err)
		defer session.Close()

		_, err = session.Get(redirector.URL + "/to-metadata")
		require.Error(t, err)
		require.ErrorIs(t, err, network.ErrBlockedAddress)
	})

	t.Run("blocks non-http redirect before sending", func(t *testing.T) {
		session, err := factory.NewAzureSession(context.Background(), 2*time.Second)
		require.NoError(t, err)
		defer session.Close()

		_, err = session.Get(redirector.URL + "/to-file")
		require.Error(t, err)
		require.ErrorIs(t, err, network.ErrInvalidURL)
	})

	t.Run("allows self-hosted loopback/LAN redirect", func(t *testing.T) {
		session, err := factory.NewAzureSession(context.Background(), 2*time.Second)
		require.NoError(t, err)
		defer session.Close()

		resp, err := session.Get(redirector.URL + "/to-local")
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, resp.StatusCode)
		require.Equal(t, 1, targetHits)
	})
}

func TestValidateFetchURL(t *testing.T) {
	valid := []string{
		"https://example.com/rss",
		"http://192.168.1.10:1200/feed",
		"http://10.0.0.5/rss",
		"http://rsshub:1200/github",
		"http://127.0.0.1:8080/test",
	}
	for _, raw := range valid {
		_, err := network.ValidateFetchURL(raw)
		require.NoError(t, err, raw)
	}

	blocked := []string{
		"",
		"file:///etc/passwd",
		"javascript:alert(1)",
		"http://169.254.169.254/latest/meta-data/",
		"http://[fe80::1]/",
		"http://0.0.0.0/",
		"http://[::]/",
	}
	for _, raw := range blocked {
		_, err := network.ValidateFetchURL(raw)
		require.Error(t, err, raw)
	}
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
		require.Equal(t, tt.want, network.ExtractHost(tt.url))
	}
}
