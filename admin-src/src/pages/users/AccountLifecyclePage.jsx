import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useLanguage } from '../../contexts/LanguageContext'
import { formatJstDateTimeShort } from '../../utils/jstFormat'

const LIMITS = [50, 100, 200, 500]

function shortHash(h) {
  if (!h) return '—'
  if (h.length <= 16) return h
  return `${h.slice(0, 8)}…${h.slice(-6)}`
}

export default function AccountLifecyclePage() {
  const { t } = useLanguage()

  // 削除/凍結ログは運用記録なので JST 固定で揃える.
  const fmtDateTime = (ts) => (ts ? formatJstDateTimeShort(ts) : '—')

  const ACTION_META = {
    requested: { label: 'requested', cls: 'bg-yellow-100 text-yellow-700', desc: t('accountLifecycle.actionDesc.requested') },
    cancelled: { label: 'cancelled', cls: 'bg-blue-100 text-blue-700', desc: t('accountLifecycle.actionDesc.cancelled') },
    purged: { label: 'purged', cls: 'bg-red-100 text-red-700', desc: t('accountLifecycle.actionDesc.purged') },
  }
  // 삭제 로그 필터
  const [action, setAction] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [logLimit, setLogLimit] = useState(100)

  // 정지 해시 필터
  const [banSearch, setBanSearch] = useState('')
  const [banLimit, setBanLimit] = useState(100)

  const logArgs = {
    p_action: action || null,
    p_from: from || null,
    p_to: to || null,
    p_limit: logLimit,
  }

  const banArgs = {
    p_search: banSearch.trim() || null,
    p_limit: banLimit,
  }

  const {
    data: logs,
    isLoading: logsLoading,
    error: logsError,
  } = useQuery({
    queryKey: ['account-deletion-log', logArgs],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_account_deletion_log', logArgs)
      if (error) throw error
      return data ?? []
    },
    staleTime: 30_000,
  })

  const {
    data: hashes,
    isLoading: hashesLoading,
    error: hashesError,
  } = useQuery({
    queryKey: ['banned-user-hashes', banArgs],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_banned_user_hashes', banArgs)
      if (error) throw error
      return data ?? []
    },
    staleTime: 30_000,
  })

  // 삭제 로그 액션별 카운트
  const counts = (logs ?? []).reduce(
    (acc, r) => {
      acc[r.action] = (acc[r.action] ?? 0) + 1
      return acc
    },
    { requested: 0, cancelled: 0, purged: 0 }
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">🗑️ {t('accountLifecycle.title')}</h1>
        <p className="text-xs text-gray-500 mt-1">
          {t('accountLifecycle.subtitle')}
        </p>
      </div>

      {/* ───────────── 1. 계정 삭제 로그 ───────────── */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{t('accountLifecycle.logSectionTitle')}</h2>
          <div className="text-xs text-gray-400 flex gap-3 items-center">
            <span>
              requested <b className="text-yellow-700">{counts.requested}</b>
            </span>
            <span>
              cancelled <b className="text-blue-700">{counts.cancelled}</b>
            </span>
            <span>
              purged <b className="text-red-700">{counts.purged}</b>
            </span>
            <span className="text-[10px] text-gray-300" title={t('accountLifecycle.countLimitTooltip')}>
              {t('accountLifecycle.displayedPrefix')}{logs?.length ?? 0}{t('accountLifecycle.displayedSuffix')}
            </span>
          </div>
        </div>

        {/* 필터 */}
        <div className="card">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">action</label>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30"
              >
                <option value="">{t('accountLifecycle.filter.actionAll')}</option>
                <option value="requested">{t('accountLifecycle.filter.actionRequested')}</option>
                <option value="cancelled">{t('accountLifecycle.filter.actionCancelled')}</option>
                <option value="purged">{t('accountLifecycle.filter.actionPurged')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">from</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">to</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('accountLifecycle.filter.limitLabel')}</label>
              <select
                value={logLimit}
                onChange={(e) => setLogLimit(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30"
              >
                {LIMITS.map((n) => (
                  <option key={n} value={n}>
                    {n}{t('accountLifecycle.unit.records')}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 결과 */}
        {logsError ? (
          <div className="card text-red-600 text-sm">{t('accountLifecycle.logLoadFailed')}{logsError.message}</div>
        ) : logsLoading ? (
          <div className="card py-12 text-center text-gray-400 text-sm">{t('common.loading')}</div>
        ) : (logs ?? []).length === 0 ? (
          <div className="card py-12 text-center text-gray-400 text-sm">{t('accountLifecycle.logEmpty')}</div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <span className="text-xs text-gray-500">
                {t('accountLifecycle.totalPrefix')}{logs.length.toLocaleString()}{t('accountLifecycle.totalSuffixNewest')}
              </span>
              <span className="text-[10px] text-gray-400">
                {t('accountLifecycle.purgeNote')}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                  <tr>
                    <th className="text-left  px-4 py-3 font-medium">{t('accountLifecycle.col.time')}</th>
                    <th className="text-left  px-4 py-3 font-medium">action</th>
                    <th className="text-left  px-4 py-3 font-medium">{t('accountLifecycle.col.user')}</th>
                    <th className="text-left  px-4 py-3 font-medium">email_hash</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map((r) => {
                    const meta = ACTION_META[r.action]
                    return (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-xs text-gray-500">
                          {fmtDateTime(r.created_at)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`text-xs px-2 py-0.5 rounded font-medium ${
                              meta?.cls ?? 'bg-gray-100 text-gray-600'
                            }`}
                            title={meta?.desc}
                          >
                            {meta?.label ?? r.action}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          {/* purge 후엔 profiles row 가 사라져 상세 페이지가 404 가 된다.
                              account_deletion_log.user_id 는 FK 가 없어 그대로 살아남으므로
                              action 으로 분기해 링크를 박지 않는다. */}
                          {r.action === 'purged' || !r.user_id ? (
                            <span className="text-gray-400 italic">(purged)</span>
                          ) : (
                            <Link
                              to={`/admin/users/${r.user_id}`}
                              className="text-brand hover:underline font-medium"
                            >
                              {r.nickname ?? `user-${r.user_id.slice(0, 4)}`}
                            </Link>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-500 font-mono">
                          {shortHash(r.email_hash)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ───────────── 2. 정지된 이메일 해시 ───────────── */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{t('accountLifecycle.hashSectionTitle')}</h2>
          <span className="text-xs text-gray-400">
            {t('accountLifecycle.hashSectionNote')}
          </span>
        </div>

        {/* 필터 */}
        <div className="card">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('accountLifecycle.hashFilter.searchLabel')}</label>
              <input
                type="text"
                value={banSearch}
                onChange={(e) => setBanSearch(e.target.value)}
                placeholder={t('accountLifecycle.hashFilter.searchPlaceholder')}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('accountLifecycle.filter.limitLabel')}</label>
              <select
                value={banLimit}
                onChange={(e) => setBanLimit(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30"
              >
                {LIMITS.map((n) => (
                  <option key={n} value={n}>
                    {n}{t('accountLifecycle.unit.records')}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 결과 */}
        {hashesError ? (
          <div className="card text-red-600 text-sm">
            {t('accountLifecycle.hashLoadFailed')}{hashesError.message}
          </div>
        ) : hashesLoading ? (
          <div className="card py-12 text-center text-gray-400 text-sm">{t('common.loading')}</div>
        ) : (hashes ?? []).length === 0 ? (
          <div className="card py-12 text-center text-gray-400 text-sm">{t('accountLifecycle.hashEmpty')} ✅</div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200">
              <span className="text-xs text-gray-500">
                {t('accountLifecycle.totalPrefix')}{hashes.length.toLocaleString()}{t('accountLifecycle.totalSuffixNewestBan')}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                  <tr>
                    <th className="text-left  px-4 py-3 font-medium">{t('accountLifecycle.col.banTime')}</th>
                    <th className="text-left  px-4 py-3 font-medium">email_hash</th>
                    <th className="text-left  px-4 py-3 font-medium">{t('accountLifecycle.col.reason')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {hashes.map((h) => (
                    <tr key={h.email_hash} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-xs text-gray-500">{fmtDateTime(h.banned_at)}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-700 font-mono">
                        <span title={h.email_hash}>{shortHash(h.email_hash)}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-700">
                        {h.banned_reason || <span className="text-gray-400 italic">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
