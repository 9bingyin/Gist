package service

import "context"

// ReadabilityFetchWithChromeForTest exposes fetchWithChrome for tests.
func ReadabilityFetchWithChromeForTest(svc ReadabilityService, ctx context.Context, targetURL, cookie string, retryCount int) ([]byte, error) {
	impl, ok := svc.(*readabilityService)
	if !ok {
		return nil, ErrInvalid
	}
	return impl.fetchWithChrome(ctx, targetURL, cookie, retryCount)
}

// ReadabilityFetchWithFreshSessionForTest exposes fetchWithFreshSession for tests.
func ReadabilityFetchWithFreshSessionForTest(svc ReadabilityService, ctx context.Context, targetURL, cookie string, retryCount int) ([]byte, error) {
	impl, ok := svc.(*readabilityService)
	if !ok {
		return nil, ErrInvalid
	}
	return impl.fetchWithFreshSession(ctx, targetURL, cookie, retryCount)
}

// ReadabilityDoFetchForTest exposes doFetch for tests.
func ReadabilityDoFetchForTest(svc ReadabilityService, ctx context.Context, targetURL, cookie string, retryCount int, isFresh bool) ([]byte, error) {
	impl, ok := svc.(*readabilityService)
	if !ok {
		return nil, ErrInvalid
	}
	session := impl.clientFactory.NewAzureSession(ctx, readabilityTimeout)
	defer session.Close()
	return impl.doFetch(ctx, session, targetURL, cookie, retryCount, isFresh)
}
