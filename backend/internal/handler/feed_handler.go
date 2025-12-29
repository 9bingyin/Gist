package handler

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"

	"gist-backend/internal/model"
	"gist-backend/internal/service"
)

type FeedHandler struct {
	service service.FeedService
}

type createFeedRequest struct {
	URL      string `json:"url"`
	FolderID *int64 `json:"folderId"`
	Title    string `json:"title"`
}

type updateFeedRequest struct {
	Title    string `json:"title"`
	FolderID *int64 `json:"folderId"`
}

type feedResponse struct {
	ID           int64   `json:"id"`
	FolderID     *int64  `json:"folderId,omitempty"`
	Title        string  `json:"title"`
	URL          string  `json:"url"`
	SiteURL      *string `json:"siteUrl,omitempty"`
	Description  *string `json:"description,omitempty"`
	ETag         *string `json:"etag,omitempty"`
	LastModified *string `json:"lastModified,omitempty"`
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

func NewFeedHandler(service service.FeedService) *FeedHandler {
	return &FeedHandler{service: service}
}

func (h *FeedHandler) RegisterRoutes(g *echo.Group) {
	g.POST("/feeds", h.Create)
	g.GET("/feeds/preview", h.Preview)
	g.GET("/feeds", h.List)
	g.PUT("/feeds/:id", h.Update)
	g.DELETE("/feeds/:id", h.Delete)
}

func (h *FeedHandler) Create(c echo.Context) error {
	var req createFeedRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}
	feed, err := h.service.Add(c.Request().Context(), req.URL, req.FolderID, req.Title)
	if err != nil {
		return writeServiceError(c, err)
	}
	return c.JSON(http.StatusCreated, toFeedResponse(feed))
}

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

func (h *FeedHandler) Update(c echo.Context) error {
	id, err := parseIDParam(c, "id")
	if err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}
	var req updateFeedRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}
	feed, err := h.service.Update(c.Request().Context(), id, req.Title, req.FolderID)
	if err != nil {
		return writeServiceError(c, err)
	}
	return c.JSON(http.StatusOK, toFeedResponse(feed))
}

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

func toFeedResponse(feed model.Feed) feedResponse {
	return feedResponse{
		ID:           feed.ID,
		FolderID:     feed.FolderID,
		Title:        feed.Title,
		URL:          feed.URL,
		SiteURL:      feed.SiteURL,
		Description:  feed.Description,
		ETag:         feed.ETag,
		LastModified: feed.LastModified,
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
