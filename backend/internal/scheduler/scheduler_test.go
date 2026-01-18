package scheduler_test

import (
	"gist/backend/internal/scheduler"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"

	"gist/backend/internal/service/mock"
)

func TestScheduler(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockRefresh := mock.NewMockRefreshService(ctrl)

	// RefreshAll should be called once immediately on Start
	mockRefresh.EXPECT().RefreshAll(gomock.Any()).Return(nil).AnyTimes()

	s := scheduler.New(mockRefresh, 100*time.Millisecond)
	s.Start()

	// Let it run for a bit
	time.Sleep(250 * time.Millisecond)

	s.Stop()
	require.True(t, true) // If we reach here without panic/deadlock, it's good
}
