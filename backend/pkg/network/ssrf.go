package network

import (
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"

	azuretls "github.com/Noooste/azuretls-client"
)

const maxRedirects = 10

var (
	// ErrInvalidURL indicates a malformed or non-HTTP(S) URL.
	ErrInvalidURL = errors.New("invalid URL")
	// ErrBlockedAddress indicates a request targeted a blocked address (e.g. cloud metadata / link-local).
	ErrBlockedAddress = errors.New("blocked target address")
)

// ValidateFetchURL validates that rawURL is an HTTP(S) URL with a non-empty host
// and does not directly target link-local/cloud-metadata or unspecified IP addresses.
// Private LAN / Docker hosts (e.g. 192.168.x.x, 10.x.x.x, 172.16.x.x, rsshub) are
// intentionally allowed for self-hosted deployments.
func ValidateFetchURL(rawURL string) (*url.URL, error) {
	trimmed := strings.TrimSpace(rawURL)
	if trimmed == "" {
		return nil, fmt.Errorf("%w: empty URL", ErrInvalidURL)
	}

	parsed, err := url.Parse(trimmed)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidURL, err)
	}

	scheme := strings.ToLower(parsed.Scheme)
	if scheme != "http" && scheme != "https" {
		return nil, fmt.Errorf("%w: unsupported scheme %q", ErrInvalidURL, parsed.Scheme)
	}

	host := strings.TrimSpace(parsed.Hostname())
	if host == "" {
		return nil, fmt.Errorf("%w: missing host", ErrInvalidURL)
	}

	if ip := net.ParseIP(host); ip != nil && IsBlockedIP(ip) {
		return nil, fmt.Errorf("%w: %s", ErrBlockedAddress, host)
	}

	return parsed, nil
}

// IsBlockedIP reports whether ip is in a blocked range:
// link-local unicast (169.254.0.0/16, fe80::/10), link-local multicast,
// or unspecified (0.0.0.0, ::).
func IsBlockedIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	if v4 := ip.To4(); v4 != nil {
		ip = v4
	}
	return ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified()
}

// CheckRedirect validates every redirect hop against ValidateFetchURL and enforces
// a maximum redirect count.
func CheckRedirect(req *http.Request, via []*http.Request) error {
	if len(via) >= maxRedirects {
		return fmt.Errorf("stopped after %d redirects", maxRedirects)
	}
	if req == nil || req.URL == nil {
		return ErrInvalidURL
	}
	_, err := ValidateFetchURL(req.URL.String())
	return err
}

// CheckAzureRedirect validates every azuretls redirect hop before sending the next request.
func CheckAzureRedirect(req *azuretls.Request, via []*azuretls.Request) error {
	if len(via) >= maxRedirects {
		return fmt.Errorf("stopped after %d redirects", maxRedirects)
	}
	if req == nil {
		return ErrInvalidURL
	}
	targetURL := strings.TrimSpace(req.Url)
	if targetURL == "" && req.HttpRequest != nil && req.HttpRequest.URL != nil {
		targetURL = req.HttpRequest.URL.String()
	}
	_, err := ValidateFetchURL(targetURL)
	return err
}

func checkRemoteConn(conn net.Conn) error {
	if conn == nil {
		return nil
	}
	tcpAddr, ok := conn.RemoteAddr().(*net.TCPAddr)
	if !ok || tcpAddr == nil {
		return nil
	}
	if IsBlockedIP(tcpAddr.IP) {
		return fmt.Errorf("%w: %s", ErrBlockedAddress, tcpAddr.IP.String())
	}
	return nil
}
