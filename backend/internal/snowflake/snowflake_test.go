package snowflake

import (
	"sync"
	"testing"
)

// testInitOnce 确保 Init 在所有测试中只被调用一次
var testInitOnce sync.Once

func ensureInit(t *testing.T) {
	t.Helper()
	testInitOnce.Do(func() {
		if err := Init(0); err != nil {
			t.Fatalf("failed to initialize snowflake: %v", err)
		}
	})
}

// TestInit 必须串行运行 (不使用 t.Parallel)，因为它修改全局状态
func TestInit(t *testing.T) {
	t.Run("initializes successfully with valid node ID", func(t *testing.T) {
		err := Init(1)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("returns error for negative node ID", func(t *testing.T) {
		err := Init(-1)
		if err == nil {
			t.Error("expected error for negative node ID, got nil")
		}
	})

	t.Run("returns error for node ID exceeding max (1023)", func(t *testing.T) {
		err := Init(1024)
		if err == nil {
			t.Error("expected error for node ID > 1023, got nil")
		}
	})

	// Reset to valid node for subsequent tests
	if err := Init(0); err != nil {
		t.Fatalf("failed to reset to node 0: %v", err)
	}
}

func TestNextID_Uniqueness(t *testing.T) {
	err := Init(0)
	if err != nil {
		t.Fatalf("failed to initialize snowflake: %v", err)
	}

	const count = 10000
	ids := make(map[int64]bool, count)

	for i := 0; i < count; i++ {
		id := NextID()
		if ids[id] {
			t.Fatalf("duplicate ID generated: %d", id)
		}
		ids[id] = true
	}

	if len(ids) != count {
		t.Errorf("expected %d unique IDs, got %d", count, len(ids))
	}
}

func TestNextID_Monotonic(t *testing.T) {
	err := Init(0)
	if err != nil {
		t.Fatalf("failed to initialize snowflake: %v", err)
	}

	const count = 1000
	prevID := NextID()

	for i := 0; i < count; i++ {
		currentID := NextID()
		if currentID <= prevID {
			t.Errorf("ID not monotonically increasing: prev=%d, current=%d", prevID, currentID)
		}
		prevID = currentID
	}
}

func TestNextID_Concurrent(t *testing.T) {
	err := Init(0)
	if err != nil {
		t.Fatalf("failed to initialize snowflake: %v", err)
	}

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
				if ids[id] {
					t.Errorf("duplicate ID generated in concurrent test: %d", id)
				}
				ids[id] = true
			}
			mu.Unlock()
		}()
	}

	wg.Wait()

	if len(ids) != totalIDs {
		t.Errorf("expected %d unique IDs, got %d", totalIDs, len(ids))
	}
}

func TestNextID_NonZero(t *testing.T) {
	err := Init(0)
	if err != nil {
		t.Fatalf("failed to initialize snowflake: %v", err)
	}

	for i := 0; i < 100; i++ {
		id := NextID()
		if id == 0 {
			t.Error("generated ID is zero")
		}
		if id < 0 {
			t.Errorf("generated ID is negative: %d", id)
		}
	}
}
