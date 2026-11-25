//go:generate mockgen -source=$GOFILE -destination=mock/$GOFILE -package=mock
package service

import (
	"context"
	"database/sql"
	"errors"

	"gist/backend/internal/model"
	"gist/backend/internal/repository"
	"gist/backend/pkg/logger"
)

const defaultEntryListLimit = 50

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
	List(ctx context.Context, params EntryListParams) ([]model.Entry, bool, error)
	GetByID(ctx context.Context, id int64) (model.Entry, error)
	MarkAsRead(ctx context.Context, id int64, read bool) error
	MarkManyAsRead(ctx context.Context, ids []int64, read bool) error
	MarkAsStarred(ctx context.Context, id int64, starred bool) error
	MarkAllAsRead(ctx context.Context, feedID *int64, folderID *int64, contentType *string) error
	GetUnreadCounts(ctx context.Context) (map[int64]int, error)
	GetStarredCount(ctx context.Context) (int, error)
	ClearReadabilityCache(ctx context.Context) (int64, error)
	ClearEntryCache(ctx context.Context) (int64, error)
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

func (s *entryService) List(ctx context.Context, params EntryListParams) ([]model.Entry, bool, error) {
	if params.FeedID != nil {
		if _, err := s.feeds.GetByID(ctx, *params.FeedID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil, false, ErrNotFound
			}
			return nil, false, err
		}
	}

	if params.FolderID != nil {
		if _, err := s.folders.GetByID(ctx, *params.FolderID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil, false, ErrNotFound
			}
			return nil, false, err
		}
	}

	limit := params.Limit
	if limit <= 0 {
		limit = defaultEntryListLimit
	}
	offset := max(params.Offset, 0)

	// Request limit+1 rows to determine whether another page exists.
	filter := repository.EntryListFilter{
		FeedID:       params.FeedID,
		FolderID:     params.FolderID,
		ContentType:  params.ContentType,
		UnreadOnly:   params.UnreadOnly,
		StarredOnly:  params.StarredOnly,
		HasThumbnail: params.HasThumbnail,
		Limit:        limit + 1,
		Offset:       offset,
	}

	entries, err := s.entries.List(ctx, filter)
	if err != nil {
		logger.Error("entry list failed", "module", "service", "action", "list", "resource", "entry", "result", "failed", "error", err)
		return nil, false, err
	}

	hasMore := len(entries) > limit
	if hasMore {
		entries = entries[:limit]
	}

	logger.Debug("entry list", "module", "service", "action", "list", "resource", "entry", "result", "ok", "count", len(entries), "has_more", hasMore)
	return entries, hasMore, nil
}

func (s *entryService) GetByID(ctx context.Context, id int64) (model.Entry, error) {
	entry, err := s.entries.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return model.Entry{}, ErrNotFound
		}
		return model.Entry{}, err
	}
	logger.Debug("entry get", "module", "service", "action", "fetch", "resource", "entry", "result", "ok", "entry_id", id)
	return entry, nil
}

func (s *entryService) MarkAsRead(ctx context.Context, id int64, read bool) error {
	if _, err := s.entries.GetByID(ctx, id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}

	if err := s.entries.UpdateReadStatus(ctx, id, read); err != nil {
		logger.Error("entry update read failed", "module", "service", "action", "update", "resource", "entry", "result", "failed", "entry_id", id, "read", read, "error", err)
		return err
	}
	logger.Info("entry read updated", "module", "service", "action", "update", "resource", "entry", "result", "ok", "entry_id", id, "read", read)
	return nil
}

func (s *entryService) MarkManyAsRead(ctx context.Context, ids []int64, read bool) error {
	if len(ids) == 0 {
		return nil
	}

	if err := s.entries.UpdateManyReadStatus(ctx, ids, read); err != nil {
		logger.Error("entries update read failed", "module", "service", "action", "update", "resource", "entry", "result", "failed", "count", len(ids), "read", read, "error", err)
		return err
	}
	logger.Info("entries read updated", "module", "service", "action", "update", "resource", "entry", "result", "ok", "count", len(ids), "read", read)
	return nil
}

