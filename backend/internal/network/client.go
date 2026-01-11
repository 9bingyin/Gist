package network

import (
	"context"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/Noooste/azuretls-client"
	"golang.org/x/net/proxy"
)

// ProxyProvider provides proxy configuration.
// This interface is defined here to avoid import cycles with service package.
type ProxyProvider interface {
	GetProxyURL(ctx context.Context) string
}

// IPStackProvider provides IP stack preference.
type IPStackProvider interface {
	GetIPStack(ctx context.Context) string
}

// ClientFactory creates HTTP clients with proxy configuration.
type ClientFactory struct {
	proxyProvider   ProxyProvider
	ipStackProvider IPStackProvider
	testTransport   http.RoundTripper // For testing only
	testHTTPClient  *http.Client      // For testing only
}

// NewClientFactory creates a new client factory.
func NewClientFactory(proxyProvider ProxyProvider, ipStackProvider IPStackProvider) *ClientFactory {
	return &ClientFactory{proxyProvider: proxyProvider, ipStackProvider: ipStackProvider}
}

// NewClientFactoryForTest creates a client factory that uses the given http.Client for testing.
// This is only for use in tests.
func NewClientFactoryForTest(client *http.Client) *ClientFactory {
	noop := &noopProvider{}
	return &ClientFactory{
		proxyProvider:   noop,
		ipStackProvider: noop,
		testHTTPClient:  client,
	}
}

// noopProvider returns empty/default values.
type noopProvider struct{}

func (p *noopProvider) GetProxyURL(ctx context.Context) string {
	return ""
}

func (p *noopProvider) GetIPStack(ctx context.Context) string {
	return "default"
}

// NewHTTPClient creates a standard http.Client with proxy configuration.
func (f *ClientFactory) NewHTTPClient(ctx context.Context, timeout time.Duration) *http.Client {
	// For testing: return the injected client
	if f.testHTTPClient != nil {
		return f.testHTTPClient
	}

	client := &http.Client{Timeout: timeout}

	// For testing: use injected transport
	if f.testTransport != nil {
		client.Transport = f.testTransport
		return client
	}

	proxyURL := f.proxyProvider.GetProxyURL(ctx)
	ipStack := f.getIPStack(ctx)
	client.Transport = f.newTransport(proxyURL, ipStack)

	return client
}

// NewAzureSession creates an azuretls.Session with proxy configuration.
func (f *ClientFactory) NewAzureSession(ctx context.Context, timeout time.Duration) *azuretls.Session {
	session := azuretls.NewSession()
	session.Browser = azuretls.Chrome
	session.SetTimeout(timeout)

	proxyURL := f.proxyProvider.GetProxyURL(ctx)
	if proxyURL != "" {
		_ = session.SetProxy(proxyURL)
	}

	return session
}

// GetProxyURL returns the current proxy URL.
func (f *ClientFactory) GetProxyURL(ctx context.Context) string {
	return f.proxyProvider.GetProxyURL(ctx)
}

// TestProxy tests if the proxy is working by making a request to the given URL.
func (f *ClientFactory) TestProxy(ctx context.Context, testURL string) error {
	client := f.NewHTTPClient(ctx, 10*time.Second)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, testURL, nil)
	if err != nil {
		return err
	}

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	return nil
}

// NewHTTPTransport creates an http.Transport with proxy configuration.
// This is useful when you need to customize the http.Client (e.g., CheckRedirect).
func (f *ClientFactory) NewHTTPTransport(ctx context.Context) *http.Transport {
	proxyURL := f.proxyProvider.GetProxyURL(ctx)
	ipStack := f.getIPStack(ctx)
	return f.newTransport(proxyURL, ipStack)
}

// TestProxyWithConfig tests a proxy configuration without saving it.
func (f *ClientFactory) TestProxyWithConfig(ctx context.Context, proxyURL, testURL string) error {
	ipStack := f.getIPStack(ctx)
	client := &http.Client{Timeout: 10 * time.Second}
	client.Transport = f.newTransport(proxyURL, ipStack)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, testURL, nil)
	if err != nil {
		return err
	}

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	return nil
}

// getIPStack returns the IP stack preference, defaulting to "default".
func (f *ClientFactory) getIPStack(ctx context.Context) string {
	if f.ipStackProvider == nil {
		return "default"
	}
	return f.ipStackProvider.GetIPStack(ctx)
}

