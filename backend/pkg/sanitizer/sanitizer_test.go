package sanitizer_test

import (
	"testing"

	"gist/backend/pkg/sanitizer"

	"github.com/stretchr/testify/require"
)

func TestSanitizeAuthor(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "Google Blog RSS - Atom name with nested elements",
			input:    "<name>Daniel Roggen</name><title>Staff Research Scientist</title><department>Fitbit</department><company/>",
			expected: "Daniel Roggen",
		},
		{
			name:     "Google Blog RSS - Another author",
			input:    "<name>Ben Gomes</name><title>Chief Technologist</title><department>Learning & Sustainability</department><company/>",
			expected: "Ben Gomes",
		},
		{
			name:     "Atom name with HTML entities",
			input:    "<name>Tom &amp; Jerry</name><title>Cartoon</title>",
			expected: "Tom & Jerry",
		},
		{
			name:     "Atom name uppercase with attributes",
			input:    `<NAME type="text">Ada &amp; Grace</NAME>`,
			expected: "Ada & Grace",
		},
		{
			name:     "Plain text author",
			input:    "John Doe",
			expected: "John Doe",
		},
		{
			name:     "Email format (RSS 2.0 standard)",
			input:    "john@example.com (John Doe)",
			expected: "john@example.com (John Doe)",
		},
		{
			name:     "Simple HTML author tag",
			input:    "<author>Jane Smith</author>",
			expected: "Jane Smith",
		},
		{
			name:     "Multiple HTML tags",
			input:    "<p><strong>Alice</strong> <em>Johnson</em></p>",
			expected: "Alice Johnson",
		},
		{
			name:     "Empty string",
			input:    "",
			expected: "",
		},
		{
			name:     "Whitespace only",
			input:    "   ",
			expected: "",
		},
		{
			name:     "Text with surrounding whitespace",
			input:    "  Bob Smith  ",
			expected: "Bob Smith",
		},
		{
			name:     "Atom name with whitespace",
			input:    "<name>  Charlie Brown  </name>",
			expected: "Charlie Brown",
		},
		{
			name:     "Complex nested structure",
			input:    "<author><name>Test User</name><email>test@example.com</email></author>",
			expected: "Test User",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.expected, sanitizer.SanitizeAuthor(tt.input))
		})
	}
}

func TestStripTags(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "Simple paragraph",
			input:    "<p>Hello World</p>",
			expected: "Hello World",
		},
		{
			name:     "Nested tags",
			input:    "<p>Hello <strong>World</strong></p>",
			expected: "Hello World",
		},
		{
			name:     "Adjacent block elements do not glue text",
			input:    "<div><h1>Title</h1><p>Content</p></div>",
			expected: "Title Content",
		},
		{
			name:     "Plain text",
			input:    "Plain text without tags",
			expected: "Plain text without tags",
		},
		{
			name:     "Empty string",
			input:    "",
			expected: "",
		},
		{
			name:     "Only tags, no content",
			input:    "<div></div>",
			expected: "",
		},
		{
			name:     "Self-closing br separates text",
			input:    "Before<br/>After",
			expected: "Before After",
		},
		{
			name:     "Mixed content",
			input:    "Text <span>with</span> <em>mixed</em> tags",
			expected: "Text with mixed tags",
		},
		{
			name:     "Special characters in text",
			input:    "<p>&lt;Hello&gt; &amp; &quot;World&quot;</p>",
			expected: "<Hello> & \"World\"",
		},
		{
			name:     "Whitespace handling",
			input:    "  <p>  Text  </p>  ",
			expected: "Text",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.expected, sanitizer.StripTags(tt.input))
		})
	}
}

func BenchmarkSanitizeAuthor(b *testing.B) {
	inputs := []string{
		"John Doe",
		"<name>Daniel Roggen</name><title>Staff Research Scientist</title>",
		"<author>Jane Smith</author>",
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		for _, input := range inputs {
			sanitizer.SanitizeAuthor(input)
		}
	}
}

func BenchmarkStripTags(b *testing.B) {
	input := "<div><h1>Title</h1><p>Hello <strong>World</strong></p></div>"

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		sanitizer.StripTags(input)
	}
}
