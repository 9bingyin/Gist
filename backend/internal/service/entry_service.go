package service

import (
	"context"
	"database/sql"
	"errors"

	"gist/backend/internal/model"
	"gist/backend/internal/repository"
)

type EntryListParams struct {
	FeedID       *int64
	FolderID     *int64
	ContentType  *string
	UnreadOnly   bool
	StarredOnly  bool
	HasThumbnail bool
	Limit        int
	Offset       int
}

type EntryService interface {
	List(ctx context.Context, params EntryListParams) ([]model.Entry, error)
	GetByID(ctx context.Context, id int64) (model.Entry, error)
	MarkAsRead(ctx context.Context, id int64, read bool) error
	MarkAsStarred(ctx context.Context, id int64, starred bool) error
	MarkAllAsRead(ctx context.Context, feedID *int64, folderID *int64, contentType *string) error
	GetUnreadCounts(ctx context.Context) (map[int64]int, error)
	GetStarredCount(ctx context.Context) (int, error)
}

type entryService struct {
	entries repository.EntryRepository
	feeds   repository.FeedRepository
	folders repository.FolderRepository
}

func NewEntryService(
	entries repository.EntryRepository,
	feeds repository.FeedRepository,
	folders repository.FolderRepository,
) EntryService {
	return &entryService{
		entries: entries,
		feeds:   feeds,
		folders: folders,
	}
}

func (s *entryService) List(ctx context.Context, params EntryListParams) ([]model.Entry, error) {
	// Validate feedID exists if provided
	if params.FeedID != nil {
		_, err := s.feeds.GetByID(ctx, *params.FeedID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil, ErrNotFound
			}
			return nil, err
		}
	}

	// Validate folderID exists if provided
	if params.FolderID != nil {
		_, err := s.folders.GetByID(ctx, *params.FolderID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil, ErrNotFound
			}
			return nil, err
		}
	}

	// Set default limit
	// Allow up to 101 for internal hasMore check (handler requests limit+1)
	limit := params.Limit
	if limit <= 0 {
		limit = 50
	}
	if limit > 101 {
		limit = 101
	}

	filter := repository.EntryListFilter{
		FeedID:       params.FeedID,
		FolderID:     params.FolderID,
		ContentType:  params.ContentType,
		UnreadOnly:   params.UnreadOnly,
		StarredOnly:  params.StarredOnly,
		HasThumbnail: params.HasThumbnail,
		Limit:        limit,
		Offset:       params.Offset,
	}

	return s.entries.List(ctx, filter)
}

func (s *entryService) GetByID(ctx context.Context, id int64) (model.Entry, error) {
	entry, err := s.entries.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return model.Entry{}, ErrNotFound
		}
		return model.Entry{}, err
	}
	return entry, nil
}

func (s *entryService) MarkAsRead(ctx context.Context, id int64, read bool) error {
	// Check entry exists
	_, err := s.entries.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}

	return s.entries.UpdateReadStatus(ctx, id, read)
}

func (s *entryService) MarkAllAsRead(ctx context.Context, feedID *int64, folderID *int64, contentType *string) error {
	// Validate feedID exists if provided
	if feedID != nil {
		_, err := s.feeds.GetByID(ctx, *feedID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return ErrNotFound
			}
			return err
		}
	}

	// Validate folderID exists if provided
	if folderID != nil {
		_, err := s.folders.GetByID(ctx, *folderID)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return ErrNotFound
			}
			return err
		}
	}

	return s.entries.MarkAllAsRead(ctx, feedID, folderID, contentType)
}

func (s *entryService) GetUnreadCounts(ctx context.Context) (map[int64]int, error) {
	counts, err := s.entries.GetAllUnreadCounts(ctx)
	if err != nil {
		return nil, err
	}

	result := make(map[int64]int)
	for _, uc := range counts {
		result[uc.FeedID] = uc.Count
	}

	return result, nil
}

func (s *entryService) MarkAsStarred(ctx context.Context, id int64, starred bool) error {
	// Check entry exists
	_, err := s.entries.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}

	return s.entries.UpdateStarredStatus(ctx, id, starred)
}

func (s *entryService) GetStarredCount(ctx context.Context) (int, error) {
	return s.entries.GetStarredCount(ctx)
}
