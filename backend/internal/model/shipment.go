// File Name: shipment.go
// Created Time: 2026-09-22 18:53:20
// Update Time: 2026-09-22 18:53:20


package model

import "time"

type Shipment struct {
	ID         int64     `db:"id"          json:"id"`
	MerchantID int64     `db:"merchant_id" json:"merchant_id"`
	OrderID    int64     `db:"order_id"    json:"order_id"`
	Express    string    `db:"express"     json:"express"`
	No         string    `db:"no"          json:"no"`
	Status     string    `db:"status"      json:"status"`
	Receiver   string    `db:"receiver"    json:"receiver"`
	Phone      string    `db:"phone"       json:"phone"`
	Address    string    `db:"address"     json:"address"`
	CreatedAt  time.Time `db:"created_at"  json:"created_at"`
	UpdatedAt  time.Time `db:"updated_at"  json:"updated_at"`
}

type ShipmentTrace struct {
	ID         int64     `db:"id"          json:"id"`
	ShipmentID int64     `db:"shipment_id" json:"shipment_id"`
	TraceAt    time.Time `db:"trace_at"    json:"trace_at"`
	Text       string    `db:"text"        json:"text"`
	CreatedAt  time.Time `db:"created_at"  json:"created_at"`
}

const (
	ShipStatusNone       = "none"
	ShipStatusShipped    = "shipped"
	ShipStatusDelivering = "delivering"
	ShipStatusSigned     = "signed"
	ShipStatusReturning  = "returning"
	ShipStatusReceived   = "received"
)

var ShipFlow = map[string][]string{
	ShipStatusNone:       {ShipStatusShipped, ShipStatusDelivering},
	ShipStatusShipped:    {ShipStatusDelivering, ShipStatusSigned},
	ShipStatusDelivering: {ShipStatusSigned},
	ShipStatusSigned:     {ShipStatusReturning},
	ShipStatusReturning:  {ShipStatusReceived},
}

func CanShipTransition(from, to string) bool {
	next, ok := ShipFlow[from]
	if !ok {
		return false
	}
	for _, s := range next {
		if s == to {
			return true
		}
	}
	return false
}

var ShipStatusText = map[string]string{
	ShipStatusNone:       "待发货",
	ShipStatusShipped:    "运输中",
	ShipStatusDelivering: "派送中",
	ShipStatusSigned:     "已签收",
	ShipStatusReturning:  "寄回中",
	ShipStatusReceived:   "已收回",
}

// ExpressCompanies 支持的快递公司
var ExpressCompanies = map[string]string{
	"sf":   "顺丰速运",
	"jd":   "京东物流",
	"zto":  "中通快递",
	"yto":  "圆通速递",
	"yd":   "韵达快递",
	"ems":  "中国邮政 EMS",
	"self": "同城自提",
}
