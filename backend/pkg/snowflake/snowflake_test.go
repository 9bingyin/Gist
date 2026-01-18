package snowflake

import (
	"sync"
	"testing"

	"github.com/stretchr/testify/require"
)

// TestInit 必须串行运行 (不使用 t.Parallel)，因为它修改全局状态
func TestInit(t *testing.T) {
	t.Run("initializes successfully with valid node ID", func(t *testing.T) {
		err := Init(1)
		require.NoError(t, err)
	})

	t.Run("returns error for negative node ID", func(t *testing.T) {
		err := Init(-1)
		require.Error(t, err)
	})

	t.Run("returns error for node ID exceeding max (1023)", func(t *testing.T) {
		err := Init(1024)
		require.Error(t, err)
	})

	// Reset to valid node for subsequent tests
	err := Init(0)
	require.NoError(t, err)
}

func TestNextID_Uniqueness(t *testing.T) {
	err := Init(0)
	require.NoError(t, err)

	const count = 10000
	ids := make(map[int64]bool, count)

	for i := 0; i < count; i++ {
		id := NextID()
		require.False(t, ids[id], "duplicate ID generated: %d", id)
		ids[id] = true
	}

	require.Len(t, ids, count)
}

func TestNextID_Monotonic(t *testing.T) {
	err := Init(0)
	require.NoError(t, err)

	const count = 1000
	prevID := NextID()

	for i := 0; i < count; i++ {
		currentID := NextID()
		require.Greater(t, currentID, prevID, "ID not monotonically increasing")
		prevID = currentID
	}
}

func TestNextID_Concurrent(t *testing.T) {
	err := Init(0)
	require.NoError(t, err)

	const goroutines = 10
	const idsPerGoroutine = 1000
	const totalIDs = goroutines * idsPerGoroutine

	var wg sync.WaitGroup
	var mu sync.Mutex
	ids := make(map[int64]bool, totalIDs)

	for g := 0; g < goroutines; g++ {
		wg.Add(1)
		go func() {
			defer wg.Done()

			localIDs := make([]int64, idsPerGoroutine)
			for i := 0; i < idsPerGoroutine; i++ {
				localIDs[i] = NextID()
			}

			mu.Lock()
			for _, id := range localIDs {
				require.False(t, ids[id], "duplicate ID generated in concurrent test: %d", id)
				ids[id] = true
			}
			mu.Unlock()
		}()
	}

	wg.Wait()
	require.Len(t, ids, totalIDs)
}

func TestNextID_NonZero(t *testing.T) {
	err := Init(0)
	require.NoError(t, err)

	for i := 0; i < 100; i++ {
		id := NextID()
		require.NotZero(t, id)
		require.Positive(t, id)
	}
}
