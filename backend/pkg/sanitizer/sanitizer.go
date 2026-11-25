package sanitizer

import (
	"io"
	"regexp"
	"strings"
	"unicode"

	"golang.org/x/net/html"
)

// authorNameRegex matches Atom-style <name> tags (case-insensitive, with optional attributes).
var authorNameRegex = regexp.MustCompile(`(?is)<name(?:\s[^>]*)?>([^<]+)</name>`)

var blockTags = map[string]struct{}{
	"address": {}, "article": {}, "aside": {}, "author": {}, "blockquote": {},
	"br": {}, "company": {}, "dd": {}, "department": {}, "div": {}, "dl": {},
	"dt": {}, "email": {}, "figcaption": {}, "figure": {}, "footer": {},
	"h1": {}, "h2": {}, "h3": {}, "h4": {}, "h5": {}, "h6": {},
	"header": {}, "hr": {}, "li": {}, "main": {}, "nav": {}, "ol": {},
	"p": {}, "pre": {}, "section": {}, "table": {}, "td": {}, "th": {},
	"title": {}, "tr": {}, "ul": {},
}

// SanitizeAuthor removes XML/HTML tags from an author field.
// For Atom-style nested structures (e.g. <name>John Doe</name><title>...</title>),
// it prefers the content inside <name>.
func SanitizeAuthor(author string) string {
	author = strings.TrimSpace(author)
	if author == "" {
		return ""
	}

	if !strings.Contains(author, "<") {
		return author
	}

	if matches := authorNameRegex.FindStringSubmatch(author); len(matches) > 1 {
		if unescaped := strings.TrimSpace(html.UnescapeString(matches[1])); unescaped != "" {
			return unescaped
		}
	}

	return StripTags(author)
}

// StripTags removes all HTML/XML tags while keeping plain text content.
// Not intended as an XSS sanitizer.
func StripTags(input string) string {
	input = strings.TrimSpace(input)
	if input == "" {
		return ""
	}

	tokenizer := html.NewTokenizer(strings.NewReader(input))
	var buf strings.Builder
	needSpace := false

	for {
		tt := tokenizer.Next()
		if tt == html.ErrorToken {
			if tokenizer.Err() == io.EOF {
				break
			}
			return ""
		}

		switch tt {
		case html.StartTagToken, html.EndTagToken, html.SelfClosingTagToken:
			nameBytes, _ := tokenizer.TagName()
			if _, isBlock := blockTags[strings.ToLower(string(nameBytes))]; isBlock && buf.Len() > 0 {
				needSpace = true
			}
		case html.TextToken:
			text := tokenizer.Token().Data
			if text == "" {
				continue
			}
			if needSpace {
				if !endsWithSpace(buf.String()) && !startsWithSpace(text) {
					buf.WriteByte(' ')
				}
				needSpace = false
			}
			buf.WriteString(text)
		}
	}

	return strings.TrimSpace(buf.String())
}

func startsWithSpace(s string) bool {
	for _, r := range s {
		return unicode.IsSpace(r)
	}
	return false
}

func endsWithSpace(s string) bool {
	if s == "" {
		return false
	}
	var last rune
	for _, r := range s {
		last = r
	}
	return unicode.IsSpace(last)
}
