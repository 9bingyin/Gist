package snowflake

import (
	"sync/atomic"

	"github.com/bwmarrin/snowflake"
)

var node atomic.Pointer[snowflake.Node]

func init() {
	n, err := snowflake.NewNode(0)
	if err != nil {
		panic("snowflake default init: " + err.Error())
	}
	node.Store(n)
}

// Init initializes the snowflake node with the given node ID.
// Node ID should be unique across all instances (0-1023).
func Init(nodeID int64) error {
	n, err := snowflake.NewNode(nodeID)
	if err != nil {
		return err
	}
	node.Store(n)
	return nil
}

// NextID generates a new unique snowflake ID.
func NextID() int64 {
	return node.Load().Generate().Int64()
}
