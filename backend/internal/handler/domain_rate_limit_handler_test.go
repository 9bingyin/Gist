package handler_test

import (
	"gist/backend/internal/handler"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"

	"gist/backend/internal/service"
	"gist/backend/internal/service/mock"
)

func TestDomainRateLimitHandler_List_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockDomainRateLimitService(ctrl)
	h := handler.NewDomainRateLimitHandlerHelper(mockService)

	e := newTestEcho()
	req := newJSONRequest(http.MethodGet, "/domain-rate-limits", nil)
	c, rec := newTestContext(e, req)

	limits := []service.DomainRateLimitDTO{
		{ID: "1", Host: "example.com", IntervalSeconds: 10},
		{ID: "2", Host: "test.com", IntervalSeconds: 5},
	}

	mockService.EXPECT().
		List(gomock.Any()).
		Return(limits, nil)

	err := h.List(c)
	require.NoError(t, err)

	var resp handler.DomainRateLimitListResponse
	assertJSONResponse(t, rec, http.StatusOK, &resp)
	require.Len(t, resp.Items, 2)
}

func TestDomainRateLimitHandler_Create_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockDomainRateLimitService(ctrl)
	h := handler.NewDomainRateLimitHandlerHelper(mockService)

	e := newTestEcho()
	reqBody := map[string]interface{}{
		"host":            "example.com",
		"intervalSeconds": 10,
	}
	req := newJSONRequest(http.MethodPost, "/domain-rate-limits", reqBody)
	c, rec := newTestContext(e, req)

	mockService.EXPECT().
		SetInterval(gomock.Any(), "example.com", 10).
		Return(nil)

	mockService.EXPECT().
		List(gomock.Any()).
		Return([]service.DomainRateLimitDTO{
			{ID: "1", Host: "example.com", IntervalSeconds: 10},
		}, nil)

	err := h.Create(c)
	require.NoError(t, err)

	require.Equal(t, http.StatusCreated, rec.Code)
}

func TestDomainRateLimitHandler_Create_InvalidRequest(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockDomainRateLimitService(ctrl)
	h := handler.NewDomainRateLimitHandlerHelper(mockService)

	e := newTestEcho()
	reqBody := map[string]interface{}{
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
