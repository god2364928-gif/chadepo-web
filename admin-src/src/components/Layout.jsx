import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const nav = [
  { to: '/admin',          label: 'ダッシュボード',   icon: '📊', exact: true },
  { to: '/admin/users',    label: 'ユーザー管理',     icon: '👤' },
  { to: '/admin/exchange', label: '交換管理',         icon: '🎁' },
  { to: '/admin/raffle',   label: '応募・抽選',       icon: '🎰' },
  { to: '/admin/fraud',    label: '不正利用検知',     icon: '🚨' },
  { to: '/admin/missions', label: 'ゲーム・ミッション', icon: '🎮' },
  { to: '/admin/referral', label: '紹介プログラム',   icon: '🔗' },
  { to: '/admin/inquiry', label: 'お問い合わせ管理',  icon: '💬' },
  { to: '/admin/ads',     label: '広告分析',         icon: '📺' },
]

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/admin/login')
  }

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* 사이드바 */}
      <aside className="w-60 bg-sidebar flex flex-col flex-shrink-0">
        <div className="px-6 py-5 border-b border-gray-700">
          <div className="text-brand font-bold text-lg">チャデポ</div>
          <div className="text-gray-400 text-xs mt-0.5">管理画面</div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {nav.map(({ to, label, icon, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-brand text-white font-medium'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`
              }
            >
              <span className="text-base">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-gray-700">
          <div className="text-gray-400 text-xs truncate mb-2">{user?.email}</div>
          <button onClick={handleLogout} className="text-gray-400 hover:text-white text-xs transition-colors">
            ログアウト
          </button>
        </div>
      </aside>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
