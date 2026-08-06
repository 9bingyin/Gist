package network_test

import (
	"context"
	"crypto/x509"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/Noooste/azuretls-client"
	tls "github.com/Noooste/utls"
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
	session := factory.NewAzureSession(context.Background(), time.Second)
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

func TestClientFactory_NewAzureSession_RejectsUntrustedCertificate(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(server.Close)

	serverURL, err := url.Parse(server.URL)
	require.NoError(t, err)

	provider := &tlsTestProvider{}
	factory := network.NewClientFactory(provider, provider)
	session := factory.NewAzureSession(context.Background(), time.Second)
	t.Cleanup(session.Close)
	session.PinManager = azuretls.NewPinManager()
	require.NoError(t, session.AddPins(serverURL, []string{"stale-pin"}))

	_, err = session.Get(server.URL)
	require.ErrorContains(t, err, "certificate signed by unknown authority")
}
