import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useState } from 'react'
import GameAbuseLog from './GameAbuseLog'

/** DB `public._try_flag_abusive_signup` 와 동일 상수 (마이그레이션 변경 시 여기도 맞출 것) */
const SIGNUP_ABUSE = {
  devWindowDays: 30,
  devThreshold: 3,
  ipWindowHours: 24,
  ipThreshold: 5,
  socialWindowDays: 30,
  socialThreshold: 2,
}

/**
 * 가입 시 자동 플래그와 동일한 OR 조건으로 기기 연계 계정 수를 센다.
 * (idfv 동일 OR device_fingerprint 동일, 창구 내)
 */
async function countDeviceCluster(supabase, row, devCutoffIso) {
  const idfv = row.idfv_or_ssaid
  const dev = row.device_fingerprint
  if (!idfv && !dev) return 0

  let q = supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', devCutoffIso)

  if (idfv && dev) {
    q = q.or(`idfv_or_ssaid.eq.${idfv},device_fingerprint.eq.${dev}`)
  } else if (idfv) {
    q = q.eq('idfv_or_ssaid', idfv)
  } else {
    q = q.eq('device_fingerprint', dev)
  }

  const { count, error } = await q
  if (error) throw error
  return count ?? 0
}

/**
 * 의심 유저들이 실제로 친구초대 시스템으로 받은 보상 합계를 user_id → 금액 맵으로 반환.
 *  - referral_events.referee_bonus_amount (referee_bonus_granted=true)
 *  - referral_events.referrer_bonus_amount (referrer_bonus_granted=true)
 *  - referral_energy_bonus.bonus_amount (referrer_id 기준)
 * 의심 플래그된 유저는 DB 차원에서 보상 차단되므로 정상이면 0 이어야 한다. 0이 아니면 "의심 걸리기 전에 받은 / 누락된 케이스" 로 수동 검토가 필요함을 의미.
 */
async function fetchReferralPayoutsByUser(supabase, userIds) {
  if (!userIds.length) return {}

  const totals = Object.fromEntries(userIds.map((id) => [id, 0]))

  const [refereeRes, referrerRes, energyRes] = await Promise.all([
    supabase
      .from('referral_events')
      .select('referee_id, referee_bonus_amount')
      .in('referee_id', userIds)
      .eq('referee_bonus_granted', true),
    supabase
      .from('referral_events')
      .select('referrer_id, referrer_bonus_amount')
      .in('referrer_id', userIds)
      .eq('referrer_bonus_granted', true),
    supabase
      .from('referral_energy_bonus')
      .select('referrer_id, bonus_amount')
      .in('referrer_id', userIds),
  ])

  // 권한/네트워크 오류가 0 P 로 둔갑하면 부정이용 판단이 오염되므로 명시적으로 throw.
  if (refereeRes.error) throw refereeRes.error
  if (referrerRes.error) throw referrerRes.error
  if (energyRes.error) throw energyRes.error

  for (const r of refereeRes.data ?? []) {
    if (totals[r.referee_id] != null) totals[r.referee_id] += r.referee_bonus_amount ?? 0
  }
  for (const r of referrerRes.data ?? []) {
    if (totals[r.referrer_id] != null) totals[r.referrer_id] += r.referrer_bonus_amount ?? 0
  }
  for (const r of energyRes.data ?? []) {
    if (totals[r.referrer_id] != null) totals[r.referrer_id] += r.bonus_amount ?? 0
  }

  return totals
}

