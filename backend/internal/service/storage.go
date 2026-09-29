// File Name: storage.go
// Created Time: 2026-09-22 19:10:43
// Update Time: 2026-09-22 19:11:15


package service

import (
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"

	"rental-platform/internal/config"
	"rental-platform/pkg/errs"
)

// 允许上传的扩展名白名单
var allowedExtensions = map[string]bool{
	".jpg": true, ".jpeg": true, ".png": true,
	".webp": true, ".gif": true, ".pdf": true,
}

type Storage struct {
	dir      string
	baseURL  string
	maxBytes int64
}

func NewStorage(cfg config.StorageConfig) (*Storage, error) {
	if cfg.Type != "local" {
		return nil, fmt.Errorf("storage.type %q not supported", cfg.Type)
	}
	if err := os.MkdirAll(cfg.Dir, 0o755); err != nil {
		return nil, fmt.Errorf("mkdir storage dir: %w", err)
	}
	return &Storage{
		dir:      cfg.Dir,
		baseURL:  cfg.BaseURL,
		maxBytes: int64(cfg.MaxUploadMB) * 1024 * 1024,
	}, nil
}

// Save 保存上传文件，返回相对路径（如 /equipment/2026/09/xxx.png）
// scope 是子目录名，调用方传入 "equipment" 或 "avatar"
func (s *Storage) Save(scope string, fh *multipart.FileHeader) (string, error) {
	if fh == nil || fh.Size == 0 {
		return "", fmt.Errorf("%w: 文件为空", errs.ErrInvalidArgument)
	}
	if fh.Size > s.maxBytes {
		return "", fmt.Errorf("%w: 文件超过 %d MB", errs.ErrInvalidArgument, s.maxBytes/1024/1024)
	}
	ext := strings.ToLower(filepath.Ext(fh.Filename))
	if !allowedExtensions[ext] {
		return "", fmt.Errorf("%w: 扩展名 %s 不允许", errs.ErrInvalidArgument, ext)
	}

	sub := filepath.Join(scope, time.Now().Format("2006/01"))
	fullDir := filepath.Join(s.dir, sub)
	if err := os.MkdirAll(fullDir, 0o755); err != nil {
		return "", err
	}

	name := uuid.NewString() + ext
	dst := filepath.Join(fullDir, name)

	src, err := fh.Open()
	if err != nil {
		return "", err
	}
	defer func() { _ = src.Close() }()

	out, err := os.Create(dst)
	if err != nil {
		return "", err
	}
	if _, err := io.Copy(out, src); err != nil {
		_ = out.Close()
		_ = os.Remove(dst)
		return "", err
	}
	if err := out.Close(); err != nil {
		_ = os.Remove(dst)
		return "", err
	}

	return "/" + filepath.ToSlash(filepath.Join(sub, name)), nil
}

// BaseURL 返回配置的静态资源前缀，供 handler 拼响应使用
func (s *Storage) BaseURL() string { return s.baseURL }
