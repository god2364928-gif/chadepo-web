import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useLanguage } from '../../contexts/LanguageContext'
import { formatJstMonthDayTime } from '../../utils/jstFormat'

const LIMITS = [50, 100, 200]

const AREA_LABELS = {
  outer: 'outer',
  middle: 'middle',
  inner: 'inner',
  triple: 'triple',
  bullseye: 'bullseye',
  mega_jackpot: 'MEGA',
}

const AREA_COLORS = {
  outer: 'text-gray-500',
  middle: 'text-blue-600',
  inner: 'text-indigo-600',
  triple: 'text-purple-600',
  bullseye: 'text-orange-500 font-semibold',
  mega_jackpot: 'text-red-600 font-bold',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// 投擲ログは月-日 時:分 を JST 固定で表示.
function fmtDateTime(ts) {
  return ts ? formatJstMonthDayTime(ts) : '—'
}

export default function DartThrowsPage() {
  const { t } = useLanguage()
  const [userInput, setUserInput] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [tier, setTier] = useState('')
  const [jackpotOnly, setJackpotOnly] = useState(false)
  const [limit, setLimit] = useState(100)

  const trimmedUser = userInput.trim()
  const isUuid = UUID_RE.test(trimmedUser)

  const queryArgs = {
    p_user_id: isUuid ? trimmedUser : null,
    p_nickname: !isUuid && trimmedUser ? trimmedUser : null,
    p_from: from || null,
    p_to: to || null,
    p_tier: tier ? Number(tier) : null,
    p_jackpot_only: jackpotOnly,
    p_limit: limit,
  }

  const {
    data: rows,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['dart-throws', queryArgs],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_dart_throws', queryArgs)
      if (error) throw error
      return data ?? []
    },
    staleTime: 30_000,
  })

  if (error) {
    return (
      <div className="card text-red-600 text-sm">
        {t('dart.fetchFail')}: {error.message}
      </div>
    )
  }

  const jackpotCount = (rows ?? []).filter((r) => r.is_jackpot).length

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">🎯 {t('dart.title')}</h1>
        <p className="text-xs text-gray-500 mt-1">
          {t('dart.subtitle')}
        </p>
      </div>

      {/* 필터 */}
      <div className="card space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t('dart.filter.user')}</label>
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder={t('dart.filter.userPlaceholder')}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
            {trimmedUser && (
              <div className="text-[10px] text-gray-400 mt-1">
                {isUuid ? t('dart.filter.uuidMatch') : t('dart.filter.nicknamePartial')}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
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
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">tier</label>
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30"
            >
              <option value="">{t('common.all')}</option>
              <option value="1">{t('dart.tier.first')}</option>
              <option value="2">{t('dart.tier.second')}</option>
            </select>
          </div>
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                checked={jackpotOnly}
                onChange={(e) => setJackpotOnly(e.target.checked)}
                className="rounded"
              />
              {t('dart.filter.jackpotOnly')}
            </label>
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">{t('common.displayCount')}</label>
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30"
              >
                {LIMITS.map((n) => (
                  <option key={n} value={n}>
                    {n}{t('common.casesUnit')}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* 결과 */}
      {isLoading ? (
        <div className="card py-12 text-center text-gray-400 text-sm">{t('common.loading')}</div>
      ) : (rows ?? []).length === 0 ? (
        <div className="card py-12 text-center text-gray-400 text-sm">{t('dart.noMatches')}</div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-sm">
              {t('dart.logTitle')}
              <span className="ml-2 text-xs text-gray-400 font-normal">
                {t('common.totalPrefix')} {rows.length.toLocaleString()}{t('common.casesUnit')}
                {jackpotCount > 0 && (
                  <span className="ml-2 text-orange-500">
                    ({t('dart.jackpot')} {jackpotCount}{t('common.casesUnit')})
                  </span>
                )}
              </span>
            </h2>
            <span className="text-[10px] text-gray-400">
              ※ {t('dart.logNote')}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                <tr>
                  <th className="text-left  px-4 py-3 font-medium">{t('dart.col.time')}</th>
                  <th className="text-left  px-4 py-3 font-medium">{t('dart.col.throwDate')}</th>
                  <th className="text-left  px-4 py-3 font-medium">{t('dart.col.user')}</th>
                  <th className="text-center px-4 py-3 font-medium">tier</th>
                  <th className="text-left  px-4 py-3 font-medium">area</th>
                  <th className="text-right px-4 py-3 font-medium">{t('dart.col.earnedPoints')}</th>
                  <th className="text-center px-4 py-3 font-medium">{t('dart.jackpot')}</th>
                  <th className="text-right px-4 py-3 font-medium">{t('dart.col.reroll')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className={`hover:bg-gray-50 ${r.is_jackpot ? 'bg-orange-50/40' : ''}`}
                  >
                    <td className="px-4 py-2.5 text-xs text-gray-500">{fmtDateTime(r.created_at)}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{r.throw_date}</td>
                    <td className="px-4 py-2.5">
                      <Link
                        to={`/admin/users/${r.user_id}`}
                        className="text-brand hover:underline font-medium text-xs"
                      >
                        {r.nickname}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-center text-xs text-gray-700">
                      {r.challenge_tier === 1 ? t('dart.tierShort.first') : t('dart.tierShort.second')}
                    </td>
                    <td className={`px-4 py-2.5 text-xs ${AREA_COLORS[r.area] ?? 'text-gray-700'}`}>
                      {AREA_LABELS[r.area] ?? r.area}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs font-medium text-gray-800">
                      {Number(r.final_points).toLocaleString()}P
                      {r.base_points !== r.final_points && (
                        <span className="ml-1 text-[10px] text-gray-400">
                          (base {r.base_points})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center text-xs">
                      {r.is_jackpot ? (
                        <span className="text-red-600 font-bold">🎉</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-gray-500">
                      {r.reroll_count > 0 ? `${r.reroll_count}${t('common.timesUnit')}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-gray-100 text-[10px] text-gray-400 flex gap-4">
            <span>● {t('dart.footnoteJackpot')}</span>
            <span>● {t('dart.footnoteArea')}</span>
          </div>
        </div>
      )}
    </div>
  )
}
