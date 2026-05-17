import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useState } from 'react'
import GameAbuseLog from './GameAbuseLog'
import { useLanguage } from '../../contexts/LanguageContext'
import { formatJstDate } from '../../utils/jstFormat'

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
async function enrichFlaggedWithSignupAbuseReasons(supabase, rows, t) {
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
            `${t('fraud.reason.deviceHit')} ${SIGNUP_ABUSE.devWindowDays}${t('fraud.reason.daysWithin')} ${devCount}${t('fraud.reason.casesOver')} ${SIGNUP_ABUSE.devThreshold}${t('fraud.reason.casesThresholdSuffix')}`,
          )
        } else if (u.idfv_or_ssaid || u.device_fingerprint) {
          refs.push(
            `${t('fraud.reason.deviceRef')} ${devCount}${t('fraud.reason.casesCount')} / ${SIGNUP_ABUSE.devWindowDays}${t('fraud.reason.daysUnit')} (${t('fraud.reason.thresholdPrefix')} ${SIGNUP_ABUSE.devThreshold}${t('fraud.reason.casesUnder')})`,
          )
        } else {
          refs.push(t('fraud.reason.noIdfv'))
        }
      } catch {
        refs.push(t('fraud.reason.deviceFetchFail'))
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
              `${t('fraud.reason.ipHit')} ${SIGNUP_ABUSE.ipWindowHours}${t('fraud.reason.hoursWithin')} ${ipCount}${t('fraud.reason.casesOver')} ${SIGNUP_ABUSE.ipThreshold}${t('fraud.reason.casesThresholdSuffix')}`,
            )
          } else {
            refs.push(
              `${t('fraud.reason.ipRef')} ${ipCount}${t('fraud.reason.casesCount')} / ${SIGNUP_ABUSE.ipWindowHours}${t('fraud.reason.hoursUnit')} (${t('fraud.reason.thresholdPrefix')} ${SIGNUP_ABUSE.ipThreshold}${t('fraud.reason.casesUnder')})`,
            )
          }
        } catch {
          refs.push(t('fraud.reason.ipFetchFail'))
        }
      } else {
        refs.push(t('fraud.reason.noSignupIp'))
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
              `${t('fraud.reason.socialHit')} ${SIGNUP_ABUSE.socialWindowDays}${t('fraud.reason.daysWithin')} ${socCount}${t('fraud.reason.casesOver')} ${SIGNUP_ABUSE.socialThreshold}${t('fraud.reason.casesThresholdSuffix')}`,
            )
          } else {
            refs.push(
              `${t('fraud.reason.socialRef')} ${socCount}${t('fraud.reason.casesCount')} / ${SIGNUP_ABUSE.socialWindowDays}${t('fraud.reason.daysUnit')} (${t('fraud.reason.thresholdPrefix')} ${SIGNUP_ABUSE.socialThreshold}${t('fraud.reason.casesUnder')})`,
            )
          }
        } catch {
          refs.push(t('fraud.reason.socialFetchFail'))
        }
      } else {
        refs.push(t('fraud.reason.noSocialHash'))
      }

      let summary
      if (hits.length) {
        summary = hits.join('\n')
      } else {
        summary =
          t('fraud.reason.noAutoThreshold') + '\n' +
          t('fraud.reason.noAutoNote') + '\n' +
          `${t('fraud.reason.referencePrefix')} ${refs.join(' · ')}`
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
        _devicePreview: `IDFV/SSAID: ${idfvShort} · ${t('fraud.reason.fingerprintLabel')}: ${fpShort}`,
      }
    }),
  )
}

