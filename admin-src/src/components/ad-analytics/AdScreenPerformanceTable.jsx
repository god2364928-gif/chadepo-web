import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { formatInt, formatUsd, formatPct } from '../../utils/jstFormat'

const COLUMNS = [
  { id: 'screen_context', label: '화면', align: 'left', type: 'string' },
  { id: 'ad_format', label: '포맷', align: 'left', type: 'string' },
  { id: 'impressions', label: '노출', align: 'right', type: 'number' },
  { id: 'clicks', label: '클릭', align: 'right', type: 'number' },
  { id: 'revenue_usd', label: '수익', align: 'right', type: 'number' },
  { id: 'ecpm', label: 'eCPM', align: 'right', type: 'number' },
  { id: 'ctr', label: 'CTR', align: 'right', type: 'number' },
]

export default function AdScreenPerformanceTable({ period, adFormat, refreshKey }) {
  const [sortBy, setSortBy] = useState('revenue_usd')
  const [sortDir, setSortDir] = useState('desc')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['ad_screen_performance', period, adFormat, refreshKey],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_ad_screen_performance', {
        p_period: period,
        p_ad_format: adFormat || null,
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
      setSortDir(COLUMNS.find((c) => c.id === col)?.type === 'number' ? 'desc' : 'asc')
    }
  }

  function sortIcon(col) {
    if (sortBy !== col) return <span className="text-gray-300 ml-1">⇅</span>
    return <span className="text-brand ml-1">{sortDir === 'asc' ? '▲' : '▼'}</span>
  }

  return (
    <div className="card p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200">
        <h2 className="font-semibold text-gray-900 text-sm">화면별 성과</h2>
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
              {rows.map((r, i) => (
                <tr key={`${r.screen_context}-${r.ad_format}-${i}`} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-700">{r.screen_context}</td>
                  <td className="px-4 py-2.5 text-gray-500">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
                      {r.ad_format}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">{formatInt(r.impressions)}</td>
                  <td className="px-4 py-2.5 text-right text-gray-600">{formatInt(r.clicks)}</td>
                  <td className="px-4 py-2.5 text-right text-blue-600 font-medium">
                    {formatUsd(r.revenue_usd)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-700">{formatUsd(r.ecpm, 4)}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700">{formatPct(r.ctr)}</td>
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
