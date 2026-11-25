package service_test

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"

	"gist/backend/internal/model"
	"gist/backend/internal/repository/mock"
	"gist/backend/internal/service"

	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"
)

func TestIsValidHost(t *testing.T) {
	tests := []struct {
		host  string
		valid bool
	}{
		{host: "", valid: false},
		{host: "localhost", valid: true},
		{host: "rsshub", valid: true},
		{host: "127.0.0.1", valid: true},
		{host: "example.com", valid: true},
		{host: "bad host", valid: false},
		{host: "example.com/path", valid: false},
		{host: "-invalid.com", valid: false},
	}

	for _, tc := range tests {
		require.Equal(t, tc.valid, service.IsValidHost(tc.host), "host=%q", tc.host)
	}
}

func TestDomainRateLimitService_SetInterval_Create(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	repo := mock.NewMockDomainRateLimitRepository(ctrl)
	svc := service.NewDomainRateLimitService(repo)

	repo.EXPECT().GetByHost(gomock.Any(), "example.com").Return(nil, nil)
	repo.EXPECT().Create(gomock.Any(), "example.com", 0).Return(&model.DomainRateLimit{ID: 1, Host: "example.com", IntervalSeconds: 0}, nil)

	limit, err := svc.SetInterval(context.Background(), "Example.COM", -1)
	require.NoError(t, err)
	require.Equal(t, int64(1), limit.ID)
	require.Equal(t, "example.com", limit.Host)
	require.Equal(t, 0, limit.IntervalSeconds)
}

func TestDomainRateLimitService_SetInterval_Update(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	repo := mock.NewMockDomainRateLimitRepository(ctrl)
	svc := service.NewDomainRateLimitService(repo)

	repo.EXPECT().GetByHost(gomock.Any(), "example.com").Return(&model.DomainRateLimit{ID: 2, Host: "example.com"}, nil)
	repo.EXPECT().Update(gomock.Any(), "example.com", 10).Return(nil)

	limit, err := svc.SetInterval(context.Background(), "example.com", 10)
	require.NoError(t, err)
	require.Equal(t, int64(2), limit.ID)
	require.Equal(t, 10, limit.IntervalSeconds)
}

func TestDomainRateLimitService_SetInterval_InvalidHost(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	repo := mock.NewMockDomainRateLimitRepository(ctrl)
	svc := service.NewDomainRateLimitService(repo)

	_, err := svc.SetInterval(context.Background(), "bad host/path", 10)
	require.ErrorIs(t, err, service.ErrInvalid)
}

func TestDomainRateLimitService_GetInterval(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	repo := mock.NewMockDomainRateLimitRepository(ctrl)
	svc := service.NewDomainRateLimitService(repo)

	repo.EXPECT().GetByHost(gomock.Any(), "example.com").Return(&model.DomainRateLimit{IntervalSeconds: 5}, nil).Times(2)
	require.Equal(t, 5, svc.GetInterval(context.Background(), "example.com"))
	require.Equal(t, 5*time.Second, svc.GetIntervalDuration(context.Background(), "example.com"))
}

func TestDomainRateLimitService_DeleteInterval_Error(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	repo := mock.NewMockDomainRateLimitRepository(ctrl)
	svc := service.NewDomainRateLimitService(repo)

	repo.EXPECT().Delete(gomock.Any(), "example.com").Return(errors.New("delete failed"))
	require.Error(t, svc.DeleteInterval(context.Background(), "example.com"))

	repo.EXPECT().Delete(gomock.Any(), "missing.com").Return(sql.ErrNoRows)
	require.ErrorIs(t, svc.DeleteInterval(context.Background(), "missing.com"), service.ErrNotFound)
}

func TestDomainRateLimitService_List(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	repo := mock.NewMockDomainRateLimitRepository(ctrl)
	svc := service.NewDomainRateLimitService(repo)

	limits := []model.DomainRateLimit{
		{ID: 1, Host: "example.com", IntervalSeconds: 10},
	}
	repo.EXPECT().List(gomock.Any()).Return(limits, nil)

	got, err := svc.List(context.Background())
	require.NoError(t, err)
	require.Len(t, got, 1)
	require.Equal(t, int64(1), got[0].ID)
}