// newTransport creates an http.Transport with proxy and IP stack configuration.
func (f *ClientFactory) newTransport(proxyURL, ipStack string) *http.Transport {
	dialFunc := f.makeDialFunc(ipStack)

	if proxyURL == "" {
		return &http.Transport{
			DialContext: dialFunc,
		}
	}

	parsed, err := url.Parse(proxyURL)
	if err != nil {
		return &http.Transport{
			DialContext: dialFunc,
		}
	}

	// Check if it's a SOCKS proxy
	if strings.HasPrefix(parsed.Scheme, "socks") {
		// Extract auth if present
		var auth *proxy.Auth
		if parsed.User != nil {
			auth = &proxy.Auth{
				User: parsed.User.Username(),
			}
			if password, ok := parsed.User.Password(); ok {
				auth.Password = password
			}
		}

		// Create SOCKS5 dialer with custom dial function
		dialer, err := proxy.SOCKS5("tcp", parsed.Host, auth, &ipStackDialer{ipStack: ipStack})
		if err != nil {
			return &http.Transport{
				DialContext: dialFunc,
			}
		}

		// Create transport with SOCKS5 dialer
		return &http.Transport{
			DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
				return dialer.Dial(network, addr)
			},
		}
	}

	// For HTTP/HTTPS proxies, use standard http.ProxyURL with custom dial
	return &http.Transport{
		Proxy:       http.ProxyURL(parsed),
		DialContext: dialFunc,
	}
}

// ipStackDialer implements proxy.Dialer for SOCKS5 with IP stack preference.
type ipStackDialer struct {
	ipStack string
}

func (d *ipStackDialer) Dial(network, addr string) (net.Conn, error) {
	return dialWithIPStack(context.Background(), network, addr, d.ipStack)
}

// makeDialFunc creates a DialContext function with IP stack preference.
func (f *ClientFactory) makeDialFunc(ipStack string) func(ctx context.Context, network, addr string) (net.Conn, error) {
	return func(ctx context.Context, network, addr string) (net.Conn, error) {
		return dialWithIPStack(ctx, network, addr, ipStack)
	}
}

// dialWithIPStack dials with IP stack preference and fallback.
// - "default": uses Go's default Happy Eyeballs behavior
// - "ipv4": tries IPv4 first, falls back to IPv6 on timeout/failure
// - "ipv6": tries IPv6 first, falls back to IPv4 on timeout/failure
func dialWithIPStack(ctx context.Context, network, addr string, ipStack string) (net.Conn, error) {
	switch ipStack {
	case "ipv4":
		slog.Debug("dialing with IPv4 preference", "addr", addr)
		return dialWithPreference(ctx, addr, "tcp4", "tcp6")
	case "ipv6":
		slog.Debug("dialing with IPv6 preference", "addr", addr)
		return dialWithPreference(ctx, addr, "tcp6", "tcp4")
	default:
		// Happy Eyeballs - use standard Dialer
		slog.Debug("dialing with Happy Eyeballs", "addr", addr)
		d := &net.Dialer{Timeout: 30 * time.Second}
		return d.DialContext(ctx, network, addr)
	}
}

// dialWithPreference tries the primary network first, then falls back to secondary.
func dialWithPreference(ctx context.Context, addr, primary, fallback string) (net.Conn, error) {
	// Try primary with 3 second timeout
	d := &net.Dialer{Timeout: 3 * time.Second}
	conn, err := d.DialContext(ctx, primary, addr)
	if err == nil {
		slog.Debug("dial succeeded", "network", primary, "addr", addr)
		return conn, nil
	}

	// Primary failed, try fallback with longer timeout
	slog.Debug("primary dial failed, trying fallback", "primary", primary, "fallback", fallback, "addr", addr, "error", err)
	d.Timeout = 30 * time.Second
	conn, err = d.DialContext(ctx, fallback, addr)
	if err == nil {
		slog.Debug("fallback dial succeeded", "network", fallback, "addr", addr)
	} else {
		slog.Debug("fallback dial failed", "network", fallback, "addr", addr, "error", err)
	}
	return conn, err
}

// ExtractHost returns the host from a URL string.
func ExtractHost(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}
	return u.Host
}
