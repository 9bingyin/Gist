package urlutil

import (
	"net/url"
	"strings"
)

// StripFragment removes URL fragments while keeping scheme/host/path/query.
func StripFragment(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}

	parsed, err := url.Parse(trimmed)
	if err == nil {
		parsed.Fragment = ""
		return parsed.String()
	}

	if before, _, ok := strings.Cut(trimmed, "#"); ok {
		return before
	}
	return trimmed
}
