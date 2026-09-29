// File Name: asset.js
// Created Time: 2026-09-22 19:38:33
// Update Time: 2026-09-23 19:20:00


// 后端静态资源挂在 /static 下（见 router.go 的 r.Static(cfg.Storage.BaseURL, cfg.Storage.Dir)），
// 而库里存的 cover_path / avatar_path 是不带前缀的相对路径（如 /equipment/2026/09/x.png）。
// 因此渲染时必须补上 /static，否则 <img src="/equipment/..."> 会 404。
const ASSET_BASE = import.meta.env.VITE_ASSET_BASE || '/static'

export function assetUrl(path) {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  if (/^data:/i.test(path)) return path
  const base = ASSET_BASE.replace(/\/$/, '')
  // 已经带前缀的（如后端 upload 接口返回的 url 字段）不重复拼接
  if (path === base || path.startsWith(base + '/')) return path
  return base + '/' + path.replace(/^\//, '')
}
