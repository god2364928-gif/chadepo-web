import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const statusBadge = (s) => {
  if (s === 'active')    return <span className="badge-green">진행중</span>
  if (s === 'drawing')   return <span className="badge-blue">추첨중</span>
  if (s === 'completed') return <span className="badge-gray">완료</span>
  if (s === 'cancelled') return <span className="badge-red">취소</span>
  return <span className="badge-gray">{s}</span>
}

export default function RafflePage() {
  const qc = useQueryClient()
  const [selectedRound, setSelectedRound] = useState(null)

  const { data: rounds } = useQuery({
    queryKey: ['raffle-rounds'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('raffle_rounds')
        .select('*, raffle_items!raffle_item_id(title_ja, prize_value, entry_cost_energy, max_entries_per_user, total_prize_count)')
        .order('status')
        .order('created_at', { ascending: false })
        .limit(30)
      if (error) throw error
      return data ?? []
    },
  })

  const { data: entries } = useQuery({
    queryKey: ['raffle-entries', selectedRound?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('raffle_entries')
        .select('user_id, entry_count, energy_spent, ad_watched, is_ceiling_win, created_at, profiles!user_id(nickname)')
        .eq('round_id', selectedRound.id)
        .order('entry_count', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!selectedRound,
  })

  const { data: winners } = useQuery({
    queryKey: ['raffle-winners', selectedRound?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('raffle_winners')
        .select('user_id, prize_delivered, delivery_method, delivery_ref, winner_review, review_approved, notified_at, created_at, profiles!user_id(nickname)')
        .eq('round_id', selectedRound.id)
      if (error) throw error
      return data ?? []
    },
    enabled: !!selectedRound,
  })

  const approveReview = useMutation({
    mutationFn: async ({ userId, approved }) => {
      const { error } = await supabase
        .from('raffle_winners')
        .update({ review_approved: approved })
        .eq('round_id', selectedRound.id)
        .eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries(['raffle-winners', selectedRound?.id]),
  })

  const markDelivered = useMutation({
    mutationFn: async (userId) => {
      const { error } = await supabase
        .from('raffle_winners')
        .update({ prize_delivered: true })
        .eq('round_id', selectedRound.id)
        .eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries(['raffle-winners', selectedRound?.id]),
  })

  const totalTickets = entries?.reduce((sum, e) => sum + (e.entry_count ?? 0), 0) ?? 0
  const uniqueUsers  = entries?.length ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">응모·추첨 관리</h1>
        <p className="text-gray-500 text-sm mt-1">라운드 목표 응모수 달성 시 자동 추첨됩니다</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 라운드 목록 */}
        <div className="lg:col-span-1 space-y-2">
          <h2 className="font-semibold text-gray-700 text-sm px-1">라운드 목록</h2>
          {(rounds ?? []).map(r => {
            const item = r.raffle_items
            const progress = r.target_entries > 0
              ? Math.round((r.current_entries / r.target_entries) * 100)
              : 0
            return (
              <button
                key={r.id}
                onClick={() => setSelectedRound(r)}
                className={`w-full text-left p-4 rounded-xl border transition-all ${
                  selectedRound?.id === r.id
                    ? 'border-brand bg-orange-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm">{item?.title_ja}</span>
                  {statusBadge(r.status)}
                </div>
                <div className="text-xs text-gray-500 mb-2">
                  회차 #{r.round_no} · 응모 {r.current_entries?.toLocaleString()}/{r.target_entries?.toLocaleString()}명
                  {r.winner_count > 1 && ` · ${r.winner_count}명 당첨`}
                </div>
                {/* 진행률 바 */}
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full ${r.status === 'active' ? 'bg-brand' : 'bg-gray-400'}`}
                    style={{ width: `${Math.min(100, progress)}%` }}
                  />
                </div>
                <div className="text-xs text-gray-400 mt-1">{progress}% 달성</div>
                {r.drawn_at && (
                  <div className="text-xs text-gray-400 mt-0.5">
                    추첨: {new Date(r.drawn_at).toLocaleDateString('ko-KR')}
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* 라운드 상세 */}
        <div className="lg:col-span-2 space-y-4">
          {!selectedRound ? (
            <div className="card text-center text-gray-400 py-16">라운드를 선택하세요</div>
          ) : (
            <>
              {/* 라운드 요약 */}
              <div className="card">
                <h3 className="font-semibold text-gray-900 mb-3">
                  {selectedRound.raffle_items?.title_ja} — 회차 #{selectedRound.round_no}
                </h3>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xl font-bold text-gray-900">{uniqueUsers.toLocaleString()}</div>
                    <div className="text-xs text-gray-500 mt-0.5">응모 유저</div>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-3">
                    <div className="text-xl font-bold text-brand">{totalTickets.toLocaleString()}</div>
                    <div className="text-xs text-gray-500 mt-0.5">총 티켓 수</div>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3">
                    <div className="text-xl font-bold text-blue-700">{selectedRound.winner_count}</div>
                    <div className="text-xs text-gray-500 mt-0.5">당첨자 수</div>
                  </div>
                </div>
                {selectedRound.status === 'active' && (
                  <div className="mt-3 p-3 bg-yellow-50 rounded-lg text-xs text-yellow-700">
                    ℹ️ 추첨은 목표 응모 수({selectedRound.target_entries?.toLocaleString()}명) 달성 시 자동으로 진행됩니다
                  </div>
                )}
              </div>

              {/* 당첨자 관리 */}
              {(winners ?? []).length > 0 && (
                <div className="card">
                  <h3 className="font-semibold text-gray-900 mb-3">
                    🏆 당첨자 ({winners.length}명)
                  </h3>
                  <div className="space-y-3">
                    {winners.map(w => (
                      <div key={w.user_id} className="border border-gray-100 rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <Link to={`/admin/users/${w.user_id}`} className="font-medium text-brand hover:underline">
                            {w.profiles?.nickname ?? '알 수 없음'}
                          </Link>
                          <div className="flex items-center gap-2">
                            {w.prize_delivered
                              ? <span className="badge-green">포인트 지급완료</span>
                              : <button onClick={() => markDelivered.mutate(w.user_id)}
                                  className="btn-primary text-xs py-1">지급 완료 처리</button>}
                          </div>
                        </div>

                        {/* 당첨 후기 */}
                        {w.winner_review ? (
                          <div className="bg-gray-50 rounded-lg p-3">
                            <div className="text-xs text-gray-500 mb-1">당첨 후기</div>
                            <p className="text-sm text-gray-700">"{w.winner_review}"</p>
                            <div className="flex items-center gap-2 mt-2">
                              {w.review_approved === true && <span className="badge-green">후기 승인됨</span>}
                              {w.review_approved === false && <span className="badge-red">후기 거절됨</span>}
                              {w.review_approved === null && <span className="badge-yellow">검토 필요</span>}
                              {w.review_approved !== true && (
                                <button onClick={() => approveReview.mutate({ userId: w.user_id, approved: true })}
                                  className="text-xs text-green-600 hover:underline">승인</button>
                              )}
                              {w.review_approved !== false && (
                                <button onClick={() => approveReview.mutate({ userId: w.user_id, approved: false })}
                                  className="text-xs text-red-600 hover:underline">거절</button>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-400">후기 미작성</div>
                        )}

                        <div className="text-xs text-gray-400">
                          지급방식: {w.delivery_method ?? '—'} · 
                          당첨일: {new Date(w.created_at).toLocaleDateString('ko-KR')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 응모자 목록 */}
              <div className="card">
                <h3 className="font-semibold text-gray-900 mb-3">
                  응모자 ({uniqueUsers}명 / 티켓 총 {totalTickets.toLocaleString()}장)
                </h3>
                <div className="overflow-x-auto max-h-72 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="text-xs text-gray-500 border-b border-gray-100">
                        <th className="text-left pb-2">닉네임</th>
                        <th className="text-right pb-2">티켓</th>
                        <th className="text-right pb-2">소비 에너지</th>
                        <th className="text-right pb-2">광고 시청</th>
                        <th className="text-right pb-2">천장당첨</th>
                        <th className="text-right pb-2">응모일</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {(entries ?? []).map((e, i) => (
                        <tr key={e.user_id} className="hover:bg-gray-50">
                          <td className="py-2">
                            <Link to={`/admin/users/${e.user_id}`} className="text-brand hover:underline text-xs">
                              {e.profiles?.nickname ?? '알 수 없음'}
                            </Link>
                          </td>
                          <td className="py-2 text-right font-medium">{e.entry_count?.toLocaleString()}</td>
                          <td className="py-2 text-right text-gray-500">{e.energy_spent?.toLocaleString()} E</td>
                          <td className="py-2 text-right">{e.ad_watched ? '✅' : '—'}</td>
                          <td className="py-2 text-right">{e.is_ceiling_win ? '🏆' : '—'}</td>
                          <td className="py-2 text-right text-gray-400 text-xs">
                            {new Date(e.created_at).toLocaleDateString('ko-KR')}
                          </td>
                        </tr>
                      ))}
                      {(entries ?? []).length === 0 && (
                        <tr><td colSpan={6} className="py-6 text-center text-gray-400 text-xs">응모자 없음</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
