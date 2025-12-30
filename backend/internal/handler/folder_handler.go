package handler

import (
	"net/http"
	"time"

	"github.com/labstack/echo/v4"

	"gist/backend/internal/model"
	"gist/backend/internal/service"
)

type FolderHandler struct {
	service service.FolderService
}

type folderRequest struct {
	Name     string `json:"name"`
	ParentID *int64 `json:"parentId"`
}

type folderResponse struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	ParentID  *int64 `json:"parentId,omitempty"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

func NewFolderHandler(service service.FolderService) *FolderHandler {
	return &FolderHandler{service: service}
}

func (h *FolderHandler) RegisterRoutes(g *echo.Group) {
	g.POST("/folders", h.Create)
	g.GET("/folders", h.List)
	g.PUT("/folders/:id", h.Update)
	g.DELETE("/folders/:id", h.Delete)
}

// Create creates a new folder.
// @Summary Create a folder
// @Description Create a new folder to organize feeds
// @Tags folders
// @Accept json
// @Produce json
// @Param folder body folderRequest true "Folder creation request"
// @Success 201 Created {object} folderResponse
// @Failure 400 {object} errorResponse
// @Router /folders [post]
func (h *FolderHandler) Create(c echo.Context) error {
	var req folderRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}
	folder, err := h.service.Create(c.Request().Context(), req.Name, req.ParentID)
	if err != nil {
		return writeServiceError(c, err)
	}
	return c.JSON(http.StatusCreated, toFolderResponse(folder))
}

// List returns all folders.
// @Summary List folders
// @Description Get a list of all folders
// @Tags folders
// @Produce json
// @Success 200 {array} folderResponse
// @Router /folders [get]
func (h *FolderHandler) List(c echo.Context) error {
	folders, err := h.service.List(c.Request().Context())
	if err != nil {
		return writeServiceError(c, err)
	}
	response := make([]folderResponse, 0, len(folders))
	for _, folder := range folders {
		response = append(response, toFolderResponse(folder))
	}
	return c.JSON(http.StatusOK, response)
}

// Update updates an existing folder.
// @Summary Update a folder
// @Description Update the name or parent ID of an existing folder
// @Tags folders
// @Accept json
// @Produce json
// @Param id path int true "Folder ID"
// @Param folder body folderRequest true "Folder update request"
// @Success 200 {object} folderResponse
// @Failure 400 {object} errorResponse
// @Failure 404 {object} errorResponse
// @Router /folders/{id} [put]
func (h *FolderHandler) Update(c echo.Context) error {
	id, err := parseIDParam(c, "id")
	if err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}
	var req folderRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}
	folder, err := h.service.Update(c.Request().Context(), id, req.Name, req.ParentID)
	if err != nil {
		return writeServiceError(c, err)
	}
	return c.JSON(http.StatusOK, toFolderResponse(folder))
}

// Delete deletes a folder.
// @Summary Delete a folder
// @Description Delete an existing folder
// @Tags folders
// @Param id path int true "Folder ID"
// @Success 204 "No Content"
// @Failure 400 {object} errorResponse
// @Failure 404 {object} errorResponse
// @Router /folders/{id} [delete]
func (h *FolderHandler) Delete(c echo.Context) error {
	id, err := parseIDParam(c, "id")
	if err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}
	if err := h.service.Delete(c.Request().Context(), id); err != nil {
		return writeServiceError(c, err)
	}
	return c.NoContent(http.StatusNoContent)
}

func toFolderResponse(folder model.Folder) folderResponse {
	return folderResponse{
		ID:        folder.ID,
		Name:      folder.Name,
		ParentID:  folder.ParentID,
		CreatedAt: folder.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt: folder.UpdatedAt.UTC().Format(time.RFC3339),
	}
}
