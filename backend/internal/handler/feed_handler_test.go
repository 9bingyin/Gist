package handler_test

import (
	"gist/backend/internal/handler"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"

	"gist/backend/internal/model"
	"gist/backend/internal/service"
	"gist/backend/internal/service/mock"
)

func TestFeedHandler_Create_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockFeedService(ctrl)
	mockRefreshService := mock.NewMockRefreshService(ctrl)
	h := handler.NewFeedHandlerHelper(mockService, mockRefreshService)

	e := newTestEcho()
	reqBody := map[string]interface{}{
		"url":      "https://example.com/feed.xml",
		"folderId": "123",
		"type":     "article",
	}
	req := newJSONRequest(http.MethodPost, "/feeds", reqBody)
	c, rec := newTestContext(e, req)

	expectedFeed := model.Feed{
		ID:    1,
		Title: "Example Feed",
		URL:   "https://example.com/feed.xml",
	}

	mockService.EXPECT().
		Add(gomock.Any(), "https://example.com/feed.xml", gomock.Any(), "", "article").
		Return(expectedFeed, nil)

	err := h.Create(c)
	require.NoError(t, err)

	var resp handler.FeedResponse
	assertJSONResponse(t, rec, http.StatusCreated, &resp)
	require.Equal(t, "1", resp.ID)
	require.Equal(t, "Example Feed", resp.Title)
}

func TestFeedHandler_Create_Conflict(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockFeedService(ctrl)
	mockRefreshService := mock.NewMockRefreshService(ctrl)
	h := handler.NewFeedHandlerHelper(mockService, mockRefreshService)

	e := newTestEcho()
	reqBody := map[string]interface{}{
		"url": "https://example.com/feed.xml",
	}
	req := newJSONRequest(http.MethodPost, "/feeds", reqBody)
	c, rec := newTestContext(e, req)

	conflictErr := &service.FeedConflictError{
		ExistingFeed: model.Feed{ID: 999, Title: "Existing"},
	}

	mockService.EXPECT().
		Add(gomock.Any(), "https://example.com/feed.xml", gomock.Any(), "", "article").
		Return(model.Feed{}, conflictErr)

	err := h.Create(c)
	require.NoError(t, err)

	require.Equal(t, http.StatusConflict, rec.Code)
}

func TestFeedHandler_Create_InvalidRequest(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockFeedService(ctrl)
	mockRefreshService := mock.NewMockRefreshService(ctrl)
	h := handler.NewFeedHandlerHelper(mockService, mockRefreshService)

	e := newTestEcho()
	req := newJSONRequest(http.MethodPost, "/feeds", map[string]interface{}{})
	c, rec := newTestContext(e, req)

	// Empty URL will be passed to service, which should return an error
	mockService.EXPECT().
		Add(gomock.Any(), "", gomock.Any(), "", "article").
		Return(model.Feed{}, service.ErrInvalid)

	err := h.Create(c)
	require.NoError(t, err)

	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestFeedHandler_List_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockFeedService(ctrl)
	mockRefreshService := mock.NewMockRefreshService(ctrl)
	h := handler.NewFeedHandlerHelper(mockService, mockRefreshService)

	e := newTestEcho()
	req := newJSONRequest(http.MethodGet, "/feeds", nil)
	c, rec := newTestContext(e, req)

	feeds := []model.Feed{
		{ID: 1, Title: "Feed 1", URL: "https://example.com/1"},
		{ID: 2, Title: "Feed 2", URL: "https://example.com/2"},
	}

	mockService.EXPECT().
		List(gomock.Any(), gomock.Any()).
		Return(feeds, nil)

	err := h.List(c)
	require.NoError(t, err)

	var resp []handler.FeedResponse
	assertJSONResponse(t, rec, http.StatusOK, &resp)
	require.Len(t, resp, 2)
	require.Equal(t, "1", resp[0].ID)
	require.Equal(t, "Feed 1", resp[0].Title)
}

