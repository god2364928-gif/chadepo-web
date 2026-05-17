import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'

const nav = [
  { to: '/admin', labelKey: 'nav.dashboard', icon: '📊', exact: true },
  { to: '/admin/users', labelKey: 'nav.users', icon: '👤' },
  { to: '/admin/account-lifecycle', labelKey: 'nav.accountLifecycle', icon: '🗑️' },
  { to: '/admin/exchange', labelKey: 'nav.exchange', icon: '🎁' },
  { to: '/admin/raffle', labelKey: 'nav.raffle', icon: '🎰' },
  { to: '/admin/fraud', labelKey: 'nav.fraud', icon: '🚨' },
  { to: '/admin/missions', labelKey: 'nav.missions', icon: '🎮' },
  { to: '/admin/dart', labelKey: 'nav.dart', icon: '🎯' },
  { to: '/admin/referral', labelKey: 'nav.referral', icon: '🔗' },
  { to: '/admin/inquiry', labelKey: 'nav.inquiry', icon: '💬' },
  { to: '/admin/ads', labelKey: 'nav.ads', icon: '📺' },
  { to: '/admin/campaigns', labelKey: 'nav.campaigns', icon: '📣' },
]

function LanguageToggle() {
  const { lang, setLang, t } = useLanguage()
  const options = [
    { value: 'ja', label: '日本語' },
    { value: 'ko', label: '한국어' },
  ]
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 hidden sm:inline">{t('common.language')}</span>
      <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setLang(opt.value)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              lang === opt.value
                ? 'bg-brand text-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            aria-pressed={lang === opt.value}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const { t } = useLanguage()
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
          <div className="text-brand font-bold text-lg">{t('brand.title')}</div>
          <div className="text-gray-400 text-xs mt-0.5">{t('brand.subtitle')}</div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {nav.map(({ to, labelKey, icon, exact }) => (
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
              {t(labelKey)}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-gray-700">
          <div className="text-gray-400 text-xs truncate mb-2">{user?.email}</div>
          <button
            onClick={handleLogout}
            className="text-gray-400 hover:text-white text-xs transition-colors"
          >
            {t('common.logout')}
          </button>
        </div>
      </aside>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 overflow-y-auto">
        <header className="sticky top-0 z-10 flex justify-end items-center gap-3 px-8 py-3 bg-gray-100/90 backdrop-blur border-b border-gray-200">
          <LanguageToggle />
        </header>
        <div className="p-8">{children}</div>
      </main>
    </div>
  )
}
