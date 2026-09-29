// File Name: category.ts
// Created Time: 2026-09-22 20:03:38
// Update Time: 2026-09-22 20:03:38


import { get } from '../request'

export interface Category {
  id: number
  merchant_id: number
  parent_id: number
  name: string
  sort: number
}

export function listCategories() {
  return get<Category[]>('/app/equipments/categories', undefined, {
    auth: false,
    silent: true,
  })
}
