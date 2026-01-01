package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"

	"gist/backend/internal/model"
	"gist/backend/internal/service"
)

type FolderHandler struct {
	service service.FolderService
}

type folderRequest struct {
	Name     string  `json:"name"`
	ParentID *string `json:"parentId"`
	Type     string  `json:"type"`
}

type updateFolderTypeRequest struct {
	Type string `json:"type"`
}

type deleteFoldersRequest struct {
	IDs []string `json:"ids"`
}

type folderResponse struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	ParentID  *string `json:"parentId,omitempty"`
	Type      string  `json:"type"`
	CreatedAt string  `json:"createdAt"`
	UpdatedAt string  `json:"updatedAt"`
}

func NewFolderHandler(service service.FolderService) *FolderHandler {
	return &FolderHandler{service: service}
}

func (h *FolderHandler) RegisterRoutes(g *echo.Group) {
	g.POST("/folders", h.Create)
	g.GET("/folders", h.List)
	g.PUT("/folders/:id", h.Update)
	g.PATCH("/folders/:id/type", h.UpdateType)
	g.DELETE("/folders/:id", h.Delete)
	g.DELETE("/folders", h.DeleteBatch)
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
	var parentID *int64
	if req.ParentID != nil {
		id, err := strconv.ParseInt(*req.ParentID, 10, 64)
		if err != nil {
			return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid parent ID"})
		}
		parentID = &id
	}
	folderType := req.Type
	if folderType == "" {
		folderType = "article"
	} else if !isValidContentType(folderType) {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "type must be article, picture, or notification"})
	}
	folder, err := h.service.Create(c.Request().Context(), req.Name, parentID, folderType)
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
	var parentID *int64
	if req.ParentID != nil {
		pid, err := strconv.ParseInt(*req.ParentID, 10, 64)
		if err != nil {
			return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid parent ID"})
		}
		parentID = &pid
	}
	folder, err := h.service.Update(c.Request().Context(), id, req.Name, parentID)
	if err != nil {
		return writeServiceError(c, err)
	}
	return c.JSON(http.StatusOK, toFolderResponse(folder))
}

// UpdateType updates the content type of a folder.
// @Summary Update folder type
// @Description Change the content type of a folder (article/picture/notification)
// @Tags folders
// @Accept json
// @Param id path int true "Folder ID"
// @Param request body updateFolderTypeRequest true "Type update request"
// @Success 204 "No Content"
// @Failure 400 {object} errorResponse
// @Failure 404 {object} errorResponse
// @Router /folders/{id}/type [patch]
func (h *FolderHandler) UpdateType(c echo.Context) error {
	id, err := parseIDParam(c, "id")
	if err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}
	var req updateFolderTypeRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}
	if !isValidContentType(req.Type) {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "type must be article, picture, or notification"})
	}
	if err := h.service.UpdateType(c.Request().Context(), id, req.Type); err != nil {
		return writeServiceError(c, err)
	}
	return c.NoContent(http.StatusNoContent)
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

// DeleteBatch deletes multiple folders.
// @Summary Delete multiple folders
// @Description Delete multiple folders at once (also deletes feeds in them)
// @Tags folders
// @Accept json
// @Param request body deleteFoldersRequest true "Folder IDs to delete"
// @Success 204 "No Content"
// @Failure 400 {object} errorResponse
// @Router /folders [delete]
func (h *FolderHandler) DeleteBatch(c echo.Context) error {
	var req deleteFoldersRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid request"})
	}
	if len(req.IDs) == 0 {
		return c.JSON(http.StatusBadRequest, errorResponse{Error: "no folder IDs provided"})
	}

	for _, idStr := range req.IDs {
		id, err := strconv.ParseInt(idStr, 10, 64)
		if err != nil {
			return c.JSON(http.StatusBadRequest, errorResponse{Error: "invalid folder ID"})
		}
		if err := h.service.Delete(c.Request().Context(), id); err != nil {
			return writeServiceError(c, err)
		}
	}

	return c.NoContent(http.StatusNoContent)
}

func toFolderResponse(folder model.Folder) folderResponse {
	return folderResponse{
		ID:        idToString(folder.ID),
		Name:      folder.Name,
		ParentID:  idPtrToString(folder.ParentID),
		Type:      folder.Type,
		CreatedAt: folder.CreatedAt.UTC().Format(time.RFC3339),
		UpdatedAt: folder.UpdatedAt.UTC().Format(time.RFC3339),
	}
}
