package service

import (
	"context"
	"testing"
	"time"
)

func TestImportTaskService_Lifecycle(t *testing.T) {
	service := NewImportTaskService()

	id, ctx := service.Start(3)
	if id == "" {
		t.Fatal("expected non-empty task id")
	}

	service.Update(1, "Feed A")
	current := service.Get()
	if current == nil {
		t.Fatal("expected task to exist")
	}
	if current.Status != "running" {
		t.Fatalf("expected status running, got %s", current.Status)
	}
	if current.Total != 3 || current.Current != 1 {
		t.Fatalf("unexpected progress: total=%d current=%d", current.Total, current.Current)
	}
	if current.Feed != "Feed A" {
		t.Fatalf("expected feed name Feed A, got %s", current.Feed)
	}

	result := ImportResult{FeedsCreated: 2, FeedsSkipped: 1}
	service.Complete(result)
	completed := service.Get()
	if completed.Status != "done" {
		t.Fatalf("expected status done, got %s", completed.Status)
	}
	if completed.Result == nil || completed.Result.FeedsCreated != 2 {
		t.Fatalf("expected result to be set")
	}
	if completed.Feed != "" {
		t.Fatalf("expected feed to be cleared on completion")
	}

	service.Update(2, "Feed B")
	afterComplete := service.Get()
	if afterComplete.Current != completed.Current || afterComplete.Feed != "" {
		t.Fatalf("update should not mutate completed task")
	}

	select {
	case <-ctx.Done():
		t.Fatal("context should not be cancelled on complete")
	default:
	}
}

func TestImportTaskService_FailAndCancel(t *testing.T) {
	service := NewImportTaskService()

	_, ctx := service.Start(2)
	service.Update(1, "Feed A")

	service.Fail(context.Canceled)
	failed := service.Get()
	if failed.Status != "error" {
		t.Fatalf("expected status error, got %s", failed.Status)
	}
	if failed.Error == "" {
		t.Fatalf("expected error string to be set")
	}
	if failed.Feed != "" {
		t.Fatalf("expected feed to be cleared on failure")
	}

	cancelled := service.Cancel()
	if cancelled {
		t.Fatalf("cancel should return false when task is not running")
	}

	_, ctx2 := service.Start(1)
	service.Update(1, "Feed B")

	if !service.Cancel() {
		t.Fatal("expected cancel to return true")
	}
	canceledTask := service.Get()
	if canceledTask.Status != "cancelled" {
		t.Fatalf("expected status cancelled, got %s", canceledTask.Status)
	}
	if canceledTask.Feed != "" {
		t.Fatalf("expected feed to be cleared on cancel")
	}

	select {
	case <-ctx2.Done():
		if ctx2.Err() != context.Canceled {
			t.Fatalf("expected context canceled, got %v", ctx2.Err())
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("expected context to be cancelled")
	}

	select {
	case <-ctx.Done():
		if ctx.Err() != context.Canceled {
			t.Fatalf("expected previous context canceled, got %v", ctx.Err())
		}
	default:
		t.Fatal("expected previous context to be cancelled by new task")
	}
}

func TestImportTaskService_GetReturnsCopy(t *testing.T) {
	service := NewImportTaskService()
	service.Start(1)
	service.Complete(ImportResult{FeedsCreated: 1})

	first := service.Get()
	if first == nil || first.Result == nil {
		t.Fatal("expected task result")
	}
	first.Result.FeedsCreated = 99

	second := service.Get()
	if second.Result == nil || second.Result.FeedsCreated != 1 {
		t.Fatal("expected internal result to remain unchanged")
	}
}