/** 의심 유저 행에 자동 탐지 사유(기기/IP/소셜) 요약을 붙인다 */
async function enrichFlaggedWithSignupAbuseReasons(supabase, rows) {
  const now = Date.now()
  const devCutoff = new Date(
    now - SIGNUP_ABUSE.devWindowDays * 24 * 60 * 60 * 1000,
  ).toISOString()
  const ipCutoff = new Date(now - SIGNUP_ABUSE.ipWindowHours * 60 * 60 * 1000).toISOString()
  const socialCutoff = new Date(
    now - SIGNUP_ABUSE.socialWindowDays * 24 * 60 * 60 * 1000,
  ).toISOString()

  return Promise.all(
    (rows ?? []).map(async (u) => {
      const hits = []
      const refs = []

      try {
        const devCount = await countDeviceCluster(supabase, u, devCutoff)
        if (devCount >= SIGNUP_ABUSE.devThreshold) {
          hits.push(
            `동일 기기·IDFV/지문 기준 최근 ${SIGNUP_ABUSE.devWindowDays}일 내 연계 계정 ${devCount}건 (의심 기준 ${SIGNUP_ABUSE.devThreshold}건 이상)`,
          )
        } else if (u.idfv_or_ssaid || u.device_fingerprint) {
          refs.push(
            `기기·IDFV 연계 ${devCount}건 / ${SIGNUP_ABUSE.devWindowDays}일 (기준 ${SIGNUP_ABUSE.devThreshold}건 미만)`,
          )
        } else {
          refs.push('IDFV·기기 지문 없음')
        }
      } catch {
        refs.push('기기 연계 집계를 불러오지 못했습니다.')
      }

      if (u.signup_ip) {
        try {
          const { count, error } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', ipCutoff)
            .eq('signup_ip', u.signup_ip)
          if (error) throw error
          const ipCount = count ?? 0
          if (ipCount >= SIGNUP_ABUSE.ipThreshold) {
            hits.push(
              `동일 가입 IP 기준 최근 ${SIGNUP_ABUSE.ipWindowHours}시간 내 ${ipCount}건 (의심 기준 ${SIGNUP_ABUSE.ipThreshold}건 이상)`,
            )
          } else {
            refs.push(
              `동일 IP ${ipCount}건 / ${SIGNUP_ABUSE.ipWindowHours}시간 (기준 ${SIGNUP_ABUSE.ipThreshold}건 미만)`,
            )
          }
        } catch {
          refs.push('IP 연계 집계를 불러오지 못했습니다.')
        }
      } else {
        refs.push('가입 IP 없음(클라이언트 미전송 시 IP 규칙은 동작하지 않음)')
      }

      if (u.social_sub_hash) {
        try {
          const { count, error } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', socialCutoff)
            .eq('social_sub_hash', u.social_sub_hash)
          if (error) throw error
          const socCount = count ?? 0
          if (socCount >= SIGNUP_ABUSE.socialThreshold) {
            hits.push(
              `동일 소셜 계정(해시) 기준 최근 ${SIGNUP_ABUSE.socialWindowDays}일 내 ${socCount}건 (의심 기준 ${SIGNUP_ABUSE.socialThreshold}건 이상)`,
            )
          } else {
            refs.push(
              `동일 소셜 해시 ${socCount}건 / ${SIGNUP_ABUSE.socialWindowDays}일 (기준 ${SIGNUP_ABUSE.socialThreshold}건 미만)`,
            )
          }
        } catch {
          refs.push('소셜 해시 집계를 불러오지 못했습니다.')
        }
      } else {
        refs.push('소셜 해시 없음')
      }

      let summary
      if (hits.length) {
        summary = hits.join('\n')
      } else {
        summary =
          '현재 시점에서 자동 다중가입 탐지 임계값은 충족되지 않습니다.\n' +
          '(수동 플래그, 또는 가입 이후 데이터·계정 수 변화 가능)\n' +
          `참고: ${refs.join(' · ')}`
      }

      const idfv = u.idfv_or_ssaid
      const idfvShort =
        idfv && idfv.length > 14 ? `${idfv.slice(0, 8)}…${idfv.slice(-4)}` : idfv || '—'
      const fpShort =
        u.device_fingerprint && u.device_fingerprint.length > 16
          ? `${u.device_fingerprint.slice(0, 10)}…`
          : u.device_fingerprint || '—'

      return {
        ...u,
        _suspicionSummary: summary,
        _devicePreview: `IDFV/SSAID: ${idfvShort} · 지문: ${fpShort}`,
      }
    }),
  )
}

