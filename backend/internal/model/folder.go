package model

import "time"

type Folder struct {
	ID        int64
	Name      string
	ParentID  *int64
	CreatedAt time.Time
	UpdatedAt time.Time
}
