package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"gist/backend/internal/model"
)

type FolderRepository interface {
	Create(ctx context.Context, name string, parentID *int64) (model.Folder, error)
	GetByID(ctx context.Context, id int64) (model.Folder, error)
	FindByName(ctx context.Context, name string, parentID *int64) (*model.Folder, error)
	List(ctx context.Context) ([]model.Folder, error)
	Update(ctx context.Context, id int64, name string, parentID *int64) (model.Folder, error)
	Delete(ctx context.Context, id int64) error
}

type folderRepository struct {
	db dbtx
}

func NewFolderRepository(db dbtx) FolderRepository {
	return &folderRepository{db: db}
}

func (r *folderRepository) Create(ctx context.Context, name string, parentID *int64) (model.Folder, error) {
	now := time.Now().UTC()
	result, err := r.db.ExecContext(
		ctx,
		`INSERT INTO folders (name, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?)`,
		name,
		nullableInt64(parentID),
		formatTime(now),
		formatTime(now),
	)
	if err != nil {
		return model.Folder{}, fmt.Errorf("create folder: %w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return model.Folder{}, fmt.Errorf("get folder id: %w", err)
	}

	return model.Folder{
		ID:        id,
		Name:      name,
		ParentID:  parentID,
		CreatedAt: now,
		UpdatedAt: now,
	}, nil
}

func (r *folderRepository) GetByID(ctx context.Context, id int64) (model.Folder, error) {
	row := r.db.QueryRowContext(ctx, `SELECT id, name, parent_id, created_at, updated_at FROM folders WHERE id = ?`, id)

	var folder model.Folder
	var parentID sql.NullInt64
	var createdAt string
	var updatedAt string
	if err := row.Scan(&folder.ID, &folder.Name, &parentID, &createdAt, &updatedAt); err != nil {
		return model.Folder{}, fmt.Errorf("get folder: %w", err)
	}
	if parentID.Valid {
		folder.ParentID = &parentID.Int64
	}
	var err error
	folder.CreatedAt, err = parseTime(createdAt)
	if err != nil {
		return model.Folder{}, fmt.Errorf("parse folder created_at: %w", err)
	}
	folder.UpdatedAt, err = parseTime(updatedAt)
	if err != nil {
		return model.Folder{}, fmt.Errorf("parse folder updated_at: %w", err)
	}

	return folder, nil
}

func (r *folderRepository) FindByName(ctx context.Context, name string, parentID *int64) (*model.Folder, error) {
	query := `SELECT id, name, parent_id, created_at, updated_at FROM folders WHERE name = ? AND parent_id IS NULL`
	args := []interface{}{name}
	if parentID != nil {
		query = `SELECT id, name, parent_id, created_at, updated_at FROM folders WHERE name = ? AND parent_id = ?`
		args = append(args, *parentID)
	}

	row := r.db.QueryRowContext(ctx, query, args...)
	var folder model.Folder
	var parent sql.NullInt64
	var createdAt string
	var updatedAt string
	if err := row.Scan(&folder.ID, &folder.Name, &parent, &createdAt, &updatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("find folder: %w", err)
	}
	if parent.Valid {
		folder.ParentID = &parent.Int64
	}
	var err error
	folder.CreatedAt, err = parseTime(createdAt)
	if err != nil {
		return nil, fmt.Errorf("parse folder created_at: %w", err)
	}
	folder.UpdatedAt, err = parseTime(updatedAt)
	if err != nil {
		return nil, fmt.Errorf("parse folder updated_at: %w", err)
	}

	return &folder, nil
}

func (r *folderRepository) List(ctx context.Context) ([]model.Folder, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id, name, parent_id, created_at, updated_at FROM folders ORDER BY name`)
	if err != nil {
		return nil, fmt.Errorf("list folders: %w", err)
	}
	defer rows.Close()

	var folders []model.Folder
	for rows.Next() {
		var folder model.Folder
		var parentID sql.NullInt64
		var createdAt string
		var updatedAt string
		if err := rows.Scan(&folder.ID, &folder.Name, &parentID, &createdAt, &updatedAt); err != nil {
			return nil, fmt.Errorf("scan folder: %w", err)
		}
		if parentID.Valid {
			folder.ParentID = &parentID.Int64
		}
		folder.CreatedAt, err = parseTime(createdAt)
		if err != nil {
			return nil, fmt.Errorf("parse folder created_at: %w", err)
		}
		folder.UpdatedAt, err = parseTime(updatedAt)
		if err != nil {
			return nil, fmt.Errorf("parse folder updated_at: %w", err)
		}
		folders = append(folders, folder)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate folders: %w", err)
	}

	return folders, nil
}

func (r *folderRepository) Update(ctx context.Context, id int64, name string, parentID *int64) (model.Folder, error) {
	now := time.Now().UTC()
	_, err := r.db.ExecContext(
		ctx,
		`UPDATE folders SET name = ?, parent_id = ?, updated_at = ? WHERE id = ?`,
		name,
		nullableInt64(parentID),
		formatTime(now),
		id,
	)
	if err != nil {
		return model.Folder{}, fmt.Errorf("update folder: %w", err)
	}

	return r.GetByID(ctx, id)
}

func (r *folderRepository) Delete(ctx context.Context, id int64) error {
	if _, err := r.db.ExecContext(ctx, `DELETE FROM folders WHERE id = ?`, id); err != nil {
		return fmt.Errorf("delete folder: %w", err)
	}
	return nil
}
