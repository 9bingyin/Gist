package model

import "time"

type Feed struct {
	ID           int64
	FolderID     *int64
	Title        string
	URL          string
	SiteURL      *string
	Description  *string
	IconPath     *string
	Type         string // article, picture, notification
	ETag         *string
	LastModified *string
	ErrorMessage *string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}
