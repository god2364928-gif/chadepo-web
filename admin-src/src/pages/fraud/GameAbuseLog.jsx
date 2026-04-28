import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { GAME_TYPE_LABELS } from '../../lib/gameLabels'

const LIMITS = [50, 100, 200, 500]

function fmtDateTime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtMs(ms) {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}초`
}

export default function GameAbuseLog() {
  const [gameFilter, setGameFilter] = useState('')
  const [limit, setLimit] = useState(100)

  const {
    data: logs,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['abuse-log', gameFilter, limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_abuse_log', {
        p_game_type: gameFilter || null,
        p_limit: limit,
      })
      if (error) throw error
      return data ?? []
    },
    staleTime: 30_000,
  })

  if (error) {
    return (
      <div className="card text-red-600 text-sm">어뷰징 로그 불러오기 실패: {error.message}</div>
    )
  }

  // 어뷰징 발생한 게임 종류만 셀렉트 옵션으로
  const distinctGames = Array.from(new Set((logs ?? []).map((r) => r.game_type))).sort()

  return (
    <div className="space-y-4">
      {/* 필터 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">게임 종류</span>
          <select
            value={gameFilter}
            onChange={(e) => setGameFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30"
          >
            <option value="">전체</option>
            {distinctGames.map((g) => (
              <option key={g} value={g}>
                {GAME_TYPE_LABELS[g] ?? g}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">표시 건수</span>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30"
          >
            {LIMITS.map((n) => (
              <option key={n} value={n}>
                {n}건
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="card py-12 text-center text-gray-400 text-sm">불러오는 중...</div>
      ) : (logs ?? []).length === 0 ? (
        <div className="card py-12 text-center text-gray-400 text-sm">어뷰징 의심 사례 없음 ✅</div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-sm">
              어뷰징 의심 로그
              <span className="ml-2 text-xs text-gray-400 font-normal">
                총 {logs.length.toLocaleString()}건
              </span>
            </h2>
            <span className="text-[10px] text-gray-400">
              ※ 거절 없이 기록만 함. 누적 위반 많은 유저 우선 검토
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                <tr>
                  <th className="text-left  px-4 py-3 font-medium">시각</th>
                  <th className="text-left  px-4 py-3 font-medium">유저</th>
                  <th className="text-left  px-4 py-3 font-medium">게임</th>
                  <th className="text-right px-4 py-3 font-medium">기록 시간</th>
                  <th className="text-right px-4 py-3 font-medium">최소 허용</th>
                  <th className="text-right px-4 py-3 font-medium">누적 위반</th>
                  <th className="text-left  px-4 py-3 font-medium">앱 버전</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((r) => {
                  const isRepeat = Number(r.user_total_violations) >= 3
                  const isMultiGame = Number(r.user_distinct_games) >= 2
                  return (
                    <tr key={r.id} className={`hover:bg-gray-50 ${isRepeat ? 'bg-red-50/30' : ''}`}>
                      <td className="px-4 py-2.5 text-xs text-gray-500">
                        {fmtDateTime(r.created_at)}
                      </td>
                      <td className="px-4 py-2.5">
                        <Link
                          to={`/admin/users/${r.user_id}`}
                          className="text-brand hover:underline font-medium text-xs"
                        >
                          {r.nickname}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-700">
                        {GAME_TYPE_LABELS[r.game_type] ?? r.game_type}
                        {r.difficulty && (
                          <span className="ml-1 text-[10px] text-gray-400 bg-gray-100 px-1 rounded">
                            {r.difficulty}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-orange-500 font-medium">
                        {fmtMs(r.recorded_value)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-gray-400">
                        {fmtMs(r.expected_minimum)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs">
                        <span
                          className={
                            isRepeat
                              ? 'text-red-600 font-bold'
                              : Number(r.user_total_violations) > 1
                                ? 'text-orange-500 font-medium'
                                : 'text-gray-400'
                          }
                        >
                          {Number(r.user_total_violations)}회
                        </span>
                        {isMultiGame && (
                          <span className="ml-1 text-[10px] text-red-500 bg-red-100 px-1 rounded">
                            {r.user_distinct_games}게임
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400 font-mono">
                        {r.app_version ?? '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-gray-100 text-[10px] text-gray-400 flex gap-4">
            <span>● 누적 위반 3회 이상 행은 분홍색 배경</span>
            <span>● 「2게임 이상」 배지는 다양한 게임에서 반복 위반한 유저</span>
          </div>
        </div>
      )}
    </div>
  )
}
