import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

// 100P (prize_value <= AUTO_DRAW_MAX_PRIZE) 만 자동 추첨, 그 외는 어드민 직접 지정
// 모든 추첨 상품(100P 포함)은 어드민 「당첨 지정」 후 사용자가 앱에서 「受け取る」 버튼을
// 직접 눌러야 포인트가 지급됨 (Phase 1A 셀프 클레임 플로우)
const AUTO_DRAW_MAX_PRIZE = 100

const statusBadge = (s) => {
  if (s === 'active') return <span className="badge-green">진행중</span>
  if (s === 'drawing') return <span className="badge-blue">추첨중</span>
  if (s === 'completed') return <span className="badge-gray">완료</span>
  if (s === 'cancelled') return <span className="badge-red">취소</span>
  return <span className="badge-gray">{s}</span>
}

const ENTRY_PAGE = 100

export default function RafflePage() {
  const qc = useQueryClient()
  const [selectedItemId, setSelectedItemId] = useState(null)
  const [selectedRound, setSelectedRound] = useState(null)
  const [entryPage, setEntryPage] = useState(0)

  // 상품 목록 (탭용)
  const { data: items } = useQuery({
    queryKey: ['raffle-items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('raffle_items')
        .select(
          'id, title_ja, prize_value, entry_cost_energy, max_entries_per_user, total_prize_count, is_active'
        )
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

  // 탭 전환 시 페이지만 초기화 (라운드는 자동 선택 effect 가 담당)
  const handleTabChange = (itemId) => {
    setSelectedItemId(itemId)
    setSelectedRound(null)
    setEntryPage(0)
  }

  const handleSelectRound = (r) => {
    setSelectedRound(r)
    setEntryPage(0)
  }

  // 선택 상품의 라운드 목록
  // staleTime:0 + refetchInterval:8000: drawing 라운드 전환 시 즉시 반영
  const { data: rounds, refetch: refetchRounds } = useQuery({
    queryKey: ['raffle-rounds', selectedItemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('raffle_rounds')
        .select(
          'id, round_no, status, target_entries, current_entries, winner_count, drawn_at, created_at'
        )
        .eq('raffle_item_id', selectedItemId)
        .order('round_no', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!selectedItemId,
    staleTime: 0,
    refetchInterval: 8000,
  })

  // 페이지 진입(또는 탭 전환) 시 최신 진행중 회차 자동 선택
  // 우선순위: 추첨중(drawing) > 진행중(active) > round_no 내림차순 첫 행
  useEffect(() => {
    if (!rounds || rounds.length === 0) return
    if (selectedRound && rounds.some((r) => r.id === selectedRound.id)) return
    const drawing = rounds.find((r) => r.status === 'drawing')
    const active = rounds.find((r) => r.status === 'active')
    const target = drawing ?? active ?? rounds[0]
    if (target) {
      setSelectedRound(target)
      setEntryPage(0)
    }
  }, [rounds, selectedRound])

  // rounds 가 갱신되면 선택된 round 의 최신 status 도 동기화
  useEffect(() => {
    if (!selectedRound || !rounds) return
    const fresh = rounds.find((r) => r.id === selectedRound.id)
    if (
      fresh &&
      (fresh.status !== selectedRound.status ||
        fresh.current_entries !== selectedRound.current_entries)
    ) {
      setSelectedRound(fresh)
    }
  }, [rounds, selectedRound])

  // 선택 라운드의 응모자 (1인 1행 합산, 페이지별)
  const { data: entriesResult } = useQuery({
    queryKey: ['raffle-entries-grouped', selectedRound?.id, entryPage],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_list_raffle_entries_grouped', {
        p_round_id: selectedRound.id,
        p_limit: ENTRY_PAGE,
        p_offset: entryPage * ENTRY_PAGE,
      })
      if (error) throw error
      const rows = data ?? []
      const total = rows.length > 0 ? Number(rows[0].total_users ?? 0) : 0
      return { rows, total }
    },
    enabled: !!selectedRound,
    keepPreviousData: true,
  })
  const entries = entriesResult?.rows ?? []
  const entriesTotal = entriesResult?.total ?? 0

  // 선택 라운드의 당첨자
  const { data: winners } = useQuery({
    queryKey: ['raffle-winners', selectedRound?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('raffle_winners')
        .select(
          'id, user_id, prize_delivered, delivery_method, winner_review, review_approved, claimed_at, created_at, profiles!user_id(nickname)'
        )
        .eq('round_id', selectedRound.id)
      if (error) throw error
      return data ?? []
    },
    enabled: !!selectedRound,
  })

  // 부적절한 코멘트 사후 숨김 (review_approved=false + winner_review=NULL)
  const hideComment = useMutation({
    mutationFn: async (winnerId) => {
      const { error } = await supabase.rpc('admin_hide_raffle_comment', {
        p_winner_id: winnerId,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries(['raffle-winners', selectedRound?.id]),
  })

  const [pickError, setPickError] = useState('')

  // 추첨 시작: active → drawing (응모 종료, 어드민이 직접 선택할 수 있는 단계로)
  const startDrawing = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('admin_start_raffle_drawing', {
        p_round_id: selectedRound.id,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      setPickError('')
      qc.invalidateQueries(['raffle-rounds', selectedItemId])
    },
    onError: (err) => setPickError(err.message),
  })

  const handleStartDrawing = () => {
    const ok = window.confirm(
      `⚠️ 추첨 단계로 전환합니다.\n\n` +
        `회차: #${selectedRound.round_no}\n` +
        `현재 응모자: ${entriesTotal.toLocaleString()}명 / 티켓 ${(selectedRound.current_entries ?? 0).toLocaleString()}장\n\n` +
        `이 시점부터 더 이상 응모를 받지 않습니다.\n` +
        `진행하시겠습니까?`
    )
    if (!ok) return
    setPickError('')
    startDrawing.mutate()
  }

  // 어드민 당첨자 지정 RPC.
  // - 모든 수동 추첨 상품(5천/1만/100万): prize_delivered=false / claimed_at=NULL 로 등록만
  // - 사용자가 앱 「ポイント履歴」 화면에서 직접 「受け取る」 클릭 → claim_raffle_prize RPC
  //   가 포인트 지급 + 코멘트 저장 + claimed_at 갱신을 수행
  // - 100P 회차는 자동 추첨이라 어드민 지정 불가 (RPC 가 거부)
  const pickWinner = useMutation({
    mutationFn: async ({ userId, nickname }) => {
      const { error } = await supabase.rpc('admin_pick_raffle_winner', {
        p_round_id: selectedRound.id,
        p_user_id: userId,
      })
      if (error) throw new Error(error.message)
      return nickname
    },
    onSuccess: () => {
      setPickError('')
      qc.invalidateQueries(['raffle-rounds', selectedItemId])
      qc.invalidateQueries(['raffle-winners', selectedRound?.id])
    },
    onError: (err) => setPickError(err.message),
  })

  const handlePickWinner = (userId, nickname) => {
    const prizeLabel = selectedItem?.title_ja ?? '상품'
    const ok = window.confirm(
      `⚠️ 당첨자로 지정합니다.\n\n` +
        `당첨자: ${nickname}\n` +
        `회차: #${selectedRound.round_no}\n` +
        `상품: ${prizeLabel}\n\n` +
        `※ 지정 후 사용자가 앱에서 「受け取る」 버튼을 직접 눌러야 포인트가 지급됩니다.\n` +
        `한 번 지정하면 되돌릴 수 없습니다. 진행하시겠습니까?`
    )
    if (!ok) return
    setPickError('')
    pickWinner.mutate({ userId, nickname })
  }

  const totalTickets = selectedRound?.current_entries ?? 0
  const targetEntries = selectedRound?.target_entries ?? 0
  const uniqueUsers = entriesTotal
  const selectedItem = items?.find((i) => i.id === selectedItemId)
  const prizeValue = selectedItem?.prize_value ?? 0
  // 100P 만 자동 추첨, 그 외(5천/1만/100万)는 어드민 직접 지정 + 「지급 완료 처리」 수동
  const isManualItem = prizeValue > AUTO_DRAW_MAX_PRIZE
  const targetReached = targetEntries > 0 && totalTickets >= targetEntries
  const canPickWinner = isManualItem && selectedRound?.status === 'drawing'
  // 통상은 응모 목표 도달 시 자동으로 drawing 으로 전환되므로
  // 「추첨 시작」 버튼은 거의 노출되지 않음 (자동 전환 실패 시 안전망).
  const canStartDraw = isManualItem && selectedRound?.status === 'active' && targetReached
  const showTargetWaiting = isManualItem && selectedRound?.status === 'active' && !targetReached

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">응모·추첨 관리</h1>
          <p className="text-gray-500 text-sm mt-1">
            {isManualItem
              ? '응모 목표 도달 시 자동으로 「추첨중」으로 전환됩니다. 어드민이 당첨자를 지정한 후, 사용자가 앱에서 「受け取る」 버튼을 누르면 포인트가 지급됩니다.'
              : '목표 응모 수 달성 시 자동 추첨됩니다. 사용자가 앱에서 「受け取る」 버튼을 누르면 포인트가 지급됩니다.'}
          </p>
        </div>
        <button
          onClick={() => refetchRounds()}
          className="shrink-0 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 whitespace-nowrap"
        >
          🔄 새로고침
        </button>
      </div>

      {/* 상품 탭 */}
      <div className="flex gap-1 border-b border-gray-200">
        {(items ?? []).map((item) => (
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
              {rounds && (
                <span className="ml-1 text-gray-400 font-normal">({rounds.length}건)</span>
              )}
            </h2>
            {selectedItem && (
              <span className="text-xs text-gray-400">
                응모비 {selectedItem.entry_cost_energy}E · 최대 {selectedItem.max_entries_per_user}
                회
              </span>
            )}
          </div>

          <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
            {(rounds ?? []).map((r) => {
              const progress =
                r.target_entries > 0 ? Math.round((r.current_entries / r.target_entries) * 100) : 0
              const isSelected = selectedRound?.id === r.id
              return (
                <button
                  key={r.id}
                  onClick={() => handleSelectRound(r)}
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
                    응모 {r.current_entries?.toLocaleString()} /{' '}
                    {r.target_entries?.toLocaleString()}명
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        r.status === 'active'
                          ? 'bg-brand'
                          : r.status === 'drawing'
                            ? 'bg-blue-500'
                            : 'bg-gray-400'
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
                <p className="text-sm">
                  회차를 선택하면
                  <br />
                  상세 정보가 여기에 표시됩니다
                </p>
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
                    <div className="text-xl font-bold text-gray-900">
                      {uniqueUsers.toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">응모 유저</div>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-3">
                    <div className="text-xl font-bold text-brand">
                      {totalTickets.toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">총 티켓 수</div>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3">
                    <div className="text-xl font-bold text-blue-700">
                      {selectedRound.winner_count ?? 1}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">당첨자 수</div>
                  </div>
                </div>

                {/* 자동 추첨 안내 */}
                {selectedRound.status === 'active' && !isManualItem && (
                  <div className="mt-3 p-3 bg-yellow-50 rounded-lg text-xs text-yellow-700">
                    ℹ️ 목표 응모 수({selectedRound.target_entries?.toLocaleString()}명) 달성 시 자동
                    추첨됩니다
                  </div>
                )}

                {/* 수동 추첨 상품: 응모 접수 중 (목표 미달) */}
                {showTargetWaiting && (
                  <div className="mt-3 p-4 bg-amber-50 rounded-lg border border-amber-200">
                    <p className="text-sm font-semibold text-amber-800">⏳ 응모 접수중</p>
                    <p className="text-xs text-amber-700 mt-1">
                      현재 티켓 {totalTickets.toLocaleString()}장 / 목표{' '}
                      {targetEntries.toLocaleString()}장 &nbsp;(
                      <span className="font-semibold">
                        {(targetEntries - totalTickets).toLocaleString()}장 남음
                      </span>
                      )
                    </p>
                    <p className="text-[11px] text-amber-600 mt-1.5">
                      목표 응모 수에 도달하면 자동으로 「추첨중」 단계로 넘어가고, 다음 회차가 즉시
                      새로 열립니다.
                    </p>
                  </div>
                )}

                {/* 안전망: 자동 전환되지 않은 경우(드뭄) 어드민이 수동 시작 */}
                {canStartDraw && (
                  <div className="mt-3 p-4 bg-purple-50 rounded-lg border border-purple-200">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-purple-800">
                          🎯 목표 응모 수 달성
                        </p>
                        <p className="text-xs text-purple-600 mt-0.5">
                          현재 {uniqueUsers.toLocaleString()}명 · 티켓{' '}
                          {totalTickets.toLocaleString()}장 (목표 {targetEntries.toLocaleString()}
                          장)
                        </p>
                        <p className="text-[11px] text-purple-500 mt-1">
                          통상은 자동 전환됩니다. 수동 시작 시 응모 접수가 종료되고 당첨자를 직접
                          선택하는 단계로 넘어갑니다.
                        </p>
                      </div>
                      <button
                        onClick={handleStartDrawing}
                        disabled={startDrawing.isPending}
                        className="shrink-0 px-4 py-2 text-sm font-semibold bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg whitespace-nowrap"
                      >
                        🎲 추첨 시작
                      </button>
                    </div>
                  </div>
                )}

                {/* 추첨중: 어드민이 당첨자 직접 선택 */}
                {canPickWinner && (
                  <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm font-semibold text-blue-800">
                      👇 아래 응모자 목록에서 당첨자를 직접 선택하세요
                    </p>
                    <p className="text-xs text-blue-600 mt-0.5">
                      응모자 {uniqueUsers.toLocaleString()}명 · 티켓 {totalTickets.toLocaleString()}
                      장 (응모는 마감되었습니다)
                    </p>
                    <p className="text-[11px] text-blue-500 mt-1">
                      ※ 지정 후 사용자가 앱에서 「受け取る」 버튼을 직접 눌러야 포인트가 지급됩니다.
                    </p>
                  </div>
                )}

                {/* 추첨 완료 안내 (수동 추첨 상품) */}
                {isManualItem && selectedRound.status === 'completed' && (
                  <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-sm font-semibold text-gray-700">✅ 추첨 완료</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      당첨자가 앱에서 「受け取る」 버튼을 누르면 포인트가 지급됩니다. 코멘트는
                      부적절 시 「숨김 처리」 가능합니다.
                    </p>
                  </div>
                )}

                {pickError && (
                  <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-200">
                    <p className="text-xs text-red-700">오류: {pickError}</p>
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
                    {winners.map((w) => (
                      <div
                        key={w.user_id}
                        className="border border-gray-100 rounded-lg p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <Link
                            to={`/admin/users/${w.user_id}`}
                            className="font-medium text-brand hover:underline"
                          >
                            {w.profiles?.nickname || `ユーザー${w.user_id?.slice(0, 4)}`}
                          </Link>
                          {w.claimed_at ? (
                            <span className="badge-green">
                              수령 완료 ({new Date(w.claimed_at).toLocaleDateString('ko-KR')})
                            </span>
                          ) : (
                            <span className="badge-yellow">수령 대기</span>
                          )}
                        </div>

                        {w.winner_review ? (
                          <div className="bg-gray-50 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                              <div className="text-xs text-gray-500">사용자 코멘트</div>
                              {w.review_approved ? (
                                <span className="badge-green">노출중</span>
                              ) : (
                                <span className="badge-gray">숨김</span>
                              )}
                            </div>
                            <p className="text-sm text-gray-700">"{w.winner_review}"</p>
                            {w.review_approved && (
                              <div className="flex items-center gap-2 mt-2">
                                <button
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        '이 코멘트를 숨김 처리하시겠습니까?\n(앱 내 当選内訳에서 사라집니다)'
                                      )
                                    ) {
                                      hideComment.mutate(w.id)
                                    }
                                  }}
                                  className="text-xs text-red-600 hover:underline"
                                  disabled={hideComment.isPending}
                                >
                                  🚫 숨김 처리
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-xs text-gray-400">
                            {w.claimed_at ? '코멘트 미작성' : '수령 전'}
                          </div>
                        )}

                        <div className="text-xs text-gray-400">
                          지급방식: {w.delivery_method ?? '—'} · 당첨일:{' '}
                          {new Date(w.created_at).toLocaleDateString('ko-KR')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 응모자 목록 (1인 1행 합산) */}
              <div className="card">
                <h3 className="font-semibold text-gray-900 mb-3">
                  응모자 ({uniqueUsers.toLocaleString()}명 / 티켓 {totalTickets.toLocaleString()}장)
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr className="text-xs text-gray-500">
                        <th className="text-left  pb-2 pt-2 px-1">닉네임</th>
                        <th className="text-right pb-2 pt-2 px-1">티켓</th>
                        <th className="text-right pb-2 pt-2 px-1">소비 E</th>
                        <th className="text-right pb-2 pt-2 px-1">최초 응모</th>
                        <th className="text-right pb-2 pt-2 px-1">최근 응모</th>
                        {canPickWinner && <th className="text-right pb-2 pt-2 px-1">선택</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {entries.map((e) => {
                        const ticketCount = Number(e.ticket_count ?? 0)
                        const nickname = e.nickname || `ユーザー${e.user_id?.slice(0, 4)}`
                        return (
                          <tr key={e.user_id} className="hover:bg-gray-50">
                            <td className="py-2 px-1">
                              <Link
                                to={`/admin/users/${e.user_id}`}
                                className="text-brand hover:underline text-xs"
                              >
                                {nickname}
                              </Link>
                            </td>
                            <td className="py-2 text-right font-medium px-1">
                              {ticketCount.toLocaleString()}
                            </td>
                            <td className="py-2 text-right text-gray-500 px-1">
                              {ticketCount.toLocaleString()}
                            </td>
                            <td className="py-2 text-right text-gray-400 text-xs px-1 whitespace-nowrap">
                              {e.first_entry_at
                                ? new Date(e.first_entry_at).toLocaleDateString('ko-KR')
                                : '—'}
                            </td>
                            <td className="py-2 text-right text-gray-400 text-xs px-1 whitespace-nowrap">
                              {e.last_entry_at
                                ? new Date(e.last_entry_at).toLocaleDateString('ko-KR')
                                : '—'}
                            </td>
                            {canPickWinner && (
                              <td className="py-2 text-right px-1">
                                <button
                                  onClick={() => handlePickWinner(e.user_id, nickname)}
                                  disabled={pickWinner.isPending}
                                  className="px-2 py-1 text-xs font-semibold bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg transition-colors whitespace-nowrap"
                                >
                                  🏆 당첨 지정
                                </button>
                              </td>
                            )}
                          </tr>
                        )
                      })}
                      {entries.length === 0 && (
                        <tr>
                          <td
                            colSpan={canPickWinner ? 6 : 5}
                            className="py-6 text-center text-gray-400 text-xs"
                          >
                            응모자 없음
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {entriesTotal > ENTRY_PAGE && (
                  <div className="flex items-center justify-between text-xs text-gray-500 mt-3 pt-3 border-t border-gray-100">
                    <button
                      onClick={() => setEntryPage((p) => Math.max(0, p - 1))}
                      disabled={entryPage === 0}
                      className="px-2 py-1 border rounded disabled:opacity-40 hover:bg-gray-50"
                    >
                      ← 이전
                    </button>
                    <span>
                      {entryPage + 1} / {Math.ceil(entriesTotal / ENTRY_PAGE)} 페이지
                    </span>
                    <button
                      onClick={() => setEntryPage((p) => p + 1)}
                      disabled={(entryPage + 1) * ENTRY_PAGE >= entriesTotal}
                      className="px-2 py-1 border rounded disabled:opacity-40 hover:bg-gray-50"
                    >
                      다음 →
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
