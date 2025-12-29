package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"

	"gist-backend/internal/model"
	"gist-backend/internal/service"
)

type EntryHandler struct {
	service service.EntryService
}

func NewEntryHandler(service service.EntryService) *EntryHandler {
	return &EntryHandler{service: service}
}

func (h *EntryHandler) RegisterRoutes(g *echo.Group) {
	g.GET("/entries", h.List)
	g.GET("/entries/:id", h.GetByID)
	g.PATCH("/entries/:id/read", h.UpdateReadStatus)
	g.POST("/entries/mark-read", h.MarkAllAsRead)
	g.GET("/unread-counts", h.GetUnreadCounts)
}

type entryResponse struct {
	ID          int64   `json:"id"`
	FeedID      int64   `json:"feedId"`
	Title       *string `json:"title,omitempty"`
	URL         *string `json:"url,omitempty"`
	Content     *string `json:"content,omitempty"`
	Author      *string `json:"author,omitempty"`
	PublishedAt *string `json:"publishedAt,omitempty"`
	Read        bool    `json:"read"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
}

type entryListResponse struct {
	Entries []entryResponse `json:"entries"`
	HasMore bool            `json:"hasMore"`
}

type updateReadRequest struct {
	Read bool `json:"read"`
}

type markAllReadRequest struct {
	FeedID   *int64 `json:"feedId,omitempty"`
	FolderID *int64 `json:"folderId,omitempty"`
}

type unreadCountsResponse struct {
	Counts map[string]int `json:"counts"`
}

func (h *EntryHandler) List(c echo.Context) error {
	params := service.EntryListParams{
		Limit:  50,
		Offset: 0,
	}

	if raw := c.QueryParam("feedId"); raw != "" {
		id, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid feedId"})
		}
		params.FeedID = &id
	}

	if raw := c.QueryParam("folderId"); raw != "" {
		id, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid folderId"})
		}
		params.FolderID = &id
	}

	if c.QueryParam("unreadOnly") == "true" {
		params.UnreadOnly = true
	}

	if raw := c.QueryParam("limit"); raw != "" {
		limit, err := strconv.Atoi(raw)
		if err == nil && limit > 0 && limit <= 100 {
			params.Limit = limit
		}
	}

	if raw := c.QueryParam("offset"); raw != "" {
		offset, err := strconv.Atoi(raw)
		if err == nil && offset >= 0 {
			params.Offset = offset
		}
	}

	entries, err := h.service.List(c.Request().Context(), params)
	if err != nil {
		return writeServiceError(c, err)
	}

	hasMore := len(entries) == params.Limit

	response := entryListResponse{
		Entries: make([]entryResponse, len(entries)),
		HasMore: hasMore,
	}
	for i, e := range entries {
		response.Entries[i] = toEntryResponse(e)
	}

	return c.JSON(http.StatusOK, response)
}

func (h *EntryHandler) GetByID(c echo.Context) error {
	id, err := parseIDParam(c, "id")
	if err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid id"})
	}

	entry, err := h.service.GetByID(c.Request().Context(), id)
	if err != nil {
		return writeServiceError(c, err)
	}

	return c.JSON(http.StatusOK, toEntryResponse(entry))
}

func (h *EntryHandler) UpdateReadStatus(c echo.Context) error {
	id, err := parseIDParam(c, "id")
	if err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid id"})
	}

	var req updateReadRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}

	if err := h.service.MarkAsRead(c.Request().Context(), id, req.Read); err != nil {
		return writeServiceError(c, err)
	}

	return c.NoContent(http.StatusNoContent)
}

func (h *EntryHandler) MarkAllAsRead(c echo.Context) error {
	var req markAllReadRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}

	if err := h.service.MarkAllAsRead(c.Request().Context(), req.FeedID, req.FolderID); err != nil {
		return writeServiceError(c, err)
	}

	return c.NoContent(http.StatusNoContent)
}

func (h *EntryHandler) GetUnreadCounts(c echo.Context) error {
	counts, err := h.service.GetUnreadCounts(c.Request().Context())
	if err != nil {
		return writeServiceError(c, err)
	}

	// Convert int64 keys to string keys for JSON
	stringCounts := make(map[string]int)
	for feedID, count := range counts {
		stringCounts[strconv.FormatInt(feedID, 10)] = count
	}

	return c.JSON(http.StatusOK, unreadCountsResponse{Counts: stringCounts})
}

func toEntryResponse(e model.Entry) entryResponse {
	resp := entryResponse{
		ID:        e.ID,
		FeedID:    e.FeedID,
		Title:     e.Title,
		URL:       e.URL,
		Content:   e.Content,
		Author:    e.Author,
		Read:      e.Read,
		CreatedAt: e.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt: e.UpdatedAt.UTC().Format(time.RFC3339),
	}

	if e.PublishedAt != nil {
		formatted := e.PublishedAt.UTC().Format(time.RFC3339)
		resp.PublishedAt = &formatted
	}

	return resp
}
