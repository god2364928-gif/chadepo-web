// JST (Asia/Tokyo) 시간/숫자 포맷 헬퍼
// 어드민 광고 분석 페이지에서 사용. 모든 timestamptz 는 JST 로 변환해 표시.

const JST = 'Asia/Tokyo'

const dateFmt = new Intl.DateTimeFormat('ja-JP', {
  timeZone: JST, year: 'numeric', month: '2-digit', day: '2-digit',
})
const dateTimeFmt = new Intl.DateTimeFormat('ja-JP', {
  timeZone: JST, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
})
const timeFmt = new Intl.DateTimeFormat('ja-JP', {
  timeZone: JST, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
})
const monthDayFmt = new Intl.DateTimeFormat('ja-JP', {
  timeZone: JST, month: '2-digit', day: '2-digit',
})

function toDate(input) {
  if (input == null) return null
  if (input instanceof Date) return input
  return new Date(input)
}

export function formatJstDate(input) {
  const d = toDate(input)
  if (!d || isNaN(d)) return '—'
  return dateFmt.format(d).replaceAll('/', '-')
}

export function formatJstDateTime(input) {
  const d = toDate(input)
  if (!d || isNaN(d)) return '—'
  return dateTimeFmt.format(d).replace(/\//g, '-')
}

export function formatJstTime(input) {
  const d = toDate(input)
  if (!d || isNaN(d)) return '—'
  return timeFmt.format(d)
}

export function formatJstMonthDay(input) {
  const d = toDate(input)
  if (!d || isNaN(d)) return '—'
  return monthDayFmt.format(d).replace('/', '-')
}

// 숫자 포맷
export function formatInt(value) {
  if (value == null) return '—'
  return Number(value).toLocaleString('ja-JP')
}

export function formatUsd(value, digits = 4) {
  if (value == null) return '—'
  const n = Number(value)
  if (isNaN(n)) return '—'
  return `$${n.toFixed(digits)}`
}

export function formatPct(value, digits = 1) {
  if (value == null) return '—'
  const n = Number(value)
  if (isNaN(n)) return '—'
  return `${n.toFixed(digits)}%`
}
