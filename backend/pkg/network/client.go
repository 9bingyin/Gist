package network

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/Noooste/azuretls-client"
	tls "github.com/Noooste/utls"
	"golang.org/x/net/proxy"

	"gist/backend/pkg/logger"
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

type transportKey struct {
	proxyURL string
	ipStack  string
}

type errorRoundTripper struct {
	err error
}

func (e errorRoundTripper) RoundTrip(*http.Request) (*http.Response, error) {
	return nil, e.err
}

// ClientFactory creates HTTP clients with proxy and IP stack configuration,
// reusing pooled transports per (proxyURL, ipStack).
type ClientFactory struct {
	proxyProvider   ProxyProvider
	ipStackProvider IPStackProvider
	testHTTPClient  *http.Client // For testing only

	mu         sync.RWMutex
	transports map[transportKey]*http.Transport
}

// NewClientFactory creates a new client factory.
func NewClientFactory(proxyProvider ProxyProvider, ipStackProvider IPStackProvider) *ClientFactory {
	return &ClientFactory{
		proxyProvider:   proxyProvider,
		ipStackProvider: ipStackProvider,
		transports:      make(map[transportKey]*http.Transport),
	}
}

// NewClientFactoryForTest creates a client factory that uses the given http.Client for testing.
// This is only for use in tests.
func NewClientFactoryForTest(client *http.Client) *ClientFactory {
	noop := &noopProvider{}
	return &ClientFactory{
		proxyProvider:   noop,
		ipStackProvider: noop,
		testHTTPClient:  client,
		transports:      make(map[transportKey]*http.Transport),
	}
}

// noopProvider returns empty/default values.
type noopProvider struct{}

func (p *noopProvider) GetProxyURL(context.Context) string {
	return ""
}

func (p *noopProvider) GetIPStack(context.Context) string {
	return "default"
}

// InvalidateTransports closes idle connections on all cached transports and clears the cache.
// Call this when network/proxy settings change.
func (f *ClientFactory) InvalidateTransports() {
	f.mu.Lock()
	old := f.transports
	f.transports = make(map[transportKey]*http.Transport)
	f.mu.Unlock()

	for _, tr := range old {
		tr.CloseIdleConnections()
	}
}

// NewHTTPClient creates an http.Client using a pooled transport for the current
// proxy and IP stack configuration. If the configured proxy is invalid, requests
// made with the returned client fail explicitly instead of silently bypassing the proxy.
func (f *ClientFactory) NewHTTPClient(ctx context.Context, timeout time.Duration) *http.Client {
	if f.testHTTPClient != nil {
		return f.testHTTPClient
	}

	proxyURL := f.getProxyURL(ctx)
	ipStack := f.getIPStack(ctx)

	rt, err := f.getOrCreateTransport(proxyURL, ipStack)
	if err != nil {
		return &http.Client{
			Timeout:       timeout,
			Transport:     errorRoundTripper{err: err},
			CheckRedirect: CheckRedirect,
		}
	}

	return &http.Client{
		Timeout:       timeout,
		Transport:     rt,
		CheckRedirect: CheckRedirect,
	}
}

// NewAzureSession creates an azuretls.Session bound to ctx with proxy configuration
// and pre-send per-hop redirect validation.
func (f *ClientFactory) NewAzureSession(ctx context.Context, timeout time.Duration) (*azuretls.Session, error) {
	session := azuretls.NewSessionWithContext(ctx)
	session.Browser = azuretls.Chrome
	session.SetTimeout(timeout)
	session.ModifyConfig = useStandardCertificateVerification
	session.CheckRedirect = CheckAzureRedirect

	proxyURL := f.getProxyURL(ctx)
	if proxyURL != "" {
		if err := session.SetProxy(proxyURL); err != nil {
			session.Close()
			return nil, fmt.Errorf("configure azuretls proxy: %w", err)
		}
	} else {
		session.Dial = func(dialCtx context.Context, networkName, addr string) (net.Conn, error) {
			conn, err := (&net.Dialer{Timeout: 30 * time.Second, KeepAlive: 30 * time.Second}).DialContext(dialCtx, networkName, addr)
			if err != nil {
				return nil, err
			}
			if err := checkRemoteConn(conn); err != nil {
				_ = conn.Close()
				return nil, err
			}
			return conn, nil
		}
	}

	return session, nil
}

func useStandardCertificateVerification(config *tls.Config) error {
	// azuretls caches automatically discovered certificate pins globally. Those
	// pins become stale when a CDN rotates certificates, while browsers normally
	// rely on the CA chain and hostname verification instead.
	config.InsecureSkipVerify = false
	config.VerifyPeerCertificate = nil
	return nil
}

