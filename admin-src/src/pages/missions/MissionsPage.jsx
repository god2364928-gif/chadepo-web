import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

export default function MissionsPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState('missions')
  const [editMission, setEditMission] = useState(null)

  const { data: missions } = useQuery({
    queryKey: ['missions'],
    queryFn: async () => {
      const { data } = await supabase
        .from('mission_definitions')
        .select('*')
        .order('category')
      return data ?? []
    },
    enabled: tab === 'missions',
  })

  const { data: gamePlays } = useQuery({
    queryKey: ['game-plays-today'],
    queryFn: async () => {
      const { data } = await supabase
        .from('game_plays')
        .select('game_type, user_id, points_earned, created_at, profiles(nickname)')
        .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
        .order('created_at', { ascending: false })
        .limit(100)
      return data ?? []
    },
    enabled: tab === 'games',
  })

  const toggleMission = useMutation({
    mutationFn: async ({ id, val }) => {
      const { error } = await supabase.from('mission_definitions').update({ is_active: val }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries(['missions']),
  })

  const updateMission = useMutation({
    mutationFn: async ({ id, base_points, daily_limit, cooldown_mins }) => {
      const { error } = await supabase
        .from('mission_definitions')
        .update({ base_points: Number(base_points), daily_limit: Number(daily_limit), cooldown_mins: Number(cooldown_mins) })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries(['missions']); setEditMission(null) },
  })

  const gameStats = gamePlays ? Object.entries(
    gamePlays.reduce((acc, g) => {
      acc[g.game_type] = (acc[g.game_type] ?? 0) + 1
      return acc
    }, {})
  ).sort((a, b) => b[1] - a[1]) : []

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">게임·미션 관리</h1>

      <div className="flex gap-2 border-b border-gray-200">
        {[['missions', '미션 설정'], ['games', '오늘 게임 현황']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === k ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>{l}</button>
        ))}
      </div>

      {tab === 'missions' && (
        <div className="space-y-4">
          {editMission && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl w-full max-w-sm shadow-xl p-6 space-y-4">
                <h3 className="font-semibold text-gray-900">미션 수정: {editMission.title_ja}</h3>
                {[
                  { label: '기본 포인트', key: 'base_points' },
                  { label: '일일 한도', key: 'daily_limit' },
                  { label: '쿨다운 (분)', key: 'cooldown_mins' },
                ].map(({ label, key }) => (
                  <div key={key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                    <input type="number" className="input"
                      value={editMission[key] ?? ''}
                      onChange={e => setEditMission(m => ({ ...m, [key]: e.target.value }))} />
                  </div>
                ))}
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setEditMission(null)} className="btn-secondary">취소</button>
                  <button onClick={() => updateMission.mutate(editMission)} className="btn-primary"
                    disabled={updateMission.isPending}>저장</button>
                </div>
              </div>
            </div>
          )}
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">미션명</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">카테고리</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">보상 P</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">일일 한도</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">쿨다운</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">활성</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">수정</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(missions ?? []).map(m => (
                  <tr key={m.id} className={`hover:bg-gray-50 ${!m.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-medium">{m.title_ja ?? m.type}</td>
                    <td className="px-4 py-3"><span className="badge-blue">{m.category}</span></td>
                    <td className="px-4 py-3 text-right">{m.base_points} P</td>
                    <td className="px-4 py-3 text-right">{m.daily_limit ?? '—'}</td>
                    <td className="px-4 py-3 text-right">{m.cooldown_mins ?? 0}분</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => toggleMission.mutate({ id: m.id, val: !m.is_active })}
                        className={m.is_active ? 'badge-green cursor-pointer' : 'badge-gray cursor-pointer'}>
                        {m.is_active ? 'ON' : 'OFF'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setEditMission(m)} className="text-xs text-brand hover:underline">수정</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'games' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">게임별 플레이 수 (오늘)</h2>
            <div className="space-y-2">
              {gameStats.map(([type, count]) => (
                <div key={type} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">{type}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 bg-gray-100 rounded-full h-2">
                      <div className="bg-brand h-2 rounded-full" style={{ width: `${Math.min(100, (count / (gamePlays?.length || 1)) * 100)}%` }} />
                    </div>
                    <span className="text-sm font-medium text-gray-900 w-8 text-right">{count}</span>
                  </div>
                </div>
              ))}
              {gameStats.length === 0 && <div className="text-gray-400 text-sm">오늘 게임 기록 없음</div>}
            </div>
          </div>

          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-4">최근 플레이 ({gamePlays?.length ?? 0}건)</h2>
            <div className="max-h-72 overflow-y-auto space-y-1">
              {(gamePlays ?? []).map((g, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0 text-sm">
                  <span className="text-gray-700">{g.profiles?.nickname}</span>
                  <div className="flex items-center gap-2">
                    <span className="badge-gray text-xs">{g.game_type}</span>
                    <span className="text-green-600 text-xs font-medium">+{g.points_earned} P</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
