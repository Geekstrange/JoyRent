import dayjs from 'dayjs'

export function today(): string {
  return dayjs().format('YYYY-MM-DD')
}

export function addDays(base: string, n: number): string {
  return dayjs(base).add(n, 'day').format('YYYY-MM-DD')
}

export function diffDays(start: string, end: string): number {
  const s = dayjs(start)
  const e = dayjs(end)
  return Math.max(1, e.diff(s, 'day') + 1)
}

export function formatDate(d: string): string {
  return dayjs(d).format('YYYY-MM-DD')
}

export function formatDateTime(d: string): string {
  return dayjs(d).format('YYYY-MM-DD HH:mm')
}

export function shortDate(d: string): string {
  return dayjs(d).format('MM/DD')
}
