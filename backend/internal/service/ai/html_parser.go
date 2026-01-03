package ai

import (
	"bytes"
	"strings"

	"golang.org/x/net/html"
)

// Block represents a parsed HTML block.
type Block struct {
	Index         int    // Original position
	HTML          string // HTML content
	NeedTranslate bool   // Whether translation is needed
}

// blockElements are HTML elements that should be treated as separate blocks.
var blockElements = map[string]bool{
	"p":          true,
	"h1":         true,
	"h2":         true,
	"h3":         true,
	"h4":         true,
	"h5":         true,
	"h6":         true,
	"ul":         true,
	"ol":         true,
	"li":         true,
	"blockquote": true,
	"div":        true,
	"section":    true,
	"article":    true,
	"header":     true,
	"footer":     true,
	"nav":        true,
	"aside":      true,
	"main":       true,
	"table":      true,
	"thead":      true,
	"tbody":      true,
	"tr":         true,
	"td":         true,
	"th":         true,
	"dl":         true,
	"dt":         true,
	"dd":         true,
	"hr":         true,
	"br":         true,
	"figure":     true,
	"figcaption": true,
	"pre":        true,
	"address":    true,
	"form":       true,
	"fieldset":   true,
	"legend":     true,
	"details":    true,
	"summary":    true,
}

// skipElements are elements that should not be translated.
var skipElements = map[string]bool{
	"img":      true,
	"picture":  true,
	"video":    true,
	"audio":    true,
	"iframe":   true,
	"svg":      true,
	"canvas":   true,
	"pre":      true,
	"code":     true,
	"script":   true,
	"style":    true,
	"noscript": true,
	"object":   true,
	"embed":    true,
	"math":     true,
}

// wrapperElements are elements that wrap content but should not be treated as blocks themselves.
var wrapperElements = map[string]bool{
	"div":     true,
	"article": true,
	"section": true,
	"main":    true,
	"aside":   true,
	"header":  true,
	"footer":  true,
	"nav":     true,
}

// ParseHTMLBlocks parses HTML content into blocks for translation.
func ParseHTMLBlocks(content string) ([]Block, error) {
	doc, err := html.Parse(strings.NewReader(content))
	if err != nil {
		return nil, err
	}

	// Find the body or use the whole document
	var root *html.Node
	var findBody func(*html.Node) *html.Node
	findBody = func(n *html.Node) *html.Node {
		if n.Type == html.ElementNode && n.Data == "body" {
			return n
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			if result := findBody(c); result != nil {
				return result
			}
		}
		return nil
	}

	root = findBody(doc)
	if root == nil {
		// No body found, use the document itself
		root = doc
	}

	// Collect blocks recursively
	var blocks []Block
	index := 0
	collectBlocks(root, &blocks, &index)

	// If no blocks found (e.g., plain text or fragment), treat whole content as one block
	if len(blocks) == 0 && strings.TrimSpace(content) != "" {
		blocks = append(blocks, Block{
			Index:         0,
			HTML:          content,
			NeedTranslate: true,
		})
	}

	return blocks, nil
}

// collectBlocks recursively collects blocks from a node.
// If a node is a wrapper element, it recursively processes children.
// Otherwise, it treats the node as a single block.
func collectBlocks(parent *html.Node, blocks *[]Block, index *int) {
	// Count non-whitespace children
	var children []*html.Node
	for child := parent.FirstChild; child != nil; child = child.NextSibling {
		blockHTML := renderNode(child)
		if blockHTML != "" && !isWhitespaceOnly(blockHTML) {
			children = append(children, child)
		}
	}

	for _, child := range children {
		// Check if this is a wrapper element that should be expanded
		if child.Type == html.ElementNode && wrapperElements[child.Data] {
			// Always expand wrapper elements recursively
			collectBlocks(child, blocks, index)
			continue
		}

		// Treat as a single block
		blockHTML := renderNode(child)
		needTranslate := shouldTranslate(child)
		*blocks = append(*blocks, Block{
			Index:         *index,
			HTML:          blockHTML,
			NeedTranslate: needTranslate,
		})
		*index++
	}
}

