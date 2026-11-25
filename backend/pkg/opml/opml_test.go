package opml_test

import (
	"bytes"
	"strings"
	"testing"

	"gist/backend/pkg/opml"

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

	doc, err := opml.Parse(strings.NewReader(opmlData))
	require.NoError(t, err)
	require.Equal(t, "2.0", doc.Version)
	require.Equal(t, "Test OPML", doc.Head.Title)
	require.Len(t, doc.Body.Outlines, 1)
	require.Equal(t, "Folder", doc.Body.Outlines[0].Text)
	require.Len(t, doc.Body.Outlines[0].Outlines, 1)
	require.Equal(t, "Feed", doc.Body.Outlines[0].Outlines[0].Text)

	encoded, err := opml.Encode(doc)
	require.NoError(t, err)
	require.Contains(t, string(encoded), "Test OPML")
	require.Contains(t, string(encoded), "xmlUrl=\"http://example.com/rss\"")
}

func TestOPML_Parse_NonUTF8Encoding(t *testing.T) {
	// ISO-8859-1 encoded "Café" (0xe9 = é)
	raw := []byte("<?xml version=\"1.0\" encoding=\"ISO-8859-1\"?><opml version=\"2.0\"><head><title>Caf\xe9</title></head><body/></opml>")

	doc, err := opml.Parse(bytes.NewReader(raw))
	require.NoError(t, err)
	require.Equal(t, "Café", doc.Head.Title)
}

func TestOPML_Parse_InvalidXML(t *testing.T) {
	_, err := opml.Parse(strings.NewReader("<opml>"))
	require.Error(t, err)
}
