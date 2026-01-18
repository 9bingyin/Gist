package handler_test

import (
	"gist/backend/internal/handler"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"

	"gist/backend/internal/model"
	"gist/backend/internal/service/mock"
)

func TestFolderHandler_Create_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockFolderService(ctrl)
	h := handler.NewFolderHandlerHelper(mockService)

	e := newTestEcho()
	reqBody := map[string]interface{}{
		"name": "Test Folder",
		"type": "article",
	}
	req := newJSONRequest(http.MethodPost, "/folders", reqBody)
	c, rec := newTestContext(e, req)

	folder := model.Folder{
		ID:   1,
		Name: "Test Folder",
		Type: "article",
	}

	mockService.EXPECT().
		Create(gomock.Any(), "Test Folder", gomock.Any(), "article").
		Return(folder, nil)

	err := h.Create(c)
	require.NoError(t, err)

	var resp handler.FolderResponse
	assertJSONResponse(t, rec, http.StatusCreated, &resp)
	require.Equal(t, "1", resp.ID)
	require.Equal(t, "Test Folder", resp.Name)
}

func TestFolderHandler_List_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockFolderService(ctrl)
	h := handler.NewFolderHandlerHelper(mockService)

	e := newTestEcho()
	req := newJSONRequest(http.MethodGet, "/folders", nil)
	c, rec := newTestContext(e, req)

	folders := []model.Folder{
		{ID: 1, Name: "Folder 1"},
		{ID: 2, Name: "Folder 2"},
	}

	mockService.EXPECT().
		List(gomock.Any()).
		Return(folders, nil)

	err := h.List(c)
	require.NoError(t, err)

	var resp []handler.FolderResponse
	assertJSONResponse(t, rec, http.StatusOK, &resp)
	require.Len(t, resp, 2)
}

func TestFolderHandler_Update_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockFolderService(ctrl)
	h := handler.NewFolderHandlerHelper(mockService)

	e := newTestEcho()
	reqBody := map[string]interface{}{
		"name": "Updated Name",
	}
	req := newJSONRequest(http.MethodPut, "/folders/123", reqBody)
	c, rec := newTestContext(e, req)
	setPathParams(c, map[string]string{"id": "123"})

	folder := model.Folder{
		ID:   123,
		Name: "Updated Name",
	}

	mockService.EXPECT().
		Update(gomock.Any(), int64(123), "Updated Name", gomock.Any()).
		Return(folder, nil)

	err := h.Update(c)
	require.NoError(t, err)

	var resp handler.FolderResponse
	assertJSONResponse(t, rec, http.StatusOK, &resp)
	require.Equal(t, "Updated Name", resp.Name)
}

func TestFolderHandler_Delete_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockFolderService(ctrl)
	h := handler.NewFolderHandlerHelper(mockService)

	e := newTestEcho()
	req := newJSONRequest(http.MethodDelete, "/folders/123", nil)
	c, rec := newTestContext(e, req)
	setPathParams(c, map[string]string{"id": "123"})

	mockService.EXPECT().
		Delete(gomock.Any(), int64(123)).
		Return(nil)

	err := h.Delete(c)
	require.NoError(t, err)

	require.Equal(t, http.StatusNoContent, rec.Code)
}

func TestFolderHandler_UpdateType_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockFolderService(ctrl)
	h := handler.NewFolderHandlerHelper(mockService)

	e := newTestEcho()
	reqBody := map[string]interface{}{
		"type": "picture",
	}
	req := newJSONRequest(http.MethodPatch, "/folders/123/type", reqBody)
	c, rec := newTestContext(e, req)
	setPathParams(c, map[string]string{"id": "123"})

	mockService.EXPECT().
		UpdateType(gomock.Any(), int64(123), "picture").
		Return(nil)

	err := h.UpdateType(c)
	require.NoError(t, err)

	require.Equal(t, http.StatusNoContent, rec.Code)
}

func TestFolderHandler_DeleteBatch_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockFolderService(ctrl)
	h := handler.NewFolderHandlerHelper(mockService)

	e := newTestEcho()
	reqBody := map[string]interface{}{
		"ids": []string{"1", "2"},
	}
	req := newJSONRequest(http.MethodDelete, "/folders", reqBody)
	c, rec := newTestContext(e, req)

	mockService.EXPECT().
		Delete(gomock.Any(), int64(1)).
		Return(nil)
	mockService.EXPECT().
		Delete(gomock.Any(), int64(2)).
		Return(nil)

	err := h.DeleteBatch(c)
	require.NoError(t, err)

	require.Equal(t, http.StatusNoContent, rec.Code)
}