export default function FraudPage() {
  const qc = useQueryClient()
  const { t, lang } = useLanguage()
  const [tab, setTab] = useState('flagged')

  const {
    data: flagged,
    isLoading: flaggedLoading,
    error: flaggedError,
  } = useQuery({
    queryKey: ['flagged-users', lang],
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
      const enriched = await enrichFlaggedWithSignupAbuseReasons(supabase, data ?? [], t)
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
    { key: 'flagged', label: `🚨 ${t('fraud.tab.flagged')} (${flagged?.length ?? '…'})` },
    { key: 'ip', label: `🔍 ${t('fraud.tab.ip')}` },
    { key: 'balance', label: `💰 ${t('fraud.tab.balance')}` },
    { key: 'game_abuse', label: `🎮 ${t('fraud.tab.gameAbuse')}` },
  ]

  // mutation 실패가 콘솔에만 남고 운영자에게 안 보이면 "버튼 눌렀는데 상태가 안 바뀐다"
  // 식의 혼란이 생기므로, 한쪽이라도 error 가 있으면 페이지 상단에 배너로 표면화한다.
  const actionError = toggleFlag.error ?? toggleBan.error

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">{t('fraud.title')}</h1>

      {actionError && (
        <div className="card border border-red-300 bg-red-50 text-red-700 text-sm flex items-start justify-between gap-3">
          <div>
            <strong>{t('fraud.actionFailed')}</strong> {actionError.message ?? t('common.unknownError')}
            <div className="text-xs text-red-500 mt-1">
              {t('fraud.actionFailedHint')}
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
            {t('common.close')}
          </button>
        </div>
      )}

      <div className="flex gap-2 border-b border-gray-200">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.key}
            onClick={() => setTab(tabItem.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === tabItem.key
                ? 'border-brand text-brand'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tabItem.label}
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
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">{t('fraud.col.nickname')}</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium w-[280px]">
                    {t('fraud.col.suspicionReason')}
                  </th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">{t('fraud.col.signupIp')}</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">{t('fraud.col.points')}</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium" title={t('fraud.col.referralPayoutTooltip')}>
                    {t('fraud.col.referralPayout')}
                  </th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">{t('fraud.col.signupDate')}</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">{t('fraud.col.status')}</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">{t('fraud.col.action')}</th>
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
                        <span className="text-red-600 font-semibold" title={t('fraud.col.referralPayoutTooltipNonZero')}>
                          {u._referralPayout.toLocaleString()} P
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs" title={t('fraud.col.referralPayoutTooltipZero')}>
                          0 P
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right align-top text-gray-400 text-xs">
                      {formatJstDate(u.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right align-top">
                      {u.is_banned ? (
                        <span className="badge-red">{t('fraud.status.banned')}</span>
                      ) : (
                        <span className="badge-yellow">{t('fraud.status.suspicious')}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right align-top">
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => {
                            const label = u.nickname || `ユーザー${u.id.slice(0, 4)}`
                            if (
                              window.confirm(
                                `${t('fraud.confirm.clearFlagPrefix')}「${label}」${t('fraud.confirm.clearFlagSuffix')}\n${t('fraud.confirm.clearFlagDetail')}`,
                              )
                            ) {
                              toggleFlag.mutate({ id: u.id, val: false })
                            }
                          }}
                          disabled={toggleFlag.isPending}
                          className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40"
                        >
                          {t('fraud.action.clear')}
                        </button>
                        <button
                          onClick={() => {
                            const label = u.nickname || `ユーザー${u.id.slice(0, 4)}`
                            const msg = u.is_banned
                              ? `「${label}」${t('fraud.confirm.unbanSuffix')}\n${t('fraud.confirm.unbanDetail')}`
                              : `${t('fraud.confirm.banPrefix')}「${label}」${t('fraud.confirm.banSuffix')}\n${t('fraud.confirm.banDetail')}`
                            if (window.confirm(msg)) {
                              toggleBan.mutate({ id: u.id, val: !u.is_banned })
                            }
                          }}
                          disabled={toggleBan.isPending}
                          className={`text-xs disabled:opacity-40 ${u.is_banned ? 'text-green-600 hover:text-green-800' : 'text-red-600 hover:text-red-800'}`}
                        >
                          {u.is_banned ? t('fraud.action.unban') : t('fraud.action.ban')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {flaggedLoading && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                      {t('common.loading')}
                    </td>
                  </tr>
                )}
                {flaggedError && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-red-600">
                      {t('fraud.flaggedFetchFail')} (
                      {flaggedError.message ?? t('common.unknownError')}). {t('common.checkPermNetwork')}
                    </td>
                  </tr>
                )}
                {!flaggedLoading && !flaggedError && (flagged ?? []).length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                      {t('fraud.flaggedEmpty')} ✅
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500 px-1 leading-relaxed">
            {t('fraud.footnote.criteriaPrefix')}
            <code className="text-[11px] bg-gray-100 px-1 rounded">_try_flag_abusive_signup</code>
            {t('fraud.footnote.criteriaSuffix')}
            <br />
            <span className="text-gray-600">
              {t('fraud.footnote.referralPayout')}
            </span>
          </p>
        </div>
      )}

      {/* 중복 IP 탭 */}
      {tab === 'ip' && (
        <div className="space-y-4">
          {duplicateIPsLoading && (
            <div className="card text-center text-gray-400 py-8">{t('common.loading')}</div>
          )}
          {duplicateIPsError && (
            <div className="card text-center text-red-600 py-8">
              {t('fraud.ipFetchFail')} (
              {duplicateIPsError.message ?? t('common.unknownError')}). {t('common.checkPermNetwork')}
            </div>
          )}
          {!duplicateIPsLoading &&
            !duplicateIPsError &&
            (duplicateIPs ?? []).map(({ ip, dbCount, users }) => (
              <div key={ip} className="card">
                <div className="flex items-center gap-3 mb-3 flex-wrap">
                  <code className="text-sm bg-gray-100 px-2 py-1 rounded font-mono">{ip}</code>
                  <span className="badge-red">{t('fraud.ip.dbBased')} {dbCount ?? '?'}{t('fraud.ip.accountsUnit')}</span>
                  {dbCount != null && users.length !== dbCount && (
                    <span
                      className="text-xs text-gray-500"
                      title={t('fraud.ip.limitNoteTooltip')}
                    >
                      {t('fraud.ip.displayedPrefix')} {users.length}{t('fraud.ip.casesUnit')}
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
                          {formatJstDate(u.created_at)}
                        </span>
                        {u.is_banned && <span className="badge-red text-xs">{t('fraud.status.banned')}</span>}
                        {u.is_flagged && <span className="badge-yellow text-xs">{t('fraud.status.suspicious')}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          {!duplicateIPsLoading && !duplicateIPsError && (duplicateIPs ?? []).length === 0 && (
            <div className="card text-center text-gray-400 py-8">{t('fraud.ipEmpty')} ✅</div>
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
                <th className="text-left px-4 py-3 text-gray-500 font-medium">{t('fraud.balance.rank')}</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">{t('fraud.col.nickname')}</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">{t('fraud.col.points')}</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">{t('fraud.balance.selfEarned')}</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">{t('fraud.balance.energy')}</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">{t('fraud.col.status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {highBalanceLoading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    {t('common.loading')}
                  </td>
                </tr>
              )}
              {highBalanceError && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-red-600">
                    {t('fraud.balanceFetchFail')} (
                    {highBalanceError.message ?? t('common.unknownError')}).
                  </td>
                </tr>
              )}
              {!highBalanceLoading && !highBalanceError && (highBalance ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    {t('common.noTargets')}
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
                      <span className="badge-yellow">{t('fraud.status.suspicious')}</span>
                    ) : (
                      <span className="badge-green">{t('fraud.status.normal')}</span>
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
