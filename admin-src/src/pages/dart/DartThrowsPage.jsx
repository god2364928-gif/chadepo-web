import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

const LIMITS = [50, 100, 200]

const AREA_LABELS = {
  outer: 'outer',
  middle: 'middle',
  inner: 'inner',
  triple: 'triple',
  bullseye: 'bullseye',
  mega_jackpot: 'MEGA',
}

const AREA_COLORS = {
  outer: 'text-gray-500',
  middle: 'text-blue-600',
  inner: 'text-indigo-600',
  triple: 'text-purple-600',
  bullseye: 'text-orange-500 font-semibold',
  mega_jackpot: 'text-red-600 font-bold',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function fmtDateTime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function DartThrowsPage() {
  const [userInput, setUserInput] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [tier, setTier] = useState('')
  const [jackpotOnly, setJackpotOnly] = useState(false)
  const [limit, setLimit] = useState(100)

  const trimmedUser = userInput.trim()
  const isUuid = UUID_RE.test(trimmedUser)

  const queryArgs = {
    p_user_id: isUuid ? trimmedUser : null,
    p_nickname: !isUuid && trimmedUser ? trimmedUser : null,
    p_from: from || null,
    p_to: to || null,
    p_tier: tier ? Number(tier) : null,
    p_jackpot_only: jackpotOnly,
    p_limit: limit,
  }

  const {
    data: rows,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['dart-throws', queryArgs],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_dart_throws', queryArgs)
      if (error) throw error
      return data ?? []
    },
    staleTime: 30_000,
  })

  if (error) {
    return (
      <div className="card text-red-600 text-sm">
        ダーツ ログ 불러오기 실패: {error.message}
      </div>
    )
  }

  const jackpotCount = (rows ?? []).filter((r) => r.is_jackpot).length

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">🎯 ダーツチャレンジ</h1>
        <p className="text-xs text-gray-500 mt-1">
          1日2回 (ミッション 2개 후 1차 / 6개 후 2차) 챌린지의 throw 로그
        </p>
      </div>

      {/* 필터 */}
      <div className="card space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">유저 (nickname 또는 UUID)</label>
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="부분일치 검색"
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
            {trimmedUser && (
              <div className="text-[10px] text-gray-400 mt-1">
                {isUuid ? 'UUID 정확 일치' : 'nickname 부분일치'}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">from</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">to</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">tier</label>
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30"
            >
              <option value="">전체</option>
              <option value="1">1차 (ミッション 2개 후)</option>
              <option value="2">2차 (ミッション 6개 후)</option>
            </select>
          </div>
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                checked={jackpotOnly}
                onChange={(e) => setJackpotOnly(e.target.checked)}
                className="rounded"
              />
              잭팟만
            </label>
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">표시 건수</label>
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30"
              >
                {LIMITS.map((n) => (
                  <option key={n} value={n}>
                    {n}건
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* 결과 */}
      {isLoading ? (
        <div className="card py-12 text-center text-gray-400 text-sm">불러오는 중...</div>
      ) : (rows ?? []).length === 0 ? (
        <div className="card py-12 text-center text-gray-400 text-sm">조건에 해당하는 throw 가 없습니다</div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-sm">
              throw 로그
              <span className="ml-2 text-xs text-gray-400 font-normal">
                총 {rows.length.toLocaleString()}건
                {jackpotCount > 0 && (
                  <span className="ml-2 text-orange-500">
                    (잭팟 {jackpotCount}건)
                  </span>
                )}
              </span>
            </h2>
            <span className="text-[10px] text-gray-400">
              ※ 최신순. 결과 200건 상한 (페이지네이션 미구현)
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                <tr>
                  <th className="text-left  px-4 py-3 font-medium">시각</th>
                  <th className="text-left  px-4 py-3 font-medium">throw 날짜</th>
                  <th className="text-left  px-4 py-3 font-medium">유저</th>
                  <th className="text-center px-4 py-3 font-medium">tier</th>
                  <th className="text-left  px-4 py-3 font-medium">area</th>
                  <th className="text-right px-4 py-3 font-medium">획득 P</th>
                  <th className="text-center px-4 py-3 font-medium">잭팟</th>
                  <th className="text-right px-4 py-3 font-medium">리롤</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className={`hover:bg-gray-50 ${r.is_jackpot ? 'bg-orange-50/40' : ''}`}
                  >
                    <td className="px-4 py-2.5 text-xs text-gray-500">{fmtDateTime(r.created_at)}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{r.throw_date}</td>
                    <td className="px-4 py-2.5">
                      <Link
                        to={`/admin/users/${r.user_id}`}
                        className="text-brand hover:underline font-medium text-xs"
                      >
                        {r.nickname}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-center text-xs text-gray-700">
                      {r.challenge_tier === 1 ? '1차' : '2차'}
                    </td>
                    <td className={`px-4 py-2.5 text-xs ${AREA_COLORS[r.area] ?? 'text-gray-700'}`}>
                      {AREA_LABELS[r.area] ?? r.area}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs font-medium text-gray-800">
                      {Number(r.final_points).toLocaleString()}P
                      {r.base_points !== r.final_points && (
                        <span className="ml-1 text-[10px] text-gray-400">
                          (base {r.base_points})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center text-xs">
                      {r.is_jackpot ? (
                        <span className="text-red-600 font-bold">🎉</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-gray-500">
                      {r.reroll_count > 0 ? `${r.reroll_count}회` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-gray-100 text-[10px] text-gray-400 flex gap-4">
            <span>● 잭팟 행은 주황색 배경</span>
            <span>● area: outer / middle / inner / triple / bullseye / MEGA(=mega_jackpot)</span>
          </div>
        </div>
      )}
    </div>
  )
}
