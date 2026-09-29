// File Name: money.js
// Created Time: 2026-09-22 19:38:18
// Update Time: 2026-09-22 19:38:18


export function centsToYuan(cents) {
  const n = Number(cents || 0)
  return (n / 100).toFixed(2)
}

export function yuanToCents(yuan) {
  const n = Number(yuan || 0)
  return Math.round(n * 100)
}

export function formatMoney(cents) {
  const [int, frac] = centsToYuan(cents).split('.')
  const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `¥${withSep}.${frac}`
}

export function formatMoneyShort(cents) {
  const [int] = centsToYuan(cents).split('.')
  const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `¥${withSep}`
}
