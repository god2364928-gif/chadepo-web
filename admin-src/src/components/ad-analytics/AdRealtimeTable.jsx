import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useLanguage } from '../../contexts/LanguageContext'
import { supabase } from '../../lib/supabase'
import { formatJstDateTime, formatUsd } from '../../utils/jstFormat'

const EVENT_STYLES = {
  requested: { cls: 'bg-gray-100 text-gray-600' },
  loaded: { cls: 'bg-blue-50 text-blue-700' },
  load_failed: { cls: 'bg-red-50 text-red-700' },
  displayed: { cls: 'bg-indigo-50 text-indigo-700' },
  clicked: { cls: 'bg-purple-50 text-purple-700' },
  hidden: { cls: 'bg-gray-100 text-gray-500' },
  rewarded: { cls: 'bg-yellow-50 text-yellow-700 font-medium' },
  display_failed: { cls: 'bg-red-50 text-red-700' },
  revenue_paid: { cls: 'bg-green-50 text-green-700 font-medium' },
}

export default function AdRealtimeTable({ refreshKey: parentRefreshKey }) {
  const { t } = useLanguage()
  const [minutes, setMinutes] = useState(60)
  const [localRefreshKey, setLocalRefreshKey] = useState(0)
  const refreshKey = `${parentRefreshKey}_${localRefreshKey}`

  const PRESETS = [
    { id: 5, label: t('ads.realtime.preset.5m') },
    { id: 15, label: t('ads.realtime.preset.15m') },
    { id: 60, label: t('ads.realtime.preset.1h') },
    { id: 360, label: t('ads.realtime.preset.6h') },
    { id: 1440, label: t('ads.realtime.preset.24h') },
  ]

  const EVENT_LABEL_KEYS = {
    requested: t('ads.realtime.event.requested'),
    loaded: t('ads.realtime.event.loaded'),
    load_failed: t('ads.realtime.event.loadFailed'),
    displayed: t('ads.realtime.event.displayed'),
    clicked: t('ads.realtime.event.clicked'),
    hidden: t('ads.realtime.event.hidden'),
    rewarded: t('ads.realtime.event.rewarded'),
    display_failed: t('ads.realtime.event.displayFailed'),
    revenue_paid: t('ads.realtime.event.revenuePaid'),
  }

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['ad_realtime', minutes, refreshKey],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_ad_realtime', {
        p_minutes: minutes,
      })
      if (error) throw error
      return data ?? []
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })

  return (
    <div className="space-y-4">
      {/* 컨트롤 행 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{t('ads.realtime.recent')}</span>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => setMinutes(p.id)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                minutes === p.id
                  ? 'bg-brand text-white border-brand font-medium'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            setLocalRefreshKey((k) => k + 1)
            refetch()
          }}
          disabled={isFetching}
          className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          🔄 {isFetching ? t('common.loading') : t('common.refresh')}
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 text-sm">{t('ads.realtime.title')}</h2>
          <span className="text-xs text-gray-400">{t('ads.realtime.subtitle')}</span>
        </div>
        {error ? (
          <div className="px-4 py-6 text-center">
            <p className="text-red-700 text-sm mb-2">{t('common.loadFailed')}: {error.message}</p>
            <button
              onClick={() => refetch()}
              className="text-xs px-3 py-1 bg-white border border-red-300 text-red-700 rounded hover:bg-red-50"
            >
              {t('common.retry')}
            </button>
          </div>
        ) : isLoading ? (
          <div className="py-12 text-center text-gray-400 text-sm">{t('common.loading')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                <tr>
                  <th className="text-left  px-4 py-3 font-medium">{t('ads.realtime.col.time')}</th>
                  <th className="text-left  px-4 py-3 font-medium">{t('ads.realtime.col.user')}</th>
                  <th className="text-left  px-4 py-3 font-medium">{t('ads.realtime.col.type')}</th>
                  <th className="text-left  px-4 py-3 font-medium">{t('ads.realtime.col.format')}</th>
                  <th className="text-left  px-4 py-3 font-medium">{t('ads.realtime.col.screen')}</th>
                  <th className="text-left  px-4 py-3 font-medium">{t('ads.realtime.col.network')}</th>
                  <th className="text-right px-4 py-3 font-medium">{t('ads.realtime.col.revenue')}</th>
                  <th className="text-left  px-4 py-3 font-medium">{t('ads.realtime.col.error')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(data ?? []).map((r, i) => {
                  const e = EVENT_STYLES[r.event_type] ?? {
                    cls: 'bg-gray-100 text-gray-700',
                  }
                  const eventLabel = EVENT_LABEL_KEYS[r.event_type] ?? r.event_type
                  const isError =
                    r.event_type === 'load_failed' ||
                    r.event_type === 'display_failed' ||
                    r.error_code != null
                  const isRevenue = r.event_type === 'revenue_paid'
                  const rowCls = isError
                    ? 'hover:bg-red-50 bg-red-50/40'
                    : isRevenue
                      ? 'hover:bg-green-50 bg-green-50/40'
                      : 'hover:bg-gray-50'
                  return (
                    <tr key={i} className={rowCls}>
                      <td className="px-4 py-2 text-xs text-gray-600 whitespace-nowrap">
                        {formatJstDateTime(r.created_at)}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {r.user_id ? (
                          <Link
                            to={`/admin/users/${r.user_id}`}
                            className="text-brand hover:underline"
                            title={r.user_id}
                          >
                            {r.nickname ?? '—'}
                          </Link>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`text-[11px] px-1.5 py-0.5 rounded ${e.cls}`}>{eventLabel}</span>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-700">
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
                          {r.ad_format}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-600">{r.screen_context}</td>
                      <td className="px-4 py-2 text-xs text-gray-500">{r.ad_network}</td>
                      <td className="px-4 py-2 text-right text-xs">
                        {r.revenue_usd != null ? (
                          <span className="text-blue-600 font-medium">
                            {formatUsd(r.revenue_usd)}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {r.error_code != null ? (
                          <span className="text-red-600">
                            [{r.error_code}] {r.error_message ?? ''}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {(!data || data.length === 0) && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-xs">
                      {t('ads.realtime.noEvents')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
