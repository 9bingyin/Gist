package scheduler_test

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"

	"gist/backend/internal/scheduler"
	"gist/backend/internal/service/mock"

	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"
)

func TestScheduler(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockRefresh := mock.NewMockRefreshService(ctrl)

	var calls atomic.Int32
	mockRefresh.EXPECT().RefreshAll(gomock.Any()).DoAndReturn(func(context.Context) error {
		calls.Add(1)
		return nil
	}).AnyTimes()

	s := scheduler.New(mockRefresh, 50*time.Millisecond)
	s.Start()

	require.Eventually(t, func() bool {
		return calls.Load() >= 2
	}, time.Second, 10*time.Millisecond)

	// Stop must be idempotent.
	s.Stop()
	s.Stop()
}

func TestScheduler_CancelsInFlightRefreshAndHandlesInvalidInterval(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockRefresh := mock.NewMockRefreshService(ctrl)
	started := make(chan struct{})
	cancelled := make(chan struct{})

	mockRefresh.EXPECT().RefreshAll(gomock.Any()).DoAndReturn(func(ctx context.Context) error {
		close(started)
		<-ctx.Done()
		close(cancelled)
		return ctx.Err()
	}).Times(1)

	// Non-positive interval must not panic.
	s := scheduler.New(mockRefresh, 0)
	s.Start()

	<-started
	s.Stop()

	select {
	case <-cancelled:
	case <-time.After(time.Second):
		t.Fatal("expected in-flight refresh to be cancelled on Stop")
	}
}

func TestScheduler_RefreshError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockRefresh := mock.NewMockRefreshService(ctrl)
	done := make(chan struct{})
	mockRefresh.EXPECT().RefreshAll(gomock.Any()).DoAndReturn(func(context.Context) error {
		close(done)
		return errors.New("boom")
	}).Times(1)

	s := scheduler.New(mockRefresh, time.Hour)
	s.Start()
	<-done
	s.Stop()
}
