import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLanguage } from '../../contexts/LanguageContext'
import { formatJstDate, formatJstDateTime } from '../../utils/jstFormat'

const REF_PAGE = 50

export default function ReferralPage() {
  const { t } = useLanguage()
  const qc = useQueryClient()
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(0)

  const handleFilter = (f) => {
    setFilter(f)
    setPage(0)
  }

  // referral_events 는 RLS 로 본인 행만 SELECT 허용. 어드민 운영용으로는
  // SECURITY DEFINER + is_admin() 가드 RPC 를 통해서만 전체 조회/갱신한다.
  // (2026_05_17_admin_referral_admin_rpcs.sql)
  const { data: eventsResult, error: eventsError } = useQuery({
    queryKey: ['referral-events', filter, page],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_referral_events', {
        p_filter: filter,
        p_limit: REF_PAGE,
        p_offset: page * REF_PAGE,
      })
      if (error) throw error
      const rows = (data ?? []).map((r) => ({
        ...r,
        referrer: { nickname: r.referrer_nickname },
        referee: { nickname: r.referee_nickname },
      }))
      const total = rows.length > 0 ? Number(rows[0].total_count ?? 0) : 0
      return { rows, total }
    },
    keepPreviousData: true,
  })

  const { data: summary, error: summaryError } = useQuery({
    queryKey: ['referral-summary'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_referral_summary')
      if (error) throw error
      return (data ?? []).reduce((acc, r) => {
        acc[r.status] = Number(r.cnt ?? 0)
        return acc
      }, {})
    },
  })

  const { data: bonusStats, error: bonusError } = useQuery({
    queryKey: ['referral-bonus-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_referral_bonus_top', { p_limit: 20 })
      if (error) throw error
      return data ?? []
    },
  })

  // flagged → pending(무혐의) / expired(거절). 직접 update 가 아니라
  // SECURITY DEFINER RPC 로 처리하여 admin_audit_log 에 기록.
  const clearFlag = useMutation({
    mutationFn: async ({ id, reason }) => {
      const { error } = await supabase.rpc('admin_clear_referral_flag', {
        p_id: id,
        p_reason: reason,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['referral-events'] })
      qc.invalidateQueries({ queryKey: ['referral-summary'] })
    },
  })

  const rejectReferral = useMutation({
    mutationFn: async ({ id, reason }) => {
      const { error } = await supabase.rpc('admin_reject_referral', {
        p_id: id,
        p_reason: reason,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['referral-events'] })
      qc.invalidateQueries({ queryKey: ['referral-summary'] })
    },
  })

  // window.prompt 으로 감사 로그 사유 수집. 취소(null) 또는 공백만 입력 시 처리 중단
  // → admin_audit_log.reason 이 빈 문자열로 박히는 무의미 항목 차단.
  const promptReason = (kind) => {
    const promptText =
      kind === 'clear'
        ? t('referral.action.clear.prompt')
        : t('referral.action.reject.prompt')
    const raw = window.prompt(promptText)
    if (raw === null) return null
    const trimmed = raw.trim()
    if (trimmed.length === 0) {
      window.alert(t('referral.action.reasonRequired'))
      return null
    }
    return trimmed
  }

  // 신정책 (2026-05-07): pending = 「받기 가능 (24h 안)」.
  //   reward_available 은 구 데이터(광고 3회 게이트 시절) 잔존이지만 동일하게 표시.
  const statusBadge = (s) => {
    if (s === 'rewarded') return <span className="badge-green">{t('referral.status.rewarded')}</span>
    if (s === 'pending')
      return (
        <span className="badge-yellow" title={t('referral.status.pendingTooltip')}>
          {t('referral.status.pending')}
        </span>
      )
    if (s === 'reward_available')
      return (
        <span className="badge-yellow" title={t('referral.status.rewardAvailableTooltip')}>
          {t('referral.status.rewardAvailable')}
        </span>
      )
    if (s === 'flagged') return <span className="badge-red">{t('referral.status.flagged')}</span>
    if (s === 'expired')
      return (
        <span className="badge-gray" title={t('referral.status.expiredTooltip')}>
          {t('referral.status.expired')}
        </span>
      )
    return <span className="badge-gray">{s}</span>
  }

  // 「받기 가능 만료까지」 라벨 — 신정책의 expires_at 카운트다운.
  const formatRemainHours = (iso) => {
    if (!iso) return '—'
    const ms = new Date(iso).getTime() - Date.now()
    if (ms <= 0) return <span className="text-gray-400">{t('referral.expired')}</span>
    const h = Math.floor(ms / 3600_000)
    const m = Math.floor((ms % 3600_000) / 60_000)
    return (
      <span className="text-orange-600 font-medium">
        {t('referral.remaining')} {h}h {m}m
      </span>
    )
  }

  const events = eventsResult?.rows ?? []
  const total = eventsResult?.total ?? 0

  // 어드민 RPC 가 실패할 때(권한 누락/마이그레이션 미적용/컬럼 변경)
  // 화면이 "데이터 없음" 처럼 보이지 않도록 상단 배너로 즉시 노출.
  const loadError = eventsError ?? summaryError ?? bonusError
  const actionError = clearFlag.error ?? rejectReferral.error

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">{t('referral.title')}</h1>

      {(loadError || actionError) && (
        <div className="card border border-red-300 bg-red-50 text-red-700 text-sm">
          {loadError && (
            <div>
              <strong>{t('referral.error.loadFailed')}</strong>{' '}
              {loadError.message ?? t('common.unknownError')}
              <div className="text-xs text-red-500 mt-1">{t('referral.error.hint')}</div>
            </div>
          )}
          {actionError && (
            <div className={loadError ? 'mt-2 pt-2 border-t border-red-200' : ''}>
              <strong>{t('referral.error.actionFailed')}</strong>{' '}
              {actionError.message ?? t('common.unknownError')}
            </div>
          )}
        </div>
      )}

      {/* 요약 카드 (신정책 2026-05-07) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: t('referral.summary.total'),
            value:
              (summary?.rewarded ?? 0) +
              (summary?.pending ?? 0) +
              (summary?.reward_available ?? 0) +
              (summary?.flagged ?? 0) +
              (summary?.expired ?? 0),
            color: 'bg-white',
            tooltip: t('referral.summary.totalTooltip'),
          },
          {
            label: t('referral.summary.rewarded'),
            value: summary?.rewarded ?? 0,
            color: 'bg-green-50',
            tooltip: t('referral.summary.rewardedTooltip'),
          },
          {
            label: t('referral.summary.claimable'),
            value: (summary?.pending ?? 0) + (summary?.reward_available ?? 0),
            color: 'bg-yellow-50',
            tooltip: t('referral.summary.claimableTooltip'),
          },
          {
            label: t('referral.summary.flagged'),
            value: summary?.flagged ?? 0,
            color: 'bg-red-50',
            tooltip: t('referral.summary.flaggedTooltip'),
          },
        ].map(({ label, value, color, tooltip }) => (
          <div
            key={label}
            className={`${color} rounded-xl border border-gray-200 p-4`}
            title={tooltip}
          >
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
              ['all', t('referral.filter.all')],
              ['claimable', t('referral.filter.claimable')],
              ['rewarded', t('referral.filter.rewarded')],
              ['flagged', t('referral.filter.flagged')],
              ['expired', t('referral.filter.expired')],
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
              <span className="ml-auto text-xs text-gray-400">{t('common.totalLabel')} {total.toLocaleString()}{t('referral.countUnit')}</span>
            )}
          </div>
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">{t('referral.column.referrer')}</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">{t('referral.column.referee')}</th>
                  <th
                    className="text-right px-4 py-3 text-gray-500 font-medium"
                    title={t('referral.column.expiresTooltip')}
                  >
                    {t('referral.column.expiresIn')}
                  </th>
                  <th
                    className="text-right px-4 py-3 text-gray-500 font-medium"
                    title={t('referral.column.pushTooltip')}
                  >
                    {t('referral.column.push')}
                  </th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">{t('referral.column.bonusReferrer')}</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">{t('referral.column.bonusReferee')}</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">{t('referral.column.signupDate')}</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">{t('referral.column.status')}</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">{t('referral.column.action')}</th>
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
                        {e.referrer?.nickname || `${t('referral.userPrefix')}${e.referrer_id?.slice(0, 4)}`}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/users/${e.referee_id}`}
                        className="text-brand hover:underline text-xs"
                      >
                        {e.referee?.nickname || `${t('referral.userPrefix')}${e.referee_id?.slice(0, 4)}`}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right text-xs whitespace-nowrap">
                      {e.status === 'pending' || e.status === 'reward_available'
                        ? formatRemainHours(e.expires_at)
                        : e.status === 'rewarded' ? (
                            <span
                              className="text-gray-400"
                              title={
                                e.referrer_bonus_granted_at
                                  ? `${t('referral.claimedAt')}: ${formatJstDateTime(e.referrer_bonus_granted_at)}`
                                  : ''
                              }
                            >
                              {t('referral.done')}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs">
                      {e.referrer_notified_at ? (
                        <span
                          className="text-green-600"
                          title={`${t('referral.pushSentAt')}: ${formatJstDateTime(e.referrer_notified_at)}`}
                        >
                          ✓
                        </span>
                      ) : (
                        <span className="text-gray-300" title={t('referral.pushNotSent')}>
                          —
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs">
                      {e.referrer_bonus_granted ? (
                        <span className="text-green-600 font-medium">
                          +{e.referrer_bonus_amount ?? 0} P
                        </span>
                      ) : (
                        <span className="text-gray-400">{t('referral.notGranted')}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs">
                      {e.referee_bonus_granted ? (
                        <span className="text-green-600 font-medium">
                          +{e.referee_bonus_amount ?? 0} P
                        </span>
                      ) : (
                        <span className="text-gray-400">{t('referral.notGranted')}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400 text-xs whitespace-nowrap">
                      {formatJstDate(e.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">{statusBadge(e.status)}</td>
                    <td className="px-4 py-3 text-right">
                      {e.status === 'flagged' && (
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={() => {
                              const reason = promptReason('clear')
                              if (reason !== null) clearFlag.mutate({ id: e.id, reason })
                            }}
                            disabled={clearFlag.isPending || rejectReferral.isPending}
                            className="text-xs text-green-600 hover:underline disabled:opacity-40"
                          >
                            {t('referral.action.clear')}
                          </button>
                          <button
                            onClick={() => {
                              const reason = promptReason('reject')
                              if (reason !== null) rejectReferral.mutate({ id: e.id, reason })
                            }}
                            disabled={clearFlag.isPending || rejectReferral.isPending}
                            className="text-xs text-red-600 hover:underline disabled:opacity-40"
                          >
                            {t('referral.action.reject')}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {events.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                      {t('referral.empty')}
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
                {t('common.prev')}
              </button>
              <span>
                {page + 1} / {Math.ceil(total / REF_PAGE)} {t('common.pageUnit')}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={(page + 1) * REF_PAGE >= total}
                className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                {t('common.next')}
              </button>
            </div>
          )}
        </div>

        {/* 동반 에너지 적립 TOP */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">{t('referral.bonusTop.title')}</h2>
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
                  <div className="text-xs text-gray-400">{b.bonus_days}{t('referral.bonusTop.daysUnit')}</div>
                </div>
              </div>
            ))}
            {(bonusStats ?? []).length === 0 && (
              <div className="text-gray-400 text-sm">{t('referral.bonusTop.empty')}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
