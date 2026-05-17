import { useQuery } from '@tanstack/react-query'
import { useLanguage } from '../../contexts/LanguageContext'
import { supabase } from '../../lib/supabase'
import { formatInt, formatUsd, formatPct } from '../../utils/jstFormat'

export default function AdSummaryCards({ period, refreshKey }) {
  const { t } = useLanguage()
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['ad_summary', period, refreshKey],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_ad_summary', {
        p_period: period,
      })
      if (error) throw error
      return Array.isArray(data) && data.length > 0 ? data[0] : null
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  if (error) {
    return (
      <div className="card border-red-200 bg-red-50">
        <p className="text-sm text-red-700 mb-2">
          {t('ads.summary.loadError')}: {error.message}
        </p>
        <button
          onClick={() => refetch()}
          className="text-xs px-3 py-1 bg-white border border-red-300 text-red-700 rounded hover:bg-red-100"
        >
          {t('common.retry')}
        </button>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card animate-pulse">
            <div className="h-3 w-12 bg-gray-200 rounded mb-3" />
            <div className="h-7 w-20 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    )
  }

  const failureRateColor = (rate) => {
    if (rate == null) return 'text-gray-400'
    const v = Number(rate)
    if (v >= 20) return 'text-red-600'
    if (v >= 5) return 'text-orange-500'
    return 'text-green-600'
  }

  const cards = [
    { label: t('ads.summary.impressions'), value: formatInt(data?.total_impressions), color: 'text-gray-900' },
    { label: t('ads.summary.clicks'), value: formatInt(data?.total_clicks), color: 'text-gray-900' },
    { label: t('ads.summary.revenue'), value: formatUsd(data?.total_revenue_usd), color: 'text-blue-600' },
    { label: t('ads.summary.rewarded'), value: formatInt(data?.total_rewarded), color: 'text-purple-600' },
    { label: t('ads.summary.loadFailed'), value: formatInt(data?.total_load_failed), color: 'text-gray-700' },
    {
      label: t('ads.summary.failureRate'),
      value: formatPct(data?.load_failure_rate),
      color: failureRateColor(data?.load_failure_rate),
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((c, i) => (
        <div key={i} className="card text-center">
          <p className="text-xs text-gray-500 mb-1">{c.label}</p>
          <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
        </div>
      ))}
    </div>
  )
}
