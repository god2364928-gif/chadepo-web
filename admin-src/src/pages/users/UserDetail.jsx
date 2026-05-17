import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

// auth.users 의 OAuth 메타데이터를 사람이 읽기 좋게 정리해 보여주는 카드.
// admin_get_user_oauth_info RPC 의 응답 (jsonb) 을 그대로 받는다.
function SocialAccountCard({ info }) {
  if (!info) {
    return (
      <div className="card space-y-3">
        <h2 className="font-semibold text-gray-900">소셜 계정 정보</h2>
        <div className="text-gray-400 text-sm">読み込み中...</div>
      </div>
    )
  }

  const fmt = (ts) => (ts ? new Date(ts).toLocaleString('ko-KR') : '—')

  // 이메일 표시: dummy / Apple 비공개 / 일반 을 라벨로 분리
  const renderEmail = () => {
    if (!info.email) return <span className="text-gray-400">—</span>
    if (info.email_is_dummy) {
      return (
        <span className="text-gray-400">
          미공개 <span className="text-xs">(LINE 미동의)</span>
        </span>
      )
    }
    return (
      <span className="break-all">
        {info.email}
        {info.email_is_apple_relay && (
          <span className="ml-1 text-xs badge-gray align-middle">Apple 비공개</span>
        )}
      </span>
    )
  }

  const rows = [
    ['표시 이름', info.display_name ?? '—'],
    ['이메일', renderEmail()],
    ['이메일 인증', info.email_confirmed_at ? '✅ 인증됨' : '미인증'],
    ['플랫폼', info.provider ?? '—'],
    ['플랫폼 ID', info.provider_sub ?? '—'],
    ['OAuth 가입', fmt(info.created_at)],
    ['최근 로그인', fmt(info.last_sign_in_at)],
  ]

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-3">
        {info.avatar_url ? (
          <img
            src={info.avatar_url}
            alt=""
            className="w-10 h-10 rounded-full bg-gray-100 object-cover"
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-300 text-xs">
            no img
          </div>
        )}
        <h2 className="font-semibold text-gray-900">소셜 계정 정보</h2>
      </div>
      <dl className="space-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-gray-500 whitespace-nowrap">{k}</dt>
            <dd className="text-gray-900 font-medium text-right max-w-[180px] break-all">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function AdjustModal({ type, userId, onClose }) {
  const qc = useQueryClient()
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!note.trim()) {
      setMsg('사유를 입력해주세요.')
      return
    }
    setLoading(true)
    const fn = type === 'point' ? 'admin_adjust_points' : 'admin_adjust_energy'
    const { error } = await supabase.rpc(fn, {
      p_user_id: userId,
      p_amount: Number(amount),
      p_note: note,
    })
    setLoading(false)
    if (error) {
      setMsg('오류: ' + error.message)
      return
    }
    qc.invalidateQueries({ queryKey: ['user', userId] })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">
            {type === 'point' ? '포인트' : '에너지'} 수동 조정
          </h3>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              조정 금액 (음수 입력 시 차감)
            </label>
            <input
              type="number"
              className="input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="예: 1000 또는 -500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">사유 (필수)</label>
            <textarea
              className="input h-20 resize-none"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="예: 버그로 인한 누락 보상 지급"
              required
            />
          </div>
          {msg && <p className="text-red-600 text-sm">{msg}</p>}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="btn-secondary">
              취소
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? '처리 중...' : '적용'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// 의심/정지 토글 사유 입력 모달.
// admin_set_flag / admin_set_ban RPC 를 호출하고, RPC 내부에서 admin_audit_log 에
// 변경 전/후 값과 사유가 자동 기록된다. RLS 강화 (2026_04_28) 로 profiles.is_flagged
// / is_banned 직접 UPDATE 가 막혀 있어 반드시 이 RPC 경로를 사용해야 한다.
function ReasonModal({ modal, userId, onClose }) {
  const qc = useQueryClient()
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const { kind, nextValue } = modal
  const title =
    kind === 'flag'
      ? nextValue
        ? '의심 플래그 설정'
        : '의심 플래그 해제'
      : nextValue
        ? '계정 정지'
        : '계정 정지 해제'
  const desc =
    kind === 'flag'
      ? nextValue
        ? '부정이용 의심으로 표시합니다.'
        : '의심 플래그를 해제합니다.'
      : nextValue
        ? '앱 접근을 차단합니다.'
        : '정지를 해제하고 정상 상태로 복귀합니다.'
  const placeholder =
    kind === 'ban' && nextValue
      ? '예: 동일 IP 에서 5계정 연속 가입, 추천 보상 어뷰징 정황'
      : '운영자 메모용. admin_audit_log 에 기록됩니다.'

  async function handleSubmit(e) {
    e.preventDefault()
    if (!reason.trim()) {
      setMsg('사유를 입력해주세요.')
      return
    }
    setLoading(true)
    setMsg('')
    try {
      let error
      if (kind === 'flag') {
        ;({ error } = await supabase.rpc('admin_set_flag', {
          p_user_id: userId,
          p_value: nextValue,
          p_reason: reason,
        }))
      } else {
        // 정지 해제 시 banned_reason 은 null 로 클리어 (RPC 가 그대로 컬럼에 박음)
        ;({ error } = await supabase.rpc('admin_set_ban', {
          p_user_id: userId,
          p_value: nextValue,
          p_banned_reason: nextValue ? reason : null,
          p_reason: reason,
        }))
      }
      if (error) {
        setMsg('오류: ' + error.message)
        return
      }
      // 상세 + 리스트/부정탐지 화면 캐시도 같이 무효화 (queryKey prefix match).
      // React Query v5: 객체 형태 filter 가 표준. 첫 인자 array 형태는 v4 호환 사라짐.
      qc.invalidateQueries({ queryKey: ['user', userId] })
      qc.invalidateQueries({ queryKey: ['users'] })
      qc.invalidateQueries({ queryKey: ['flagged-users'] })
      onClose()
    } catch (e) {
      // 네트워크/세션 예외 — Supabase RPC 가 throw 한 경우
      setMsg('오류: ' + (e?.message ?? String(e)))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-500 mt-1">{desc}</p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">사유 (필수)</label>
            <textarea
              className="input h-20 resize-none"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={placeholder}
              required
            />
          </div>
          {msg && <p className="text-red-600 text-sm">{msg}</p>}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
              disabled={loading}
            >
              취소
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? '처리 중...' : '적용'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function UserDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [modal, setModal] = useState(null)
  // 의심/정지 토글용 사유 입력 모달 상태. { kind: 'flag'|'ban', nextValue: boolean }
  const [reasonModal, setReasonModal] = useState(null)
  const [activeTab, setActiveTab] = useState('points')

  const { data: user, isLoading } = useQuery({
    queryKey: ['user', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', id).single()
      if (error) throw error
      return data
    },
  })

  // OAuth 가입 정보 (auth.users 영역). admin_get_user_oauth_info RPC 가
  // is_admin() 가드 + SECURITY DEFINER 로 안전하게 노출한다.
  const { data: oauthInfo } = useQuery({
    queryKey: ['user-oauth-info', id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_user_oauth_info', {
        p_user_id: id,
      })
      if (error) throw error
      return data
    },
  })

  const { data: pointLogs } = useQuery({
    queryKey: ['point-logs', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('point_logs')
        .select('*')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(50)
      return data ?? []
    },
    enabled: activeTab === 'points',
  })

  const { data: energyLogs } = useQuery({
    queryKey: ['energy-logs', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('energy_logs')
        .select('*')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(50)
      return data ?? []
    },
    enabled: activeTab === 'energy',
  })

  const { data: exchangeLogs } = useQuery({
    queryKey: ['exchange-logs', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('exchange_requests')
        .select('*, exchange_items(title_ja)')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(30)
      return data ?? []
    },
    enabled: activeTab === 'exchange',
  })

  const { data: referralData } = useQuery({
    queryKey: ['referral-data', id],
    queryFn: async () => {
      const [referred, referrals] = await Promise.all([
        supabase
          .from('referral_events')
          .select('*, profiles!referrer_id(nickname)')
          .eq('referee_id', id)
          .maybeSingle(),
        supabase
          .from('referral_events')
          .select('*, profiles!referee_id(nickname)')
          .eq('referrer_id', id)
          .order('created_at', { ascending: false })
          .limit(20),
      ])
      return { referred: referred.data, referrals: referrals.data ?? [] }
    },
    enabled: activeTab === 'referral',
  })

  // 응모(=raffle_entries) 직접 select 는 RLS 정책이 정의돼 있지 않아 차단될 수 있다.
  // 당첨(raffle_winners) 은 admin_all_raffle_winners 정책으로 admin direct SELECT 허용.
  // round/item 메타는 PostgREST FK 임베드가 보장되지 않아 두 단계 쿼리로 매핑한다.
  const { data: raffleData } = useQuery({
    queryKey: ['raffle-history', id],
    queryFn: async () => {
      const { data: winners, error } = await supabase
        .from('raffle_winners')
        .select(
          'id, round_id, prize_delivered, delivery_method, claimed_at, created_at, winner_review, review_approved'
        )
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      const rows = winners ?? []
      const roundIds = [...new Set(rows.map((r) => r.round_id).filter(Boolean))]
      let roundMap = {}
      let itemMap = {}
      if (roundIds.length > 0) {
        const { data: rounds, error: roundsError } = await supabase
          .from('raffle_rounds')
          .select('id, round_no, raffle_item_id')
          .in('id', roundIds)
        if (roundsError) throw roundsError
        roundMap = Object.fromEntries((rounds ?? []).map((r) => [r.id, r]))
        const itemIds = [...new Set((rounds ?? []).map((r) => r.raffle_item_id).filter(Boolean))]
        if (itemIds.length > 0) {
          const { data: items, error: itemsError } = await supabase
            .from('raffle_items')
            .select('id, title_ja')
            .in('id', itemIds)
          if (itemsError) throw itemsError
          itemMap = Object.fromEntries((items ?? []).map((i) => [i.id, i]))
        }
      }
      return rows.map((r) => {
        const round = roundMap[r.round_id]
        const item = round ? itemMap[round.raffle_item_id] : null
        return {
          ...r,
          round_no: round?.round_no ?? null,
          item_title: item?.title_ja ?? null,
        }
      })
    },
    enabled: activeTab === 'raffle',
  })

  // admin_audit_log 는 (target_type, target_id) 인덱스가 있어 user 단위 조회가 빠르다.
  // admin_id 의 nickname 은 PostgREST FK 임베드가 보장되지 않아 별도 쿼리로 매핑한다.
  const { data: auditLogs } = useQuery({
    queryKey: ['audit-logs', id],
    queryFn: async () => {
      const { data: logs, error } = await supabase
        .from('admin_audit_log')
        .select('id, admin_id, action, before_value, after_value, reason, created_at')
        .eq('target_type', 'user')
        .eq('target_id', id)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      const rows = logs ?? []
      const adminIds = [...new Set(rows.map((r) => r.admin_id).filter(Boolean))]
      let adminMap = {}
      if (adminIds.length > 0) {
        const { data: admins, error: adminsError } = await supabase
          .from('profiles')
          .select('id, nickname')
          .in('id', adminIds)
        if (adminsError) throw adminsError
        adminMap = Object.fromEntries((admins ?? []).map((a) => [a.id, a.nickname]))
      }
      return rows.map((r) => ({ ...r, admin_nickname: adminMap[r.admin_id] ?? null }))
    },
    enabled: activeTab === 'audit',
  })

  if (isLoading) return <div className="text-gray-400 text-sm">読み込み中...</div>
  if (!user) return <div className="text-red-500">유저를 찾을 수 없습니다.</div>

  const tabs = [
    { key: 'points', label: '포인트 이력' },
    { key: 'energy', label: '에너지 이력' },
    { key: 'exchange', label: '교환 이력' },
    { key: 'referral', label: '추천 관계' },
    { key: 'raffle', label: '당첨 이력' },
    { key: 'audit', label: '감사 로그' },
  ]

  return (
    <div className="space-y-6">
      {modal && <AdjustModal type={modal} userId={id} onClose={() => setModal(null)} />}
      {reasonModal && (
        <ReasonModal modal={reasonModal} userId={id} onClose={() => setReasonModal(null)} />
      )}

      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600 text-sm">
          ← 뒤로
        </button>
        {oauthInfo?.avatar_url ? (
          <img
            src={oauthInfo.avatar_url}
            alt=""
            className="w-9 h-9 rounded-full bg-gray-100 object-cover"
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        ) : null}
        <h1 className="text-2xl font-bold text-gray-900">
          {user.nickname || `ユーザー${user.id.slice(0, 4)}`}
        </h1>
        {oauthInfo?.display_name ? (
          <span className="text-sm text-gray-400">({oauthInfo.display_name})</span>
        ) : null}
        {user.is_banned && <span className="badge-red">정지</span>}
        {user.is_flagged && <span className="badge-yellow">의심</span>}
        {user.deleted_at && (
          <span
            className="badge-gray"
            title={
              user.scheduled_deletion_at
                ? `삭제 예정: ${new Date(user.scheduled_deletion_at).toLocaleString('ko-KR')}`
                : '탈퇴 신청 (예정일 미설정)'
            }
          >
            탈퇴 신청중
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {/* 기본 정보 */}
        <div className="card space-y-3">
          <h2 className="font-semibold text-gray-900">기본 정보</h2>
          <dl className="space-y-2 text-sm">
            {[
              ['플랫폼', user.social_provider],
              ['추천코드', user.referral_code],
              ['가입일', user.created_at ? new Date(user.created_at).toLocaleString('ko-KR') : '—'],
              [
                '마지막 접속',
                user.last_seen_at ? new Date(user.last_seen_at).toLocaleString('ko-KR') : '—',
              ],
              ['가입 IP', user.signup_ip ?? '—'],
              // R10: 탈퇴 신청 / 삭제 예정 (해당 유저만 노출 — 노이즈 제거)
              ...(user.deleted_at
                ? [['탈퇴 신청일', new Date(user.deleted_at).toLocaleString('ko-KR')]]
                : []),
              ...(user.scheduled_deletion_at
                ? [
                    [
                      '삭제 예정일',
                      new Date(user.scheduled_deletion_at).toLocaleString('ko-KR'),
                    ],
                  ]
                : []),
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <dt className="text-gray-500">{k}</dt>
                <dd className="text-gray-900 font-medium text-right max-w-[160px] break-all">
                  {v ?? '—'}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* 소셜 계정 정보 (auth.users / OAuth 측 메타데이터) */}
        <SocialAccountCard info={oauthInfo} />

        {/* 잔액 */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-900">잔액</h2>
          <div className="space-y-3">
            <div className="bg-orange-50 rounded-lg p-4">
              <div className="text-xs text-orange-600 font-medium">포인트</div>
              <div className="text-2xl font-bold text-orange-700 mt-1">
                {user.points?.toLocaleString()} P
              </div>
              <div
                className="text-xs text-orange-400 mt-0.5"
                title="신정책 (2026-05-07): 교환 시 자체획득 1,000P 게이트 폐지. 본 수치는 참고용 누적값."
              >
                자체획득: {user.self_earned_points?.toLocaleString()} P
                <span className="ml-1 text-[10px] text-gray-400">(참고용)</span>
              </div>
            </div>
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-xs text-blue-600 font-medium">에너지</div>
              <div className="text-2xl font-bold text-blue-700 mt-1">
                {user.energy?.toLocaleString()} E
              </div>
              <div
                className="text-xs text-blue-400 mt-0.5"
                title="아직 받지 않은 수령 대기 에너지. 앱의 받기 버튼 클릭 시 energy 로 이동."
              >
                수령 대기: {(user.pending_energy ?? 0).toLocaleString()} E
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setModal('point')} className="btn-primary flex-1 text-xs py-1.5">
              포인트 조정
            </button>
            <button
              onClick={() => setModal('energy')}
              className="btn-secondary flex-1 text-xs py-1.5"
            >
              에너지 조정
            </button>
          </div>
        </div>

        {/* 계정 관리 */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-900">계정 관리</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <div className="text-sm font-medium text-gray-900">의심 플래그</div>
                <div className="text-xs text-gray-500">부정이용 의심 표시</div>
              </div>
              <button
                onClick={() =>
                  setReasonModal({ kind: 'flag', nextValue: !user.is_flagged })
                }
                className={
                  user.is_flagged ? 'badge-yellow cursor-pointer' : 'badge-gray cursor-pointer'
                }
              >
                {user.is_flagged ? '설정됨 (해제)' : '미설정 (설정)'}
              </button>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-900">계정 정지</div>
                  <div className="text-xs text-gray-500">앱 접근 차단</div>
                </div>
                <button
                  onClick={() =>
                    setReasonModal({ kind: 'ban', nextValue: !user.is_banned })
                  }
                  className={
                    user.is_banned ? 'badge-red cursor-pointer' : 'badge-gray cursor-pointer'
                  }
                >
                  {user.is_banned ? '정지됨 (해제)' : '정상 (정지)'}
                </button>
              </div>
              {user.is_banned && user.banned_reason && (
                <div className="text-xs text-red-700 border-t border-gray-200 pt-2 break-words">
                  <span className="text-gray-500 font-medium">정지 사유: </span>
                  {user.banned_reason}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 이력 탭 */}
      <div className="card p-0 overflow-hidden">
        <div className="flex border-b border-gray-100 bg-gray-50">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-5 py-3 text-sm font-medium transition-colors ${
                activeTab === t.key
                  ? 'text-brand border-b-2 border-brand bg-white'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="p-4 overflow-x-auto max-h-96 overflow-y-auto">
          {activeTab === 'points' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs">
                  <th className="text-left pb-2">일시</th>
                  <th className="text-left pb-2">출처</th>
                  <th className="text-right pb-2">금액</th>
                  <th className="text-left pb-2 pl-4">메모</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(pointLogs ?? []).map((l) => (
                  <tr key={l.id}>
                    <td className="py-2 text-gray-400 text-xs whitespace-nowrap">
                      {new Date(l.created_at).toLocaleString('ko-KR')}
                    </td>
                    <td className="py-2">
                      <span className="badge-gray text-xs">{l.source}</span>
                    </td>
                    <td
                      className={`py-2 text-right font-medium ${l.amount > 0 ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {l.amount > 0 ? '+' : ''}
                      {l.amount?.toLocaleString()} P
                    </td>
                    <td className="py-2 pl-4 text-gray-500 text-xs">{l.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {activeTab === 'energy' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs">
                  <th className="text-left pb-2">일시</th>
                  <th className="text-left pb-2">출처</th>
                  <th className="text-right pb-2">금액</th>
                  <th className="text-left pb-2 pl-4">메모</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(energyLogs ?? []).map((l) => (
                  <tr key={l.id}>
                    <td className="py-2 text-gray-400 text-xs whitespace-nowrap">
                      {new Date(l.created_at).toLocaleString('ko-KR')}
                    </td>
                    <td className="py-2">
                      <span className="badge-gray text-xs">{l.source}</span>
                    </td>
                    <td
                      className={`py-2 text-right font-medium ${l.amount > 0 ? 'text-blue-600' : 'text-red-600'}`}
                    >
                      {l.amount > 0 ? '+' : ''}
                      {l.amount?.toLocaleString()} E
                    </td>
                    <td className="py-2 pl-4 text-gray-500 text-xs">{l.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {activeTab === 'exchange' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs">
                  <th className="text-left pb-2">일시</th>
                  <th className="text-left pb-2">상품</th>
                  <th className="text-right pb-2">소비 P</th>
                  <th className="text-right pb-2">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(exchangeLogs ?? []).map((l) => (
                  <tr key={l.id}>
                    <td className="py-2 text-gray-400 text-xs whitespace-nowrap">
                      {new Date(l.created_at).toLocaleString('ko-KR')}
                    </td>
                    <td className="py-2">{l.exchange_items?.title_ja}</td>
                    <td className="py-2 text-right font-medium text-red-600">
                      -{l.points_spent?.toLocaleString()} P
                    </td>
                    <td className="py-2 text-right">
                      <span className={l.status === 'pending' ? 'badge-yellow' : 'badge-green'}>
                        {l.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {activeTab === 'referral' && (
            <div className="space-y-4 text-sm">
              <div>
                <div className="font-medium text-gray-700 mb-2">초대해 준 사람</div>
                {referralData?.referred ? (
                  <div className="p-3 bg-blue-50 rounded-lg">
                    {referralData.referred.profiles?.nickname ?? '알 수 없음'}
                  </div>
                ) : (
                  <div className="text-gray-400">없음 (자체 가입)</div>
                )}
              </div>
              <div>
                <div className="font-medium text-gray-700 mb-2">
                  내가 초대한 사람 ({referralData?.referrals?.length ?? 0}명)
                </div>
                <div className="space-y-1">
                  {(referralData?.referrals ?? []).map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between p-2 bg-gray-50 rounded"
                    >
                      <span>{r.profiles?.nickname ?? '알 수 없음'}</span>
                      <span className={r.status === 'rewarded' ? 'badge-green' : 'badge-gray'}>
                        {r.status}
                      </span>
                    </div>
                  ))}
                  {referralData?.referrals?.length === 0 && (
                    <div className="text-gray-400">초대한 사람 없음</div>
                  )}
                </div>
              </div>
            </div>
          )}
          {activeTab === 'raffle' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs">
                  <th className="text-left pb-2">당첨 일시</th>
                  <th className="text-left pb-2">상품</th>
                  <th className="text-left pb-2">회차</th>
                  <th className="text-left pb-2">수령 상태</th>
                  <th className="text-left pb-2">전달 방법</th>
                  <th className="text-left pb-2 pl-4">코멘트</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(raffleData ?? []).map((w) => (
                  <tr key={w.id} className="align-top">
                    <td className="py-2 text-gray-400 text-xs whitespace-nowrap">
                      {new Date(w.created_at).toLocaleString('ko-KR')}
                    </td>
                    <td className="py-2">{w.item_title ?? '—'}</td>
                    <td className="py-2 text-xs text-gray-500">
                      {w.round_no != null ? `#${w.round_no}` : '—'}
                    </td>
                    <td className="py-2 text-xs">
                      {w.claimed_at ? (
                        <span className="badge-green">受取済</span>
                      ) : w.prize_delivered ? (
                        <span className="badge-yellow">전달됨/미수령</span>
                      ) : (
                        <span className="badge-gray">미전달</span>
                      )}
                    </td>
                    <td className="py-2 text-xs text-gray-500">{w.delivery_method ?? '—'}</td>
                    <td className="py-2 pl-4 text-xs text-gray-500">
                      {w.winner_review ? (
                        <span className={w.review_approved === false ? 'text-red-500 line-through' : ''}>
                          {w.winner_review}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
                {(raffleData ?? []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-gray-400 text-xs">
                      당첨 이력 없음
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
          {activeTab === 'audit' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs">
                  <th className="text-left pb-2">일시</th>
                  <th className="text-left pb-2">액션</th>
                  <th className="text-left pb-2">관리자</th>
                  <th className="text-left pb-2">변경</th>
                  <th className="text-left pb-2 pl-4">사유</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(auditLogs ?? []).map((l) => (
                  <tr key={l.id} className="align-top">
                    <td className="py-2 text-gray-400 text-xs whitespace-nowrap">
                      {new Date(l.created_at).toLocaleString('ko-KR')}
                    </td>
                    <td className="py-2">
                      <span className="badge-gray text-xs">{l.action}</span>
                    </td>
                    <td className="py-2 text-xs">
                      {l.admin_nickname ?? (
                        <span className="text-gray-400">
                          {l.admin_id ? l.admin_id.slice(0, 8) : '—'}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-xs text-gray-600">
                      <span className="text-gray-400">전:</span>{' '}
                      <code className="text-[11px]">
                        {l.before_value === null ? '—' : JSON.stringify(l.before_value)}
                      </code>
                      <br />
                      <span className="text-gray-400">후:</span>{' '}
                      <code className="text-[11px]">
                        {l.after_value === null ? '—' : JSON.stringify(l.after_value)}
                      </code>
                    </td>
                    <td className="py-2 pl-4 text-gray-500 text-xs">{l.reason || '—'}</td>
                  </tr>
                ))}
                {(auditLogs ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-gray-400 text-xs">
                      감사 로그 없음
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