func (s *entryService) MarkAllAsRead(ctx context.Context, feedID *int64, folderID *int64, contentType *string) error {
	if feedID != nil {
		if _, err := s.feeds.GetByID(ctx, *feedID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return ErrNotFound
			}
			return err
		}
	}

	if folderID != nil {
		if _, err := s.folders.GetByID(ctx, *folderID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return ErrNotFound
			}
			return err
		}
	}

	var feedIDValue, folderIDValue, contentTypeValue any
	if feedID != nil {
		feedIDValue = *feedID
	}
	if folderID != nil {
		folderIDValue = *folderID
	}
	if contentType != nil {
		contentTypeValue = *contentType
	}

	if err := s.entries.MarkAllAsRead(ctx, feedID, folderID, contentType); err != nil {
		logger.Error("entries mark all read failed", "module", "service", "action", "update", "resource", "entry", "result", "failed", "feed_id", feedIDValue, "folder_id", folderIDValue, "content_type", contentTypeValue, "error", err)
		return err
	}
	logger.Info("entries marked read", "module", "service", "action", "update", "resource", "entry", "result", "ok", "feed_id", feedIDValue, "folder_id", folderIDValue, "content_type", contentTypeValue)
	return nil
}

func (s *entryService) GetUnreadCounts(ctx context.Context) (map[int64]int, error) {
	counts, err := s.entries.GetAllUnreadCounts(ctx)
	if err != nil {
		logger.Error("entry unread counts failed", "module", "service", "action", "list", "resource", "entry", "result", "failed", "error", err)
		return nil, err
	}

	result := make(map[int64]int, len(counts))
	for _, uc := range counts {
		result[uc.FeedID] = uc.Count
	}
	return result, nil
}

func (s *entryService) MarkAsStarred(ctx context.Context, id int64, starred bool) error {
	if _, err := s.entries.GetByID(ctx, id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}

	if err := s.entries.UpdateStarredStatus(ctx, id, starred); err != nil {
		logger.Error("entry update starred failed", "module", "service", "action", "update", "resource", "entry", "result", "failed", "entry_id", id, "starred", starred, "error", err)
		return err
	}
	logger.Info("entry starred updated", "module", "service", "action", "update", "resource", "entry", "result", "ok", "entry_id", id, "starred", starred)
	return nil
}

func (s *entryService) GetStarredCount(ctx context.Context) (int, error) {
	count, err := s.entries.GetStarredCount(ctx)
	if err != nil {
		logger.Error("entry starred count failed", "module", "service", "action", "list", "resource", "entry", "result", "failed", "error", err)
		return 0, err
	}
	logger.Debug("entry starred count", "module", "service", "action", "list", "resource", "entry", "result", "ok", "count", count)
	return count, nil
}

func (s *entryService) ClearReadabilityCache(ctx context.Context) (int64, error) {
	deleted, err := s.entries.ClearAllReadableContent(ctx)
	if err != nil {
		logger.Error("readability cache clear failed", "module", "service", "action", "clear", "resource", "entry", "result", "failed", "error", err)
		return 0, err
	}
	logger.Info("readability cache cleared", "module", "service", "action", "clear", "resource", "entry", "result", "ok", "count", deleted)
	return deleted, nil
}

func (s *entryService) ClearEntryCache(ctx context.Context) (int64, error) {
	deleted, err := s.entries.DeleteUnstarred(ctx)
	if err != nil {
		logger.Error("entry cache clear failed", "module", "service", "action", "clear", "resource", "entry", "result", "failed", "error", err)
		return 0, err
	}
	if _, resetErr := s.feeds.ClearAllConditionalGet(ctx); resetErr != nil {
		logger.Warn("feed conditional get reset failed", "module", "service", "action", "update", "resource", "feed", "result", "failed", "error", resetErr)
	}
	logger.Info("entry cache cleared", "module", "service", "action", "clear", "resource", "entry", "result", "ok", "count", deleted)
	return deleted, nil
}
