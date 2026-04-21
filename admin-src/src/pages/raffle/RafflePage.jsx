import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const MANUAL_DRAW_THRESHOLD = 1_000_000

const statusBadge = (s) => {
  if (s === 'active')    return <span className="badge-green">진행중</span>
  if (s === 'drawing')   return <span className="badge-blue">추첨중</span>
  if (s === 'completed') return <span className="badge-gray">완료</span>
  if (s === 'cancelled') return <span className="badge-red">취소</span>
  return <span className="badge-gray">{s}</span>
}

const fmtPrize = (v) =>
  v >= 10000 ? `${(v / 10000).toLocaleString()}만P` : `${v?.toLocaleString()}P`

export default function RafflePage() {
  const qc = useQueryClient()
  const [selectedItemId, setSelectedItemId] = useState(null)
  const [selectedRound, setSelectedRound]   = useState(null)

  // 상품 목록 (탭용)
  const { data: items } = useQuery({
    queryKey: ['raffle-items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('raffle_items')
        .select('id, title_ja, prize_value, entry_cost_energy, max_entries_per_user, total_prize_count, is_active')
        .order('prize_value', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  // 첫 상품 자동 선택
  useEffect(() => {
    if (items?.length && !selectedItemId) {
      setSelectedItemId(items[0].id)
    }
  }, [items, selectedItemId])

  // 탭 전환 시 라운드 선택 초기화
  const handleTabChange = (itemId) => {
    setSelectedItemId(itemId)
    setSelectedRound(null)
  }

  // 선택 상품의 라운드 목록
  const { data: rounds } = useQuery({
    queryKey: ['raffle-rounds', selectedItemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('raffle_rounds')
        .select('id, round_no, status, target_entries, current_entries, winner_count, drawn_at, created_at')
        .eq('raffle_item_id', selectedItemId)
        .order('round_no', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!selectedItemId,
  })

  // 선택 라운드의 응모자
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

  // 선택 라운드의 당첨자
  const { data: winners } = useQuery({
    queryKey: ['raffle-winners', selectedRound?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('raffle_winners')
        .select('user_id, prize_delivered, delivery_method, winner_review, review_approved, created_at, profiles!user_id(nickname)')
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

  const [drawResult, setDrawResult] = useState(null)
  const [drawError, setDrawError]   = useState('')

  const drawRound = useMutation({
    mutationFn: async (roundId) => {
      const { data, error } = await supabase.rpc('admin_draw_raffle_round', { p_round_id: roundId })
      if (error) throw new Error(error.message)
      return data?.[0]
    },
    onSuccess: (result) => {
      setDrawResult(result)
      setDrawError('')
      qc.invalidateQueries(['raffle-rounds', selectedItemId])
      qc.invalidateQueries(['raffle-winners', selectedRound?.id])
    },
    onError: (err) => {
      setDrawError(err.message)
    },
  })

  const handleDraw = () => {
    if (!selectedRound) return
    const ok = window.confirm(
      `⚠️ 추첨을 실행합니다.\n\n회차: #${selectedRound.round_no}\n응모자: ${entries?.length ?? 0}명\n\n한 번 실행하면 되돌릴 수 없습니다. 진행하시겠습니까?`
    )
    if (!ok) return
    setDrawResult(null)
    setDrawError('')
    drawRound.mutate(selectedRound.id)
  }

  const totalTickets = entries?.reduce((s, e) => s + (e.entry_count ?? 0), 0) ?? 0
  const uniqueUsers  = entries?.length ?? 0
  const selectedItem = items?.find(i => i.id === selectedItemId)
  const isManualItem = (selectedItem?.prize_value ?? 0) >= MANUAL_DRAW_THRESHOLD

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">응모·추첨 관리</h1>
        <p className="text-gray-500 text-sm mt-1">
          {isManualItem
            ? '100만P 라운드는 어드민이 직접 추첨을 실행합니다'
            : '목표 응모 수 달성 시 자동 추첨됩니다'}
        </p>
      </div>

      {/* 상품 탭 */}
      <div className="flex gap-1 border-b border-gray-200">
        {(items ?? []).map(item => (
          <button
            key={item.id}
            onClick={() => handleTabChange(item.id)}
            className={`px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
              selectedItemId === item.id
                ? 'border-brand text-brand'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {item.title_ja}
            {!item.is_active && <span className="ml-1 text-xs text-gray-400">(비활성)</span>}
          </button>
        ))}
      </div>

      {/* 탭 내용: 라운드 목록(좌) + 상세 패널(우) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-[600px]">

        {/* ── 라운드 목록 ── */}
        <div className="lg:col-span-1 space-y-2">
          <div className="flex items-center justify-between px-1 mb-2">
            <h2 className="font-semibold text-gray-700 text-sm">
              회차 목록
              {rounds && <span className="ml-1 text-gray-400 font-normal">({rounds.length}건)</span>}
            </h2>
            {selectedItem && (
              <span className="text-xs text-gray-400">
                응모비 {selectedItem.entry_cost_energy}E · 최대 {selectedItem.max_entries_per_user}회
              </span>
            )}
          </div>

          <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
            {(rounds ?? []).map(r => {
              const progress = r.target_entries > 0
                ? Math.round((r.current_entries / r.target_entries) * 100)
                : 0
              const isSelected = selectedRound?.id === r.id
              return (
                <button
                  key={r.id}
                  onClick={() => setSelectedRound(r)}
                  className={`w-full text-left p-4 rounded-xl border transition-all ${
                    isSelected
                      ? 'border-brand bg-orange-50 shadow-sm'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold text-sm">회차 #{r.round_no}</span>
                    {statusBadge(r.status)}
                  </div>
                  <div className="text-xs text-gray-500 mb-2">
                    응모 {r.current_entries?.toLocaleString()} / {r.target_entries?.toLocaleString()}명
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        r.status === 'active' ? 'bg-brand' : 'bg-gray-400'
                      }`}
                      style={{ width: `${Math.min(100, progress)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-gray-400">{progress}% 달성</span>
                    {r.drawn_at && (
                      <span className="text-xs text-gray-400">
                        {new Date(r.drawn_at).toLocaleDateString('ko-KR')}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
            {rounds?.length === 0 && (
              <div className="text-center text-gray-400 text-sm py-12 bg-gray-50 rounded-xl">
                회차 없음
              </div>
            )}
          </div>
        </div>

        {/* ── 상세 패널 ── */}
        <div className="lg:col-span-2 space-y-4">
          {!selectedRound ? (
            <div className="h-full flex items-center justify-center bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 min-h-[400px]">
              <div className="text-center text-gray-400">
                <div className="text-4xl mb-3">←</div>
                <p className="text-sm">회차를 선택하면<br/>상세 정보가 여기에 표시됩니다</p>
              </div>
            </div>
          ) : (
            <>
              {/* 라운드 요약 카드 */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900">
                    {selectedItem?.title_ja} — 회차 #{selectedRound.round_no}
                  </h3>
                  {statusBadge(selectedRound.status)}
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xl font-bold text-gray-900">{uniqueUsers.toLocaleString()}</div>
                    <div className="text-xs text-gray-500 mt-0.5">응모 유저</div>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-3">
                    <div className="text-xl font-bold text-brand">{totalTickets.toLocaleString()}</div>
                    <div className="text-xs text-gray-500 mt-0.5">총 티켓 수</div>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3">
                    <div className="text-xl font-bold text-blue-700">{selectedRound.winner_count ?? 1}</div>
                    <div className="text-xs text-gray-500 mt-0.5">당첨자 수</div>
                  </div>
                </div>
                {selectedRound.status === 'active' && !isManualItem && (
                  <div className="mt-3 p-3 bg-yellow-50 rounded-lg text-xs text-yellow-700">
                    ℹ️ 목표 응모 수({selectedRound.target_entries?.toLocaleString()}명) 달성 시 자동 추첨됩니다
                  </div>
                )}

                {/* 수동 추첨 영역 (100만P 전용) */}
                {isManualItem && selectedRound.status === 'active' && (
                  <div className="mt-3 p-4 bg-purple-50 rounded-lg border border-purple-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-purple-800">수동 추첨 실행</p>
                        <p className="text-xs text-purple-600 mt-0.5">
                          현재 응모자 {uniqueUsers}명 · 티켓 {totalTickets.toLocaleString()}장
                        </p>
                      </div>
                      <button
                        onClick={handleDraw}
                        disabled={drawRound.isPending || uniqueUsers === 0}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
                      >
                        {drawRound.isPending ? '추첨 중...' : '🎯 추첨 실행'}
                      </button>
                    </div>
                    {uniqueUsers === 0 && (
                      <p className="text-xs text-purple-500">응모자가 없어 추첨을 실행할 수 없습니다</p>
                    )}
                  </div>
                )}

                {/* 추첨 결과 표시 */}
                {drawResult && (
                  <div className="mt-3 p-4 bg-green-50 rounded-lg border border-green-300">
                    <p className="text-sm font-semibold text-green-800 mb-1">🎉 추첨 완료!</p>
                    <p className="text-sm text-green-700">
                      당첨자: <strong>{drawResult.nickname}</strong> — {drawResult.prize_value?.toLocaleString()} P 지급
                    </p>
                    <p className="text-xs text-green-600 mt-1">{drawResult.message}</p>
                  </div>
                )}
                {drawError && (
                  <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-200">
                    <p className="text-xs text-red-700">오류: {drawError}</p>
                  </div>
                )}
              </div>

              {/* 당첨자 관리 */}
              {(winners ?? []).length > 0 && (
                <div className="card">
                  <h3 className="font-semibold text-gray-900 mb-3">🏆 당첨자 ({winners.length}명)</h3>
                  <div className="space-y-3">
                    {winners.map(w => (
                      <div key={w.user_id} className="border border-gray-100 rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <Link to={`/admin/users/${w.user_id}`} className="font-medium text-brand hover:underline">
                            {w.profiles?.nickname ?? '알 수 없음'}
                          </Link>
                          {w.prize_delivered
                            ? <span className="badge-green">포인트 지급완료</span>
                            : <button onClick={() => markDelivered.mutate(w.user_id)}
                                className="btn-primary text-xs py-1">지급 완료 처리</button>}
                        </div>

                        {w.winner_review ? (
                          <div className="bg-gray-50 rounded-lg p-3">
                            <div className="text-xs text-gray-500 mb-1">당첨 후기</div>
                            <p className="text-sm text-gray-700">"{w.winner_review}"</p>
                            <div className="flex items-center gap-2 mt-2">
                              {w.review_approved === true  && <span className="badge-green">후기 승인됨</span>}
                              {w.review_approved === false && <span className="badge-red">후기 거절됨</span>}
                              {w.review_approved === null  && <span className="badge-yellow">검토 필요</span>}
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
                          지급방식: {w.delivery_method ?? '—'} · 당첨일: {new Date(w.created_at).toLocaleDateString('ko-KR')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 응모자 목록 */}
              <div className="card">
                <h3 className="font-semibold text-gray-900 mb-3">
                  응모자 ({uniqueUsers}명 / 티켓 {totalTickets.toLocaleString()}장)
                </h3>
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white border-b border-gray-100">
                      <tr className="text-xs text-gray-500">
                        <th className="text-left pb-2">닉네임</th>
                        <th className="text-right pb-2">티켓</th>
                        <th className="text-right pb-2">소비 E</th>
                        <th className="text-right pb-2">광고</th>
                        <th className="text-right pb-2">천장</th>
                        <th className="text-right pb-2">응모일</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {(entries ?? []).map(e => (
                        <tr key={e.user_id} className="hover:bg-gray-50">
                          <td className="py-2">
                            <Link to={`/admin/users/${e.user_id}`} className="text-brand hover:underline text-xs">
                              {e.profiles?.nickname ?? '알 수 없음'}
                            </Link>
                          </td>
                          <td className="py-2 text-right font-medium">{e.entry_count?.toLocaleString()}</td>
                          <td className="py-2 text-right text-gray-500">{e.energy_spent?.toLocaleString()}</td>
                          <td className="py-2 text-right">{e.ad_watched ? '✅' : '—'}</td>
                          <td className="py-2 text-right">{e.is_ceiling_win ? '🏆' : '—'}</td>
                          <td className="py-2 text-right text-gray-400 text-xs">
                            {new Date(e.created_at).toLocaleDateString('ko-KR')}
                          </td>
                        </tr>
                      ))}
                      {entries?.length === 0 && (
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
