import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const REF_PAGE = 50

export default function ReferralPage() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(0)

  const handleFilter = (f) => {
    setFilter(f)
    setPage(0)
  }

  const { data: eventsResult } = useQuery({
    queryKey: ['referral-events', filter, page],
    queryFn: async () => {
      let q = supabase
        .from('referral_events')
        .select(
          'id, referrer_id, referee_id, status, ad_watch_count, referee_bonus_granted, referee_bonus_amount, referrer_bonus_granted, referrer_bonus_amount, created_at, referrer:profiles!referrer_id(nickname), referee:profiles!referee_id(nickname)',
          { count: 'exact' }
        )
        .order('created_at', { ascending: false })
        .range(page * REF_PAGE, (page + 1) * REF_PAGE - 1)
      if (filter !== 'all') q = q.eq('status', filter)
      const { data, count } = await q
      return { rows: data ?? [], total: count ?? 0 }
    },
    keepPreviousData: true,
  })

  const { data: summary } = useQuery({
    queryKey: ['referral-summary'],
    queryFn: async () => {
      const { data } = await supabase.from('referral_events').select('status')
      if (!data) return {}
      return data.reduce((acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1
        return acc
      }, {})
    },
  })

  const { data: bonusStats } = useQuery({
    queryKey: ['referral-bonus-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_referral_bonus_top', { p_limit: 20 })
      if (error) throw error
      return data ?? []
    },
  })

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }) => {
      const { error } = await supabase.from('referral_events').update({ status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries(['referral-events'])
      qc.invalidateQueries(['referral-summary'])
    },
  })

  const statusBadge = (s) => {
    if (s === 'rewarded') return <span className="badge-green">보상완료</span>
    if (s === 'pending') return <span className="badge-yellow">대기중</span>
    if (s === 'reward_available') return <span className="badge-yellow">받기대기</span>
    if (s === 'flagged') return <span className="badge-red">의심</span>
    if (s === 'expired') return <span className="badge-gray">만료</span>
    return <span className="badge-gray">{s}</span>
  }

  const events = eventsResult?.rows ?? []
  const total = eventsResult?.total ?? 0

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">추천 프로그램 관리</h1>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: '전체 초대',
            value:
              (summary?.rewarded ?? 0) +
              (summary?.pending ?? 0) +
              (summary?.reward_available ?? 0) +
              (summary?.flagged ?? 0) +
              (summary?.expired ?? 0),
            color: 'bg-white',
          },
          { label: '보상 완료', value: summary?.rewarded ?? 0, color: 'bg-green-50' },
          {
            label: '대기 중',
            value: (summary?.pending ?? 0) + (summary?.reward_available ?? 0),
            color: 'bg-yellow-50',
          },
          { label: '의심 건', value: summary?.flagged ?? 0, color: 'bg-red-50' },
        ].map(({ label, value, color }) => (
          <div key={label} className={`${color} rounded-xl border border-gray-200 p-4`}>
            <div className="text-2xl font-bold text-gray-900">{value}</div>
            <div className="text-sm text-gray-500 mt-1">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 초대 이벤트 목록 */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {[
              ['all', '전체'],
              ['pending', '대기중'],
              ['reward_available', '받기대기'],
              ['rewarded', '완료'],
              ['flagged', '의심'],
              ['expired', '만료'],
            ].map(([v, l]) => (
              <button
                key={v}
                onClick={() => handleFilter(v)}
                className={
                  filter === v
                    ? 'btn-primary text-xs py-1.5 px-3'
                    : 'btn-secondary text-xs py-1.5 px-3'
                }
              >
                {l}
              </button>
            ))}
            {total > 0 && (
              <span className="ml-auto text-xs text-gray-400">전체 {total.toLocaleString()}건</span>
            )}
          </div>
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">초대한 사람</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">초대받은 사람</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">광고</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">보상(초대자)</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">보상(신규)</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">날짜</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">상태</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">처리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {events.map((e) => (
                  <tr
                    key={e.id}
                    className={`hover:bg-gray-50 ${e.status === 'flagged' ? 'bg-red-50' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/users/${e.referrer_id}`}
                        className="text-brand hover:underline text-xs"
                      >
                        {e.referrer?.nickname || `ユーザー${e.referrer_id?.slice(0, 4)}`}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/users/${e.referee_id}`}
                        className="text-brand hover:underline text-xs"
                      >
                        {e.referee?.nickname || `ユーザー${e.referee_id?.slice(0, 4)}`}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-600">
                      {e.ad_watch_count ?? 0}회
                    </td>
                    <td className="px-4 py-3 text-right text-xs">
                      {e.referrer_bonus_granted ? (
                        <span className="text-green-600 font-medium">
                          +{e.referrer_bonus_amount ?? 0} P
                        </span>
                      ) : (
                        <span className="text-gray-400">미지급</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs">
                      {e.referee_bonus_granted ? (
                        <span className="text-green-600 font-medium">
                          +{e.referee_bonus_amount ?? 0} P
                        </span>
                      ) : (
                        <span className="text-gray-400">미지급</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400 text-xs whitespace-nowrap">
                      {new Date(e.created_at).toLocaleDateString('ko-KR')}
                    </td>
                    <td className="px-4 py-3 text-right">{statusBadge(e.status)}</td>
                    <td className="px-4 py-3 text-right">
                      {e.status === 'flagged' && (
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={() => updateStatus.mutate({ id: e.id, status: 'pending' })}
                            className="text-xs text-green-600 hover:underline"
                          >
                            무혐의
                          </button>
                          <button
                            onClick={() => updateStatus.mutate({ id: e.id, status: 'expired' })}
                            className="text-xs text-red-600 hover:underline"
                          >
                            거절
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {events.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                      내역 없음
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {total > REF_PAGE && (
            <div className="flex items-center justify-between text-sm text-gray-500">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                ← 이전
              </button>
              <span>
                {page + 1} / {Math.ceil(total / REF_PAGE)} 페이지
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={(page + 1) * REF_PAGE >= total}
                className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                다음 →
              </button>
            </div>
          )}
        </div>

        {/* 동반 에너지 적립 TOP */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">동반 에너지 적립 TOP 20</h2>
          <div className="space-y-2">
            {(bonusStats ?? []).map((b, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0"
              >
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 text-xs w-5">{i + 1}</span>
                  <span className="text-sm font-medium">{b.nickname || '—'}</span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-blue-600">
                    +{Number(b.total_energy).toLocaleString()} E
                  </div>
                  <div className="text-xs text-gray-400">{b.bonus_days}일치</div>
                </div>
              </div>
            ))}
            {(bonusStats ?? []).length === 0 && (
              <div className="text-gray-400 text-sm">데이터 없음</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
