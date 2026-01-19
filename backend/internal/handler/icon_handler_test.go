package handler_test

import (
	"context"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"gist/backend/internal/handler"
	"gist/backend/internal/service/mock"

	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"
)

// testContextKey is a custom type for context keys to avoid staticcheck SA1029
type testContextKey string

func TestIconHandler_GetIcon_FileExists(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockIconService(ctrl)
	h := handler.NewIconHandlerHelper(mockService)

	dir := t.TempDir()
	filename := "icon.png"
	fullPath := filepath.Join(dir, filename)
	require.NoError(t, os.WriteFile(fullPath, []byte("icon-data"), 0o600))

	mockService.EXPECT().
		GetIconPath(filename).
		Return(fullPath)

	e := newTestEcho()
	req := newJSONRequest(http.MethodGet, "/icons/"+filename, nil)
	c, rec := newTestContext(e, req)
	setPathParams(c, map[string]string{"filename": filename})

	err := h.GetIcon(c)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), "icon-data")
}

func TestIconHandler_GetIcon_NotFound(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockIconService(ctrl)
	h := handler.NewIconHandlerHelper(mockService)

	mockService.EXPECT().
		GetIconPath("missing.png").
		Return(filepath.Join(t.TempDir(), "missing.png"))

	e := newTestEcho()
	req := newJSONRequest(http.MethodGet, "/icons/missing.png", nil)
	c, rec := newTestContext(e, req)
	setPathParams(c, map[string]string{"filename": "missing.png"})

	err := h.GetIcon(c)
	require.NoError(t, err)
	require.Equal(t, http.StatusNotFound, rec.Code)
}

func TestIconHandler_GetIcon_EmptyFilename(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockIconService(ctrl)
	h := handler.NewIconHandlerHelper(mockService)

	e := newTestEcho()
	req := newJSONRequest(http.MethodGet, "/icons/", nil)
	c, rec := newTestContext(e, req)

	err := h.GetIcon(c)
	require.NoError(t, err)
	require.Equal(t, http.StatusNotFound, rec.Code)
}

func TestIconHandler_ClearIconCache_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockIconService(ctrl)
	h := handler.NewIconHandlerHelper(mockService)

	mockService.EXPECT().
		ClearAllIcons(gomock.Any()).
		Return(int64(3), nil)

	e := newTestEcho()
	req := newJSONRequest(http.MethodDelete, "/icons/cache", nil)
	c, rec := newTestContext(e, req)

	err := h.ClearIconCache(c)
	require.NoError(t, err)

	var resp map[string]int64
	assertJSONResponse(t, rec, http.StatusOK, &resp)
	require.Equal(t, int64(3), resp["deleted"])
}

func TestIconHandler_ClearIconCache_Error(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockIconService(ctrl)
	h := handler.NewIconHandlerHelper(mockService)

	mockService.EXPECT().
		ClearAllIcons(gomock.Any()).
		Return(int64(0), errors.New("clear failed"))

	e := newTestEcho()
	req := newJSONRequest(http.MethodDelete, "/icons/cache", nil)
	c, rec := newTestContext(e, req)

	err := h.ClearIconCache(c)
	require.NoError(t, err)
	require.Equal(t, http.StatusInternalServerError, rec.Code)
}

func TestIconHandler_ClearIconCache_Context(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockIconService(ctrl)
	h := handler.NewIconHandlerHelper(mockService)

	ctx := context.WithValue(context.Background(), testContextKey("key"), "value")
	mockService.EXPECT().
		ClearAllIcons(gomock.Any()).
		DoAndReturn(func(gotCtx context.Context) (int64, error) {
			require.Equal(t, "value", gotCtx.Value(testContextKey("key")))
			return int64(1), nil
		})

	e := newTestEcho()
	req := newJSONRequest(http.MethodDelete, "/icons/cache", nil)
	req = req.WithContext(ctx)
	c, rec := newTestContext(e, req)

	err := h.ClearIconCache(c)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, rec.Code)
}
