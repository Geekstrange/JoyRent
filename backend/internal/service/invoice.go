// File Name: invoice.go
// Created Time: 2026-09-22 19:23:25
// Update Time: 2026-09-22 19:12:25


package service

import (
	"context"
	"fmt"
	"math/rand"
	"time"

	"github.com/jmoiron/sqlx"

	"rental-platform/internal/model"
	"rental-platform/internal/repository"
	"rental-platform/pkg/errs"
)

type InvoiceService struct {
	db        *sqlx.DB
	invRepo   *repository.InvoiceRepo
	orderRepo *repository.OrderRepo
	payRepo   *repository.PaymentRepo
}

func NewInvoiceService(db *sqlx.DB) *InvoiceService {
	return &InvoiceService{
		db:        db,
		invRepo:   repository.NewInvoiceRepo(db),
		orderRepo: repository.NewOrderRepo(db),
		payRepo:   repository.NewPaymentRepo(db),
	}
}

func (s *InvoiceService) List(ctx context.Context, merchantID int64, status string) ([]model.Invoice, error) {
	return s.invRepo.List(ctx, merchantID, status)
}

func (s *InvoiceService) Get(ctx context.Context, merchantID, id int64) (*model.Invoice, error) {
	return s.invRepo.GetByID(ctx, merchantID, id)
}

func (s *InvoiceService) GetByOrder(ctx context.Context, orderID int64) (*model.Invoice, error) {
	return s.invRepo.GetByOrderID(ctx, orderID)
}

func (s *InvoiceService) SumIssued(ctx context.Context, merchantID int64) (int64, error) {
	return s.invRepo.SumIssued(ctx, merchantID)
}

type ApplyInvoiceInput struct {
	MerchantID int64
	OrderID    int64
	UserID     int64
	Type       string
	Title      string
	TaxNo      string
	Email      string
}

// Apply 用户申请开票
func (s *InvoiceService) Apply(ctx context.Context, in ApplyInvoiceInput) (*model.Invoice, error) {
	if in.Type != model.InvoiceTypePersonal && in.Type != model.InvoiceTypeCompany {
		return nil, fmt.Errorf("%w: 发票类型无效", errs.ErrInvalidArgument)
	}
	if in.Title == "" {
		return nil, fmt.Errorf("%w: 发票抬头不能为空", errs.ErrInvalidArgument)
	}
	if in.Type == model.InvoiceTypeCompany && in.TaxNo == "" {
		return nil, fmt.Errorf("%w: 企业发票必须填写税号", errs.ErrInvalidArgument)
	}
	if in.Email == "" {
		return nil, fmt.Errorf("%w: 接收邮箱不能为空", errs.ErrInvalidArgument)
	}

	o, err := s.orderRepo.GetByID(ctx, in.MerchantID, in.OrderID)
	if err != nil {
		return nil, err
	}
	if o.UserID != in.UserID {
		return nil, errs.ErrForbidden
	}
	if !model.CanIssueInvoice(o.Status) {
		return nil, fmt.Errorf("%w: 当前订单状态不可开票", errs.ErrInvalidState)
	}
	if _, err := s.invRepo.GetByOrderID(ctx, o.ID); err == nil {
		return nil, errs.ErrDuplicateInvoice
	} else if err != errs.ErrNotFound {
		return nil, err
	}

	v := &model.Invoice{
		MerchantID:  in.MerchantID,
		No:          genInvoiceNo(),
		OrderID:     o.ID,
		UserID:      o.UserID,
		AmountCents: o.RentCents,
		Type:        in.Type,
		Title:       in.Title,
		TaxNo:       in.TaxNo,
		Email:       in.Email,
		Status:      model.InvoiceStatusPending,
	}
	if err := s.invRepo.Create(ctx, v); err != nil {
		return nil, err
	}
	return v, nil
}

// Issue 管理后台开票
func (s *InvoiceService) Issue(ctx context.Context, merchantID, id int64, invoiceNo string) error {
	if invoiceNo == "" {
		return fmt.Errorf("%w: 发票号码不能为空", errs.ErrInvalidArgument)
	}
	return s.invRepo.Issue(ctx, merchantID, id, invoiceNo)
}

// Reject 管理后台拒绝
func (s *InvoiceService) Reject(ctx context.Context, merchantID, id int64, reason string) error {
	if reason == "" {
		return fmt.Errorf("%w: 拒绝原因不能为空", errs.ErrInvalidArgument)
	}
	return s.invRepo.Reject(ctx, merchantID, id, reason)
}

func genInvoiceNo() string {
	return fmt.Sprintf("INV%s%04d", time.Now().Format("20060102"), rand.Intn(10000))
}
