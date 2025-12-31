package model

import "time"

type AITranslation struct {
	ID            int64
	EntryID       int64
	IsReadability bool
	Language      string
	Content       string
	CreatedAt     time.Time
}
