import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { Link } from 'react-router-dom'

function StatCard({ label, value, sub, color = 'gray', to }) {
  const colors = {
    gray:   'border-gray-200 bg-white',
    orange: 'border-brand bg-orange-50',
    red:    'border-red-400 bg-red-50',
    green:  'border-green-400 bg-green-50',
    blue:   'border-blue-400 bg-blue-50',
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

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_dashboard_stats')
      if (error) throw error
      return data
    },
  })

  const { data: recentUsers } = useQuery({
    queryKey: ['recent-users'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, nickname, created_at, points, energy, is_flagged')
        .order('created_at', { ascending: false })
        .limit(8)
      return data ?? []
    },
  })

  const { data: pendingExchanges } = useQuery({
    queryKey: ['pending-exchanges'],
    queryFn: async () => {
      const { data } = await supabase
        .from('exchange_requests')
        .select('id, points_spent, status, created_at, user_id, profiles!user_id(nickname), exchange_items!item_id(title_ja)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5)
      return data ?? []
    },
  })

  if (isLoading) return <div className="text-gray-400 text-sm">読み込み中...</div>

  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
        <p className="text-gray-500 text-sm mt-1">{today}</p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="전체 가입자" value={stats?.total_users?.toLocaleString()} color="gray" to="/admin/users" />
        <StatCard label="오늘 신규 가입" value={stats?.today_signups} color="blue" to="/admin/users" />
        <StatCard label="교환 대기 중" value={stats?.pending_exchanges} color={stats?.pending_exchanges > 0 ? 'orange' : 'gray'} to="/admin/exchange" sub="처리 필요" />
        <StatCard label="의심 유저" value={stats?.flagged_users} color={stats?.flagged_users > 0 ? 'red' : 'gray'} to="/admin/fraud" sub="확인 필요" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="오늘 포인트 발행" value={`${(stats?.today_points_issued ?? 0).toLocaleString()} P`} color="green" />
        <StatCard label="오늘 에너지 발행" value={`${(stats?.today_energy_issued ?? 0).toLocaleString()} E`} color="green" />
        <StatCard label="진행 중 응모 라운드" value={stats?.active_raffle_rounds} color="blue" to="/admin/raffle" />
      </div>

      {/* 최근 가입자 */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">최근 가입자</h2>
          <Link to="/admin/users" className="text-brand text-sm hover:underline">전체 보기 →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 text-gray-500 font-medium">닉네임</th>
                <th className="text-right py-2 text-gray-500 font-medium">포인트</th>
                <th className="text-right py-2 text-gray-500 font-medium">에너지</th>
                <th className="text-right py-2 text-gray-500 font-medium">가입일</th>
                <th className="text-right py-2 text-gray-500 font-medium">상태</th>
              </tr>
            </thead>
            <tbody>
              {(recentUsers ?? []).map(u => (
                <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2.5">
                    <Link to={`/admin/users/${u.id}`} className="text-brand hover:underline font-medium">
                      {u.nickname || `ユーザー${u.id.slice(0, 4)}`}
                    </Link>
                  </td>
                  <td className="py-2.5 text-right text-gray-700">{u.points?.toLocaleString()} P</td>
                  <td className="py-2.5 text-right text-gray-700">{u.energy?.toLocaleString()} E</td>
                  <td className="py-2.5 text-right text-gray-400">{new Date(u.created_at).toLocaleDateString('ko-KR')}</td>
                  <td className="py-2.5 text-right">
                    {u.is_flagged
                      ? <span className="badge-red">의심</span>
                      : <span className="badge-green">정상</span>}
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
            <h2 className="font-semibold text-gray-900">⚠️ 처리 대기 교환 신청</h2>
            <Link to="/admin/exchange" className="text-brand text-sm hover:underline">모두 처리 →</Link>
          </div>
          <div className="space-y-2">
            {pendingExchanges.map(ex => (
              <div key={ex.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <span className="font-medium text-sm">{ex.profiles?.nickname || `ユーザー${ex.user_id?.slice(0, 4)}`}</span>
                  <span className="text-gray-400 text-xs ml-2">{ex.exchange_items?.title_ja}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-700">{ex.points_spent?.toLocaleString()} P</span>
                  <span className="badge-yellow">대기</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
