import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { GAME_TYPE_LABELS, GAME_TIER, TIER_META, PUZZLE_GAME_TYPES } from '../../lib/gameLabels'
import { useLanguage } from '../../contexts/LanguageContext'

// ─── 상수 ─────────────────────────────────────────────────────────────────
const REACTION_TREND_DAYS = 30
const REACTION_LOW_SAMPLE = 10 // 이 미만이면 회색 처리

// ─── 유틸 ─────────────────────────────────────────────────────────────────
function fmtMs(ms, labels) {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  const sec = ms / 1000
  if (sec < 60) return `${sec.toFixed(1)}${labels.sec}`
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}${labels.min} ${s}${labels.sec}`
}

function fmtPct(pct) {
  if (pct == null) return '—'
  return `${Number(pct).toFixed(0)}%`
}

function rateColor(pct) {
  if (pct == null) return 'text-gray-400'
  const v = Number(pct)
  if (v === 0) return 'text-red-600 font-bold'
  if (v < 30) return 'text-orange-500 font-medium'
  if (v < 70) return 'text-yellow-600'
  return 'text-green-600'
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────
export default function GameTimeStats() {
  const { t } = useLanguage()
  const msLabels = { sec: t('common.secondsShort'), min: t('common.minutesShort') }
  const PERIODS = [
    { id: '1d', label: t('common.today') },
    { id: '7d', label: t('missions.gameTime.period.7d') },
    { id: '30d', label: t('missions.gameTime.period.30d') },
  ]
  const [period, setPeriod] = useState('7d')
  const [appVersion, setAppVersion] = useState('') // '' = 전체

  // 통계 (섹션 1+2)
  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
  } = useQuery({
    queryKey: ['game-time-stats', period, appVersion],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_game_play_stats', {
        p_period: period,
        p_app_version: appVersion || null,
      })
      if (error) throw error
      return data ?? []
    },
    staleTime: 60_000,
  })

  // 경고 배너
  const { data: alerts } = useQuery({
    queryKey: ['game-alerts'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_alerts', {})
      if (error) throw error
      return data ?? []
    },
    staleTime: 60_000,
  })

  // 반응속도 추세 (섹션 3)
  const { data: reactionTrend } = useQuery({
    queryKey: ['reaction-trend', REACTION_TREND_DAYS],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_reaction_speed_trend', {
        p_days: REACTION_TREND_DAYS,
      })
      if (error) throw error
      return data ?? []
    },
    staleTime: 60_000,
  })

  // 앱 버전 옵션 — 통계 결과로부터 추출 (없으면 빈 배열).
  // 진짜 앱 버전 목록은 game_plays.app_version 에서 직접 distinct 가 정확하지만
  // 별도 RPC 추가는 오버엔지니어링이라 화면 안에선 stats 행에 등장하는 버전만 필터.
  // (현 상태: 앱 버전 RPC 미구현. UI 만 노출하고 1개 옵션만.)
  // → 이번 PR 에서는 「전체」만 노출. 데이터 모이면 별도 PR 에서 옵션화.

  if (statsError) {
    return <div className="card text-red-600 text-sm">{t('missions.gameTime.statsFetchFail')}: {statsError.message}</div>
  }

  // 섹션 1+2 기본 합계
  const totalAttempts = (stats ?? []).reduce((s, r) => s + Number(r.attempt_count), 0)
  const totalCompletes = (stats ?? []).reduce((s, r) => s + Number(r.completed_count), 0)
  const overallRate =
    totalAttempts > 0 ? Math.round((totalCompletes / totalAttempts) * 1000) / 10 : null
  const totalAbuses = (stats ?? []).reduce((s, r) => s + Number(r.abuse_count ?? 0), 0)

  // 섹션 2: 퍼즐 게임만 필터 + measured_count 0 인 행 제외
  const puzzleRows = (stats ?? []).filter(
    (r) => PUZZLE_GAME_TYPES.has(r.game_type) && Number(r.measured_count ?? 0) > 0
  )

  // 섹션 2 Y축 스케일: 모든 퍼즐 게임의 max(p75) 기준
  const distMaxMs = Math.max(
    1000,
    ...puzzleRows.map((r) => Number(r.p75_clear_ms ?? r.median_clear_ms ?? 0))
  )

  return (
    <div className="space-y-6">
      {/* 필터 행 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{t('missions.gameTime.period')}</span>
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                period === p.id
                  ? 'bg-brand text-white border-brand font-medium'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{t('missions.gameTime.appVersion')}</span>
          <select
            value={appVersion}
            onChange={(e) => setAppVersion(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30"
          >
            <option value="">{t('common.all')}</option>
            {/* TODO(future): distinct app_version RPC 추가 후 옵션 자동 생성 */}
          </select>
        </div>
      </div>

      {/* 경고 배너 */}
      {(alerts ?? []).length > 0 && (
        <div className="space-y-2">
          {(alerts ?? []).map((a, i) => (
            <AlertBanner key={i} alert={a} />
          ))}
        </div>
      )}

      {statsLoading ? (
        <div className="py-12 text-center text-gray-400">{t('common.loading')}</div>
      ) : (
        <>
          {/* 요약 카드 3개 */}
          <div className="grid grid-cols-3 gap-4">
            <div className="card text-center">
              <p className="text-sm text-gray-500 mb-1">{t('missions.gameTime.totalPlays')}</p>
              <p className="text-3xl font-bold text-gray-900">{totalAttempts.toLocaleString()}{t('common.casesUnit')}</p>
            </div>
            <div className="card text-center">
              <p className="text-sm text-gray-500 mb-1">{t('missions.gameTime.overallRate')}</p>
              <p className={`text-3xl font-bold ${rateColor(overallRate)}`}>
                {overallRate != null ? `${overallRate}%` : '—'}
              </p>
            </div>
            <div className="card text-center">
              <p className="text-sm text-gray-500 mb-1">{t('missions.gameTime.abuseSuspicion')}</p>
              <p
                className={`text-3xl font-bold ${
                  totalAbuses === 0 ? 'text-green-600' : 'text-orange-500'
                }`}
              >
                {totalAbuses.toLocaleString()}{t('common.casesUnit')}
              </p>
            </div>
          </div>

          {/* 섹션 1+2: 통계 테이블 */}
          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 text-sm">{t('missions.gameTime.tableTitle')}</h2>
              <span className="text-xs text-gray-400">
                {PERIODS.find((p) => p.id === period)?.label} {t('missions.gameTime.basedOn')}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                  <tr>
                    <th className="text-left  px-4 py-3 font-medium">{t('missions.gameTime.col.game')}</th>
                    <th className="text-right px-4 py-3 font-medium">{t('missions.gameTime.col.attempts')}</th>
                    <th className="text-right px-4 py-3 font-medium">{t('missions.gameTime.col.completed')}</th>
                    <th className="text-right px-4 py-3 font-medium">{t('missions.gameTime.col.completionRate')}</th>
                    <th className="text-right px-4 py-3 font-medium">{t('missions.gameTime.col.avgTime')}</th>
                    <th className="text-right px-4 py-3 font-medium">{t('missions.gameTime.col.median')}</th>
                    <th className="text-right px-4 py-3 font-medium">{t('missions.gameTime.col.measured')}</th>
                    <th className="text-right px-4 py-3 font-medium">{t('missions.gameTime.col.abuse')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(stats ?? []).map((r) => {
                    const tier = GAME_TIER[r.game_type]
                    const tm = TIER_META[tier]
                    const isReaction = r.game_type === 'reaction_speed'
                    const avg = isReaction ? r.avg_score_ms : r.avg_clear_ms
                    const med = isReaction ? r.median_score_ms : r.median_clear_ms
                    const measured = isReaction ? r.measured_score_count : r.measured_count
                    return (
                      <tr key={`${r.game_type}-${r.difficulty}`} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            {tm && (
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${tm.cls}`}
                              >
                                {tm.label}
                              </span>
                            )}
                            <span className="text-xs text-gray-700">
                              {GAME_TYPE_LABELS[r.game_type] ?? r.game_type}
                            </span>
                            {r.difficulty && (
                              <span className="text-[10px] text-gray-400 bg-gray-100 px-1 rounded">
                                {r.difficulty}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium">
                          {Number(r.attempt_count).toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-500">
                          {Number(r.completed_count).toLocaleString()}
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right text-xs ${rateColor(r.completion_rate)}`}
                        >
                          {fmtPct(r.completion_rate)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs text-gray-700">
                          {fmtMs(avg, msLabels)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs text-gray-500">
                          {fmtMs(med, msLabels)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs text-gray-400">
                          {Number(measured ?? 0).toLocaleString()}
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right text-xs ${
                            Number(r.abuse_count) > 0
                              ? 'text-orange-500 font-medium'
                              : 'text-gray-300'
                          }`}
                        >
                          {Number(r.abuse_count) > 0 ? `${r.abuse_count}${t('common.casesUnit')}` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                  {(stats ?? []).length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-xs">
                        {t('missions.gameTime.noData')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 섹션 2: 퍼즐 게임 시간 분포 */}
          {puzzleRows.length > 0 && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900 text-sm">{t('missions.gameTime.puzzleDistribution')}</h2>
                <span className="text-xs text-gray-400">{t('missions.gameTime.distLegend')}</span>
              </div>
              <div className="space-y-3">
                {puzzleRows.map((r) => (
                  <DistributionRow
                    key={`${r.game_type}-${r.difficulty}`}
                    row={r}
                    maxMs={distMaxMs}
                    t={t}
                    msLabels={msLabels}
                  />
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 text-[10px] text-gray-400">
                ※ {t('missions.gameTime.puzzleNote')}
              </div>
            </div>
          )}

          {/* 섹션 3: 반응속도 추세 */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900 text-sm">{t('missions.gameTime.reactionTrendTitle')}</h2>
              <span className="text-xs text-gray-400">
                ● {t('missions.gameTime.reactionEnough')} ({REACTION_LOW_SAMPLE}{t('common.casesUnit')}↑) ・ ● {t('missions.gameTime.reactionLow')}
              </span>
            </div>
            <ReactionTrendChart points={reactionTrend ?? []} t={t} />
          </div>
        </>
      )}
    </div>
  )
}

// ─── 경고 배너 컴포넌트 ─────────────────────────────────────────────────
function AlertBanner({ alert }) {
  const isDanger = alert.severity === 'danger'
  const bg = isDanger ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'
  const text = isDanger ? 'text-red-700' : 'text-yellow-700'
  const icon = alert.alert_type === 'low_completion' ? '⚠️' : '🚨'
  return (
    <div className={`border rounded-lg px-4 py-3 flex items-center gap-3 ${bg}`}>
      <span className="text-lg shrink-0">{icon}</span>
      <span className={`text-sm font-medium ${text}`}>{alert.detail}</span>
    </div>
  )
}

// ─── 분포 막대 (P25 ─ median ─ P75) ─────────────────────────────────────
function DistributionRow({ row, maxMs, t, msLabels }) {
  const tier = GAME_TIER[row.game_type]
  const tm = TIER_META[tier]
  const p25 = Number(row.p25_clear_ms ?? row.median_clear_ms ?? 0)
  const p50 = Number(row.median_clear_ms ?? 0)
  const p75 = Number(row.p75_clear_ms ?? row.median_clear_ms ?? 0)
  const avg = Number(row.avg_clear_ms ?? p50)

  const left = `${(p25 / maxMs) * 100}%`
  const width = `${Math.max(0.5, ((p75 - p25) / maxMs) * 100)}%`
  const medLeft = `${(p50 / maxMs) * 100}%`
  const avgLeft = `${(avg / maxMs) * 100}%`

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5 text-xs">
        {tm && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${tm.cls}`}>
            {tm.label}
          </span>
        )}
        <span className="text-gray-700 flex-1">
          {GAME_TYPE_LABELS[row.game_type] ?? row.game_type}
          {row.difficulty && (
            <span className="ml-1 text-[10px] text-gray-400 bg-gray-100 px-1 rounded">
              {row.difficulty}
            </span>
          )}
        </span>
        <span className="text-gray-400 text-[10px]">
          P25 {fmtMs(p25, msLabels)} · 中 {fmtMs(p50, msLabels)} · P75 {fmtMs(p75, msLabels)} · 平均 {fmtMs(avg, msLabels)}
        </span>
      </div>
      {/* 막대 */}
      <div className="relative h-3 bg-gray-100 rounded-full overflow-visible">
        {/* P25 ─ P75 박스 */}
        <div className="absolute h-3 bg-brand/30 rounded-full" style={{ left, width }} />
        {/* 중앙값 (●) */}
        <div
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-brand border-2 border-white shadow"
          style={{ left: medLeft }}
          title={`${t('missions.gameTime.median')} ${fmtMs(p50, msLabels)}`}
        />
        {/* 평균 (▼) */}
        <div
          className="absolute -top-1 -translate-x-1/2 text-[10px] text-gray-500"
          style={{ left: avgLeft }}
          title={`${t('missions.gameTime.average')} ${fmtMs(avg, msLabels)}`}
        >
          ▼
        </div>
      </div>
    </div>
  )
}

// ─── 반응속도 30일 추세선 (SVG) ─────────────────────────────────────────
function ReactionTrendChart({ points, t }) {
  const W = 720,
    H = 180,
    PAD_L = 40,
    PAD_R = 12,
    PAD_T = 16,
    PAD_B = 28

  if (!points.length) {
    return (
      <div className="py-12 text-center text-gray-400 text-sm">{t('missions.gameTime.reactionNoData')}</div>
    )
  }

  // x: 30일 인덱스 / y: avg_score_ms
  const validPts = points.filter((p) => p.avg_score_ms != null)
  const yMin = validPts.length > 0 ? Math.min(...validPts.map((p) => p.avg_score_ms)) : 0
  const yMax = validPts.length > 0 ? Math.max(...validPts.map((p) => p.avg_score_ms)) : 1000
  const yRange = Math.max(50, yMax - yMin)
  const yPad = yRange * 0.15

  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B

  const xScale = (i) => PAD_L + (i / Math.max(1, points.length - 1)) * innerW
  const yScale = (v) => PAD_T + innerH - ((v - (yMin - yPad)) / (yRange + yPad * 2)) * innerH

  const linePath = points
    .map((p, i) => {
      if (p.avg_score_ms == null) return null
      const x = xScale(i)
      const y = yScale(p.avg_score_ms)
      return `${x},${y}`
    })
    .filter(Boolean)

  // y축 기준선 (최소·중간·최대)
  const yTicks = [yMin - yPad, (yMin + yMax) / 2, yMax + yPad]

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 480 }}>
        {/* y축 grid */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={yScale(v)}
              y2={yScale(v)}
              stroke="#f3f4f6"
              strokeWidth="1"
            />
            <text x={PAD_L - 6} y={yScale(v) + 4} fontSize="10" fill="#9ca3af" textAnchor="end">
              {Math.round(v)}ms
            </text>
          </g>
        ))}

        {/* x축 라벨 (시작·중간·끝 3개) */}
        {[0, Math.floor(points.length / 2), points.length - 1].map((i) => {
          const p = points[i]
          if (!p) return null
          return (
            <text key={i} x={xScale(i)} y={H - 8} fontSize="10" fill="#9ca3af" textAnchor="middle">
              {p.stat_date?.slice(5)} {/* MM-DD */}
            </text>
          )
        })}

        {/* 추세선 */}
        {linePath.length > 1 && (
          <polyline fill="none" stroke="#e8531e" strokeWidth="1.5" points={linePath.join(' ')} />
        )}

        {/* 점 */}
        {points.map((p, i) => {
          if (p.avg_score_ms == null) return null
          const isLow = Number(p.sample_count) < REACTION_LOW_SAMPLE
          return (
            <g key={i}>
              <circle
                cx={xScale(i)}
                cy={yScale(p.avg_score_ms)}
                r="3.5"
                fill={isLow ? '#d1d5db' : '#e8531e'}
                stroke="white"
                strokeWidth="1.5"
              >
                <title>
                  {p.stat_date} · {t('missions.gameTime.average')} {p.avg_score_ms}ms · {t('missions.gameTime.sample')} {p.sample_count}{t('common.casesUnit')}
                  {isLow ? ` (${t('missions.gameTime.reactionLow')})` : ''}
                </title>
              </circle>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
