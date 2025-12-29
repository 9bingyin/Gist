package model

import "time"

type Feed struct {
	ID           int64
	FolderID     *int64
	Title        string
	URL          string
	SiteURL      *string
	Description  *string
	ETag         *string
	LastModified *string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}
