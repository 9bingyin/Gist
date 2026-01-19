package network

import (
	"context"
	"net"
)

// NewNoopProviderForTest exposes the noop provider for tests.
func NewNoopProviderForTest() *noopProvider {
	return &noopProvider{}
}

// DialWithPreferenceForTest exposes dialWithPreference for tests.
func DialWithPreferenceForTest(ctx context.Context, addr, primary, fallback string) (net.Conn, error) {
	return dialWithPreference(ctx, addr, primary, fallback)
}

// DialWithIPStackForTest exposes dialWithIPStack for tests.
func DialWithIPStackForTest(ctx context.Context, network, addr, ipStack string) (net.Conn, error) {
	return dialWithIPStack(ctx, network, addr, ipStack)
}

// DialWithIPStackDialerForTest exposes ipStackDialer.Dial for tests.
func DialWithIPStackDialerForTest(network, addr, ipStack string) (net.Conn, error) {
	return (&ipStackDialer{ipStack: ipStack}).Dial(network, addr)
}
