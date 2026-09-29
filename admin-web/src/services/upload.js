// File Name: upload.js
// Created Time: 2026-09-22 19:42:32
// Update Time: 2026-09-22 19:42:32


import request from './request'

export function uploadFile(file, scope = 'equipment') {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('scope', scope)
  return request.post('/admin/upload', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}
