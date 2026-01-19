package network

import (
	"context"
	"net"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func acceptOnce(t *testing.T, ln *net.TCPListener) {
	t.Helper()
	_ = ln.SetDeadline(time.Now().Add(2 * time.Second))
	go func() {
		conn, err := ln.Accept()
		if err == nil {
			_ = conn.Close()
		}
	}()
}

func TestNoopProviderDefaults(t *testing.T) {
	p := NewNoopProviderForTest()
	require.Equal(t, "", p.GetProxyURL(context.Background()))
	require.Equal(t, "default", p.GetIPStack(context.Background()))
}

func TestDialWithPreference_PrimarySuccess(t *testing.T) {
	ln, err := net.Listen("tcp4", "127.0.0.1:0")
	require.NoError(t, err)
	defer ln.Close()

	tcpLn := ln.(*net.TCPListener)
	acceptOnce(t, tcpLn)

	conn, err := DialWithPreferenceForTest(context.Background(), tcpLn.Addr().String(), "tcp4", "tcp6")
	require.NoError(t, err)
	require.NoError(t, conn.Close())
}

func TestDialWithPreference_FallbackSuccess(t *testing.T) {
	ln, err := net.Listen("tcp4", "127.0.0.1:0")
	require.NoError(t, err)
	defer ln.Close()

	tcpLn := ln.(*net.TCPListener)
	acceptOnce(t, tcpLn)

	conn, err := DialWithPreferenceForTest(context.Background(), tcpLn.Addr().String(), "tcp6", "tcp4")
	require.NoError(t, err)
	require.NoError(t, conn.Close())
}

func TestDialWithIPStack_IPv4AndIPv6(t *testing.T) {
	ln, err := net.Listen("tcp4", "127.0.0.1:0")
	require.NoError(t, err)
	defer ln.Close()

	tcpLn := ln.(*net.TCPListener)
	acceptOnce(t, tcpLn)

	conn, err := DialWithIPStackForTest(context.Background(), "tcp", tcpLn.Addr().String(), "ipv4")
	require.NoError(t, err)
	require.NoError(t, conn.Close())

	acceptOnce(t, tcpLn)
	conn, err = DialWithIPStackForTest(context.Background(), "tcp", tcpLn.Addr().String(), "ipv6")
	require.NoError(t, err)
	require.NoError(t, conn.Close())
}

func TestIPStackDialer_Dial(t *testing.T) {
	ln, err := net.Listen("tcp4", "127.0.0.1:0")
	require.NoError(t, err)
	defer ln.Close()

	tcpLn := ln.(*net.TCPListener)
	acceptOnce(t, tcpLn)

	conn, err := DialWithIPStackDialerForTest("tcp", tcpLn.Addr().String(), "ipv4")
	require.NoError(t, err)
	require.NoError(t, conn.Close())
}
