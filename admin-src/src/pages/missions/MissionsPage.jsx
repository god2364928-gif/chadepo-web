import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

const GAME_TYPE_LABELS = {
  scratch: '스크래치',
  fortune: '운세 뽑기',
  math_puzzle: '수학 퍼즐',
  crossword: '크로스워드',
  quiz: '퀴즈',
  tap_game: '탭 게임',
  calculation: '계산 문제',
  memory: '카드 기억',
  video_watch: '동영상 보기',
  survey: '앙케이트',
}

function todayString() {
  return new Date().toISOString().slice(0, 10)
}

export default function MissionsPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState('missions')
  const [editMission, setEditMission] = useState(null)

  // 미션 설정 탭
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

  // 오늘 게임 현황 탭 (game_plays)
  const { data: gamePlays } = useQuery({
    queryKey: ['game-plays-today'],
    queryFn: async () => {
      const { data } = await supabase
        .from('game_plays')
        .select('game_type, user_id, points_earned, energy_spent, play_date, profiles!user_id(nickname)')
        .eq('play_date', todayString())
        .order('play_date', { ascending: false })
        .limit(100)
      return data ?? []
    },
    enabled: tab === 'games',
  })

  // 오늘 미션 현황 탭 (mission_completions)
  const { data: missionCompletions } = useQuery({
    queryKey: ['mission-completions-today'],
    queryFn: async () => {
      const { data } = await supabase
        .from('mission_completions')
        .select('*, mission_definitions!mission_id(title_ja, type), profiles!user_id(nickname)')
        .eq('completion_date', todayString())
        .order('created_at', { ascending: false })
        .limit(100)
      return data ?? []
    },
    enabled: tab === 'mission-log',
  })

  const toggleMission = useMutation({
    mutationFn: async ({ id, val }) => {
      const { error } = await supabase.from('mission_definitions').update({ is_active: val }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries(['missions']),
  })

  const updateMission = useMutation({
    mutationFn: async ({ id, base_points, daily_limit, cooldown_mins, ad_required }) => {
      const { error } = await supabase
        .from('mission_definitions')
        .update({
          base_points: Number(base_points),
          daily_limit: Number(daily_limit),
          cooldown_mins: Number(cooldown_mins),
          ad_required: Boolean(ad_required),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries(['missions']); setEditMission(null) },
  })

  // 게임별 집계
  const gameStats = gamePlays
    ? Object.entries(
        gamePlays.reduce((acc, g) => {
          if (!acc[g.game_type]) acc[g.game_type] = { count: 0, points: 0, energy: 0 }
          acc[g.game_type].count += 1
          acc[g.game_type].points += g.points_earned ?? 0
          acc[g.game_type].energy += g.energy_spent ?? 0
          return acc
        }, {})
      ).sort((a, b) => b[1].count - a[1].count)
    : []

  const totalGamePoints = gamePlays?.reduce((s, g) => s + (g.points_earned ?? 0), 0) ?? 0
  const totalMissionCompletions = missionCompletions?.length ?? 0

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">게임·미션 관리</h1>

      <div className="flex gap-2 border-b border-gray-200">
        {[
          ['missions', '미션 설정'],
          ['games', '오늘 게임 현황'],
          ['mission-log', '오늘 미션 현황'],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === k ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>{l}</button>
        ))}
      </div>

      {/* 미션 설정 탭 */}
      {tab === 'missions' && (
        <div className="space-y-4">
          {editMission && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl w-full max-w-sm shadow-xl p-6 space-y-4">
                <h3 className="font-semibold text-gray-900">미션 수정: {editMission.title_ja}</h3>
                {[
                  { label: '기본 포인트', key: 'base_points', type: 'number' },
                  { label: '일일 한도', key: 'daily_limit', type: 'number' },
                  { label: '쿨다운 (분)', key: 'cooldown_mins', type: 'number' },
                ].map(({ label, key }) => (
                  <div key={key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                    <input type="number" className="input"
                      value={editMission[key] ?? ''}
                      onChange={e => setEditMission(m => ({ ...m, [key]: e.target.value }))} />
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">광고 시청 필요</label>
                  <button
                    onClick={() => setEditMission(m => ({ ...m, ad_required: !m.ad_required }))}
                    className={editMission.ad_required ? 'badge-green cursor-pointer' : 'badge-gray cursor-pointer'}>
                    {editMission.ad_required ? 'ON' : 'OFF'}
                  </button>
                </div>
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
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">광고</th>
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
                      <span className={m.ad_required ? 'badge-blue' : 'badge-gray'}>
                        {m.ad_required ? '필요' : '없음'}
                      </span>
                    </td>
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

      {/* 오늘 게임 현황 탭 */}
      {tab === 'games' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="card text-center">
              <p className="text-sm text-gray-500 mb-1">오늘 총 플레이</p>
              <p className="text-2xl font-bold text-gray-900">{gamePlays?.length ?? 0}건</p>
            </div>
            <div className="card text-center">
              <p className="text-sm text-gray-500 mb-1">오늘 총 지급 포인트</p>
              <p className="text-2xl font-bold text-brand">{totalGamePoints.toLocaleString()} P</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card">
              <h2 className="font-semibold text-gray-900 mb-4">게임별 집계 (오늘)</h2>
              {gameStats.length === 0
                ? <div className="text-gray-400 text-sm">오늘 게임 기록 없음</div>
                : (
                  <div className="space-y-3">
                    {gameStats.map(([type, stat]) => (
                      <div key={type} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 w-28">{GAME_TYPE_LABELS[type] ?? type}</span>
                        <div className="flex items-center gap-3">
                          <div className="w-20 bg-gray-100 rounded-full h-2">
                            <div className="bg-brand h-2 rounded-full"
                              style={{ width: `${Math.min(100, (stat.count / (gamePlays?.length || 1)) * 100)}%` }} />
                          </div>
                          <span className="text-gray-900 font-medium w-8 text-right">{stat.count}회</span>
                          <span className="text-green-600 font-medium w-14 text-right">+{stat.points} P</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </div>

            <div className="card">
              <h2 className="font-semibold text-gray-900 mb-4">최근 플레이 ({gamePlays?.length ?? 0}건)</h2>
              <div className="max-h-72 overflow-y-auto space-y-1">
                {(gamePlays ?? []).map((g, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0 text-sm">
                    <span className="text-gray-700">{g.profiles?.nickname ?? '—'}</span>
                    <div className="flex items-center gap-2">
                      <span className="badge-gray text-xs">{GAME_TYPE_LABELS[g.game_type] ?? g.game_type}</span>
                      <span className="text-orange-500 text-xs">-{g.energy_spent}E</span>
                      <span className="text-green-600 text-xs font-medium">+{g.points_earned} P</span>
                    </div>
                  </div>
                ))}
                {gamePlays?.length === 0 && <div className="text-gray-400 text-sm">오늘 기록 없음</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 오늘 미션 현황 탭 */}
      {tab === 'mission-log' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="card text-center">
              <p className="text-sm text-gray-500 mb-1">오늘 미션 완료</p>
              <p className="text-2xl font-bold text-gray-900">{totalMissionCompletions}건</p>
            </div>
            <div className="card text-center">
              <p className="text-sm text-gray-500 mb-1">광고 시청 포함</p>
              <p className="text-2xl font-bold text-brand">
                {missionCompletions?.filter(m => m.ad_watched).length ?? 0}건
              </p>
            </div>
          </div>

          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">유저</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">미션</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">타입</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">광고</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">획득 P</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">시각</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(missionCompletions ?? []).map(mc => (
                  <tr key={mc.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{mc.profiles?.nickname ?? '—'}</td>
                    <td className="px-4 py-3">{mc.mission_definitions?.title_ja ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="badge-blue">{mc.mission_definitions?.type ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={mc.ad_watched ? 'badge-green' : 'badge-gray'}>
                        {mc.ad_watched ? '시청' : '미시청'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-green-600 font-medium">+{mc.points_earned} P</td>
                    <td className="px-4 py-3 text-right text-gray-400 text-xs">
                      {new Date(mc.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
                {(missionCompletions ?? []).length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">오늘 미션 완료 기록 없음</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