// TestProxyWithConfig tests a proxy configuration without saving it.
func (f *ClientFactory) TestProxyWithConfig(ctx context.Context, proxyURL, testURL string) error {
	if _, err := ValidateFetchURL(testURL); err != nil {
		return err
	}

	ipStack := f.getIPStack(ctx)
	tr, err := f.newTransport(proxyURL, ipStack)
	if err != nil {
		return err
	}
	defer tr.CloseIdleConnections()

	client := &http.Client{
		Timeout:       10 * time.Second,
		Transport:     tr,
		CheckRedirect: CheckRedirect,
	}

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

func (f *ClientFactory) getProxyURL(ctx context.Context) string {
	if f.proxyProvider == nil {
		return ""
	}
	return strings.TrimSpace(f.proxyProvider.GetProxyURL(ctx))
}

func (f *ClientFactory) getIPStack(ctx context.Context) string {
	if f.ipStackProvider == nil {
		return "default"
	}
	ipStack := strings.TrimSpace(f.ipStackProvider.GetIPStack(ctx))
	if ipStack == "" {
		return "default"
	}
	return ipStack
}

func (f *ClientFactory) getOrCreateTransport(proxyURL, ipStack string) (*http.Transport, error) {
	key := transportKey{proxyURL: proxyURL, ipStack: ipStack}

	f.mu.RLock()
	if tr, ok := f.transports[key]; ok {
		f.mu.RUnlock()
		return tr, nil
	}
	f.mu.RUnlock()

	tr, err := f.newTransport(proxyURL, ipStack)
	if err != nil {
		return nil, err
	}

	f.mu.Lock()
	defer f.mu.Unlock()
	if f.transports == nil {
		f.transports = make(map[transportKey]*http.Transport)
	}
	if existing, ok := f.transports[key]; ok {
		tr.CloseIdleConnections()
		return existing, nil
	}
	f.transports[key] = tr
	return tr, nil
}

// newTransport creates a pooled http.Transport cloned from http.DefaultTransport
// with proxy and IP stack configuration.
func (f *ClientFactory) newTransport(proxyURL, ipStack string) (*http.Transport, error) {
	dialFunc := f.makeDialFunc(ipStack)

	if proxyURL == "" {
		return newPooledTransport(dialFunc, nil), nil
	}

	parsed, err := url.Parse(proxyURL)
	if err != nil {
		return nil, fmt.Errorf("invalid proxy URL: %w", err)
	}
	if parsed.Host == "" {
		return nil, errors.New("invalid proxy URL: missing host")
	}

	scheme := strings.ToLower(parsed.Scheme)
	switch scheme {
	case "http", "https":
		return newPooledTransport(dialFunc, http.ProxyURL(parsed)), nil
	case "socks5", "socks5h":
		var auth *proxy.Auth
		if parsed.User != nil {
			auth = &proxy.Auth{
				User: parsed.User.Username(),
			}
			if password, ok := parsed.User.Password(); ok {
				auth.Password = password
			}
		}

		dialer, err := proxy.SOCKS5("tcp", parsed.Host, auth, &ipStackDialer{ipStack: ipStack})
		if err != nil {
			return nil, fmt.Errorf("create SOCKS5 proxy dialer: %w", err)
		}

		if ctxDialer, ok := dialer.(proxy.ContextDialer); ok {
			return newPooledTransport(ctxDialer.DialContext, nil), nil
		}
		return newPooledTransport(func(_ context.Context, network, addr string) (net.Conn, error) {
			return dialer.Dial(network, addr)
		}, nil), nil
	default:
		return nil, fmt.Errorf("unsupported proxy scheme %q", parsed.Scheme)
	}
}

func newPooledTransport(
	dialContext func(ctx context.Context, network, addr string) (net.Conn, error),
	proxyFunc func(*http.Request) (*url.URL, error),
) *http.Transport {
	base := http.DefaultTransport.(*http.Transport).Clone()
	base.Proxy = proxyFunc
	base.DialContext = dialContext
	base.DisableKeepAlives = false
	base.ForceAttemptHTTP2 = true
	return base
}

// ipStackDialer implements proxy.Dialer and proxy.ContextDialer for SOCKS5 with IP stack preference.
type ipStackDialer struct {
	ipStack string
}

func (d *ipStackDialer) Dial(network, addr string) (net.Conn, error) {
	return dialWithIPStack(context.Background(), network, addr, d.ipStack)
}

func (d *ipStackDialer) DialContext(ctx context.Context, network, addr string) (net.Conn, error) {
	return dialWithIPStack(ctx, network, addr, d.ipStack)
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
	var (
		conn net.Conn
		err  error
	)
	switch ipStack {
	case "ipv4":
		logger.Debug("dialing with IPv4 preference", "module", "network", "action", "dial", "resource", "network", "result", "ok", "addr", addr)
		conn, err = dialWithPreference(ctx, addr, "tcp4", "tcp6")
	case "ipv6":
		logger.Debug("dialing with IPv6 preference", "module", "network", "action", "dial", "resource", "network", "result", "ok", "addr", addr)
		conn, err = dialWithPreference(ctx, addr, "tcp6", "tcp4")
	default:
		logger.Debug("dialing with Happy Eyeballs", "module", "network", "action", "dial", "resource", "network", "result", "ok", "addr", addr)
		d := &net.Dialer{Timeout: 30 * time.Second, KeepAlive: 30 * time.Second}
		conn, err = d.DialContext(ctx, network, addr)
	}
	if err != nil {
		return nil, err
	}
	if err := checkRemoteConn(conn); err != nil {
		_ = conn.Close()
		return nil, err
	}
	return conn, nil
}

// dialWithPreference tries the primary network first, then falls back to secondary.
func dialWithPreference(ctx context.Context, addr, primary, fallback string) (net.Conn, error) {
	d := &net.Dialer{Timeout: 3 * time.Second, KeepAlive: 30 * time.Second}
	conn, err := d.DialContext(ctx, primary, addr)
	if err == nil {
		logger.Debug("dial succeeded", "module", "network", "action", "dial", "resource", "network", "result", "ok", "network", primary, "addr", addr)
		return conn, nil
	}

	logger.Debug("primary dial failed, trying fallback", "module", "network", "action", "dial", "resource", "network", "result", "skipped", "primary", primary, "fallback", fallback, "addr", addr, "error", err)
	d.Timeout = 30 * time.Second
	conn, err = d.DialContext(ctx, fallback, addr)
	if err == nil {
		logger.Debug("fallback dial succeeded", "module", "network", "action", "dial", "resource", "network", "result", "ok", "network", fallback, "addr", addr)
	} else {
		logger.Debug("fallback dial failed", "module", "network", "action", "dial", "resource", "network", "result", "failed", "network", fallback, "addr", addr, "error", err)
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
