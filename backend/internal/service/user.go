// File Name: user.go
// Created Time: 2026-09-22 19:52:45
// Update Time: 2026-09-22 19:52:45


package service

import (
	"context"

	"github.com/jmoiron/sqlx"

	"rental-platform/internal/model"
	"rental-platform/internal/repository"
)

type UserService struct {
	db   *sqlx.DB
	repo *repository.AppUserRepo
}

func NewUserService(db *sqlx.DB) *UserService {
	return &UserService{
		db:   db,
		repo: repository.NewAppUserRepo(db),
	}
}

func (s *UserService) List(ctx context.Context, keyword string) ([]model.AppUser, error) {
	return s.repo.List(ctx, keyword)
}

func (s *UserService) ToggleStatus(ctx context.Context, id int64) error {
	return s.repo.ToggleStatus(ctx, id)
}
