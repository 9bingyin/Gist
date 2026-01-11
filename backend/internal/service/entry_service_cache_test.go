package service

import (
	"context"
	"errors"
	"testing"

	"gist/backend/internal/service/testutil"

	"go.uber.org/mock/gomock"
)

func TestEntryService_ClearReadabilityCache(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := testutil.NewMockEntryRepository(ctrl)
	service := NewEntryService(mockEntries, testutil.NewMockFeedRepository(ctrl), testutil.NewMockFolderRepository(ctrl))

	mockEntries.EXPECT().ClearAllReadableContent(context.Background()).Return(int64(5), nil)

	count, err := service.ClearReadabilityCache(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if count != 5 {
		t.Fatalf("expected 5, got %d", count)
	}
}

func TestEntryService_ClearEntryCache(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := testutil.NewMockEntryRepository(ctrl)
	mockFeeds := testutil.NewMockFeedRepository(ctrl)
	service := NewEntryService(mockEntries, mockFeeds, testutil.NewMockFolderRepository(ctrl))

	mockEntries.EXPECT().DeleteUnstarred(context.Background()).Return(int64(3), nil)
	mockFeeds.EXPECT().ClearAllConditionalGet(context.Background()).Return(int64(2), nil)

	count, err := service.ClearEntryCache(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if count != 3 {
		t.Fatalf("expected 3, got %d", count)
	}
}

func TestEntryService_ClearCaches_RepositoryError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockEntries := testutil.NewMockEntryRepository(ctrl)
	service := NewEntryService(mockEntries, testutil.NewMockFeedRepository(ctrl), testutil.NewMockFolderRepository(ctrl))

	errReadability := errors.New("clear readability failed")
	errEntries := errors.New("clear entries failed")

	mockEntries.EXPECT().ClearAllReadableContent(context.Background()).Return(int64(0), errReadability)
	if _, err := service.ClearReadabilityCache(context.Background()); !errors.Is(err, errReadability) {
		t.Fatalf("expected readability error, got %v", err)
	}

	mockEntries.EXPECT().DeleteUnstarred(context.Background()).Return(int64(0), errEntries)
	if _, err := service.ClearEntryCache(context.Background()); !errors.Is(err, errEntries) {
		t.Fatalf("expected entry cache error, got %v", err)
	}
}