// renderNode renders an HTML node back to string.
func renderNode(n *html.Node) string {
	var buf bytes.Buffer
	if err := html.Render(&buf, n); err != nil {
		return ""
	}
	return buf.String()
}

// shouldTranslate determines if a node needs translation.
func shouldTranslate(n *html.Node) bool {
	if n == nil {
		return false
	}

	// Text nodes need translation if they have content
	if n.Type == html.TextNode {
		return !isWhitespaceOnly(n.Data)
	}

	// Skip non-element nodes
	if n.Type != html.ElementNode {
		return false
	}

	// Check if element should be skipped
	if skipElements[n.Data] {
		return false
	}

	// Check for figure with only image
	if n.Data == "figure" && hasOnlyImageContent(n) {
		return false
	}

	// Check if has any translatable text content
	return hasTextContent(n)
}

// hasTextContent checks if a node or its children contain text.
func hasTextContent(n *html.Node) bool {
	if n == nil {
		return false
	}

	if n.Type == html.TextNode {
		return !isWhitespaceOnly(n.Data)
	}

	// Skip elements that shouldn't be translated
	if n.Type == html.ElementNode && skipElements[n.Data] {
		return false
	}

	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if hasTextContent(c) {
			return true
		}
	}

	return false
}

// hasOnlyImageContent checks if a figure element contains only image(s).
func hasOnlyImageContent(n *html.Node) bool {
	hasImage := false
	hasOtherContent := false

	var check func(*html.Node)
	check = func(node *html.Node) {
		if node.Type == html.ElementNode {
			switch node.Data {
			case "img", "picture", "source":
				hasImage = true
			case "figcaption":
				// Check if figcaption has text
				if hasTextContent(node) {
					hasOtherContent = true
				}
			}
		} else if node.Type == html.TextNode && !isWhitespaceOnly(node.Data) {
			hasOtherContent = true
		}

		for c := node.FirstChild; c != nil; c = c.NextSibling {
			check(c)
		}
	}

	for c := n.FirstChild; c != nil; c = c.NextSibling {
		check(c)
	}

	return hasImage && !hasOtherContent
}

// isWhitespaceOnly checks if a string contains only whitespace.
func isWhitespaceOnly(s string) bool {
	return strings.TrimSpace(s) == ""
}

// HTMLToText converts HTML content to plain text.
// It extracts text content while preserving paragraph structure.
func HTMLToText(content string) string {
	doc, err := html.Parse(strings.NewReader(content))
	if err != nil {
		// Fallback: return content as-is if parsing fails
		return content
	}

	var buf strings.Builder
	extractText(doc, &buf)

	// Clean up excessive whitespace while preserving paragraph breaks
	result := buf.String()
	result = strings.TrimSpace(result)

	return result
}

// extractText recursively extracts text from HTML nodes.
func extractText(n *html.Node, buf *strings.Builder) {
	if n == nil {
		return
	}

	// Skip non-content elements
	if n.Type == html.ElementNode {
		switch n.Data {
		case "script", "style", "noscript", "head", "meta", "link":
			return
		case "br":
			buf.WriteString("\n")
			return
		case "p", "div", "h1", "h2", "h3", "h4", "h5", "h6",
			"li", "tr", "blockquote", "section", "article":
			// Add newline before block elements if buffer is not empty
			if buf.Len() > 0 {
				buf.WriteString("\n")
			}
		}
	}

	// Extract text content
	if n.Type == html.TextNode {
		text := strings.TrimSpace(n.Data)
		if text != "" {
			if buf.Len() > 0 && !strings.HasSuffix(buf.String(), "\n") {
				buf.WriteString(" ")
			}
			buf.WriteString(text)
		}
	}

	// Process children
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		extractText(c, buf)
	}

	// Add newline after block elements
	if n.Type == html.ElementNode {
		switch n.Data {
		case "p", "div", "h1", "h2", "h3", "h4", "h5", "h6",
			"li", "tr", "blockquote", "section", "article":
			buf.WriteString("\n")
		}
	}
}