func TestFeedHandler_Update_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockFeedService(ctrl)
	mockRefreshService := mock.NewMockRefreshService(ctrl)
	h := handler.NewFeedHandlerHelper(mockService, mockRefreshService)

	e := newTestEcho()
	reqBody := map[string]interface{}{
		"title": "Updated Title",
	}
	req := newJSONRequest(http.MethodPut, "/feeds/123", reqBody)
	c, rec := newTestContext(e, req)
	setPathParams(c, map[string]string{"id": "123"})

	updatedFeed := model.Feed{
		ID:    123,
		Title: "Updated Title",
	}

	mockService.EXPECT().
		Update(gomock.Any(), int64(123), "Updated Title", gomock.Any()).
		Return(updatedFeed, nil)

	err := h.Update(c)
	require.NoError(t, err)

	var resp handler.FeedResponse
	assertJSONResponse(t, rec, http.StatusOK, &resp)
	require.Equal(t, "123", resp.ID)
	require.Equal(t, "Updated Title", resp.Title)
}

func TestFeedHandler_Delete_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockFeedService(ctrl)
	mockRefreshService := mock.NewMockRefreshService(ctrl)
	h := handler.NewFeedHandlerHelper(mockService, mockRefreshService)

	e := newTestEcho()
	req := newJSONRequest(http.MethodDelete, "/feeds/123", nil)
	c, rec := newTestContext(e, req)
	setPathParams(c, map[string]string{"id": "123"})

	mockService.EXPECT().
		Delete(gomock.Any(), int64(123)).
		Return(nil)

	err := h.Delete(c)
	require.NoError(t, err)

	require.Equal(t, http.StatusNoContent, rec.Code)
}

func TestFeedHandler_UpdateType_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockFeedService(ctrl)
	mockRefreshService := mock.NewMockRefreshService(ctrl)
	h := handler.NewFeedHandlerHelper(mockService, mockRefreshService)

	e := newTestEcho()
	reqBody := map[string]interface{}{
		"type": "picture",
	}
	req := newJSONRequest(http.MethodPatch, "/feeds/123/type", reqBody)
	c, rec := newTestContext(e, req)
	setPathParams(c, map[string]string{"id": "123"})

	mockService.EXPECT().
		UpdateType(gomock.Any(), int64(123), "picture").
		Return(nil)

	err := h.UpdateType(c)
	require.NoError(t, err)

	require.Equal(t, http.StatusNoContent, rec.Code)
}

func TestFeedHandler_DeleteBatch_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockFeedService(ctrl)
	mockRefreshService := mock.NewMockRefreshService(ctrl)
	h := handler.NewFeedHandlerHelper(mockService, mockRefreshService)

	e := newTestEcho()
	reqBody := map[string]interface{}{
		"ids": []string{"1", "2", "3"},
	}
	req := newJSONRequest(http.MethodDelete, "/feeds", reqBody)
	c, rec := newTestContext(e, req)

	mockService.EXPECT().
		DeleteBatch(gomock.Any(), []int64{1, 2, 3}).
		Return(nil)

	err := h.DeleteBatch(c)
	require.NoError(t, err)

	require.Equal(t, http.StatusNoContent, rec.Code)
}

func TestFeedHandler_RefreshAll_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockFeedService(ctrl)
	mockRefreshService := mock.NewMockRefreshService(ctrl)
	h := handler.NewFeedHandlerHelper(mockService, mockRefreshService)

	e := newTestEcho()
	req := newJSONRequest(http.MethodPost, "/feeds/refresh", nil)
	c, rec := newTestContext(e, req)

	mockRefreshService.EXPECT().
		RefreshAll(gomock.Any()).
		Return(nil)

	err := h.RefreshAll(c)
	require.NoError(t, err)

	require.Equal(t, http.StatusNoContent, rec.Code)
}

func TestFeedHandler_Preview_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockService := mock.NewMockFeedService(ctrl)
	mockRefreshService := mock.NewMockRefreshService(ctrl)
	h := handler.NewFeedHandlerHelper(mockService, mockRefreshService)

	e := newTestEcho()
	req := newJSONRequest(http.MethodGet, "/feeds/preview?url=https://example.com/feed.xml", nil)
	c, rec := newTestContext(e, req)

	siteURL := "https://example.com"
	preview := service.FeedPreview{
		Title:   "Example Feed",
		SiteURL: &siteURL,
	}

	mockService.EXPECT().
		Preview(gomock.Any(), "https://example.com/feed.xml").
		Return(preview, nil)

	err := h.Preview(c)
	require.NoError(t, err)

	var resp handler.FeedPreviewResponse
	assertJSONResponse(t, rec, http.StatusOK, &resp)
	require.Equal(t, "Example Feed", resp.Title)
}
