package service_test

import (
	"context"
	"errors"
	"testing"

	"gist/backend/internal/repository/mock"
	"gist/backend/internal/service"

	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"
)

func TestEntryService_ClearReadabilityCache(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := mock.NewMockEntryRepository(ctrl)
	svc := service.NewEntryService(mockEntries, mock.NewMockFeedRepository(ctrl), mock.NewMockFolderRepository(ctrl))

	mockEntries.EXPECT().ClearAllReadableContent(context.Background()).Return(int64(5), nil)

	count, err := svc.ClearReadabilityCache(context.Background())
	require.NoError(t, err)
	require.Equal(t, int64(5), count)
}

func TestEntryService_ClearEntryCache(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := mock.NewMockEntryRepository(ctrl)
	mockFeeds := mock.NewMockFeedRepository(ctrl)
	svc := service.NewEntryService(mockEntries, mockFeeds, mock.NewMockFolderRepository(ctrl))

	mockEntries.EXPECT().DeleteUnstarred(context.Background()).Return(int64(3), nil)
	mockFeeds.EXPECT().ClearAllConditionalGet(context.Background()).Return(int64(2), nil)

	count, err := svc.ClearEntryCache(context.Background())
	require.NoError(t, err)
	require.Equal(t, int64(3), count)
}

func TestEntryService_ClearCaches_RepositoryError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := mock.NewMockEntryRepository(ctrl)
	svc := service.NewEntryService(mockEntries, mock.NewMockFeedRepository(ctrl), mock.NewMockFolderRepository(ctrl))

	errReadability := errors.New("clear readability failed")
	errEntries := errors.New("clear entries failed")

	mockEntries.EXPECT().ClearAllReadableContent(context.Background()).Return(int64(0), errReadability)
	_, err := svc.ClearReadabilityCache(context.Background())
	require.ErrorIs(t, err, errReadability)

	mockEntries.EXPECT().DeleteUnstarred(context.Background()).Return(int64(0), errEntries)
	_, err = svc.ClearEntryCache(context.Background())
	require.ErrorIs(t, err, errEntries)
}
