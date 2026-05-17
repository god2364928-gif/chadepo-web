import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const nav = [
  { to: '/admin', label: '대시보드', icon: '📊', exact: true },
  { to: '/admin/users', label: '사용자 관리', icon: '👤' },
  { to: '/admin/account-lifecycle', label: '계정 정지/삭제', icon: '🗑️' },
  { to: '/admin/exchange', label: '교환 관리', icon: '🎁' },
  { to: '/admin/raffle', label: '응모/추첨', icon: '🎰' },
  { to: '/admin/fraud', label: '부정 이용 탐지', icon: '🚨' },
  { to: '/admin/missions', label: '게임/미션', icon: '🎮' },
  { to: '/admin/dart', label: 'ダーツ', icon: '🎯' },
  { to: '/admin/referral', label: '추천 프로그램', icon: '🔗' },
  { to: '/admin/inquiry', label: '문의 관리', icon: '💬' },
  { to: '/admin/ads', label: '광고 분석', icon: '📺' },
  { to: '/admin/campaigns', label: '푸시 캠페인', icon: '📣' },
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
          <div className="text-brand font-bold text-lg">차데포</div>
          <div className="text-gray-400 text-xs mt-0.5">관리 화면</div>
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
          <button
            onClick={handleLogout}
            className="text-gray-400 hover:text-white text-xs transition-colors"
          >
            로그아웃
          </button>
        </div>
      </aside>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-8">{children}</div>
      </main>
    </div>
  )
}
