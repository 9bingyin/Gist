package snowflake

import "github.com/bwmarrin/snowflake"

var node *snowflake.Node

// Init initializes the snowflake node with the given node ID.
// Node ID should be unique across all instances (0-1023).
func Init(nodeID int64) error {
	n, err := snowflake.NewNode(nodeID)
	if err != nil {
		return err
	}
	node = n
	return nil
}

// NextID generates a new unique snowflake ID.
func NextID() int64 {
	return node.Generate().Int64()
}
