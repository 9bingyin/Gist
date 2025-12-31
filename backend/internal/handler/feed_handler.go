package handler

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"

	"gist/backend/internal/model"
	"gist/backend/internal/service"
)

type FeedHandler struct {
	service        service.FeedService
	refreshService service.RefreshService
}

type createFeedRequest struct {
	URL      string  `json:"url"`
	FolderID *string `json:"folderId"`
	Title    string  `json:"title"`
}

type updateFeedRequest struct {
	Title    string  `json:"title"`
	FolderID *string `json:"folderId"`
}

type deleteFeedsRequest struct {
	IDs []string `json:"ids"`
}

type feedResponse struct {
	ID           string  `json:"id"`
	FolderID     *string `json:"folderId,omitempty"`
	Title        string  `json:"title"`
	URL          string  `json:"url"`
	SiteURL      *string `json:"siteUrl,omitempty"`
	Description  *string `json:"description,omitempty"`
	IconPath     *string `json:"iconPath,omitempty"`
	ETag         *string `json:"etag,omitempty"`
	LastModified *string `json:"lastModified,omitempty"`
	ErrorMessage *string `json:"errorMessage,omitempty"`
	CreatedAt    string  `json:"createdAt"`
	UpdatedAt    string  `json:"updatedAt"`
}

type feedPreviewResponse struct {
	URL         string  `json:"url"`
	Title       string  `json:"title"`
	Description *string `json:"description,omitempty"`
	SiteURL     *string `json:"siteUrl,omitempty"`
	ImageURL    *string `json:"imageUrl,omitempty"`
	ItemCount   *int    `json:"itemCount,omitempty"`
	LastUpdated *string `json:"lastUpdated,omitempty"`
}

func NewFeedHandler(service service.FeedService, refreshService service.RefreshService) *FeedHandler {
	return &FeedHandler{service: service, refreshService: refreshService}
}

func (h *FeedHandler) RegisterRoutes(g *echo.Group) {
	g.POST("/feeds", h.Create)
	g.POST("/feeds/refresh", h.RefreshAll)
	g.GET("/feeds/preview", h.Preview)
	g.GET("/feeds", h.List)
	g.PUT("/feeds/:id", h.Update)
	g.DELETE("/feeds/:id", h.Delete)
	g.DELETE("/feeds", h.DeleteBatch)
}

// Create creates a new feed.
// @Summary Create a feed
// @Description Subscribe to a new RSS/Atom feed
// @Tags feeds
// @Accept json
// @Produce json
// @Param feed body createFeedRequest true "Feed creation request"
// @Success 201 Created {object} feedResponse
// @Failure 400 {object} errorResponse
// @Router /feeds [post]
func (h *FeedHandler) Create(c echo.Context) error {
	var req createFeedRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}
	var folderID *int64
	if req.FolderID != nil {
		id, err := strconv.ParseInt(*req.FolderID, 10, 64)
		if err != nil {
			return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid folder ID"})
		}
		folderID = &id
	}
	feed, err := h.service.Add(c.Request().Context(), req.URL, folderID, req.Title)
	if err != nil {
		return writeServiceError(c, err)
	}
	return c.JSON(http.StatusCreated, toFeedResponse(feed))
}

// List returns all feeds, optionally filtered by folder.
// @Summary List feeds
// @Description Get a list of all subscribed feeds
// @Tags feeds
// @Produce json
// @Param folderId query int false "Filter by folder ID"
// @Success 200 {array} feedResponse
// @Router /feeds [get]
func (h *FeedHandler) List(c echo.Context) error {
	var folderID *int64
	if raw := c.QueryParam("folderId"); raw != "" {
		parsed, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
		}
		folderID = &parsed
	}

	feeds, err := h.service.List(c.Request().Context(), folderID)
	if err != nil {
		return writeServiceError(c, err)
	}
	response := make([]feedResponse, 0, len(feeds))
	for _, feed := range feeds {
		response = append(response, toFeedResponse(feed))
	}
	return c.JSON(http.StatusOK, response)
}

// Preview fetches a feed's information without subscribing.
// @Summary Preview a feed
// @Description Fetch information about a feed from its URL
// @Tags feeds
// @Produce json
// @Param url query string true "Feed URL"
// @Success 200 {object} feedPreviewResponse
// @Failure 400 {object} errorResponse
// @Router /feeds/preview [get]
func (h *FeedHandler) Preview(c echo.Context) error {
	rawURL := strings.TrimSpace(c.QueryParam("url"))
	if rawURL == "" {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}
	preview, err := h.service.Preview(c.Request().Context(), rawURL)
	if err != nil {
		return writeServiceError(c, err)
	}
	return c.JSON(http.StatusOK, toFeedPreviewResponse(preview))
}

