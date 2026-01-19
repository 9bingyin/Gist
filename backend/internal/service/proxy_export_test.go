package service

import "context"

// ProxyFetchWithFreshSessionForTest exposes fetchWithFreshSession for tests.
func ProxyFetchWithFreshSessionForTest(svc ProxyService, ctx context.Context, imageURL, refererURL, cookie string, retryCount int) (*ProxyResult, error) {
	impl, ok := svc.(*proxyService)
	if !ok {
		return nil, ErrInvalidURL
	}
	return impl.fetchWithFreshSession(ctx, imageURL, refererURL, cookie, retryCount)
}
