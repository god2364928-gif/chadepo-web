import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useState } from 'react'

export default function FraudPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState('flagged')

  const { data: flagged } = useQuery({
    queryKey: ['flagged-users'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, nickname, points, energy, created_at, signup_ip, social_provider, is_flagged, is_banned')
        .eq('is_flagged', true)
        .order('created_at', { ascending: false })
      return data ?? []
    },
    enabled: tab === 'flagged',
  })

  const { data: duplicateIPs } = useQuery({
    queryKey: ['duplicate-ips'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('signup_ip, id, nickname, created_at, is_banned, is_flagged')
        .not('signup_ip', 'is', null)
        .order('signup_ip')
        .limit(500)
      if (!data) return []
      const grouped = {}
      data.forEach(u => {
        if (!grouped[u.signup_ip]) grouped[u.signup_ip] = []
        grouped[u.signup_ip].push(u)
      })
      return Object.entries(grouped)
        .filter(([, users]) => users.length >= 2)
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 50)
    },
    enabled: tab === 'ip',
  })

  const { data: highBalance } = useQuery({
    queryKey: ['high-balance'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, nickname, points, energy, self_earned_points, created_at, is_flagged')
        .order('points', { ascending: false })
        .limit(30)
      return data ?? []
    },
    enabled: tab === 'balance',
  })

  const toggleFlag = useMutation({
    mutationFn: async ({ id, val }) => {
      const { error } = await supabase.from('profiles').update({ is_flagged: val }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries(['flagged-users'])
      qc.invalidateQueries(['duplicate-ips'])
    },
  })

  const toggleBan = useMutation({
    mutationFn: async ({ id, val }) => {
      const { error } = await supabase.from('profiles').update({ is_banned: val }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries(['flagged-users']),
  })

  const tabs = [
    { key: 'flagged', label: `🚨 의심 유저 (${flagged?.length ?? '…'})` },
    { key: 'ip', label: '🔍 중복 IP 탐지' },
    { key: 'balance', label: '💰 고액 보유자' },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">부정이용 감지</h1>

      <div className="flex gap-2 border-b border-gray-200">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>{t.label}</button>
        ))}
      </div>

      {/* 의심 유저 탭 */}
      {tab === 'flagged' && (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">닉네임</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">가입 IP</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">포인트</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">가입일</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">상태</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">처리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(flagged ?? []).map(u => (
                <tr key={u.id} className="hover:bg-red-50">
                  <td className="px-4 py-3">
                    <Link to={`/admin/users/${u.id}`} className="text-brand hover:underline font-medium">{u.nickname || `ユーザー${u.id.slice(0, 4)}`}</Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{u.signup_ip ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-medium">{u.points?.toLocaleString()} P</td>
                  <td className="px-4 py-3 text-right text-gray-400 text-xs">{new Date(u.created_at).toLocaleDateString('ko-KR')}</td>
                  <td className="px-4 py-3 text-right">
                    {u.is_banned ? <span className="badge-red">정지</span> : <span className="badge-yellow">의심</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => toggleFlag.mutate({ id: u.id, val: false })}
                        className="text-xs text-gray-500 hover:text-gray-700">무혐의</button>
                      <button onClick={() => toggleBan.mutate({ id: u.id, val: !u.is_banned })}
                        className={`text-xs ${u.is_banned ? 'text-green-600 hover:text-green-800' : 'text-red-600 hover:text-red-800'}`}>
                        {u.is_banned ? '정지해제' : '계정정지'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {(flagged ?? []).length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">의심 유저 없음 ✅</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 중복 IP 탭 */}
      {tab === 'ip' && (
        <div className="space-y-4">
          {(duplicateIPs ?? []).map(([ip, users]) => (
            <div key={ip} className="card">
              <div className="flex items-center gap-3 mb-3">
                <code className="text-sm bg-gray-100 px-2 py-1 rounded font-mono">{ip}</code>
                <span className="badge-red">{users.length}개 계정</span>
              </div>
              <div className="space-y-1">
                {users.map(u => (
                  <div key={u.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0 text-sm">
                    <Link to={`/admin/users/${u.id}`} className="text-brand hover:underline">{u.nickname || `ユーザー${u.id.slice(0, 4)}`}</Link>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 text-xs">{new Date(u.created_at).toLocaleDateString('ko-KR')}</span>
                      {u.is_banned && <span className="badge-red text-xs">정지</span>}
                      {u.is_flagged && <span className="badge-yellow text-xs">의심</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {(duplicateIPs ?? []).length === 0 && (
            <div className="card text-center text-gray-400 py-8">중복 IP 탐지 없음 ✅</div>
          )}
        </div>
      )}

      {/* 고액 보유자 탭 */}
      {tab === 'balance' && (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">순위</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">닉네임</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">포인트</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">자체 획득</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">에너지</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(highBalance ?? []).map((u, i) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-400 font-medium">{i + 1}</td>
                  <td className="px-4 py-3">
                    <Link to={`/admin/users/${u.id}`} className="text-brand hover:underline font-medium">{u.nickname || `ユーザー${u.id.slice(0, 4)}`}</Link>
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">{u.points?.toLocaleString()} P</td>
                  <td className="px-4 py-3 text-right text-gray-500">{u.self_earned_points?.toLocaleString()} P</td>
                  <td className="px-4 py-3 text-right text-gray-500">{u.energy?.toLocaleString()} E</td>
                  <td className="px-4 py-3 text-right">
                    {u.is_flagged ? <span className="badge-yellow">의심</span> : <span className="badge-green">정상</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
