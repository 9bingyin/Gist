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
	Create(ctx context.Context, name string, parentID *int64) (model.Folder, error)
	List(ctx context.Context) ([]model.Folder, error)
	Update(ctx context.Context, id int64, name string, parentID *int64) (model.Folder, error)
	Delete(ctx context.Context, id int64) error
}

type folderService struct {
	folders repository.FolderRepository
}

func NewFolderService(folders repository.FolderRepository) FolderService {
	return &folderService{folders: folders}
}

func (s *folderService) Create(ctx context.Context, name string, parentID *int64) (model.Folder, error) {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
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
	if existing, err := s.folders.FindByName(ctx, trimmed, parentID); err != nil {
		return model.Folder{}, fmt.Errorf("check folder name: %w", err)
	} else if existing != nil {
		return model.Folder{}, ErrConflict
	}

	return s.folders.Create(ctx, trimmed, parentID)
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

func (s *folderService) Delete(ctx context.Context, id int64) error {
	if _, err := s.folders.GetByID(ctx, id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return fmt.Errorf("get folder: %w", err)
	}
	return s.folders.Delete(ctx, id)
}
