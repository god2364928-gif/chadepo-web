// JST (Asia/Tokyo) 시간/숫자 포맷 헬퍼
// 어드민 광고 분석 페이지에서 사용. 모든 timestamptz 는 JST 로 변환해 표시.

const JST = 'Asia/Tokyo'

const dateFmt = new Intl.DateTimeFormat('ja-JP', {
  timeZone: JST,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const dateTimeFmt = new Intl.DateTimeFormat('ja-JP', {
  timeZone: JST,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})
const dateTimeShortFmt = new Intl.DateTimeFormat('ja-JP', {
  timeZone: JST,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})
const monthDayTimeFmt = new Intl.DateTimeFormat('ja-JP', {
  timeZone: JST,
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})
const timeFmt = new Intl.DateTimeFormat('ja-JP', {
  timeZone: JST,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})
const timeHmFmt = new Intl.DateTimeFormat('ja-JP', {
  timeZone: JST,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})
const monthDayFmt = new Intl.DateTimeFormat('ja-JP', {
  timeZone: JST,
  month: '2-digit',
  day: '2-digit',
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

// 秒なし版. UserList / InquiryPage / UserDetail のように
// 「年-月-日 時:分」だけ表示したいリストで使う。
export function formatJstDateTimeShort(input) {
  const d = toDate(input)
  if (!d || isNaN(d)) return '—'
  return dateTimeShortFmt.format(d).replace(/\//g, '-')
}

// 月-日 時:分 (年を省略, 秒なし). DartThrows / InquiryPage の
// 直近イベント表示で使う。
export function formatJstMonthDayTime(input) {
  const d = toDate(input)
  if (!d || isNaN(d)) return '—'
  return monthDayTimeFmt.format(d).replace(/\//g, '-')
}

export function formatJstTime(input) {
  const d = toDate(input)
  if (!d || isNaN(d)) return '—'
  return timeFmt.format(d)
}

// 時:分 のみ. MissionsPage のゲームプレイ時刻表示などで使う。
export function formatJstTimeHm(input) {
  const d = toDate(input)
  if (!d || isNaN(d)) return '—'
  return timeHmFmt.format(d)
}

export function formatJstMonthDay(input) {
  const d = toDate(input)
  if (!d || isNaN(d)) return '—'
  return monthDayFmt.format(d).replace('/', '-')
}

// ─────────────────────────────────────────────────────────────
// datetime-local <input> 用変換ヘルパー (CampaignsPage 等)
//   - <input type="datetime-local"> は値が `YYYY-MM-DDTHH:MM`
//     の "壁時計" 文字列 (TZ なし) で、`new Date(str)` で読むと
//     ブラウザ OS の TZ で解釈される。
//   - 運用カレンダーは JST 固定なので、UTC ⇄ JST 壁時計を
//     明示変換するヘルパーを用意する。
// ─────────────────────────────────────────────────────────────

// UTC timestamp (ISO 文字列 or Date) → datetime-local 入力値 (JST 壁時計).
// 例: '2026-05-17T05:00:00Z' → '2026-05-17T14:00'
export function utcToJstInputValue(input) {
  const d = toDate(input)
  if (!d || isNaN(d)) return ''
  const jst = new Date(d.getTime() + 9 * 3600 * 1000)
  const yyyy = jst.getUTCFullYear()
  const mm = String(jst.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(jst.getUTCDate()).padStart(2, '0')
  const hh = String(jst.getUTCHours()).padStart(2, '0')
  const mi = String(jst.getUTCMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`
}

// datetime-local 入力値 (JST 壁時計として解釈) → UTC ISO 文字列.
// 例: '2026-05-17T14:00' → '2026-05-17T05:00:00.000Z'
export function jstInputValueToUtcIso(value) {
  if (!value) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value)
  if (!m) return null
  const [, y, mo, d, h, mi] = m
  const utcMs = Date.UTC(+y, +mo - 1, +d, +h, +mi, 0) - 9 * 3600 * 1000
  return new Date(utcMs).toISOString()
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
