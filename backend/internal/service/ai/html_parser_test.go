package ai_test

import (
	"gist/backend/internal/service/ai"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestParseHTMLBlocks(t *testing.T) {
	html := `<div>
		<h1>Title</h1>
		<p>Paragraph 1</p>
		<p>Paragraph 2</p>
		<img src="test.png" />
		<figure><img src="f.png" /></figure>
	</div>`

	blocks, err := ai.ParseHTMLBlocks(html)
	require.NoError(t, err)
	require.Len(t, blocks, 5) // h1, p, p, img, figure
	require.Equal(t, "<h1>Title</h1>", blocks[0].HTML)
	require.True(t, blocks[0].NeedTranslate)
	require.False(t, blocks[3].NeedTranslate) // img
	require.False(t, blocks[4].NeedTranslate) // pure-img figure
}

func TestHTMLToText(t *testing.T) {
	html := `<div>
		<h1>Title</h1>
		<p>Paragraph 1. <br/>Line 2.</p>
	</div>`

	text := ai.HTMLToText(html)
	require.Contains(t, text, "Title")
	require.Contains(t, text, "Paragraph 1.")
	require.Contains(t, text, "Line 2.")
}

func TestReplaceRestoreMedia(t *testing.T) {
	html := `<p>Hello <img src="a.png"> world <video>v</video></p>`

	replaced, elements := ai.ReplaceMediaWithPlaceholders(html)
	require.Contains(t, replaced, ai.MediaPlaceholderPrefix)
	require.Len(t, elements, 2)

	restored := ai.RestoreMediaFromPlaceholders(replaced, elements)
	require.Equal(t, html, restored)
}