// Update updates an existing feed.
// @Summary Update a feed
// @Description Update the title or folder of an existing feed
// @Tags feeds
// @Accept json
// @Produce json
// @Param id path int true "Feed ID"
// @Param feed body updateFeedRequest true "Feed update request"
// @Success 200 {object} feedResponse
// @Failure 400 {object} errorResponse
// @Failure 404 {object} errorResponse
// @Router /feeds/{id} [put]
func (h *FeedHandler) Update(c echo.Context) error {
	id, err := parseIDParam(c, "id")
	if err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}
	var req updateFeedRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}
	var folderID *int64
	if req.FolderID != nil {
		fid, err := strconv.ParseInt(*req.FolderID, 10, 64)
		if err != nil {
			return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid folder ID"})
		}
		folderID = &fid
	}
	feed, err := h.service.Update(c.Request().Context(), id, req.Title, folderID)
	if err != nil {
		return writeServiceError(c, err)
	}
	return c.JSON(http.StatusOK, toFeedResponse(feed))
}

// Delete deletes a feed.
// @Summary Delete a feed
// @Description Unsubscribe from a feed
// @Tags feeds
// @Param id path int true "Feed ID"
// @Success 204 "No Content"
// @Failure 400 {object} errorResponse
// @Failure 404 {object} errorResponse
// @Router /feeds/{id} [delete]
func (h *FeedHandler) Delete(c echo.Context) error {
	id, err := parseIDParam(c, "id")
	if err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}
	if err := h.service.Delete(c.Request().Context(), id); err != nil {
		return writeServiceError(c, err)
	}
	return c.NoContent(http.StatusNoContent)
}

// DeleteBatch deletes multiple feeds.
// @Summary Delete multiple feeds
// @Description Unsubscribe from multiple feeds at once
// @Tags feeds
// @Accept json
// @Param request body deleteFeedsRequest true "Feed IDs to delete"
// @Success 204 "No Content"
// @Failure 400 {object} errorResponse
// @Router /feeds [delete]
func (h *FeedHandler) DeleteBatch(c echo.Context) error {
	var req deleteFeedsRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}
	if len(req.IDs) == 0 {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "no feed IDs provided"})
	}

	for _, idStr := range req.IDs {
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid feed ID"})
		}
		if err := h.service.Delete(c.Request().Context(), id); err != nil {
			return writeServiceError(c, err)
		}
	}

	return c.NoContent(http.StatusNoContent)
}

// RefreshAll triggers a refresh of all feeds.
// @Summary Refresh all feeds
// @Description Trigger an immediate refresh of all subscribed feeds
// @Tags feeds
// @Success 204 "No Content"
// @Failure 409 {object} errorResponse "Refresh already in progress"
// @Router /feeds/refresh [post]
func (h *FeedHandler) RefreshAll(c echo.Context) error {
	if err := h.refreshService.RefreshAll(c.Request().Context()); err != nil {
		if errors.Is(err, service.ErrAlreadyRefreshing) {
			return c.JSON(http.StatusConflict, errorResponse{Error: "refresh already in progress"})
		}
		return writeServiceError(c, err)
	}
	return c.NoContent(http.StatusNoContent)
}

func toFeedResponse(feed model.Feed) feedResponse {
	return feedResponse{
		ID:           idToString(feed.ID),
		FolderID:     idPtrToString(feed.FolderID),
		Title:        feed.Title,
		URL:          feed.URL,
		SiteURL:      feed.SiteURL,
		Description:  feed.Description,
		IconPath:     feed.IconPath,
		ETag:         feed.ETag,
		LastModified: feed.LastModified,
		ErrorMessage: feed.ErrorMessage,
		CreatedAt:    feed.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt:    feed.UpdatedAt.UTC().Format(time.RFC3339),
	}
}

func toFeedPreviewResponse(preview service.FeedPreview) feedPreviewResponse {
	return feedPreviewResponse{
		URL:         preview.URL,
		Title:       preview.Title,
		Description: preview.Description,
		SiteURL:     preview.SiteURL,
		ImageURL:    preview.ImageURL,
		ItemCount:   preview.ItemCount,
		LastUpdated: preview.LastUpdated,
	}
}
