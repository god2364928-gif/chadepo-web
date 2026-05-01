import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { formatInt, formatUsd } from '../../utils/jstFormat'

const COLUMNS = [
  { id: 'rank', label: '#', align: 'right', type: 'number' },
  { id: 'nickname', label: '닉네임', align: 'left', type: 'string' },
  { id: 'total_impressions', label: '노출', align: 'right', type: 'number' },
  { id: 'total_rewarded', label: '리워드', align: 'right', type: 'number' },
  { id: 'total_revenue_usd', label: '수익', align: 'right', type: 'number' },
]

export default function AdHeavyUsersTable({ refreshKey }) {
  const [sortBy, setSortBy] = useState('rank')
  const [sortDir, setSortDir] = useState('asc')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['ad_heavy_users', 100, refreshKey],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_ad_heavy_users', {
        p_limit: 100,
      })
      if (error) throw error
      return data ?? []
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  const rows = useMemo(() => {
    if (!data) return []
    const sorted = [...data].sort((a, b) => {
      const av = a[sortBy],
        bv = b[sortBy]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      const col = COLUMNS.find((c) => c.id === sortBy)
      const cmp =
        col?.type === 'number'
          ? Number(av) - Number(bv)
          : String(av).localeCompare(String(bv), 'ja')
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [data, sortBy, sortDir])

  function toggleSort(col) {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(col)
      setSortDir(
        COLUMNS.find((c) => c.id === col)?.type === 'number' && col !== 'rank' ? 'desc' : 'asc'
      )
    }
  }

  function sortIcon(col) {
    if (sortBy !== col) return <span className="text-gray-300 ml-1">⇅</span>
    return <span className="text-brand ml-1">{sortDir === 'asc' ? '▲' : '▼'}</span>
  }

  return (
    <div className="card p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 text-sm">헤비 유저 Top 100</h2>
        <span className="text-xs text-gray-400">최근 30일 (JST) · 매일 03:30 갱신</span>
      </div>
      {error ? (
        <div className="px-4 py-6 text-center">
          <p className="text-red-700 text-sm mb-2">불러오기 실패: {error.message}</p>
          <button
            onClick={() => refetch()}
            className="text-xs px-3 py-1 bg-white border border-red-300 text-red-700 rounded hover:bg-red-50"
          >
            다시 시도
          </button>
        </div>
      ) : isLoading ? (
        <div className="py-12 text-center text-gray-400 text-sm">불러오는 중...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
              <tr>
                {COLUMNS.map((c) => (
                  <th
                    key={c.id}
                    onClick={() => toggleSort(c.id)}
                    className={`px-4 py-3 font-medium cursor-pointer select-none hover:bg-gray-100 ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                  >
                    {c.label}
                    {sortIcon(c.id)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.user_id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-right text-xs text-gray-400">{r.rank}</td>
                  <td className="px-4 py-2.5">
                    <Link
                      to={`/admin/users/${r.user_id}`}
                      className="text-brand hover:underline text-xs"
                    >
                      {r.nickname}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-right">{formatInt(r.total_impressions)}</td>
                  <td className="px-4 py-2.5 text-right text-purple-600">
                    {formatInt(r.total_rewarded)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-blue-600 font-medium">
                    {formatUsd(r.total_revenue_usd)}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={COLUMNS.length}
                    className="px-4 py-8 text-center text-gray-400 text-xs"
                  >
                    데이터가 없습니다
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
