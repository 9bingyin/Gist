package model

import "time"

type Entry struct {
	ID          int64
	FeedID      int64
	Title       *string
	URL         *string
	Content     *string
	Author      *string
	PublishedAt *time.Time
	Read        bool
	CreatedAt   time.Time
	UpdatedAt   time.Time
}
