import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { Link } from 'react-router-dom'
import { useLanguage } from '../contexts/LanguageContext'
import { formatJstDate } from '../utils/jstFormat'

function StatCard({ label, value, sub, color = 'gray', to }) {
  const colors = {
    gray: 'border-gray-200 bg-white',
    orange: 'border-brand bg-orange-50',
    red: 'border-red-400 bg-red-50',
    green: 'border-green-400 bg-green-50',
    blue: 'border-blue-400 bg-blue-50',
  }
  const card = (
    <div className={`rounded-xl border-l-4 p-5 shadow-sm ${colors[color]}`}>
      <div className="text-2xl font-bold text-gray-900">{value ?? '—'}</div>
      <div className="text-sm text-gray-600 mt-1">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
  return to ? <Link to={to}>{card}</Link> : card
}

function RecentUserBadge({ user, t }) {
  // 대시보드는 단일 배지로 단순화 (UserList 는 banned/flagged/deleted 를 동시에 복수 배지로 표시).
  // 우선순위: banned > deleted_at > flagged > normal — "위험 신호" 가 강한 순.
  if (user.is_banned) {
    return <span className="badge-red">{t('dashboard.status.banned')}</span>
  }
  if (user.deleted_at) {
    return <span className="badge-red">{t('dashboard.status.deleted')}</span>
  }
  if (user.is_flagged) {
    return <span className="badge-red">{t('dashboard.status.flagged')}</span>
  }
  return <span className="badge-green">{t('dashboard.status.normal')}</span>
}

export default function Dashboard() {
  const { lang, t } = useLanguage()
  const {
    data: stats,
    isLoading,
    error: statsError,
  } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_dashboard_stats')
      if (error) throw error
      return data
    },
  })

  const { data: recentUsers, error: recentUsersError } = useQuery({
    queryKey: ['recent-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'id, nickname, created_at, points, energy, is_flagged, is_banned, deleted_at, scheduled_deletion_at'
        )
        .order('created_at', { ascending: false })
        .limit(8)
      if (error) throw error
      return data ?? []
    },
  })

  const { data: pendingExchanges, error: pendingExchangesError } = useQuery({
    queryKey: ['pending-exchanges'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exchange_requests')
        .select(
          'id, points_spent, status, created_at, user_id, profiles!user_id(nickname), exchange_items!item_id(title_ja)'
        )
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5)
      if (error) throw error
      return data ?? []
    },
  })

  if (isLoading) return <div className="text-gray-400 text-sm">{t('common.loading')}</div>

  // ヘッダ「今日:」は曜日付きで運用 OS ではなく JST 暦の今日を表示.
  const localeTag = lang === 'ko' ? 'ko-KR' : 'ja-JP'
  const today = new Date().toLocaleDateString(localeTag, {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  })

  const loadError = statsError || recentUsersError || pendingExchangesError

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('dashboard.title')}</h1>
        <p className="text-gray-500 text-sm mt-1">{today}</p>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {t('dashboard.error.loadFailed')}
          {loadError?.message ? <span className="ml-2 text-red-500">({loadError.message})</span> : null}
        </div>
      )}

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label={t('dashboard.stat.totalUsers')}
          value={stats?.total_users?.toLocaleString()}
          color="gray"
          to="/admin/users"
        />
        <StatCard
          label={t('dashboard.stat.todaySignups')}
          value={stats?.today_signups}
          color="blue"
          to="/admin/users"
        />
        <StatCard
          label={t('dashboard.stat.pendingExchanges')}
          value={stats?.pending_exchanges}
          color={stats?.pending_exchanges > 0 ? 'orange' : 'gray'}
          to="/admin/exchange"
          sub={t('dashboard.stat.pendingExchanges.sub')}
        />
        <StatCard
          label={t('dashboard.stat.flaggedUsers')}
          value={stats?.flagged_users}
          color={stats?.flagged_users > 0 ? 'red' : 'gray'}
          to="/admin/fraud"
          sub={t('dashboard.stat.flaggedUsers.sub')}
        />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label={t('dashboard.stat.todayPoints')}
          value={`${(stats?.today_points_issued ?? 0).toLocaleString()} P`}
          color="green"
        />
        <StatCard
          label={t('dashboard.stat.todayEnergy')}
          value={`${(stats?.today_energy_issued ?? 0).toLocaleString()} E`}
          color="green"
        />
        <StatCard
          label={t('dashboard.stat.activeRaffles')}
          value={stats?.active_raffle_rounds}
          color="blue"
          to="/admin/raffle"
        />
      </div>

      {/* 운영 큐 (처리 필요) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label={t('dashboard.stat.inquiriesPending')}
          value={stats?.inquiries_pending}
          color={stats?.inquiries_pending > 0 ? 'orange' : 'gray'}
          to="/admin/inquiry"
          sub={t('dashboard.stat.opsQueue.sub')}
        />
        <StatCard
          label={t('dashboard.stat.referralFlagged')}
          value={stats?.referral_flagged}
          color={stats?.referral_flagged > 0 ? 'red' : 'gray'}
          to="/admin/referral"
          sub={t('dashboard.stat.opsQueue.sub')}
        />
        <StatCard
          label={t('dashboard.stat.campaignsFailed')}
          value={stats?.campaigns_failed}
          color={stats?.campaigns_failed > 0 ? 'red' : 'gray'}
          to="/admin/campaigns"
          sub={t('dashboard.stat.opsQueue.sub')}
        />
        <StatCard
          label={t('dashboard.stat.deletionRequested')}
          value={stats?.deletion_requested_users}
          color={stats?.deletion_requested_users > 0 ? 'orange' : 'gray'}
          to="/admin/users"
          sub={t('dashboard.stat.opsQueue.sub')}
        />
      </div>

      {/* 최근 가입자 */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">{t('dashboard.recent.title')}</h2>
          <Link to="/admin/users" className="text-brand text-sm hover:underline">
            {t('common.viewAll')}
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 text-gray-500 font-medium">
                  {t('dashboard.recent.col.nickname')}
                </th>
                <th className="text-right py-2 text-gray-500 font-medium">
                  {t('dashboard.recent.col.points')}
                </th>
                <th className="text-right py-2 text-gray-500 font-medium">
                  {t('dashboard.recent.col.energy')}
                </th>
                <th className="text-right py-2 text-gray-500 font-medium">
                  {t('dashboard.recent.col.joinedAt')}
                </th>
                <th className="text-right py-2 text-gray-500 font-medium">
                  {t('dashboard.recent.col.status')}
                </th>
              </tr>
            </thead>
            <tbody>
              {(recentUsers ?? []).map((u) => (
                <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2.5">
                    <Link
                      to={`/admin/users/${u.id}`}
                      className="text-brand hover:underline font-medium"
                    >
                      {u.nickname || `ユーザー${u.id.slice(0, 4)}`}
                    </Link>
                  </td>
                  <td className="py-2.5 text-right text-gray-700">
                    {u.points?.toLocaleString()} P
                  </td>
                  <td className="py-2.5 text-right text-gray-700">
                    {u.energy?.toLocaleString()} E
                  </td>
                  <td className="py-2.5 text-right text-gray-400">
                    {formatJstDate(u.created_at)}
                  </td>
                  <td className="py-2.5 text-right">
                    <RecentUserBadge user={u} t={t} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 교환 대기 목록 */}
      {pendingExchanges && pendingExchanges.length > 0 && (
        <div className="card border-l-4 border-brand">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">
              {t('dashboard.pendingExchange.title')}
            </h2>
            <Link to="/admin/exchange" className="text-brand text-sm hover:underline">
              {t('common.processAll')}
            </Link>
          </div>
          <div className="space-y-2">
            {pendingExchanges.map((ex) => (
              <div
                key={ex.id}
                className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
              >
                <div>
                  <span className="font-medium text-sm">
                    {ex.profiles?.nickname || `ユーザー${ex.user_id?.slice(0, 4)}`}
                  </span>
                  <span className="text-gray-400 text-xs ml-2">{ex.exchange_items?.title_ja}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-700">
                    {ex.points_spent?.toLocaleString()} P
                  </span>
                  <span className="badge-yellow">{t('dashboard.pendingExchange.badge')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
