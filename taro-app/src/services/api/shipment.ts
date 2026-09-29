// File Name: shipment.ts
// Created Time: 2026-09-22 20:10:05
// Update Time: 2026-09-22 20:10:05


import { get } from '../request'

export interface Shipment {
  id: number
  merchant_id: number
  order_id: number
  express: string
  no: string
  status: string
  receiver: string
  phone: string
  address: string
  created_at: string
  updated_at: string
}

export interface ShipmentTrace {
  id: number
  shipment_id: number
  trace_at: string
  text: string
}

export interface ShipmentDetail {
  shipment: Shipment
  traces: ShipmentTrace[]
}

export function getShipmentByOrder(orderId: number) {
  return get<ShipmentDetail>(`/app/orders/${orderId}/shipment`)
}
