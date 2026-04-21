import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const PAGE = 50

const fmtDate = (ts) => {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

const SORT_COLS = {
  created_at:   { label: '가입일',     asc: false },
  points:       { label: '포인트',     asc: false },
  energy:       { label: '에너지',     asc: false },
  last_seen_at: { label: '마지막접속', asc: false },
}

export default function UserList() {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [page, setPage]     = useState(0)
  const [sortCol, setSortCol]   = useState('created_at')
  const [sortAsc, setSortAsc]   = useState(false)

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortAsc(a => !a)
    } else {
      setSortCol(col)
      setSortAsc(false)
    }
    setPage(0)
  }

  const { data, isLoading } = useQuery({
    queryKey: ['users', search, filter, page, sortCol, sortAsc],
    queryFn: async () => {
      let q = supabase
        .from('profiles')
        .select('id, nickname, points, energy, is_flagged, is_banned, created_at, last_seen_at, social_provider, referral_code', { count: 'exact' })
        .order(sortCol, { ascending: sortAsc })
        .range(page * PAGE, (page + 1) * PAGE - 1)

      if (search) q = q.ilike('nickname', `%${search}%`)
      if (filter === 'flagged') q = q.eq('is_flagged', true)
      if (filter === 'banned')  q = q.eq('is_banned', true)

      const { data, count, error } = await q
      if (error) throw error
      return { rows: data ?? [], total: count ?? 0 }
    },
    keepPreviousData: true,
  })

  const rows  = data?.rows ?? []
  const total = data?.total ?? 0

  const SortBtn = ({ col, label }) => {
    const active = sortCol === col
    return (
      <button
        onClick={() => handleSort(col)}
        className={`flex items-center gap-1 hover:text-gray-800 transition-colors ${active ? 'text-brand font-semibold' : 'text-gray-500 font-medium'}`}
      >
        {label}
        <span className="text-xs">{active ? (sortAsc ? '↑' : '↓') : '↕'}</span>
      </button>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">유저 관리</h1>
        <p className="text-gray-500 text-sm mt-1">전체 {total.toLocaleString()}명</p>
      </div>

      {/* 검색·필터 */}
      <div className="flex gap-3 flex-wrap items-center">
        <input
          className="input w-64"
          placeholder="닉네임 검색..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0) }}
        />
        <select
          className="input w-40"
          value={filter}
          onChange={e => { setFilter(e.target.value); setPage(0) }}
        >
          <option value="all">전체</option>
          <option value="flagged">의심 유저</option>
          <option value="banned">정지 계정</option>
        </select>
        <div className="flex gap-2 ml-auto text-xs text-gray-400 items-center">
          <span>정렬:</span>
          {Object.entries(SORT_COLS).map(([col, { label }]) => (
            <button
              key={col}
              onClick={() => handleSort(col)}
              className={`px-2 py-1 rounded border transition-colors ${
                sortCol === col
                  ? 'border-brand text-brand bg-orange-50'
                  : 'border-gray-200 text-gray-500 hover:border-gray-400'
              }`}
            >
              {label} {sortCol === col ? (sortAsc ? '↑' : '↓') : ''}
            </button>
          ))}
        </div>
      </div>

      {/* 테이블 */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">닉네임</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">가입방법</th>
                <th className="text-right px-4 py-3">
                  <SortBtn col="energy" label="에너지" />
                </th>
                <th className="text-right px-4 py-3">
                  <SortBtn col="points" label="포인트" />
                </th>
                <th className="text-right px-4 py-3">
                  <SortBtn col="created_at" label="가입일" />
                </th>
                <th className="text-right px-4 py-3">
                  <SortBtn col="last_seen_at" label="마지막접속" />
                </th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}><td colSpan={7} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td></tr>
                  ))
                : rows.map(u => (
                    <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <Link to={`/admin/users/${u.id}`} className="text-brand hover:underline font-medium">
                          {u.nickname || `ユーザー${u.id.slice(0, 4)}`}
                        </Link>
                        <div className="text-gray-400 text-xs">{u.referral_code}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="badge-gray">{u.social_provider ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-blue-600 font-medium">
                        {u.energy?.toLocaleString()} E
                      </td>
                      <td className="px-4 py-3 text-right text-brand font-medium">
                        {u.points?.toLocaleString()} P
                      </td>
                      <td className="px-4 py-3 text-right text-gray-400 text-xs whitespace-nowrap">
                        {fmtDate(u.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-400 text-xs whitespace-nowrap">
                        {fmtDate(u.last_seen_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {u.is_banned
                          ? <span className="badge-red">정지</span>
                          : u.is_flagged
                          ? <span className="badge-yellow">의심</span>
                          : <span className="badge-green">정상</span>}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
          <span className="text-sm text-gray-500">
            {total === 0 ? '0명' : `${page * PAGE + 1}–${Math.min((page + 1) * PAGE, total)} / ${total.toLocaleString()}명`}
          </span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="btn-secondary px-3 py-1 text-xs">이전</button>
            <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * PAGE >= total} className="btn-secondary px-3 py-1 text-xs">다음</button>
          </div>
        </div>
      </div>
    </div>
  )
}
