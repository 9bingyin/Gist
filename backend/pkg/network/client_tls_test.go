package network_test

import (
	"bytes"
	"context"
	"crypto/x509"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/Noooste/azuretls-client"
	tls "github.com/Noooste/utls"
	"github.com/andybalholm/brotli"
	"github.com/stretchr/testify/require"

	"gist/backend/pkg/network"
)

type tlsTestProvider struct{}

func (p *tlsTestProvider) GetProxyURL(context.Context) string {
	return ""
}

func (p *tlsTestProvider) GetIPStack(context.Context) string {
	return "default"
}

func TestClientFactory_NewAzureSession_IgnoresStaleDynamicPin(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(server.Close)

	serverURL, err := url.Parse(server.URL)
	require.NoError(t, err)

	certificate, err := x509.ParseCertificate(server.TLS.Certificates[0].Certificate[0])
	require.NoError(t, err)
	roots := x509.NewCertPool()
	roots.AddCert(certificate)

	provider := &tlsTestProvider{}
	factory := network.NewClientFactory(provider, provider)
	session, err := factory.NewAzureSession(context.Background(), time.Second)
	require.NoError(t, err)
	t.Cleanup(session.Close)

	// Isolate the test and preload a deliberately stale pin for the server.
	session.PinManager = azuretls.NewPinManager()
	require.NoError(t, session.AddPins(serverURL, []string{"stale-pin"}))

	baseModifyConfig := session.ModifyConfig
	require.NotNil(t, baseModifyConfig)
	session.ModifyConfig = func(config *tls.Config) error {
		if err := baseModifyConfig(config); err != nil {
			return err
		}
		config.RootCAs = roots
		return nil
	}

	response, err := session.Get(server.URL)
	require.NoError(t, err)
	t.Cleanup(func() {
		require.NoError(t, response.CloseBody())
	})
	require.Equal(t, http.StatusOK, response.StatusCode)
}

func TestOpenAzureResponseBody_HTTP2Brotli(t *testing.T) {
	const content = "<article><p>The Linux kernel disables LLVM Profi.</p></article>"
	var compressed bytes.Buffer
	writer := brotli.NewWriter(&compressed)
	_, err := io.WriteString(writer, content)
	require.NoError(t, err)
	require.NoError(t, writer.Close())

	server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Header().Set("Content-Encoding", "br")
		_, _ = w.Write(compressed.Bytes())
	}))
	server.EnableHTTP2 = true
	server.StartTLS()
	t.Cleanup(server.Close)

	roots := x509.NewCertPool()
	roots.AddCert(server.Certificate())
	factory := network.NewClientFactory(nil, nil)
	session, err := factory.NewAzureSession(t.Context(), time.Second)
	require.NoError(t, err)
	t.Cleanup(session.Close)
	baseModifyConfig := session.ModifyConfig
	session.ModifyConfig = func(config *tls.Config) error {
		if err := baseModifyConfig(config); err != nil {
			return err
		}
		config.RootCAs = roots
		return nil
	}

	response, err := session.Do(&azuretls.Request{Url: server.URL, IgnoreBody: true})
	require.NoError(t, err)
	body, err := network.OpenAzureResponseBody(response)
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, body.Close()) })
	require.Equal(t, 2, response.HttpResponse.ProtoMajor)
	require.False(t, response.HttpResponse.Uncompressed)
	decoded, err := io.ReadAll(body)
	require.NoError(t, err)
	require.Equal(t, content, string(decoded))
}

func TestClientFactory_NewAzureSession_RejectsUntrustedCertificate(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(server.Close)

	serverURL, err := url.Parse(server.URL)
	require.NoError(t, err)

	provider := &tlsTestProvider{}
	factory := network.NewClientFactory(provider, provider)
	session, err := factory.NewAzureSession(context.Background(), time.Second)
	require.NoError(t, err)
	t.Cleanup(session.Close)
	session.PinManager = azuretls.NewPinManager()
	require.NoError(t, session.AddPins(serverURL, []string{"stale-pin"}))

	_, err = session.Get(server.URL)
	require.ErrorContains(t, err, "certificate signed by unknown authority")
}
