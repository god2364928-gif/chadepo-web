import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { formatInt, formatPct } from '../../utils/jstFormat'

// fill_rate 색상 기준 — ad_format 별로 다름:
//   interstitial / rewarded → 100% 가 이상, <80% 노랑, <50% 빨강
//   banner / mrec           → auto-refresh 로 100% 초과 정상, 색상 미적용
function fillRateColor(format, rate) {
  if (rate == null) return 'text-gray-400'
  if (format === 'banner' || format === 'mrec') return 'text-gray-700'
  const v = Number(rate)
  if (v < 50) return 'text-red-600 font-medium'
  if (v < 80) return 'text-yellow-600 font-medium'
  return 'text-green-600'
}

// success_rate (loaded / loaded+failed) — 모든 포맷 공통:
//   95% 미만 노랑, 80% 미만 빨강
function successRateColor(rate) {
  if (rate == null) return 'text-gray-400'
  const v = Number(rate)
  if (v < 80) return 'text-red-600 font-medium'
  if (v < 95) return 'text-yellow-600 font-medium'
  return 'text-green-600'
}

// display_rate — 80% 미만 노랑, 50% 미만 빨강 (UX/타이밍 문제 추정)
function displayRateColor(rate) {
  if (rate == null) return 'text-gray-400'
  const v = Number(rate)
  if (v < 50) return 'text-red-600 font-medium'
  if (v < 80) return 'text-yellow-600 font-medium'
  return 'text-green-600'
}

const FORMAT_ORDER = ['rewarded', 'interstitial', 'mrec', 'banner']

export default function AdLoadHealthTable({ period, refreshKey }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['ad_load_health', period, refreshKey],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_ad_load_health', {
        p_period: period,
      })
      if (error) throw error
      return data ?? []
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  const rows = (data ?? []).slice().sort((a, b) => {
    const ai = FORMAT_ORDER.indexOf(a.ad_format)
    const bi = FORMAT_ORDER.indexOf(b.ad_format)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })

  return (
    <div className="card p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200">
        <h2 className="font-semibold text-gray-900 text-sm">SDK 건강도</h2>
      </div>
      {error ? (
        <div className="px-4 py-6 text-center">
          <p className="text-red-700 text-sm mb-2">불러오기 실패: {error.message}</p>
          <button
            onClick={() => refetch()}
            className="text-xs px-3 py-1 bg-white border border-red-300 text-red-700 rounded hover:bg-red-50"
          >
            다시 시도
          </button>
        </div>
      ) : isLoading ? (
        <div className="py-12 text-center text-gray-400 text-sm">불러오는 중...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
              <tr>
                <th className="text-left  px-4 py-3 font-medium">포맷</th>
                <th className="text-right px-4 py-3 font-medium">요청</th>
                <th className="text-right px-4 py-3 font-medium">로드</th>
                <th className="text-right px-4 py-3 font-medium">실패</th>
                <th className="text-right px-4 py-3 font-medium">표시</th>
                <th
                  className="text-right px-4 py-3 font-medium"
                  title="요청 대비 로드 성공률. Banner/MREC 는 auto-refresh 로 100% 초과 가능."
                >
                  fill_rate <span className="text-gray-300">ⓘ</span>
                </th>
                <th
                  className="text-right px-4 py-3 font-medium"
                  title="로드 요청 중 성공 비율. 95% 미만은 광고 SDK 또는 재고 문제."
                >
                  success_rate <span className="text-gray-300">ⓘ</span>
                </th>
                <th
                  className="text-right px-4 py-3 font-medium"
                  title="로드된 광고가 실제 표시된 비율. 80% 미만은 UX/타이밍 문제."
                >
                  display_rate <span className="text-gray-300">ⓘ</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.ad_format} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">
                      {r.ad_format}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-700">{formatInt(r.requested)}</td>
                  <td className="px-4 py-2.5 text-right text-gray-700">{formatInt(r.loaded)}</td>
                  <td
                    className={`px-4 py-2.5 text-right ${Number(r.load_failed) > 0 ? 'text-orange-500' : 'text-gray-400'}`}
                  >
                    {formatInt(r.load_failed)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-700">{formatInt(r.displayed)}</td>
                  <td
                    className={`px-4 py-2.5 text-right ${fillRateColor(r.ad_format, r.fill_rate)}`}
                  >
                    {formatPct(r.fill_rate)}
                  </td>
                  <td className={`px-4 py-2.5 text-right ${successRateColor(r.success_rate)}`}>
                    {formatPct(r.success_rate)}
                  </td>
                  <td className={`px-4 py-2.5 text-right ${displayRateColor(r.display_rate)}`}>
                    {formatPct(r.display_rate)}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-xs">
                    데이터가 없습니다
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="px-4 py-2.5 border-t border-gray-100 text-[11px] text-gray-400 bg-gray-50">
            ※ Banner / MREC 는 auto-refresh (30~60초) 특성상 1 요청에서 다수 로드 이벤트가
            발생합니다. fill_rate 100% 초과는 정상.
          </div>
        </div>
      )}
    </div>
  )
}
