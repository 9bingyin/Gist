package handler_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"gist/backend/internal/handler"
	"gist/backend/internal/model"
	"gist/backend/internal/service"
	"gist/backend/internal/service/mock"

	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"
)

func TestDomainRateLimitHandler_List_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockDomainRateLimitService(ctrl)
	h := handler.NewDomainRateLimitHandlerHelper(mockService)

	e := newTestEcho()
	req := newJSONRequest(http.MethodGet, "/domain-rate-limits", nil)
	c, rec := newTestContext(e, req)

	limits := []model.DomainRateLimit{
		{ID: 1, Host: "example.com", IntervalSeconds: 10},
		{ID: 2, Host: "test.com", IntervalSeconds: 5},
	}

	mockService.EXPECT().
		List(gomock.Any()).
		Return(limits, nil)

	err := h.List(c)
	require.NoError(t, err)

	var resp handler.DomainRateLimitListResponse
	assertJSONResponse(t, rec, http.StatusOK, &resp)
	require.Len(t, resp.Items, 2)
	require.Equal(t, "1", resp.Items[0].ID)
}

func TestDomainRateLimitHandler_Create_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockDomainRateLimitService(ctrl)
	h := handler.NewDomainRateLimitHandlerHelper(mockService)

	e := newTestEcho()
	reqBody := map[string]any{
		"host":            "example.com",
		"intervalSeconds": 10,
	}
	req := newJSONRequest(http.MethodPost, "/domain-rate-limits", reqBody)
	c, rec := newTestContext(e, req)

	mockService.EXPECT().
		SetInterval(gomock.Any(), "example.com", 10).
		Return(model.DomainRateLimit{ID: 1, Host: "example.com", IntervalSeconds: 10}, nil)

	err := h.Create(c)
	require.NoError(t, err)

	var resp handler.DomainRateLimitResponse
	assertJSONResponse(t, rec, http.StatusCreated, &resp)
	require.Equal(t, "1", resp.ID)
	require.Equal(t, "example.com", resp.Host)
	require.Equal(t, 10, resp.IntervalSeconds)
}

func TestDomainRateLimitHandler_Create_InvalidRequest(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockDomainRateLimitService(ctrl)
	h := handler.NewDomainRateLimitHandlerHelper(mockService)

	e := newTestEcho()
	reqBody := map[string]any{
		"host": "",
	}
	req := newJSONRequest(http.MethodPost, "/domain-rate-limits", reqBody)
	c, rec := newTestContext(e, req)

	err := h.Create(c)
	require.NoError(t, err)

	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestDomainRateLimitHandler_Delete_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockDomainRateLimitService(ctrl)
	h := handler.NewDomainRateLimitHandlerHelper(mockService)

	e := newTestEcho()
	req := newJSONRequest(http.MethodDelete, "/domain-rate-limits/example.com", nil)
	c, rec := newTestContext(e, req)
	setPathParams(c, map[string]string{"host": "example.com"})

	mockService.EXPECT().
		DeleteInterval(gomock.Any(), "example.com").
		Return(nil)

	err := h.Delete(c)
	require.NoError(t, err)

	require.Equal(t, http.StatusNoContent, rec.Code)
}

func TestDomainRateLimitHandler_Update_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockDomainRateLimitService(ctrl)
	h := handler.NewDomainRateLimitHandlerHelper(mockService)

	e := newTestEcho()
	reqBody := map[string]any{
		"intervalSeconds": 15,
	}
	req := newJSONRequest(http.MethodPut, "/domain-rate-limits/example.com", reqBody)
	c, rec := newTestContext(e, req)
	setPathParams(c, map[string]string{"host": "example.com"})

	mockService.EXPECT().
		SetInterval(gomock.Any(), "example.com", 15).
		Return(model.DomainRateLimit{ID: 7, Host: "example.com", IntervalSeconds: 15}, nil)

	err := h.Update(c)
	require.NoError(t, err)

	var resp handler.DomainRateLimitResponse
	assertJSONResponse(t, rec, http.StatusOK, &resp)
	require.Equal(t, "7", resp.ID)
	require.Equal(t, 15, resp.IntervalSeconds)
}

func TestDomainRateLimitHandler_Update_InvalidHost(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockDomainRateLimitService(ctrl)
	h := handler.NewDomainRateLimitHandlerHelper(mockService)

	e := newTestEcho()
	reqBody := map[string]any{
		"intervalSeconds": 10,
	}
	req := newJSONRequest(http.MethodPut, "/domain-rate-limits/", reqBody)
	c, rec := newTestContext(e, req)

	err := h.Update(c)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestDomainRateLimitHandler_Update_InvalidBody(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockDomainRateLimitService(ctrl)
	h := handler.NewDomainRateLimitHandlerHelper(mockService)

	e := newTestEcho()
	req := httptest.NewRequest(http.MethodPut, "/domain-rate-limits/example.com", newBody(`{"intervalSeconds":`))
	req.Header.Set("Content-Type", "application/json")
	c, rec := newTestContext(e, req)
	setPathParams(c, map[string]string{"host": "example.com"})

	err := h.Update(c)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestDomainRateLimitHandler_Update_InvalidInterval(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockDomainRateLimitService(ctrl)
	h := handler.NewDomainRateLimitHandlerHelper(mockService)

	e := newTestEcho()
	reqBody := map[string]any{
		"intervalSeconds": -1,
	}
	req := newJSONRequest(http.MethodPut, "/domain-rate-limits/example.com", reqBody)
	c, rec := newTestContext(e, req)
	setPathParams(c, map[string]string{"host": "example.com"})

	err := h.Update(c)
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestDomainRateLimitHandler_Delete_NotFound(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockDomainRateLimitService(ctrl)
	h := handler.NewDomainRateLimitHandlerHelper(mockService)

	e := newTestEcho()
	req := newJSONRequest(http.MethodDelete, "/domain-rate-limits/example.com", nil)
	c, rec := newTestContext(e, req)
	setPathParams(c, map[string]string{"host": "example.com"})

	mockService.EXPECT().
		DeleteInterval(gomock.Any(), "example.com").
		Return(service.ErrNotFound)

	err := h.Delete(c)
	require.NoError(t, err)
	require.Equal(t, http.StatusNotFound, rec.Code)
}
