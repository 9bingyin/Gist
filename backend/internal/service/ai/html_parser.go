package ai

import (
	"bytes"
	"fmt"
	"strings"

	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

// Block represents a parsed HTML block.
type Block struct {
	Index         int    // Original position
	HTML          string // HTML content
	NeedTranslate bool   // Whether translation is needed
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

var mediaPlaceholderElements = map[string]bool{
	"picture": true,
	"video":   true,
	"audio":   true,
	"img":     true,
}

// ParseHTMLBlocks parses HTML content into blocks for translation.
func ParseHTMLBlocks(content string) ([]Block, error) {
	doc, err := html.Parse(strings.NewReader(content))
	if err != nil {
		return nil, err
	}

	root := findBody(doc)
	if root == nil {
		root = doc
	}

	var blocks []Block
	index := 0
	collectBlocks(root, &blocks, &index)

	if len(blocks) == 0 && strings.TrimSpace(content) != "" {
		blocks = append(blocks, Block{
			Index:         0,
			HTML:          content,
			NeedTranslate: true,
		})
	}

	return blocks, nil
}

func findBody(n *html.Node) *html.Node {
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

// collectBlocks performs a single-pass traversal over child nodes without
// repeatedly rendering subtrees at every wrapper nesting level.
func collectBlocks(parent *html.Node, blocks *[]Block, index *int) {
	for child := parent.FirstChild; child != nil; child = child.NextSibling {
		if isIgnorableNode(child) {
			continue
		}

		if child.Type == html.ElementNode && wrapperElements[child.Data] {
			collectBlocks(child, blocks, index)
			continue
		}

		blockHTML := renderNode(child)
		if isWhitespaceOnly(blockHTML) {
			continue
		}
		*blocks = append(*blocks, Block{
			Index:         *index,
			HTML:          blockHTML,
			NeedTranslate: shouldTranslate(child),
		})
		*index++
	}
}

func isIgnorableNode(n *html.Node) bool {
	switch n.Type {
	case html.TextNode:
		return isWhitespaceOnly(n.Data)
	case html.CommentNode, html.DoctypeNode:
		return true
	default:
		return false
	}
}

func renderNode(n *html.Node) string {
	var buf bytes.Buffer
	if err := html.Render(&buf, n); err != nil {
		return ""
	}
	return buf.String()
}

func shouldTranslate(n *html.Node) bool {
	if n == nil {
		return false
	}
	if n.Type == html.TextNode {
		return !isWhitespaceOnly(n.Data)
	}
	if n.Type != html.ElementNode {
		return false
	}
	if skipElements[n.Data] {
		return false
	}
	if n.Data == "figure" && hasOnlyImageContent(n) {
		return false
	}
	return hasTextContent(n)
}

func hasTextContent(n *html.Node) bool {
	if n == nil {
		return false
	}
	if n.Type == html.TextNode {
		return !isWhitespaceOnly(n.Data)
	}
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

func isWhitespaceOnly(s string) bool {
	return strings.TrimSpace(s) == ""
}

// HTMLToText converts HTML content to plain text while preserving paragraph structure.
func HTMLToText(content string) string {
	doc, err := html.Parse(strings.NewReader(content))
	if err != nil {
		return content
	}

	var buf strings.Builder
	extractText(doc, &buf)
	return strings.TrimSpace(buf.String())
}

func extractText(n *html.Node, buf *strings.Builder) {
	if n == nil {
		return
	}

	if n.Type == html.ElementNode {
		switch n.Data {
		case "script", "style", "noscript", "head", "meta", "link":
			return
		case "br":
			buf.WriteString("\n")
			return
		case "p", "div", "h1", "h2", "h3", "h4", "h5", "h6",
			"li", "tr", "blockquote", "section", "article":
			if buf.Len() > 0 {
				buf.WriteString("\n")
			}
		}
	}

	if n.Type == html.TextNode {
		text := strings.TrimSpace(n.Data)
		if text != "" {
			if buf.Len() > 0 && !strings.HasSuffix(buf.String(), "\n") {
				buf.WriteString(" ")
			}
			buf.WriteString(text)
		}
	}

	for c := n.FirstChild; c != nil; c = c.NextSibling {
		extractText(c, buf)
	}

	if n.Type == html.ElementNode {
		switch n.Data {
		case "p", "div", "h1", "h2", "h3", "h4", "h5", "h6",
			"li", "tr", "blockquote", "section", "article":
			buf.WriteString("\n")
		}
	}
}

// MediaPlaceholderPrefix is the prefix for media placeholders.
const MediaPlaceholderPrefix = "{{__MEDIA_PLACEHOLDER_"

// ReplaceMediaWithPlaceholders walks the HTML fragment AST and replaces
// picture/video/audio/img elements with placeholders. Using the HTML parser avoids
// regex corruption when attributes contain '>' or nested markup.
func ReplaceMediaWithPlaceholders(htmlContent string) (string, []string) {
	container := &html.Node{
		Type:     html.ElementNode,
		DataAtom: atom.Body,
		Data:     "body",
	}
	nodes, err := html.ParseFragment(strings.NewReader(htmlContent), container)
	if err != nil {
		return htmlContent, nil
	}

	for _, n := range nodes {
		container.AppendChild(n)
	}

	var elements []string
	replaceMediaNodes(container, &elements)

	if len(elements) == 0 {
		return htmlContent, nil
	}

	var buf bytes.Buffer
	for c := container.FirstChild; c != nil; c = c.NextSibling {
		if err := html.Render(&buf, c); err != nil {
			return htmlContent, nil
		}
	}
	return buf.String(), elements
}

func replaceMediaNodes(parent *html.Node, elements *[]string) {
	for c := parent.FirstChild; c != nil; {
		next := c.NextSibling
		if c.Type == html.ElementNode && mediaPlaceholderElements[c.Data] {
			idx := len(*elements)
			*elements = append(*elements, renderNode(c))
			placeholder := &html.Node{
				Type: html.TextNode,
				Data: fmt.Sprintf("%s%d__}}", MediaPlaceholderPrefix, idx),
			}
			parent.InsertBefore(placeholder, c)
			parent.RemoveChild(c)
		} else {
			replaceMediaNodes(c, elements)
		}
		c = next
	}
}

// RestoreMediaFromPlaceholders restores placeholders back to original media elements.
func RestoreMediaFromPlaceholders(htmlContent string, elements []string) string {
	result := htmlContent
	for i, element := range elements {
		placeholder := fmt.Sprintf("%s%d__}}", MediaPlaceholderPrefix, i)
		result = strings.Replace(result, placeholder, element, 1)
	}
	return result
}
