//go:generate mockgen -source=$GOFILE -destination=mock/$GOFILE -package=mock
package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"gist/backend/internal/model"
	"gist/backend/internal/repository"
	"gist/backend/pkg/logger"
)

type FolderService interface {
	Create(ctx context.Context, name string, parentID *int64, folderType string) (model.Folder, error)
	List(ctx context.Context) ([]model.Folder, error)
	Update(ctx context.Context, id int64, name string, parentID *int64) (model.Folder, error)
	UpdateType(ctx context.Context, id int64, folderType string) error
	Delete(ctx context.Context, id int64) error
	DeleteBatch(ctx context.Context, ids []int64) error
}

type folderService struct {
	folders repository.FolderRepository
	feeds   repository.FeedRepository
}

func NewFolderService(folders repository.FolderRepository, feeds repository.FeedRepository) FolderService {
	return &folderService{folders: folders, feeds: feeds}
}

func (s *folderService) detectCycle(ctx context.Context, id int64, newParentID *int64) (bool, error) {
	if newParentID == nil {
		return false, nil
	}
	if *newParentID == id {
		return true, nil
	}
	visited := make(map[int64]bool)
	visited[id] = true

	currentID := newParentID
	for currentID != nil {
		if visited[*currentID] {
			return true, nil
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

	if err := s.folders.UpdateTypeWithFeeds(ctx, id, folderType); err != nil {
		logger.Error("folder update type failed", "module", "service", "action", "update", "resource", "folder", "result", "failed", "folder_id", id, "type", folderType, "error", err)
		return err
	}

	logger.Info("folder type updated", "module", "service", "action", "update", "resource", "folder", "result", "ok", "folder_id", id, "type", folderType)
	return nil
}

func (s *folderService) Delete(ctx context.Context, id int64) error {
	return s.DeleteBatch(ctx, []int64{id})
}

// DeleteBatch validates all target IDs, recursively collects all descendant folder IDs,
// and atomically deletes all feeds under those folders along with the folders themselves.
func (s *folderService) DeleteBatch(ctx context.Context, ids []int64) error {
	if len(ids) == 0 {
		return nil
	}

	allFolders, err := s.folders.List(ctx)
	if err != nil {
		return fmt.Errorf("list folders: %w", err)
	}

	exists := make(map[int64]struct{}, len(allFolders))
	childrenByParent := make(map[int64][]int64)
	for _, f := range allFolders {
		exists[f.ID] = struct{}{}
		if f.ParentID != nil {
			childrenByParent[*f.ParentID] = append(childrenByParent[*f.ParentID], f.ID)
		}
	}

	for _, id := range ids {
		if _, ok := exists[id]; !ok {
			return ErrNotFound
		}
	}

	// BFS to collect all target folders and their descendants.
	collectedSet := make(map[int64]struct{}, len(ids))
	queue := make([]int64, 0, len(ids))
	for _, id := range ids {
		if _, seen := collectedSet[id]; !seen {
			collectedSet[id] = struct{}{}
			queue = append(queue, id)
		}
	}
	for len(queue) > 0 {
		curr := queue[0]
		queue = queue[1:]
		for _, childID := range childrenByParent[curr] {
			if _, seen := collectedSet[childID]; !seen {
				collectedSet[childID] = struct{}{}
				queue = append(queue, childID)
			}
		}
	}

	allFolderIDs := make([]int64, 0, len(collectedSet))
	for id := range collectedSet {
		allFolderIDs = append(allFolderIDs, id)
	}

	if err := s.folders.DeleteBatchWithFeeds(ctx, allFolderIDs); err != nil {
		logger.Error("folder batch delete failed", "module", "service", "action", "delete", "resource", "folder", "result", "failed", "count", len(allFolderIDs), "error", err)
		return err
	}

	logger.Info("folder deleted", "module", "service", "action", "delete", "resource", "folder", "result", "ok", "count", len(allFolderIDs))
	return nil
}
