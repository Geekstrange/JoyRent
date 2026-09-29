export function centsToYuan(cents: number): string {
  const n = Number(cents || 0)
  return (n / 100).toFixed(2)
}

export function yuanToCents(yuan: number | string): number {
  const n = Number(yuan || 0)
  return Math.round(n * 100)
}

export function formatMoney(cents: number): string {
  const [int, frac] = centsToYuan(cents).split('.')
  const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `¥${withSep}.${frac}`
}

export function formatMoneyShort(cents: number): string {
  const [int] = centsToYuan(cents).split('.')
  const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `¥${withSep}`
}

// 小程序里不用 ¥ 前缀更清爽
export function formatAmount(cents: number): string {
  const [int, frac] = centsToYuan(cents).split('.')
  return `${int}.${frac}`
}
