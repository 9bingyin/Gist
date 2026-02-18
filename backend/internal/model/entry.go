package model

import "time"

type Entry struct {
	ID              int64
	FeedID          int64
	Hash            string
	Title           *string
	URL             *string
	Content         *string
	ReadableContent *string
	ThumbnailURL    *string
	Author          *string
	PublishedAt     *time.Time
	Read            bool
	Starred         bool
	CreatedAt       time.Time
	UpdatedAt       time.Time
}
