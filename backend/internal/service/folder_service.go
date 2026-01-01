package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

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

	return s.folders.Create(ctx, trimmed, parentID, folderType)
}

func (s *folderService) List(ctx context.Context) ([]model.Folder, error) {
	return s.folders.List(ctx)
}

func (s *folderService) Update(ctx context.Context, id int64, name string, parentID *int64) (model.Folder, error) {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return model.Folder{}, ErrInvalid
	}
	if parentID != nil && *parentID == id {
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

	return s.folders.Update(ctx, id, trimmed, parentID)
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
		return err
	}

	// Update all feeds in this folder to the same type
	feeds, err := s.feeds.List(ctx, &id)
	if err != nil {
		return fmt.Errorf("list feeds in folder: %w", err)
	}
	for _, feed := range feeds {
		if err := s.feeds.UpdateType(ctx, feed.ID, folderType); err != nil {
			return fmt.Errorf("update feed %d type: %w", feed.ID, err)
		}
	}

	return nil
}

func (s *folderService) Delete(ctx context.Context, id int64) error {
	if _, err := s.folders.GetByID(ctx, id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return fmt.Errorf("get folder: %w", err)
	}

	// Delete all feeds in this folder (entries will be cascade deleted by DB)
	feeds, err := s.feeds.List(ctx, &id)
	if err != nil {
		return fmt.Errorf("list feeds in folder: %w", err)
	}
	for _, feed := range feeds {
		if err := s.feeds.Delete(ctx, feed.ID); err != nil {
			return fmt.Errorf("delete feed %d: %w", feed.ID, err)
		}
	}

	return s.folders.Delete(ctx, id)
}
