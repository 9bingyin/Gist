package handler_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/require"
)

// newTestEcho creates a new Echo instance for testing.
func newTestEcho() *echo.Echo {
	e := echo.New()
	return e
}

// newJSONRequest creates a new HTTP request with JSON body.
func newJSONRequest(method, target string, body interface{}) *http.Request {
	var bodyReader io.Reader
	if body != nil {
		jsonBytes, _ := json.Marshal(body)
		bodyReader = bytes.NewReader(jsonBytes)
	}
	req := httptest.NewRequest(method, target, bodyReader)
	if body != nil {
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	}
	return req
}

// newJSONRequestRaw creates a new HTTP request with raw string body.
func newJSONRequestRaw(method, target string, body string) *http.Request {
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	return req
}

// newBody creates an io.ReadCloser from string data.
func newBody(data string) io.ReadCloser {
	return io.NopCloser(strings.NewReader(data))
}

// newTestContext creates a new Echo context for testing.
func newTestContext(e *echo.Echo, req *http.Request) (echo.Context, *httptest.ResponseRecorder) {
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	return c, rec
}

// setPathParams sets path parameters on the Echo context.
func setPathParams(c echo.Context, params map[string]string) {
	names := make([]string, 0, len(params))
	values := make([]string, 0, len(params))
	for name, value := range params {
		names = append(names, name)
		values = append(values, value)
	}
	c.SetParamNames(names...)
	c.SetParamValues(values...)
}

// parseJSONResponse parses the JSON response body into the given target.
func parseJSONResponse(t *testing.T, rec *httptest.ResponseRecorder, target interface{}) {
	err := json.Unmarshal(rec.Body.Bytes(), target)
	require.NoError(t, err, "failed to parse JSON response")
}

// assertJSONResponse asserts the response status code and parses the JSON body.
func assertJSONResponse(t *testing.T, rec *httptest.ResponseRecorder, expectedStatus int, target interface{}) {
	require.Equal(t, expectedStatus, rec.Code, "unexpected status code")
	if target != nil {
		parseJSONResponse(t, rec, target)
	}
}
