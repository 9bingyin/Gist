package opml

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestOPML_ParseAndEncode(t *testing.T) {
	opmlData := `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Test OPML</title>
  </head>
  <body>
    <outline text="Folder">
      <outline text="Feed" type="rss" xmlUrl="http://example.com/rss"/>
    </outline>
  </body>
</opml>`

	doc, err := Parse(strings.NewReader(opmlData))
	require.NoError(t, err)
	require.Equal(t, "2.0", doc.Version)
	require.Equal(t, "Test OPML", doc.Head.Title)
	require.Len(t, doc.Body.Outlines, 1)
	require.Equal(t, "Folder", doc.Body.Outlines[0].Text)
	require.Len(t, doc.Body.Outlines[0].Outlines, 1)
	require.Equal(t, "Feed", doc.Body.Outlines[0].Outlines[0].Text)

	encoded, err := Encode(doc)
	require.NoError(t, err)
	require.Contains(t, string(encoded), "Test OPML")
	require.Contains(t, string(encoded), "xmlUrl=\"http://example.com/rss\"")
}
