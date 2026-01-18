package service_test

import (
	"gist/backend/internal/service"
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestImportTaskService_Lifecycle(t *testing.T) {
	svc := service.NewImportTaskService()

	id, ctx := svc.Start(3)
	require.NotEmpty(t, id)

	svc.Update(1, "Feed A")
	current := svc.Get()
	require.NotNil(t, current)
	require.Equal(t, "running", current.Status)
	require.Equal(t, 3, current.Total)
	require.Equal(t, 1, current.Current)
	require.Equal(t, "Feed A", current.Feed)

	result := service.ImportResult{FeedsCreated: 2, FeedsSkipped: 1}
	svc.Complete(result)
	completed := svc.Get()
	require.Equal(t, "done", completed.Status)
	require.NotNil(t, completed.Result)
	require.Equal(t, 2, completed.Result.FeedsCreated)
	require.Empty(t, completed.Feed)

	svc.Update(2, "Feed B")
	afterComplete := svc.Get()
	require.Equal(t, completed.Current, afterComplete.Current)
	require.Empty(t, afterComplete.Feed)

	select {
	case <-ctx.Done():
		t.Fatal("context should not be cancelled on complete")
	default:
	}
}

func TestImportTaskService_FailAndCancel(t *testing.T) {
	svc := service.NewImportTaskService()

	_, ctx := svc.Start(2)
	svc.Update(1, "Feed A")

	svc.Fail(context.Canceled)
	failed := svc.Get()
	require.Equal(t, "error", failed.Status)
	require.NotEmpty(t, failed.Error)
	require.Empty(t, failed.Feed)

	require.False(t, svc.Cancel(), "cancel should return false when task is not running")

	_, ctx2 := svc.Start(1)
	svc.Update(1, "Feed B")

	require.True(t, svc.Cancel())
	canceledTask := svc.Get()
	require.Equal(t, "cancelled", canceledTask.Status)
	require.Empty(t, canceledTask.Feed)

	select {
	case <-ctx2.Done():
		require.ErrorIs(t, ctx2.Err(), context.Canceled)
	case <-time.After(200 * time.Millisecond):
		t.Fatal("expected context to be cancelled")
	}

	select {
	case <-ctx.Done():
		require.ErrorIs(t, ctx.Err(), context.Canceled)
	default:
		t.Fatal("expected previous context to be cancelled by new task")
	}
}

func TestImportTaskService_GetReturnsCopy(t *testing.T) {
	svc := service.NewImportTaskService()
	svc.Start(1)
	svc.Complete(service.ImportResult{FeedsCreated: 1})

	first := svc.Get()
	require.NotNil(t, first)
	require.NotNil(t, first.Result)
	first.Result.FeedsCreated = 99

	second := svc.Get()
	require.Equal(t, 1, second.Result.FeedsCreated)
}
