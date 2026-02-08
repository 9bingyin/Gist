package service_test

import (
	"bytes"
	"context"
	"strings"
	"testing"
	"time"

	"gist/backend/internal/model"
	mock_repo "gist/backend/internal/repository/mock"
	"gist/backend/internal/service"
	"gist/backend/pkg/opml"

	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"
)

const sampleOPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Tech">
      <outline text="Feed A" xmlUrl="https://a.com/rss" />
    </outline>
    <outline text="Feed B" xmlUrl="https://b.com/rss" />
  </body>
</opml>`

func TestOPMLService_Import_Invalid(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	svc := service.NewOPMLService(nil, nil, nil, nil, mock_repo.NewMockFolderRepository(ctrl), mock_repo.NewMockFeedRepository(ctrl))
	_, err := svc.Import(context.Background(), strings.NewReader("<invalid"), nil)
	require.ErrorIs(t, err, service.ErrInvalid)
}

func TestOPMLService_Import_CreatesFoldersAndFeeds(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	folderRepo := mock_repo.NewMockFolderRepository(ctrl)
	folderService := &folderServiceStub{nextID: 10}
	feedService := &feedServiceStub{nextID: 100}
	refreshSvc := &refreshServiceStub{done: make(chan []int64, 1)}
	iconSvc := &iconServiceStub{done: make(chan struct{}, 1)}

	folderRepo.EXPECT().FindByName(gomock.Any(), "Tech", (*int64)(nil)).Return(nil, nil)

	progressEvents := make([]service.ImportProgress, 0, 3)
	onProgress := func(p service.ImportProgress) {
		progressEvents = append(progressEvents, p)
	}

	svc := service.NewOPMLService(folderService, feedService, refreshSvc, iconSvc, folderRepo, nil)
	result, err := svc.Import(context.Background(), strings.NewReader(sampleOPML), onProgress)
	require.NoError(t, err)
	require.Equal(t, 1, result.FoldersCreated)
	require.Equal(t, 2, result.FeedsCreated)
	require.GreaterOrEqual(t, len(progressEvents), 3)
	require.Equal(t, "started", progressEvents[0].Status)
	require.Equal(t, 2, progressEvents[0].Total)

	require.Len(t, feedService.calls, 2)
	require.Equal(t, "https://a.com/rss", feedService.calls[0].url)
	require.Equal(t, "https://b.com/rss", feedService.calls[1].url)
	require.NotNil(t, feedService.calls[0].folderID)
	require.Equal(t, int64(10), *feedService.calls[0].folderID)
	require.Nil(t, feedService.calls[1].folderID)

	select {
	case ids := <-refreshSvc.done:
		require.Len(t, ids, 2)
	case <-time.After(500 * time.Millisecond):
		t.Fatal("expected refresh to run")
	}

	select {
	case <-iconSvc.done:
	default:
		t.Fatal("expected icon backfill to run")
	}
}

func TestOPMLService_Import_EmptyFolderNameUsesUntitled(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	folderRepo := mock_repo.NewMockFolderRepository(ctrl)
	folderService := &folderServiceStub{nextID: 1}
	feedService := &feedServiceStub{nextID: 1}

	folderRepo.EXPECT().FindByName(gomock.Any(), "Untitled", (*int64)(nil)).Return(nil, nil)

	input := `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline>
      <outline text="Feed" xmlUrl="https://a.com/rss" />
    </outline>
  </body>