export default function FraudPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState('flagged')

  const {
    data: flagged,
    isLoading: flaggedLoading,
    error: flaggedError,
  } = useQuery({
    queryKey: ['flagged-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'id, nickname, points, energy, created_at, signup_ip, social_provider, is_flagged, is_banned, idfv_or_ssaid, device_fingerprint, social_sub_hash'
        )
        .eq('is_flagged', true)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      const enriched = await enrichFlaggedWithSignupAbuseReasons(supabase, data ?? [])
      const payouts = await fetchReferralPayoutsByUser(
        supabase,
        enriched.map((u) => u.id),
      )
      return enriched.map((u) => ({ ...u, _referralPayout: payouts[u.id] ?? 0 }))
    },
    enabled: tab === 'flagged',
  })

  const {
    data: duplicateIPs,
    isLoading: duplicateIPsLoading,
    error: duplicateIPsError,
  } = useQuery({
    queryKey: ['duplicate-ips'],
    queryFn: async () => {
      const { data: ipRows, error } = await supabase.rpc('admin_get_duplicate_ips', {
        p_min_count: 2,
        p_limit: 50,
      })
      if (error) throw error
      if (!ipRows?.length) return []

      const ips = ipRows.map((r) => r.signup_ip)
      const { data: users, error: usersError } = await supabase
        .from('profiles')
        .select('id, nickname, signup_ip, created_at, is_banned, is_flagged')
        .in('signup_ip', ips)
        .order('signup_ip')
        .limit(500)
      if (usersError) throw usersError

      const grouped = {}
      ;(users ?? []).forEach((u) => {
        if (!grouped[u.signup_ip]) grouped[u.signup_ip] = []
        grouped[u.signup_ip].push(u)
      })
      // RPC 의 account_count(=DB 실측) 와 500 limit 으로 잘려서 들고온 users 를 분리해 표시.
      return ipRows.map((r) => ({
        ip: r.signup_ip,
        dbCount: r.account_count ?? null,
        users: grouped[r.signup_ip] ?? [],
      }))
    },
    enabled: tab === 'ip',
  })

  const {
    data: highBalance,
    isLoading: highBalanceLoading,
    error: highBalanceError,
  } = useQuery({
    queryKey: ['high-balance'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nickname, points, energy, self_earned_points, created_at, is_flagged')
        .order('points', { ascending: false })
        .limit(30)
      if (error) throw error
      return data ?? []
    },
    enabled: tab === 'balance',
  })

  // RLS 강화 (2026_04_28) 이후 profiles.is_flagged / is_banned 는 컬럼 화이트리스트
  // 외 컬럼이라 직접 UPDATE 시 permission denied. SECURITY DEFINER RPC 로 우회.
  // 모든 액션은 admin_audit_log 에 자동 기록 (변경 전/후 값 + 사유).
  // UI 사유 입력은 추후 (옵션 C). 현재는 자동 생성 문자열로 박음.
  const toggleFlag = useMutation({
    mutationFn: async ({ id, val }) => {
      const reason = `auto: ${val ? 'flagged' : 'unflagged'} via admin FraudPage`
      const { error } = await supabase.rpc('admin_set_flag', {
        p_user_id: id,
        p_value: val,
        p_reason: reason,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['flagged-users'] })
      qc.invalidateQueries({ queryKey: ['duplicate-ips'] })
    },
  })

  const toggleBan = useMutation({
    mutationFn: async ({ id, val }) => {
      const reason = `auto: ${val ? 'banned' : 'unbanned'} via admin FraudPage`
      const { error } = await supabase.rpc('admin_set_ban', {
        p_user_id: id,
        p_value: val,
        p_banned_reason: val ? 'admin manual ban via FraudPage' : null,
        p_reason: reason,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['flagged-users'] }),
  })

  const tabs = [
    { key: 'flagged', label: `🚨 의심 유저 (${flagged?.length ?? '…'})` },
    { key: 'ip', label: '🔍 중복 IP 탐지' },
    { key: 'balance', label: '💰 고액 보유자' },
    { key: 'game_abuse', label: '🎮 게임 어뷰징 로그' },
  ]

  // mutation 실패가 콘솔에만 남고 운영자에게 안 보이면 "버튼 눌렀는데 상태가 안 바뀐다"
  // 식의 혼란이 생기므로, 한쪽이라도 error 가 있으면 페이지 상단에 배너로 표면화한다.
  const actionError = toggleFlag.error ?? toggleBan.error

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">부정이용 감지</h1>

      {actionError && (
        <div className="card border border-red-300 bg-red-50 text-red-700 text-sm flex items-start justify-between gap-3">
          <div>
            <strong>액션 실패:</strong> {actionError.message ?? '알 수 없는 오류'}
            <div className="text-xs text-red-500 mt-1">
              audit log 에는 시도 자체가 기록되지 않았을 수 있습니다. 권한/네트워크 확인 후 다시
              시도하세요.
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              toggleFlag.reset()
              toggleBan.reset()
            }}
            className="text-xs text-red-600 hover:text-red-800 shrink-0"
          >
            닫기
          </button>
        </div>
      )}

      <div className="flex gap-2 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? 'border-brand text-brand'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 의심 유저 탭 */}
      {tab === 'flagged' && (
        <div className="space-y-3">
          <div className="card p-0 overflow-hidden overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">닉네임</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium w-[280px]">
                    의심 사유 (자동 탐지)
                  </th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">가입 IP</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">포인트</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium" title="referral_events 와 referral_energy_bonus 에 실제로 지급된 합계. 0이면 추천 시스템으로는 보상이 나가지 않은 안전 케이스.">
                    추천 실수령
                  </th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">가입일</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">상태</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">처리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(flagged ?? []).map((u) => (
                  <tr key={u.id} className="hover:bg-red-50">
                    <td className="px-4 py-3 align-top">
                      <Link
                        to={`/admin/users/${u.id}`}
                        className="text-brand hover:underline font-medium"
                      >
                        {u.nickname || `ユーザー${u.id.slice(0, 4)}`}
                      </Link>
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-gray-700 max-w-[320px]">
                      <div className="whitespace-pre-line leading-relaxed">{u._suspicionSummary}</div>
                      <div className="mt-1.5 text-[11px] text-gray-400 font-mono break-all">
                        {u._devicePreview}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-gray-500 font-mono text-xs">
                      {u.signup_ip ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right align-top font-medium">
                      {u.points?.toLocaleString()} P
                    </td>
                    <td className="px-4 py-3 text-right align-top">
                      {u._referralPayout > 0 ? (
                        <span className="text-red-600 font-semibold" title="추천 시스템으로 실제 지급된 누적 금액. 0이 아니면 의심 플래그 이전에 받았거나 누락된 케이스이므로 검토 필요.">
                          {u._referralPayout.toLocaleString()} P
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs" title="추천 시스템(피초대/초대/매일 동반)으로는 한 푼도 지급되지 않음. 의심으로 잡혀도 추천 보상 측면에서는 안전.">
                          0 P
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right align-top text-gray-400 text-xs">
                      {new Date(u.created_at).toLocaleDateString('ko-KR')}
                    </td>
                    <td className="px-4 py-3 text-right align-top">
                      {u.is_banned ? (
                        <span className="badge-red">정지</span>
                      ) : (
                        <span className="badge-yellow">의심</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right align-top">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => {
                            const label = u.nickname || `ユーザー${u.id.slice(0, 4)}`
                            if (
                              window.confirm(
                                `「${label}」을(를) 무혐의 처리하시겠습니까?\n의심 플래그를 해제합니다. (audit log 에 기록됨)`,
                              )
                            ) {
                              toggleFlag.mutate({ id: u.id, val: false })
                            }
                          }}
                          disabled={toggleFlag.isPending}
                          className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40"
                        >
                          무혐의
                        </button>
                        <button
                          onClick={() => {
                            const label = u.nickname || `ユーザー${u.id.slice(0, 4)}`
                            const msg = u.is_banned
                              ? `「${label}」의 계정정지를 해제하시겠습니까?\n해제 후 즉시 로그인/포인트 사용이 가능해집니다.`
                              : `「${label}」을(를) 계정정지하시겠습니까?\n즉시 적용됩니다. (audit log 에 기록됨)`
                            if (window.confirm(msg)) {
                              toggleBan.mutate({ id: u.id, val: !u.is_banned })
                            }
                          }}
                          disabled={toggleBan.isPending}
                          className={`text-xs disabled:opacity-40 ${u.is_banned ? 'text-green-600 hover:text-green-800' : 'text-red-600 hover:text-red-800'}`}
                        >
                          {u.is_banned ? '정지해제' : '계정정지'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {flaggedLoading && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                      불러오는 중…
                    </td>
                  </tr>
                )}
                {flaggedError && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-red-600">
                      의심 유저 목록을 불러오지 못했습니다 (
                      {flaggedError.message ?? '알 수 없는 오류'}). 권한/네트워크 상태를 확인하세요.
                    </td>
                  </tr>
                )}
                {!flaggedLoading && !flaggedError && (flagged ?? []).length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                      의심 유저 없음 ✅
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500 px-1 leading-relaxed">
            사유는 DB 가입 시 자동 플래그(
            <code className="text-[11px] bg-gray-100 px-1 rounded">_try_flag_abusive_signup</code>
            )와 동일한 기준으로 계산합니다. 기기·IDFV/지문은 30일·3건 이상, 가입 IP는 24시간·5건
            이상, 동일 소셜(해시)은 30일·2건 이상일 때 의심으로 분류됩니다.
            <br />
            <span className="text-gray-600">
              「추천 실수령」은 친구초대 시스템에서 실제로 지급된 누적 보상(피초대 1,000P·초대자
              1,000P·매일 동반 에너지)의 합계입니다. 의심 플래그가 켜진 뒤에는 모든 추천 보상이
              자동 차단되므로, 0 P이면 추천 어뷰징 측면에서는 무해한 의심 케이스입니다.
            </span>
          </p>
        </div>
      )}

      {/* 중복 IP 탭 */}
      {tab === 'ip' && (
        <div className="space-y-4">
          {duplicateIPsLoading && (
            <div className="card text-center text-gray-400 py-8">불러오는 중…</div>
          )}
          {duplicateIPsError && (
            <div className="card text-center text-red-600 py-8">
              중복 IP 목록을 불러오지 못했습니다 (
              {duplicateIPsError.message ?? '알 수 없는 오류'}). 권한/네트워크 상태를 확인하세요.
            </div>
          )}
          {!duplicateIPsLoading &&
            !duplicateIPsError &&
            (duplicateIPs ?? []).map(({ ip, dbCount, users }) => (
              <div key={ip} className="card">
                <div className="flex items-center gap-3 mb-3 flex-wrap">
                  <code className="text-sm bg-gray-100 px-2 py-1 rounded font-mono">{ip}</code>
                  <span className="badge-red">DB 기준 {dbCount ?? '?'}개 계정</span>
                  {dbCount != null && users.length !== dbCount && (
                    <span
                      className="text-xs text-gray-500"
                      title="목록은 최대 500건까지만 표시합니다 (IP 그룹 단위 정렬). DB 실측 카운트와 다를 수 있습니다."
                    >
                      표시 {users.length}건
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  {users.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0 text-sm"
                    >
                      <Link to={`/admin/users/${u.id}`} className="text-brand hover:underline">
                        {u.nickname || `ユーザー${u.id.slice(0, 4)}`}
                      </Link>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 text-xs">
                          {new Date(u.created_at).toLocaleDateString('ko-KR')}
                        </span>
                        {u.is_banned && <span className="badge-red text-xs">정지</span>}
                        {u.is_flagged && <span className="badge-yellow text-xs">의심</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          {!duplicateIPsLoading && !duplicateIPsError && (duplicateIPs ?? []).length === 0 && (
            <div className="card text-center text-gray-400 py-8">중복 IP 탐지 없음 ✅</div>
          )}
        </div>
      )}

      {/* 게임 어뷰징 로그 탭 */}
      {tab === 'game_abuse' && <GameAbuseLog />}

      {/* 고액 보유자 탭 */}
      {tab === 'balance' && (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">순위</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">닉네임</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">포인트</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">자체 획득</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">에너지</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {highBalanceLoading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    불러오는 중…
                  </td>
                </tr>
              )}
              {highBalanceError && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-red-600">
                    고액 보유자 목록을 불러오지 못했습니다 (
                    {highBalanceError.message ?? '알 수 없는 오류'}).
                  </td>
                </tr>
              )}
              {!highBalanceLoading && !highBalanceError && (highBalance ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    대상 없음
                  </td>
                </tr>
              )}
              {(highBalance ?? []).map((u, i) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-400 font-medium">{i + 1}</td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/admin/users/${u.id}`}
                      className="text-brand hover:underline font-medium"
                    >
                      {u.nickname || `ユーザー${u.id.slice(0, 4)}`}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">
                    {u.points?.toLocaleString()} P
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {u.self_earned_points?.toLocaleString()} P
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {u.energy?.toLocaleString()} E
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.is_flagged ? (
                      <span className="badge-yellow">의심</span>
                    ) : (
                      <span className="badge-green">정상</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
