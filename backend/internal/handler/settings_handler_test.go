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

func TestSettingsHandler_GetAISettings_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockSettingsService(ctrl)
	h := handler.NewSettingsHandlerHelper(mockService, nil)

	e := newTestEcho()
	req := newJSONRequest(http.MethodGet, "/settings/ai", nil)
	c, rec := newTestContext(e, req)

	settings := &service.AISettings{
		Provider: "openai",
		Model:    "gpt-4",
	}

	mockService.EXPECT().
		GetAISettings(gomock.Any()).
		Return(settings, nil)

	err := h.GetAISettings(c)
	require.NoError(t, err)

	var resp handler.AISettingsResponse
	assertJSONResponse(t, rec, http.StatusOK, &resp)
	require.Equal(t, "openai", resp.Provider)
}

func TestSettingsHandler_UpdateAISettings_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockSettingsService(ctrl)
	h := handler.NewSettingsHandlerHelper(mockService, nil)

	e := newTestEcho()
	reqBody := map[string]interface{}{
		"provider": "openai",
		"model":    "gpt-4",
	}
	req := newJSONRequest(http.MethodPut, "/settings/ai", reqBody)
	c, rec := newTestContext(e, req)

	mockService.EXPECT().
		SetAISettings(gomock.Any(), gomock.Any()).
		Return(nil)

	mockService.EXPECT().
		GetAISettings(gomock.Any()).
		Return(&service.AISettings{Provider: "openai", Model: "gpt-4"}, nil)

	err := h.UpdateAISettings(c)
	require.NoError(t, err)

	require.Equal(t, http.StatusOK, rec.Code)
}

func TestSettingsHandler_TestNetworkProxy_Disabled(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockSettingsService(ctrl)
	h := handler.NewSettingsHandlerHelper(mockService, nil)

	e := newTestEcho()
	reqBody := map[string]interface{}{
		"enabled": false,
	}
	req := newJSONRequest(http.MethodPost, "/settings/network/test", reqBody)
	c, rec := newTestContext(e, req)

	err := h.TestNetworkProxy(c)
	require.NoError(t, err)

	var resp handler.NetworkTestResponse
	assertJSONResponse(t, rec, http.StatusOK, &resp)
	require.True(t, resp.Success)
}

func TestSettingsHandler_TestNetworkProxy_InvalidParams(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockSettingsService(ctrl)
	h := handler.NewSettingsHandlerHelper(mockService, nil)

	e := newTestEcho()
	reqBody := map[string]interface{}{
		"enabled": true,
		"host":    "",
	}
	req := newJSONRequest(http.MethodPost, "/settings/network/test", reqBody)
	c, rec := newTestContext(e, req)

	err := h.TestNetworkProxy(c)
	require.NoError(t, err)

	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestSettingsHandler_GetGeneralSettings_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockSettingsService(ctrl)
	h := handler.NewSettingsHandlerHelper(mockService, nil)

	e := newTestEcho()
	req := newJSONRequest(http.MethodGet, "/settings/general", nil)
	c, rec := newTestContext(e, req)

	settings := &service.GeneralSettings{
		AutoReadability: true,
	}

	mockService.EXPECT().
		GetGeneralSettings(gomock.Any()).
		Return(settings, nil)

	err := h.GetGeneralSettings(c)
	require.NoError(t, err)

	var resp handler.GeneralSettingsResponse
	assertJSONResponse(t, rec, http.StatusOK, &resp)
	require.True(t, resp.AutoReadability)
}

func TestSettingsHandler_UpdateGeneralSettings_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockSettingsService(ctrl)
	h := handler.NewSettingsHandlerHelper(mockService, nil)

	e := newTestEcho()
	reqBody := map[string]interface{}{
		"autoReadability": true,
	}
	req := newJSONRequest(http.MethodPut, "/settings/general", reqBody)
	c, rec := newTestContext(e, req)

	mockService.EXPECT().
		SetGeneralSettings(gomock.Any(), gomock.Any()).
		Return(nil)

	mockService.EXPECT().
		GetGeneralSettings(gomock.Any()).
		Return(&service.GeneralSettings{AutoReadability: true}, nil)

	err := h.UpdateGeneralSettings(c)
	require.NoError(t, err)

	require.Equal(t, http.StatusOK, rec.Code)
}

func TestSettingsHandler_GetAppearanceSettings_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockSettingsService(ctrl)
	h := handler.NewSettingsHandlerHelper(mockService, nil)

	e := newTestEcho()
	req := newJSONRequest(http.MethodGet, "/settings/appearance", nil)
	c, rec := newTestContext(e, req)

	settings := &service.AppearanceSettings{
		ContentTypes: []string{"article"},
	}

	mockService.EXPECT().
		GetAppearanceSettings(gomock.Any()).
		Return(settings, nil)

	err := h.GetAppearanceSettings(c)
	require.NoError(t, err)

	var resp handler.AppearanceSettingsResponse
	assertJSONResponse(t, rec, http.StatusOK, &resp)
	require.Equal(t, []string{"article"}, resp.ContentTypes)
}

func TestSettingsHandler_UpdateAppearanceSettings_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockSettingsService(ctrl)
	h := handler.NewSettingsHandlerHelper(mockService, nil)

	e := newTestEcho()
	reqBody := map[string]interface{}{
		"contentTypes": []string{"article", "picture"},
	}
	req := newJSONRequest(http.MethodPut, "/settings/appearance", reqBody)
	c, rec := newTestContext(e, req)

	mockService.EXPECT().
		SetAppearanceSettings(gomock.Any(), gomock.Any()).
		Return(nil)

	mockService.EXPECT().
		GetAppearanceSettings(gomock.Any()).
		Return(&service.AppearanceSettings{ContentTypes: []string{"article", "picture"}}, nil)

	err := h.UpdateAppearanceSettings(c)
	require.NoError(t, err)

	require.Equal(t, http.StatusOK, rec.Code)
}

func TestSettingsHandler_TestAI_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockSettingsService(ctrl)
	h := handler.NewSettingsHandlerHelper(mockService, nil)

	e := newTestEcho()
	reqBody := map[string]interface{}{
		"provider": "openai",
		"apiKey":   "sk-test",
		"model":    "gpt-4",
	}
	req := newJSONRequest(http.MethodPost, "/settings/ai/test", reqBody)
	c, rec := newTestContext(e, req)

	mockService.EXPECT().
		TestAI(gomock.Any(), "openai", "sk-test", "", "gpt-4", "responses", false, 0, "").
		Return("OK", nil)

	err := h.TestAI(c)
	require.NoError(t, err)

	var resp handler.AITestResponse
	assertJSONResponse(t, rec, http.StatusOK, &resp)
	require.Equal(t, "OK", resp.Message)
}

func TestSettingsHandler_ClearAnubisCookies_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockSettingsService(ctrl)
	h := handler.NewSettingsHandlerHelper(mockService, nil)

	e := newTestEcho()
	req := newJSONRequest(http.MethodDelete, "/settings/anubis-cookies", nil)
	c, rec := newTestContext(e, req)

	mockService.EXPECT().
		ClearAnubisCookies(gomock.Any()).
		Return(int64(5), nil)

	err := h.ClearAnubisCookies(c)
	require.NoError(t, err)

	require.Equal(t, http.StatusOK, rec.Code)
}
