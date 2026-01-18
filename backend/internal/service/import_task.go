//go:generate mockgen -source=$GOFILE -destination=mock/$GOFILE -package=mock
package service

import (
	"context"
	"sync"
	"time"

	"github.com/google/uuid"

	"gist/backend/pkg/logger"
)

type ImportTask struct {
	ID        string        `json:"id"`
	Status    string        `json:"status"` // "running", "done", "error", "cancelled"
	Total     int           `json:"total"`
	Current   int           `json:"current"`
	Feed      string        `json:"feed,omitempty"`
	Result    *ImportResult `json:"result,omitempty"`
	Error     string        `json:"error,omitempty"`
	CreatedAt time.Time     `json:"createdAt"`
}

type ImportTaskService interface {
	Start(total int) (string, context.Context)
	Update(current int, feed string)
	Complete(result ImportResult)
	Fail(err error)
	Get() *ImportTask
	Cancel() bool
}

type importTaskManager struct {
	mu      sync.RWMutex
	current *ImportTask
	cancel  context.CancelFunc
}

func NewImportTaskService() ImportTaskService {
	return &importTaskManager{}
}

func (m *importTaskManager) Start(total int) (string, context.Context) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Cancel any existing task
	if m.cancel != nil {
		m.cancel()
	}

	ctx, cancel := context.WithCancel(context.Background())
	m.cancel = cancel

	id := uuid.New().String()
	m.current = &ImportTask{
		ID:        id,
		Status:    "running",
		Total:     total,
		Current:   0,
		CreatedAt: time.Now(),
	}
	logger.Info("import task started", "module", "service", "action", "import", "resource", "opml", "result", "ok", "task_id", id, "total", total)
	return id, ctx
}

func (m *importTaskManager) Update(current int, feed string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.current != nil && m.current.Status == "running" {
		m.current.Current = current
		m.current.Feed = feed
	}
}

func (m *importTaskManager) Complete(result ImportResult) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.current != nil {
		m.current.Status = "done"
		m.current.Result = &result
		m.current.Feed = ""
		logger.Info("import task completed", "module", "service", "action", "import", "resource", "opml", "result", "ok", "task_id", m.current.ID, "feeds_created", result.FeedsCreated, "feeds_skipped", result.FeedsSkipped)
	}
}

func (m *importTaskManager) Fail(err error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.current != nil {
		m.current.Status = "error"
		m.current.Error = err.Error()
		m.current.Feed = ""
		logger.Error("import task failed", "module", "service", "action", "import", "resource", "opml", "result", "failed", "task_id", m.current.ID, "error", err)
	}
}

func (m *importTaskManager) Get() *ImportTask {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.current == nil {
		return nil
	}

	// Return a copy
	task := *m.current
	if m.current.Result != nil {
		result := *m.current.Result
		task.Result = &result
	}
	return &task
}

func (m *importTaskManager) Cancel() bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.current == nil || m.current.Status != "running" {
		return false
	}

	if m.cancel != nil {
		m.cancel()
		m.cancel = nil
	}

	m.current.Status = "cancelled"
	m.current.Feed = ""
	logger.Warn("import task cancelled", "module", "service", "action", "import", "resource", "opml", "result", "cancelled", "task_id", m.current.ID)
	return true
}
