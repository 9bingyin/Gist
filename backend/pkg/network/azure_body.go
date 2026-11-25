package network

import (
	"compress/gzip"
	"compress/zlib"
	"errors"
	"fmt"
	"io"
	"strings"

	"github.com/Noooste/azuretls-client"
	"github.com/andybalholm/brotli"
	"github.com/klauspost/compress/zstd"
)

// OpenAzureResponseBody opens the decoded stream for an azuretls IgnoreBody request.
// The caller must close the returned stream; on error the raw body is closed here.
func OpenAzureResponseBody(resp *azuretls.Response) (io.ReadCloser, error) {
	raw := resp.RawBody
	if resp.HttpResponse.Uncompressed {
		return raw, nil
	}

	var decoder io.ReadCloser
	var err error
	encoding := strings.ToLower(strings.TrimSpace(resp.Header.Get("Content-Encoding")))
	switch encoding {
	case "", "identity":
		return raw, nil
	case "gzip", "x-gzip":
		decoder, err = gzip.NewReader(raw)
	case "deflate":
		decoder, err = zlib.NewReader(raw)
	case "br":
		decoder = io.NopCloser(brotli.NewReader(raw))
	case "zstd":
		var z *zstd.Decoder
		z, err = zstd.NewReader(raw, zstd.WithDecoderConcurrency(1), zstd.WithDecoderMaxMemory(64<<20))
		if err == nil {
			decoder = z.IOReadCloser()
		}
	default:
		_ = raw.Close()
		return nil, fmt.Errorf("unsupported content encoding %q", encoding)
	}
	if err != nil {
		_ = raw.Close()
		return nil, fmt.Errorf("open %s response body: %w", encoding, err)
	}
	return &azureResponseBody{ReadCloser: decoder, raw: raw}, nil
}

type azureResponseBody struct {
	io.ReadCloser
	raw io.Closer
}

func (b *azureResponseBody) Close() error {
	return errors.Join(b.ReadCloser.Close(), b.raw.Close())
}
