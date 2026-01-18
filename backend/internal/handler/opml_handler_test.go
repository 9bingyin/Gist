package handler_test

import (
	"context"
	"gist/backend/internal/handler"
	"io"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"

	"gist/backend/internal/service"
	"gist/backend/internal/service/mock"
)

func TestOPMLHandler_Import_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockOPML := mock.NewMockOPMLService(ctrl)
	mockTask := mock.NewMockImportTaskService(ctrl)
	h := handler.NewOPMLHandlerHelper(mockOPML, mockTask)

	e := newTestEcho()
	opmlContent := `<?xml version="1.0" encoding="UTF-8"?><opml version="2.0"><body><outline text="Test" xmlUrl="http://example.com/rss"/></body></opml>`
	req := newJSONRequest(http.MethodPost, "/opml/import", nil)
	req.Body = &ioReaderCloser{s: opmlContent}
	req.Header.Set("Content-Type", "application/xml")
	c, rec := newTestContext(e, req)

	// Since runImport runs in a goroutine, we need to wait or mock it carefully.
	// However, the handler returns immediately after starting the goroutine.
	// We just test the immediate response.

	mockTask.EXPECT().
		Start(1).
		Return("task-id", context.Background())

	mockOPML.EXPECT().
		Import(gomock.Any(), gomock.Any(), gomock.Any()).
		Return(service.ImportResult{}, nil)

	mockTask.EXPECT().
		Complete(service.ImportResult{}).
		Return()

	err := h.Import(c)
	require.NoError(t, err)

	// Wait a bit for the goroutine to call Start and Import
	time.Sleep(20 * time.Millisecond)

	var resp handler.ImportStartedResponse
	assertJSONResponse(t, rec, http.StatusOK, &resp)
	require.Equal(t, "started", resp.Status)
}

func TestOPMLHandler_CancelImport_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockOPML := mock.NewMockOPMLService(ctrl)
	mockTask := mock.NewMockImportTaskService(ctrl)
	h := handler.NewOPMLHandlerHelper(mockOPML, mockTask)

	mockTask.EXPECT().Cancel().Return(true)

	e := newTestEcho()
	req := newJSONRequest(http.MethodDelete, "/opml/import", nil)
	c, rec := newTestContext(e, req)

	err := h.CancelImport(c)
	require.NoError(t, err)

	var resp handler.ImportCancelledResponse
	assertJSONResponse(t, rec, http.StatusOK, &resp)
	require.True(t, resp.Cancelled)
}

func TestOPMLHandler_Export_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockOPML := mock.NewMockOPMLService(ctrl)
	mockTask := mock.NewMockImportTaskService(ctrl)
	h := handler.NewOPMLHandlerHelper(mockOPML, mockTask)

	expectedXML := []byte(`<?xml version="1.0"?><opml><body></body></opml>`)
	mockOPML.EXPECT().
		Export(gomock.Any()).
		Return(expectedXML, nil)

	e := newTestEcho()
	req := newJSONRequest(http.MethodGet, "/opml/export", nil)
	c, rec := newTestContext(e, req)

	err := h.Export(c)
	require.NoError(t, err)

	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "application/xml", rec.Header().Get("Content-Type"))
	require.Contains(t, rec.Header().Get("Content-Disposition"), "gist.opml")
	require.Equal(t, expectedXML, rec.Body.Bytes())
}

func TestOPMLHandler_ImportStatus_Idle(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockOPML := mock.NewMockOPMLService(ctrl)
	mockTask := mock.NewMockImportTaskService(ctrl)
	h := handler.NewOPMLHandlerHelper(mockOPML, mockTask)

	// Return nil for idle status
	mockTask.EXPECT().Get().Return(nil).AnyTimes()

	e := newTestEcho()
	req := newJSONRequest(http.MethodGet, "/opml/import/status", nil)
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	req = req.WithContext(ctx)
	c, rec := newTestContext(e, req)

	// Run in goroutine because ImportStatus is a blocking SSE stream
	done := make(chan bool)
	go func() {
		h.ImportStatus(c)
		close(done)
	}()

	// Wait for the context to timeout and handler to finish
	<-done

	body := rec.Body.String()
	require.Contains(t, body, "data: {\"status\":\"idle\"}")
}

// Helper types/functions for the test
type ioReaderCloser struct {
	s string
	i int
}

func (r *ioReaderCloser) Close() error { return nil }
func (r *ioReaderCloser) Read(b []byte) (int, error) {
	if r.i >= len(r.s) {
		return 0, io.EOF
	}
	n := copy(b, r.s[r.i:])
	r.i += n
	return n, nil
}
