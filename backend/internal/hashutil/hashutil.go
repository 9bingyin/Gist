package hashutil

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

// SHA256Hex returns a trimmed-input SHA-256 hash encoded in hex.
func SHA256Hex(input string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(input)))
	return hex.EncodeToString(sum[:])
}
