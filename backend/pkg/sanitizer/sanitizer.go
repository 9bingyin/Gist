package sanitizer

import (
	"io"
	"regexp"
	"strings"

	"golang.org/x/net/html"
)

// authorNameRegex 匹配 Atom 风格的 <name> 标签
var authorNameRegex = regexp.MustCompile(`<name>([^<]+)</name>`)

// SanitizeAuthor 清理 author 字段中可能包含的 XML/HTML 标签。
// 对于 Atom 风格的嵌套结构（如 <name>John Doe</name><title>...</title>），
// 优先提取 <name> 标签的内容。
// 对于其他包含标签的情况，移除所有标签只保留文本。
//
// 示例：
//   - "<name>Daniel Roggen</name><title>Staff Research Scientist</title>" -> "Daniel Roggen"
//   - "John Doe" -> "John Doe"
//   - "<author>Jane Smith</author>" -> "Jane Smith"
func SanitizeAuthor(author string) string {
	author = strings.TrimSpace(author)
	if author == "" {
		return ""
	}

	// 快速检查：如果不包含 '<'，说明是纯文本，直接返回
	if !strings.Contains(author, "<") {
		return author
	}

	// 优先尝试提取 Atom 风格的 <name> 标签
	if strings.Contains(author, "<name>") {
		if matches := authorNameRegex.FindStringSubmatch(author); len(matches) > 1 {
			return strings.TrimSpace(matches[1])
		}
	}

	// Fallback: 使用 HTML tokenizer 移除所有标签
	return StripTags(author)
}

// StripTags 移除字符串中的所有 HTML/XML 标签，只保留文本内容。
// 该函数使用 HTML tokenizer 遍历输入，仅提取文本节点。
//
// 注意：此函数仅用于内容清理，不应用于安全防护（如 XSS 防御）。
//
// 示例：
//   - "<p>Hello <strong>World</strong></p>" -> "Hello World"
//   - "Plain text" -> "Plain text"
//   - "<author>John Doe</author>" -> "John Doe"
func StripTags(input string) string {
	input = strings.TrimSpace(input)
	if input == "" {
		return ""
	}

	tokenizer := html.NewTokenizer(strings.NewReader(input))
	var buf strings.Builder

	for {
		tt := tokenizer.Next()
		if tt == html.ErrorToken {
			if tokenizer.Err() == io.EOF {
				break
			}
			// 解析错误时返回空字符串
			return ""
		}

		if tt == html.TextToken {
			buf.WriteString(tokenizer.Token().Data)
		}
	}

	return strings.TrimSpace(buf.String())
}
