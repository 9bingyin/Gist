package handler_test

import (
	"encoding/base64"
	"errors"
	"net/http"
	"testing"

	"gist/backend/internal/handler"
	"gist/backend/internal/service"
	"gist/backend/internal/service/mock"

	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"
)

func TestProxyHandler_ProxyImage_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockProxyService(ctrl)
	h := handler.NewProxyHandlerHelper(mockService)

	imageURL := "https://example.com/img.png"
	refererURL := "https://example.com/article"
	encoded := base64.URLEncoding.EncodeToString([]byte(imageURL))
	refEncoded := base64.URLEncoding.EncodeToString([]byte(refererURL))

	mockService.EXPECT().
		FetchImage(gomock.Any(), imageURL, refererURL).
		Return(&service.ProxyResult{Data: []byte("image-data"), ContentType: "image/png"}, nil)

	e := newTestEcho()
	req := newJSONRequest(http.MethodGet, "/proxy/image/"+encoded+"?ref="+refEncoded, nil)
	c, rec := newTestContext(e, req)
	setPathParams(c, map[string]string{"encoded": encoded})

	err := h.ProxyImage(c)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "image/png", rec.Header().Get("Content-Type"))
	require.Equal(t, "public, max-age=86400", rec.Header().Get("Cache-Control"))
	require.Equal(t, "nosniff", rec.Header().Get("X-Content-Type-Options"))
	require.Equal(t, "image-data", rec.Body.String())
}

func TestProxyHandler_ProxyImage_MissingEncoded(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockProxyService(ctrl)
	h := handler.NewProxyHandlerHelper(mockService)

	e := newTestEcho()
	req := newJSONRequest(http.MethodGet, "/proxy/image/", nil)
	c, rec := newTestContext(e, req)
	setPathParams(c, map[string]string{"encoded": ""})

	err := h.ProxyImage(c)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestProxyHandler_ProxyImage_InvalidEncoding(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockProxyService(ctrl)
	h := handler.NewProxyHandlerHelper(mockService)

	e := newTestEcho()
	req := newJSONRequest(http.MethodGet, "/proxy/image/invalid", nil)
	c, rec := newTestContext(e, req)
	setPathParams(c, map[string]string{"encoded": "%%%invalid"})

	err := h.ProxyImage(c)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestProxyHandler_ProxyImage_ErrorMapping(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	imageURL := "https://example.com/img.png"
	encoded := base64.URLEncoding.EncodeToString([]byte(imageURL))

	tests := []struct {
		name           string
		err            error
		status         int
		cacheControl   string
		expectedPrefix string
	}{
		{name: "invalid_url", err: service.ErrInvalidURL, status: http.StatusBadRequest},
		{name: "invalid_protocol", err: service.ErrInvalidProtocol, status: http.StatusBadRequest},
		{name: "timeout", err: service.ErrRequestTimeout, status: http.StatusGatewayTimeout},
		{name: "upstream_rejected", err: service.ErrUpstreamRejected, status: http.StatusBadGateway, cacheControl: "no-store, no-cache, must-revalidate"},
		{name: "default", err: errors.New("boom"), status: http.StatusInternalServerError},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			mockService := mock.NewMockProxyService(ctrl)
			h := handler.NewProxyHandlerHelper(mockService)

			mockService.EXPECT().
				FetchImage(gomock.Any(), imageURL, "").
				Return(nil, tc.err)

			e := newTestEcho()
			req := newJSONRequest(http.MethodGet, "/proxy/image/"+encoded, nil)
			c, rec := newTestContext(e, req)
			setPathParams(c, map[string]string{"encoded": encoded})

			err := h.ProxyImage(c)
			require.NoError(t, err)
			require.Equal(t, tc.status, rec.Code)
			if tc.cacheControl != "" {
				require.Equal(t, tc.cacheControl, rec.Header().Get("Cache-Control"))
			}
		})
	}
}