</opml>`

	svc := service.NewOPMLService(folderService, feedService, nil, nil, folderRepo, nil)
	_, err := svc.Import(context.Background(), strings.NewReader(input), nil)
	require.NoError(t, err)
	require.NotEmpty(t, folderService.created)
	require.Equal(t, "Untitled", folderService.created[0].Name)
}

func TestOPMLService_Export_SortsAndBuildsOutlines(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	folderRepo := mock_repo.NewMockFolderRepository(ctrl)
	feedRepo := mock_repo.NewMockFeedRepository(ctrl)

	folders := []model.Folder{
		{ID: 1, Name: "B Folder"},
		{ID: 2, Name: "a folder"},
	}
	feeds := []model.Feed{
		{ID: 10, Title: "Z Feed", URL: "https://z.com/rss"},
		{ID: 11, Title: "A Feed", URL: "https://a.com/rss"},
		{ID: 12, Title: "Child", URL: "https://c.com/rss", FolderID: int64Ptr(1), SiteURL: strPtr("https://c.com")},
	}

	folderRepo.EXPECT().List(gomock.Any()).Return(folders, nil)
	feedRepo.EXPECT().List(gomock.Any(), (*int64)(nil)).Return(feeds, nil)

	svc := service.NewOPMLService(nil, nil, nil, nil, folderRepo, feedRepo)
	data, err := svc.Export(context.Background())
	require.NoError(t, err)

	doc, err := opml.Parse(bytes.NewReader(data))
	require.NoError(t, err)

	require.Len(t, doc.Body.Outlines, 4)
	require.Equal(t, "a folder", doc.Body.Outlines[0].Text)
	require.Equal(t, "B Folder", doc.Body.Outlines[1].Text)
	require.Equal(t, "A Feed", doc.Body.Outlines[2].Text)
	require.Equal(t, "Z Feed", doc.Body.Outlines[3].Text)

	child := doc.Body.Outlines[1].Outlines
	require.Len(t, child, 1)
	require.Equal(t, "https://c.com/rss", child[0].XMLURL)
	require.Equal(t, "https://c.com", child[0].HTMLURL)
}

type folderServiceStub struct {
	nextID  int64
	created []model.Folder
}

func (s *folderServiceStub) Create(ctx context.Context, name string, parentID *int64, folderType string) (model.Folder, error) {
	folder := model.Folder{ID: s.nextID, Name: name, ParentID: parentID, Type: folderType}
	s.nextID++
	s.created = append(s.created, folder)
	return folder, nil
}

func (s *folderServiceStub) List(ctx context.Context) ([]model.Folder, error) {
	return nil, nil
}

func (s *folderServiceStub) Update(ctx context.Context, id int64, name string, parentID *int64) (model.Folder, error) {
	return model.Folder{}, nil
}

func (s *folderServiceStub) UpdateType(ctx context.Context, id int64, folderType string) error {
	return nil
}

func (s *folderServiceStub) Delete(ctx context.Context, id int64) error {
	return nil
}

type feedServiceStub struct {
	nextID int64
	calls  []feedAddCall
}

type feedAddCall struct {
	url      string
	folderID *int64
}

func (s *feedServiceStub) Add(ctx context.Context, feedURL string, folderID *int64, titleOverride string, feedType string) (model.Feed, error) {
	return model.Feed{}, nil
}

func (s *feedServiceStub) AddWithoutFetch(ctx context.Context, feedURL string, folderID *int64, titleOverride string, feedType string) (model.Feed, bool, error) {
	s.calls = append(s.calls, feedAddCall{url: feedURL, folderID: folderID})
	feed := model.Feed{ID: s.nextID, URL: feedURL, FolderID: folderID, Title: titleOverride, Type: feedType}
	s.nextID++
	return feed, true, nil
}

func (s *feedServiceStub) Preview(ctx context.Context, feedURL string) (service.FeedPreview, error) {
	return service.FeedPreview{}, nil
}

func (s *feedServiceStub) List(ctx context.Context, folderID *int64) ([]model.Feed, error) {
	return nil, nil
}

func (s *feedServiceStub) Update(ctx context.Context, id int64, title string, folderID *int64) (model.Feed, error) {
	return model.Feed{}, nil
}

func (s *feedServiceStub) UpdateType(ctx context.Context, id int64, feedType string) error {
	return nil
}

func (s *feedServiceStub) Delete(ctx context.Context, id int64) error {
	return nil
}

func (s *feedServiceStub) DeleteBatch(ctx context.Context, ids []int64) error {
	return nil
}

type refreshServiceStub struct {
	done chan []int64
}

func (s *refreshServiceStub) RefreshAll(ctx context.Context) error {
	return nil
}

func (s *refreshServiceStub) RefreshFeed(ctx context.Context, feedID int64) error {
	return nil
}

func (s *refreshServiceStub) RefreshFeeds(ctx context.Context, feedIDs []int64) error {
	select {
	case s.done <- append([]int64(nil), feedIDs...):
	default:
	}
	return nil
}

func (s *refreshServiceStub) IsRefreshing() bool {
	return false
}

func (s *refreshServiceStub) GetRefreshStatus() service.RefreshStatus {
	return service.RefreshStatus{}
}

type iconServiceStub struct {
	done chan struct{}
}

func (s *iconServiceStub) FetchAndSaveIcon(ctx context.Context, feedImageURL, siteURL string) (string, error) {
	return "", nil
}

func (s *iconServiceStub) EnsureIcon(ctx context.Context, iconPath, siteURL string) error {
	return nil
}

func (s *iconServiceStub) EnsureIconByFeedID(ctx context.Context, feedID int64, iconPath string) error {
	return nil
}

func (s *iconServiceStub) BackfillIcons(ctx context.Context) error {
	select {
	case s.done <- struct{}{}:
	default:
	}
	return nil
}

func (s *iconServiceStub) GetIconPath(filename string) string {
	return ""
}

func (s *iconServiceStub) ClearAllIcons(ctx context.Context) (int64, error) {
	return 0, nil
}

func int64Ptr(value int64) *int64 {
	return &value
}

func strPtr(value string) *string {
	return &value
}

// Ensure we satisfy the io.Reader interface import when not used in build tags.
