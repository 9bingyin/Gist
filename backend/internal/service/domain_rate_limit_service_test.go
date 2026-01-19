package service_test

import (
	"context"
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
		{host: "127.0.0.1", valid: true},
		{host: "example.com", valid: true},
		{host: "bad_host", valid: false},
	}

	for _, tc := range tests {
		require.Equal(t, tc.valid, service.IsValidHost(tc.host))
	}
}

func TestDomainRateLimitService_SetInterval_Create(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	repo := mock.NewMockDomainRateLimitRepository(ctrl)
	svc := service.NewDomainRateLimitService(repo)

	repo.EXPECT().GetByHost(gomock.Any(), "example.com").Return(nil, nil)
	repo.EXPECT().Create(gomock.Any(), "example.com", 0).Return(&model.DomainRateLimit{}, nil)

	err := svc.SetInterval(context.Background(), "example.com", -1)
	require.NoError(t, err)
}

func TestDomainRateLimitService_SetInterval_Update(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	repo := mock.NewMockDomainRateLimitRepository(ctrl)
	svc := service.NewDomainRateLimitService(repo)

	repo.EXPECT().GetByHost(gomock.Any(), "example.com").Return(&model.DomainRateLimit{Host: "example.com"}, nil)
	repo.EXPECT().Update(gomock.Any(), "example.com", 10).Return(nil)

	err := svc.SetInterval(context.Background(), "example.com", 10)
	require.NoError(t, err)
}

func TestDomainRateLimitService_SetInterval_InvalidHost(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	repo := mock.NewMockDomainRateLimitRepository(ctrl)
	svc := service.NewDomainRateLimitService(repo)

	err := svc.SetInterval(context.Background(), "bad_host", 10)
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

	dtos, err := svc.List(context.Background())
	require.NoError(t, err)
	require.Len(t, dtos, 1)
	require.Equal(t, "1", dtos[0].ID)
}
