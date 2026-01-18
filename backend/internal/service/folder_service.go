//go:generate mockgen -source=$GOFILE -destination=mock/$GOFILE -package=mock
package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"gist/backend/pkg/logger"
	"gist/backend/internal/model"
	"gist/backend/internal/repository"
)

type FolderService interface {
	Create(ctx context.Context, name string, parentID *int64, folderType string) (model.Folder, error)
	List(ctx context.Context) ([]model.Folder, error)
	Update(ctx context.Context, id int64, name string, parentID *int64) (model.Folder, error)
	UpdateType(ctx context.Context, id int64, folderType string) error
	Delete(ctx context.Context, id int64) error
}

type folderService struct {
	folders repository.FolderRepository
	feeds   repository.FeedRepository
}

func NewFolderService(folders repository.FolderRepository, feeds repository.FeedRepository) FolderService {
	return &folderService{folders: folders, feeds: feeds}
}

// detectCycle checks if setting newParentID as parent of id would create a cycle.
func (s *folderService) detectCycle(ctx context.Context, id int64, newParentID *int64) (bool, error) {
	if newParentID == nil {
		return false, nil
	}
	// Direct self-reference
	if *newParentID == id {
		return true, nil
	}
	// Walk up the parent chain to detect indirect cycles
	visited := make(map[int64]bool)
	visited[id] = true

	currentID := newParentID
	for currentID != nil {
		if visited[*currentID] {
			return true, nil // Cycle detected
		}
		visited[*currentID] = true
		folder, err := s.folders.GetByID(ctx, *currentID)
		if err != nil {
			return false, err
		}
		currentID = folder.ParentID
	}
	return false, nil
}

func (s *folderService) Create(ctx context.Context, name string, parentID *int64, folderType string) (model.Folder, error) {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return model.Folder{}, ErrInvalid
	}
	if folderType == "" {
		folderType = "article"
	}
	if parentID != nil {
		if _, err := s.folders.GetByID(ctx, *parentID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return model.Folder{}, ErrNotFound
			}
			return model.Folder{}, fmt.Errorf("check parent folder: %w", err)
		}
	}
	if existing, err := s.folders.FindByName(ctx, trimmed, parentID); err != nil {
		return model.Folder{}, fmt.Errorf("check folder name: %w", err)
	} else if existing != nil {
		return model.Folder{}, ErrConflict
	}

	folder, err := s.folders.Create(ctx, trimmed, parentID, folderType)
	if err != nil {
		logger.Error("folder create failed", "module", "service", "action", "create", "resource", "folder", "result", "failed", "error", err)
		return model.Folder{}, err
	}
	logger.Info("folder created", "module", "service", "action", "create", "resource", "folder", "result", "ok", "folder_id", folder.ID)
	return folder, nil
}

func (s *folderService) List(ctx context.Context) ([]model.Folder, error) {
	folders, err := s.folders.List(ctx)
	if err != nil {
		logger.Error("folder list failed", "module", "service", "action", "list", "resource", "folder", "result", "failed", "error", err)
		return nil, err
	}
	return folders, nil
}

func (s *folderService) Update(ctx context.Context, id int64, name string, parentID *int64) (model.Folder, error) {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return model.Folder{}, ErrInvalid
	}
	// Check for cycles (both direct and indirect)
	if hasCycle, err := s.detectCycle(ctx, id, parentID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return model.Folder{}, ErrNotFound
		}
		return model.Folder{}, fmt.Errorf("check cycle: %w", err)
	} else if hasCycle {
		return model.Folder{}, ErrInvalid
	}
	if parentID != nil {
		if _, err := s.folders.GetByID(ctx, *parentID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return model.Folder{}, ErrNotFound
			}
			return model.Folder{}, fmt.Errorf("check parent folder: %w", err)
		}
	}
	if _, err := s.folders.GetByID(ctx, id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return model.Folder{}, ErrNotFound
		}
		return model.Folder{}, fmt.Errorf("get folder: %w", err)
	}
	if existing, err := s.folders.FindByName(ctx, trimmed, parentID); err != nil {
		return model.Folder{}, fmt.Errorf("check folder name: %w", err)
	} else if existing != nil && existing.ID != id {
		return model.Folder{}, ErrConflict
	}

	updated, err := s.folders.Update(ctx, id, trimmed, parentID)
	if err != nil {
		logger.Error("folder update failed", "module", "service", "action", "update", "resource", "folder", "result", "failed", "folder_id", id, "error", err)
		return model.Folder{}, err
	}
	logger.Info("folder updated", "module", "service", "action", "update", "resource", "folder", "result", "ok", "folder_id", updated.ID)
	return updated, nil
}

func (s *folderService) UpdateType(ctx context.Context, id int64, folderType string) error {
	if _, err := s.folders.GetByID(ctx, id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return fmt.Errorf("get folder: %w", err)
	}

	// Update folder type
	if err := s.folders.UpdateType(ctx, id, folderType); err != nil {
		logger.Error("folder update type failed", "module", "service", "action", "update", "resource", "folder", "result", "failed", "folder_id", id, "type", folderType, "error", err)
		return err
	}

	// Update all feeds in this folder to the same type using batch operation
	if err := s.feeds.UpdateTypeByFolderID(ctx, id, folderType); err != nil {
		logger.Error("folder update feeds type failed", "module", "service", "action", "update", "resource", "feed", "result", "failed", "folder_id", id, "type", folderType, "error", err)
		return fmt.Errorf("update feeds type in folder: %w", err)
	}

	logger.Info("folder type updated", "module", "service", "action", "update", "resource", "folder", "result", "ok", "folder_id", id, "type", folderType)
	return nil
}

func (s *folderService) Delete(ctx context.Context, id int64) error {
	if _, err := s.folders.GetByID(ctx, id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return fmt.Errorf("get folder: %w", err)
	}

	// Delete all feeds in this folder using batch operation (entries will be cascade deleted by DB)
	feeds, err := s.feeds.List(ctx, &id)
	if err != nil {
		return fmt.Errorf("list feeds in folder: %w", err)
	}
	if len(feeds) > 0 {
		feedIDs := make([]int64, len(feeds))
		for i, feed := range feeds {
			feedIDs[i] = feed.ID
		}
		if _, err := s.feeds.DeleteBatch(ctx, feedIDs); err != nil {
			logger.Error("folder delete feeds failed", "module", "service", "action", "delete", "resource", "feed", "result", "failed", "folder_id", id, "count", len(feedIDs), "error", err)
			return fmt.Errorf("delete feeds in folder: %w", err)
		}
	}

	if err := s.folders.Delete(ctx, id); err != nil {
		logger.Error("folder delete failed", "module", "service", "action", "delete", "resource", "folder", "result", "failed", "folder_id", id, "error", err)
		return err
	}
	logger.Info("folder deleted", "module", "service", "action", "delete", "resource", "folder", "result", "ok", "folder_id", id)
	return nil
}
