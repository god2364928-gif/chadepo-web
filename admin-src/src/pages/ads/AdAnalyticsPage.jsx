import { useState } from 'react'
import PeriodSelector from '../../components/ad-analytics/PeriodSelector'
import AdFormatFilter from '../../components/ad-analytics/AdFormatFilter'
import AdSummaryCards from '../../components/ad-analytics/AdSummaryCards'
import AdRevenueTrendChart from '../../components/ad-analytics/AdRevenueTrendChart'
import AdScreenPerformanceTable from '../../components/ad-analytics/AdScreenPerformanceTable'
import AdLoadHealthTable from '../../components/ad-analytics/AdLoadHealthTable'
import AdHeavyUsersTable from '../../components/ad-analytics/AdHeavyUsersTable'
import AdRealtimeTable from '../../components/ad-analytics/AdRealtimeTable'

const TABS = [
  { id: 'aggregate', label: '📊 집계' },
  { id: 'realtime',  label: '⚡ 실시간' },
]

export default function AdAnalyticsPage() {
  const [tab, setTab] = useState('aggregate')
  const [period, setPeriod] = useState('7d')
  const [adFormat, setAdFormat] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">📺 광고 분석</h1>
          <p className="text-xs text-gray-500 mt-1">JST (Asia/Tokyo) 기준</p>
        </div>
      </div>

      {/* 탭 */}
      <div className="border-b border-gray-200 flex items-center gap-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm border-b-2 transition-colors -mb-px ${
              tab === t.id
                ? 'border-brand text-brand font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >{t.label}</button>
        ))}
      </div>

      {tab === 'aggregate' ? (
        <>
          {/* 집계 탭 컨트롤 */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center flex-wrap gap-4">
              <PeriodSelector value={period} onChange={setPeriod} />
              <AdFormatFilter value={adFormat} onChange={setAdFormat} />
            </div>
            <button
              onClick={() => setRefreshKey(k => k + 1)}
              className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            >
              🔄 새로고침
            </button>
          </div>

          <AdSummaryCards period={period} refreshKey={refreshKey} />
          <AdRevenueTrendChart period={period} adFormat={adFormat} refreshKey={refreshKey} />
          <AdScreenPerformanceTable period={period} adFormat={adFormat} refreshKey={refreshKey} />
          <AdLoadHealthTable period={period} refreshKey={refreshKey} />
          <AdHeavyUsersTable refreshKey={refreshKey} />
        </>
      ) : (
        <AdRealtimeTable refreshKey={refreshKey} />
      )}
    </div>
  )
}
