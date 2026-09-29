// File Name: invoice.ts
// Created Time: 2026-09-22 20:10:16
// Update Time: 2026-09-22 20:10:16


import { get, post } from '../request'

export interface Invoice {
  id: number
  merchant_id: number
  no: string
  order_id: number
  user_id: number
  amount_cents: number
  type: 'personal' | 'company'
  title: string
  tax_no: string
  email: string
  status: 'pending' | 'issued' | 'rejected'
  invoice_no: string
  reason: string
  created_at: string
  updated_at: string
}

export interface ApplyInvoiceInput {
  order_id: number
  type: 'personal' | 'company'
  title: string
  tax_no?: string
  email: string
}

export function listMyInvoices(params: { status?: string } = {}) {
  return get<Invoice[]>('/app/invoices', params)
}

export function getMyInvoice(id: number) {
  return get<Invoice>(`/app/invoices/${id}`)
}

export function applyInvoice(input: ApplyInvoiceInput) {
  return post<Invoice>('/app/invoices', input)
}
