import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

export default function RafflePage() {
  const qc = useQueryClient()
  const [selectedRound, setSelectedRound] = useState(null)
  const [confirmDraw, setConfirmDraw]     = useState(false)

  const { data: rounds } = useQuery({
    queryKey: ['raffle-rounds'],
    queryFn: async () => {
      const { data } = await supabase
        .from('raffle_rounds')
        .select('*, raffle_items(title_ja, entry_cost_energy)')
        .order('created_at', { ascending: false })
        .limit(30)
      return data ?? []
    },
  })

  const { data: entries } = useQuery({
    queryKey: ['raffle-entries', selectedRound?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('raffle_entries')
        .select('*, profiles(nickname)')
        .eq('round_id', selectedRound.id)
        .order('created_at', { ascending: false })
      return data ?? []
    },
    enabled: !!selectedRound,
  })

  const { data: winners } = useQuery({
    queryKey: ['raffle-winners', selectedRound?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('raffle_winners')
        .select('*, profiles(nickname)')
        .eq('round_id', selectedRound.id)
      return data ?? []
    },
    enabled: !!selectedRound,
  })

  const draw = useMutation({
    mutationFn: async (roundId) => {
      const { error } = await supabase.rpc('manual_draw_raffle_round', { p_round_id: roundId })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries(['raffle-rounds'])
      qc.invalidateQueries(['raffle-winners', selectedRound?.id])
      setConfirmDraw(false)
    },
  })

  const markDelivered = useMutation({
    mutationFn: async ({ roundId, userId }) => {
      const { error } = await supabase
        .from('raffle_winners')
        .update({ prize_delivered: true })
        .eq('round_id', roundId)
        .eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries(['raffle-winners', selectedRound?.id]),
  })

  const statusBadge = (s) => {
    if (s === 'active')    return <span className="badge-green">진행중</span>
    if (s === 'drawing')   return <span className="badge-blue">추첨중</span>
    if (s === 'completed') return <span className="badge-blue">추첨완료</span>
    if (s === 'cancelled') return <span className="badge-gray">취소</span>
    return <span className="badge-gray">{s}</span>
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">응모·추첨 관리</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 라운드 목록 */}
        <div className="lg:col-span-1 space-y-3">
          <h2 className="font-semibold text-gray-700 text-sm">라운드 목록</h2>
          {(rounds ?? []).map(r => (
            <button
              key={r.id}
              onClick={() => setSelectedRound(r)}
              className={`w-full text-left p-4 rounded-xl border transition-all ${
                selectedRound?.id === r.id ? 'border-brand bg-orange-50' : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-sm">{r.raffle_items?.title_ja}</span>
                {statusBadge(r.status)}
              </div>
              <div className="text-xs text-gray-400">
                회차 #{r.round_no} · 응모 {r.current_entries ?? 0}/{r.target_entries}명
              </div>
              {r.drawn_at && (
                <div className="text-xs text-gray-400 mt-0.5">
                  추첨: {new Date(r.drawn_at).toLocaleDateString('ko-KR')}
                </div>
              )}
            </button>
          ))}
        </div>

        {/* 라운드 상세 */}
        <div className="lg:col-span-2 space-y-4">
          {!selectedRound ? (
            <div className="card text-center text-gray-400 py-16">라운드를 선택하세요</div>
          ) : (
            <>
              {/* 수동 추첨 */}
              {selectedRound.status === 'active' && (
                <div className="card border-brand border">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-gray-900">수동 추첨</div>
                      <div className="text-sm text-gray-500 mt-0.5">
                        현재 응모자: {selectedRound.current_entries ?? 0}명
                      </div>
                    </div>
                    {confirmDraw ? (
                      <div className="flex gap-2">
                        <button onClick={() => setConfirmDraw(false)} className="btn-secondary text-xs">취소</button>
                        <button
                          onClick={() => draw.mutate(selectedRound.id)}
                          className="btn-danger text-xs"
                          disabled={draw.isPending}
                        >
                          {draw.isPending ? '추첨 중...' : '확인 (실행)'}
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDraw(true)} className="btn-primary text-sm">추첨 실행</button>
                    )}
                  </div>
                  {draw.isError && <p className="text-red-600 text-sm mt-2">{draw.error?.message}</p>}
                </div>
              )}

              {/* 당첨자 목록 */}
              {(winners ?? []).length > 0 && (
                <div className="card">
                  <h3 className="font-semibold text-gray-900 mb-3">당첨자 ({winners.length}명)</h3>
                  <div className="space-y-2">
                    {winners.map(w => (
                      <div key={w.user_id} className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg border border-yellow-100">
                        <span className="font-medium text-sm">{w.profiles?.nickname}</span>
                        <div className="flex items-center gap-2">
                          {w.prize_delivered
                            ? <span className="badge-green">지급완료</span>
                            : <button
                                onClick={() => markDelivered.mutate({ roundId: selectedRound.id, userId: w.user_id })}
                                className="btn-primary text-xs py-1"
                              >지급완료 처리</button>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 응모자 목록 */}
              <div className="card">
                <h3 className="font-semibold text-gray-900 mb-3">응모자 전체 ({(entries ?? []).length}명)</h3>
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {(entries ?? []).map((e, i) => (
                    <div key={e.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0 text-sm">
                      <span className="text-gray-500 text-xs w-6">{i + 1}</span>
                      <span className="flex-1">{e.profiles?.nickname}</span>
                      <span className="text-gray-400 text-xs">{new Date(e.created_at).toLocaleString('ko-KR')}</span>
                    </div>
                  ))}
                  {(entries ?? []).length === 0 && <div className="text-gray-400 text-sm text-center py-4">응모자 없음</div>}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
