import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import UserList from './pages/users/UserList'
import UserDetail from './pages/users/UserDetail'
import ExchangePage from './pages/exchange/ExchangePage'
import RafflePage from './pages/raffle/RafflePage'
import FraudPage from './pages/fraud/FraudPage'
import MissionsPage from './pages/missions/MissionsPage'
import ReferralPage from './pages/referral/ReferralPage'
import InquiryPage from './pages/inquiry/InquiryPage'

function ProtectedRoute({ children }) {
  const { user, isAdmin, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-gray-500 text-sm">로딩 중...</div>
    </div>
  )
  if (!user || !isAdmin) return <Navigate to="/admin/login" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin/login" element={<Login />} />
        <Route path="/admin/*" element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route index element={<Dashboard />} />
                <Route path="users" element={<UserList />} />
                <Route path="users/:id" element={<UserDetail />} />
                <Route path="exchange" element={<ExchangePage />} />
                <Route path="raffle" element={<RafflePage />} />
                <Route path="fraud" element={<FraudPage />} />
                <Route path="missions" element={<MissionsPage />} />
                <Route path="referral" element={<ReferralPage />} />
                <Route path="inquiry" element={<InquiryPage />} />
                <Route path="*" element={<Navigate to="/admin" replace />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
