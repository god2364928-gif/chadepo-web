import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const PAGE = 50

export default function UserList() {
  const [search, setSearch]   = useState('')
  const [filter, setFilter]   = useState('all')
  const [page, setPage]       = useState(0)

  const { data, isLoading } = useQuery({
    queryKey: ['users', search, filter, page],
    queryFn: async () => {
      let q = supabase
        .from('profiles')
        .select('id, nickname, points, energy, is_flagged, is_banned, created_at, last_seen_at, social_provider, referral_code', { count: 'exact' })
        .order('created_at', { ascending: false })
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">유저 관리</h1>
          <p className="text-gray-500 text-sm mt-1">전체 {total.toLocaleString()}명</p>
        </div>
      </div>

      {/* 검색·필터 */}
      <div className="flex gap-3 flex-wrap">
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
      </div>

      {/* 테이블 */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">닉네임</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">플랫폼</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">포인트</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">에너지</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">가입일</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">마지막 접속</th>
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
                          {u.nickname ?? '(없음)'}
                        </Link>
                        <div className="text-gray-400 text-xs">{u.referral_code}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="badge-gray">{u.social_provider ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{u.points?.toLocaleString()} P</td>
                      <td className="px-4 py-3 text-right">{u.energy?.toLocaleString()} E</td>
                      <td className="px-4 py-3 text-right text-gray-400">
                        {new Date(u.created_at).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-400">
                        {u.last_seen_at ? new Date(u.last_seen_at).toLocaleDateString('ko-KR') : '—'}
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
            {page * PAGE + 1}–{Math.min((page + 1) * PAGE, total)} / {total.toLocaleString()}명
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
