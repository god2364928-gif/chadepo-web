import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { formatJstDate, formatJstMonthDay, formatUsd, formatInt } from '../../utils/jstFormat'

// period → 일수 매핑 (revenue_trend 는 days 파라미터)
const PERIOD_TO_DAYS = { '1d': 1, '7d': 7, '30d': 30, '90d': 90 }

export default function AdRevenueTrendChart({ period, adFormat, refreshKey }) {
  const days = PERIOD_TO_DAYS[period] ?? 7

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['ad_revenue_trend', days, adFormat, refreshKey],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_ad_revenue_trend', {
        p_days: days,
        p_ad_format: adFormat || null,
      })
      if (error) throw error
      return data ?? []
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  // 일자별로 GROUP BY (포맷이 'all' 이 아닌 경우엔 이미 단일 포맷이지만,
  // 'all' 케이스에서도 RPC 가 이미 합산해서 ad_format='all' 한 row 만 줌).
  // 단일 포맷이건 all 이건 date 기준 1일 1 row 가 정상.
  const points = useMemo(() => {
    if (!data) return []
    // 날짜별로 합산 (안전장치)
    const byDate = new Map()
    for (const r of data) {
      const key = r.date
      const cur = byDate.get(key) ?? { date: key, revenue_usd: 0, impression_count: 0 }
      cur.revenue_usd += Number(r.revenue_usd ?? 0)
      cur.impression_count += Number(r.impression_count ?? 0)
      byDate.set(key, cur)
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  }, [data])

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-900 text-sm">수익 트렌드</h2>
        <span className="text-xs text-gray-400">
          최근 {days}일 (JST) · <span className="text-blue-600">● 수익(USD)</span> · <span className="text-gray-500">● 노출수</span>
        </span>
      </div>
      {error ? (
        <div className="px-4 py-6 text-center">
          <p className="text-red-700 text-sm mb-2">불러오기 실패: {error.message}</p>
          <button onClick={() => refetch()} className="text-xs px-3 py-1 bg-white border border-red-300 text-red-700 rounded hover:bg-red-50">다시 시도</button>
        </div>
      ) : isLoading ? (
        <div className="py-12 text-center text-gray-400 text-sm">불러오는 중...</div>
      ) : points.length === 0 ? (
        <div className="py-12 text-center text-gray-400 text-sm">데이터가 없습니다</div>
      ) : (
        <TrendChart points={points} days={days} />
      )}
    </div>
  )
}

