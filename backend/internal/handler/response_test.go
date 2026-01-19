package handler_test

import (
	"errors"
	"net/http"
	"testing"

	"gist/backend/internal/handler"
	"gist/backend/internal/service"

	"github.com/stretchr/testify/require"
)

func TestWriteServiceError_Mapping(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		status   int
		expected string
	}{
		{name: "invalid", err: service.ErrInvalid, status: http.StatusBadRequest, expected: "invalid request"},
		{name: "not_found", err: service.ErrNotFound, status: http.StatusNotFound, expected: "resource not found"},
		{name: "conflict", err: service.ErrConflict, status: http.StatusConflict, expected: "conflict"},
		{name: "feed_fetch", err: service.ErrFeedFetch, status: http.StatusBadGateway, expected: "feed fetch failed"},
		{name: "default", err: errors.New("boom"), status: http.StatusInternalServerError, expected: "internal error"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			e := newTestEcho()
			req := newJSONRequest(http.MethodGet, "/", nil)
			c, rec := newTestContext(e, req)

			err := handler.WriteServiceError(c, tc.err)
			require.NoError(t, err)

			var resp map[string]string
			assertJSONResponse(t, rec, tc.status, &resp)
			require.Equal(t, tc.expected, resp["error"])
		})
	}
}

func TestErrorResponse(t *testing.T) {
	e := newTestEcho()
	req := newJSONRequest(http.MethodGet, "/", nil)
	c, rec := newTestContext(e, req)

	err := handler.Error(c, http.StatusBadRequest, "bad request")
	require.NoError(t, err)

	var resp map[string]string
	assertJSONResponse(t, rec, http.StatusBadRequest, &resp)
	require.Equal(t, "bad request", resp["error"])
}

func TestIDPtrToString(t *testing.T) {
	require.Nil(t, handler.IDPtrToString(nil))

	id := int64(42)
	got := handler.IDPtrToString(&id)
	require.NotNil(t, got)
	require.Equal(t, "42", *got)
}

func TestItoa(t *testing.T) {
	require.Equal(t, "123", handler.Itoa(123))
}
