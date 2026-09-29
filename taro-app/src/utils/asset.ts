import { ASSET_BASE } from '@/utils/env'

/**
 * 把后端返回的相对资源路径拼成可直接访问的完整地址。
 *
 * 后端 storage.base_url = "/static"，接口返回的 cover_path 形如
 * "/equipment/2026/09/xxx.png"。小程序里 <Image src="/equipment/...">
 * 会被当成包内路径去找，必然 404 → 封面全空，所以必须拼成 http 地址。
 */
export function assetUrl(path?: string | null): string {
  if (!path) return ''
  // 已经是绝对地址（含 data:）直接返回
  if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:')) return path
  if (!ASSET_BASE) return path
  return ASSET_BASE.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '')
}