// ─── SVG 차트 (이중축: 좌=revenue, 우=impression) ─────────────────────────
function TrendChart({ points, days }) {
  const W = 880, H = 240, PAD_L = 56, PAD_R = 56, PAD_T = 16, PAD_B = 32

  // 전체 일자 시퀀스 생성 (오늘 JST 기준 days 일치, 데이터 없는 날도 X축에 자리 차지)
  const dateSeq = useMemo(() => buildDateSequence(days), [days])

  // 데이터 매핑
  const byDate = new Map(points.map(p => [p.date, p]))
  const series = dateSeq.map(d => ({
    date: d,
    revenue: byDate.get(d)?.revenue_usd ?? null,
    impression: byDate.get(d)?.impression_count ?? null,
  }))

  const revenueValues = series.map(s => Number(s.revenue ?? 0))
  const impressionValues = series.map(s => Number(s.impression ?? 0))
  const revMax = Math.max(0.0001, ...revenueValues)
  const impMax = Math.max(1, ...impressionValues)

  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B
  const xScale = (i) => PAD_L + (i / Math.max(1, series.length - 1)) * innerW
  const yScaleRev = (v) => PAD_T + innerH - (v / revMax) * innerH
  const yScaleImp = (v) => PAD_T + innerH - (v / impMax) * innerH

  const revPath = series
    .map((s, i) => s.revenue == null ? null : `${xScale(i)},${yScaleRev(Number(s.revenue))}`)
    .filter(Boolean)
  const impPath = series
    .map((s, i) => s.impression == null ? null : `${xScale(i)},${yScaleImp(Number(s.impression))}`)
    .filter(Boolean)

  // y축 tick (3개씩)
  const revTicks = [revMax, revMax / 2, 0]
  const impTicks = [impMax, impMax / 2, 0]

  // x축 라벨 (3~5개)
  const labelCount = Math.min(5, series.length)
  const labelIdx = labelCount === 1
    ? [0]
    : Array.from({ length: labelCount }, (_, i) => Math.round(i * (series.length - 1) / (labelCount - 1)))

  const [hoverIdx, setHoverIdx] = useState(null)

  function handleMove(e) {
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const xRatio = (e.clientX - rect.left) / rect.width
    const xPx = xRatio * W
    if (xPx < PAD_L || xPx > W - PAD_R) { setHoverIdx(null); return }
    const ratio = (xPx - PAD_L) / innerW
    const idx = Math.round(ratio * (series.length - 1))
    setHoverIdx(Math.max(0, Math.min(series.length - 1, idx)))
  }

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ minWidth: 480 }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* y축 grid */}
        {revTicks.map((v, i) => (
          <line
            key={`g-${i}`}
            x1={PAD_L} x2={W - PAD_R}
            y1={yScaleRev(v)} y2={yScaleRev(v)}
            stroke="#f3f4f6" strokeWidth="1"
          />
        ))}

        {/* y축 좌 (revenue) 라벨 */}
        {revTicks.map((v, i) => (
          <text
            key={`yl-${i}`}
            x={PAD_L - 6} y={yScaleRev(v) + 4}
            fontSize="10" fill="#3b82f6" textAnchor="end"
          >${v.toFixed(2)}</text>
        ))}

        {/* y축 우 (impression) 라벨 */}
        {impTicks.map((v, i) => (
          <text
            key={`yr-${i}`}
            x={W - PAD_R + 6} y={yScaleImp(v) + 4}
            fontSize="10" fill="#9ca3af" textAnchor="start"
          >{Math.round(v).toLocaleString()}</text>
        ))}

        {/* x축 라벨 */}
        {labelIdx.map(i => (
          <text
            key={`xl-${i}`}
            x={xScale(i)} y={H - 10}
            fontSize="10" fill="#9ca3af" textAnchor="middle"
          >
            {formatJstMonthDay(series[i].date + 'T00:00:00+09:00')}
          </text>
        ))}

        {/* impression 라인 (회색) */}
        {impPath.length > 1 && (
          <polyline
            fill="none"
            stroke="#9ca3af"
            strokeWidth="1.5"
            points={impPath.join(' ')}
          />
        )}

        {/* revenue 라인 (파랑) */}
        {revPath.length > 1 && (
          <polyline
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
            points={revPath.join(' ')}
          />
        )}

        {/* 점 */}
        {series.map((s, i) => (
          <g key={`pt-${i}`}>
            {s.impression != null && (
              <circle cx={xScale(i)} cy={yScaleImp(Number(s.impression))} r="2.5" fill="#9ca3af" />
            )}
            {s.revenue != null && (
              <circle cx={xScale(i)} cy={yScaleRev(Number(s.revenue))} r="3" fill="#3b82f6" stroke="white" strokeWidth="1.5" />
            )}
          </g>
        ))}

        {/* hover 가이드 + 툴팁 */}
        {hoverIdx != null && (() => {
          const s = series[hoverIdx]
          const x = xScale(hoverIdx)
          const tipW = 170, tipH = 64
          const tipX = Math.min(W - PAD_R - tipW, Math.max(PAD_L, x - tipW / 2))
          const tipY = PAD_T
          return (
            <g>
              <line x1={x} x2={x} y1={PAD_T} y2={H - PAD_B} stroke="#d1d5db" strokeDasharray="3 3" />
              <rect x={tipX} y={tipY} width={tipW} height={tipH} rx="4" fill="white" stroke="#e5e7eb" />
              <text x={tipX + 8} y={tipY + 16} fontSize="11" fill="#374151" fontWeight="600">
                {formatJstDate(s.date + 'T00:00:00+09:00')}
              </text>
              <text x={tipX + 8} y={tipY + 34} fontSize="11" fill="#3b82f6">
                수익: {s.revenue != null ? formatUsd(s.revenue) : '—'}
              </text>
              <text x={tipX + 8} y={tipY + 50} fontSize="11" fill="#6b7280">
                노출: {s.impression != null ? formatInt(s.impression) : '—'}
              </text>
            </g>
          )
        })()}
      </svg>
    </div>
  )
}

// JST 기준 오늘 포함 days 일 ('YYYY-MM-DD')
function buildDateSequence(days) {
  const out = []
  const fmt = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  })
  // 'YYYY/MM/DD' → 'YYYY-MM-DD'
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000)
    out.push(fmt.format(d).replace(/\//g, '-'))
  }
  return out
}
