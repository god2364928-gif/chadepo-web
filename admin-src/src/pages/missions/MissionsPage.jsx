import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

// 실제 game_plays.game_type 값 → 일본어 표기
const GAME_TYPE_LABELS = {
  // かんたん (short / 3P)
  scratch:        'スクラッチくじ',
  fortune:        'フォーチュンクッキー',
  tap_battle:     'タップバトル',
  reaction_speed: 'はんのうそくど',
  math_puzzle:    'けいさんパズル',
  wordle:         'ひらがなワードル',
  // ふつう (medium / 5~6P)
  memory_card:    'カード神経衰弱',
  crossword:      'ひらがなクロスワード',
  word_search:    'もじさがし',
  // むずかしい (long / 7~13P)
  number_puzzle:      '数字スライド',
  sudoku:             'チャデポ数独',
  sudoku_4x4:         '数独 (4×4)',
  sudoku_9x9:         '数独 (9×9 ふつう)',
  sudoku_9x9_hard:    '数独 (9×9 むずかしい)',
  nurie:          'ぬりえパズル',
}

const GAME_TIER = {
  scratch: 'short', fortune: 'short', tap_battle: 'short',
  reaction_speed: 'short', math_puzzle: 'short', wordle: 'short',
  memory_card: 'medium', crossword: 'medium', word_search: 'medium',
  number_puzzle: 'long', sudoku: 'long', sudoku_4x4: 'long',
  sudoku_9x9: 'long', sudoku_9x9_hard: 'long', nurie: 'long',
}

const TIER_META = {
  short:  { label: 'かんたん',   pts: '3P',    badgeCls: 'bg-green-100 text-green-700' },
  medium: { label: 'ふつう',     pts: '5~6P',  badgeCls: 'bg-yellow-100 text-yellow-700' },
  long:   { label: 'むずかしい', pts: '7~13P', badgeCls: 'bg-red-100 text-red-700' },
}

// 실제 mission_definitions.type 값 → 일본어 표기
const MISSION_TYPE_LABELS = {
  quiz:        'クイズ',
  tap_game:    'タップゲーム',
  calculation: '計算問題',
  memory:      'カード記憶',
  video_watch: '動画を見る',
  survey:      'アンケート',
}

// 신형 일일 미션: mission_key (텍스트) → 일본어 표기
const MISSION_KEY_LABELS = {
  daily_attendance: '出席チェック',
  play_game:        'ゲームプレイ',
  energy_20:        'エネルギー20回',
  feed_20:          'エサやり20回',
  raffle_20:        '応募20回',
  sanpo:            'お散歩3000歩',
  sugoroku:         'すごろく',
  steps_1000:       '1000歩あるく',
}

const CATEGORY_LABELS = {
  daily:   { label: 'デイリー', cls: 'bg-orange-100 text-orange-700' },
  regular: { label: 'レギュラー', cls: 'bg-indigo-100 text-indigo-700' },
  easy:    { label: 'かんたん', cls: 'bg-green-100 text-green-700' },
}

function todayString() {
  return new Date().toISOString().slice(0, 10)
}

export default function MissionsPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState('missions')
  const [editMission, setEditMission] = useState(null)

  // ── 미션 설정 탭 ──────────────────────────────────────────
  const { data: missions } = useQuery({
    queryKey: ['missions'],
    queryFn: async () => {
      const { data } = await supabase
        .from('mission_definitions')
        .select('*')
        .order('sort_order', { ascending: true })
      return data ?? []
    },
    enabled: tab === 'missions',
  })

  // ── 오늘 게임 현황 탭 (game_plays) ───────────────────────
  const { data: gamePlays } = useQuery({
    queryKey: ['game-plays-today'],
    queryFn: async () => {
      const { data } = await supabase
        .from('game_plays')
        .select('game_type, user_id, points_earned, recommended_bonus, energy_spent, created_at, profiles!user_id(nickname)')
        .eq('play_date', todayString())
        .order('created_at', { ascending: false })
        .limit(200)
      return data ?? []
    },
    enabled: tab === 'games',
  })

  // ── 오늘 미션 현황 탭 (mission_completions) ───────────────
  // mission_id(UUID)가 있으면 구형 미션, mission_key(텍스트)가 있으면 신형 퀘스트 미션
  const { data: missionCompletions } = useQuery({
    queryKey: ['mission-completions-today'],
    queryFn: async () => {
      const { data } = await supabase
        .from('mission_completions')
        .select('id, user_id, mission_id, mission_key, points_earned, ad_watched, attempt_no, created_at, profiles!user_id(nickname)')
        .eq('completion_date', todayString())
        .order('created_at', { ascending: false })
        .limit(200)
      return data ?? []
    },
    enabled: tab === 'mission-log',
  })

  // ── 미션 설정 뮤테이션 ────────────────────────────────────
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
          daily_limit: daily_limit !== '' && daily_limit != null ? Number(daily_limit) : null,
          cooldown_mins: Number(cooldown_mins),
          ad_required: Boolean(ad_required),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries(['missions']); setEditMission(null) },
  })

  // ── 게임별 집계 (tier 순서대로) ───────────────────────────
  const gameStats = gamePlays
    ? Object.entries(
        gamePlays.reduce((acc, g) => {
          const key = g.game_type
          if (!acc[key]) acc[key] = { count: 0, points: 0, bonus: 0, energy: 0 }
          acc[key].count  += 1
          acc[key].points += g.points_earned ?? 0
          acc[key].bonus  += g.recommended_bonus ?? 0
          acc[key].energy += g.energy_spent ?? 0
          return acc
        }, {})
      ).sort((a, b) => {
        const tierOrder = { short: 0, medium: 1, long: 2 }
        return (tierOrder[GAME_TIER[a[0]] ?? 'medium'] ?? 1) - (tierOrder[GAME_TIER[b[0]] ?? 'medium'] ?? 1)
      })
    : []

  const totalGamePlays  = gamePlays?.length ?? 0
  const totalGamePoints = gamePlays?.reduce((s, g) => s + (g.points_earned ?? 0), 0) ?? 0
  const totalGameBonus  = gamePlays?.reduce((s, g) => s + (g.recommended_bonus ?? 0), 0) ?? 0
  const totalMissionCompletions = missionCompletions?.length ?? 0
  const totalMissionPoints = missionCompletions?.reduce((s, m) => s + (m.points_earned ?? 0), 0) ?? 0

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">게임·미션 관리</h1>

      <div className="flex gap-2 border-b border-gray-200">
        {[
          ['missions',    '미션 설정'],
          ['games',       '오늘 게임 현황'],
          ['mission-log', '오늘 미션 현황'],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === k ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>{l}</button>
        ))}
      </div>

      {/* ── 미션 설정 탭 ── */}
      {tab === 'missions' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            미션 시스템 — 퀴즈·탭게임·계산·카드기억·동영상·앙케이트 6종. 게임 시스템과 별도로 동작합니다.
          </p>

          {editMission && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl w-full max-w-sm shadow-xl p-6 space-y-4">
                <h3 className="font-semibold text-gray-900">미션 수정: {editMission.title_ja}</h3>
                {[
                  { label: '기본 포인트', key: 'base_points' },
                  { label: '일일 한도 (비워두면 무제한)', key: 'daily_limit' },
                  { label: '쿨다운 (분)', key: 'cooldown_mins' },
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
                    className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer ${
                      editMission.ad_required ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                    {editMission.ad_required ? '필요' : '없음'}
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
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">타입</th>
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
                {(missions ?? []).map(m => {
                  const cat = CATEGORY_LABELS[m.category] ?? { label: m.category, cls: 'bg-gray-100 text-gray-500' }
                  return (
                    <tr key={m.id} className={`hover:bg-gray-50 ${!m.is_active ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 font-medium">{m.title_ja}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{MISSION_TYPE_LABELS[m.type] ?? m.type}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cat.cls}`}>{cat.label}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{m.base_points} P</td>
                      <td className="px-4 py-3 text-right">{m.daily_limit ?? '무제한'}</td>
                      <td className="px-4 py-3 text-right">{m.cooldown_mins ?? 0}분</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          m.ad_required ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {m.ad_required ? '필요' : '없음'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => toggleMission.mutate({ id: m.id, val: !m.is_active })}
                          className={`px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer ${
                            m.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                          }`}>
                          {m.is_active ? 'ON' : 'OFF'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => setEditMission(m)} className="text-xs text-brand hover:underline">수정</button>
                      </td>
                    </tr>
                  )
                })}
                {(missions ?? []).length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">미션 없음</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 오늘 게임 현황 탭 ── */}
      {tab === 'games' && (
        <div className="space-y-6">
          <p className="text-sm text-gray-500">
            게임 시스템 — 에너지 소비 → 포인트 획득. 스크래치·운세·타입배틀 등 16종, 하루 각 3회 제한.
          </p>

          {/* 요약 카드 */}
          <div className="grid grid-cols-3 gap-4">
            <div className="card text-center">
              <p className="text-sm text-gray-500 mb-1">오늘 총 플레이</p>
              <p className="text-2xl font-bold text-gray-900">{totalGamePlays}건</p>
            </div>
            <div className="card text-center">
              <p className="text-sm text-gray-500 mb-1">오늘 지급 포인트</p>
              <p className="text-2xl font-bold text-brand">{totalGamePoints.toLocaleString()} P</p>
            </div>
            <div className="card text-center">
              <p className="text-sm text-gray-500 mb-1">추천 보너스</p>
              <p className="text-2xl font-bold text-orange-500">+{totalGameBonus.toLocaleString()} P</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 게임별 집계 */}
            <div className="card">
              <h2 className="font-semibold text-gray-900 mb-4">게임별 집계 (오늘)</h2>
              {gameStats.length === 0
                ? <div className="text-gray-400 text-sm py-4 text-center">오늘 게임 기록 없음</div>
                : (
                  <div className="space-y-2">
                    {gameStats.map(([type, stat]) => {
                      const tier = GAME_TIER[type]
                      const tierMeta = TIER_META[tier]
                      return (
                        <div key={type} className="flex items-center gap-2 text-sm py-1 border-b border-gray-50 last:border-0">
                          {tierMeta && (
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${tierMeta.badgeCls}`}>
                              {tierMeta.label}
                            </span>
                          )}
                          <span className="text-gray-700 flex-1 truncate">{GAME_TYPE_LABELS[type] ?? type}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="w-16 bg-gray-100 rounded-full h-1.5">
                              <div className="bg-brand h-1.5 rounded-full"
                                style={{ width: `${Math.min(100, (stat.count / Math.max(totalGamePlays, 1)) * 100)}%` }} />
                            </div>
                            <span className="text-gray-600 w-8 text-right">{stat.count}회</span>
                            <span className="text-green-600 font-medium w-14 text-right">+{stat.points} P</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
            </div>

            {/* 최근 플레이 로그 */}
            <div className="card">
              <h2 className="font-semibold text-gray-900 mb-4">최근 플레이 ({totalGamePlays}건)</h2>
              <div className="max-h-72 overflow-y-auto space-y-1">
                {(gamePlays ?? []).map((g, i) => {
                  const nickname = g.profiles?.nickname || `ユーザー${g.user_id?.slice(0, 4)}`
                  return (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0 text-sm">
                      <span className="text-gray-700 truncate max-w-[100px]">{nickname}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                          {GAME_TYPE_LABELS[g.game_type] ?? g.game_type}
                        </span>
                        <span className="text-orange-500 text-xs">-{g.energy_spent}⚡</span>
                        <span className="text-green-600 text-xs font-medium">+{g.points_earned}P</span>
                        {g.recommended_bonus > 0 && (
                          <span className="text-xs text-orange-400">🔥+{g.recommended_bonus}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
                {(gamePlays ?? []).length === 0 && (
                  <div className="text-gray-400 text-sm py-4 text-center">오늘 기록 없음</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 오늘 미션 현황 탭 ── */}
      {tab === 'mission-log' && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="card text-center">
              <p className="text-sm text-gray-500 mb-1">오늘 미션 완료</p>
              <p className="text-2xl font-bold text-gray-900">{totalMissionCompletions}건</p>
            </div>
            <div className="card text-center">
              <p className="text-sm text-gray-500 mb-1">지급 포인트</p>
              <p className="text-2xl font-bold text-brand">{totalMissionPoints.toLocaleString()} P</p>
            </div>
            <div className="card text-center">
              <p className="text-sm text-gray-500 mb-1">광고 시청 포함</p>
              <p className="text-2xl font-bold text-orange-500">
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
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">종류</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">횟수</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">광고</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">획득 P</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">시각</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(missionCompletions ?? []).map(mc => {
                  const nickname = mc.profiles?.nickname || `ユーザー${mc.user_id?.slice(0, 4)}`

                  // 신형(mission_key) vs 구형(mission_id) 분기
                  const isNewStyle = !mc.mission_id && mc.mission_key
                  const missionLabel = isNewStyle
                    ? (MISSION_KEY_LABELS[mc.mission_key] ?? mc.mission_key)
                    : '(구형 미션)'
                  const kindLabel = isNewStyle ? '퀘스트' : '일반'
                  const kindCls = isNewStyle
                    ? 'bg-orange-50 text-orange-600'
                    : 'bg-indigo-50 text-indigo-600'

                  return (
                    <tr key={mc.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{nickname}</td>
                      <td className="px-4 py-3">{missionLabel}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${kindCls}`}>
                          {kindLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">{mc.attempt_no ?? 1}회차</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          mc.ad_watched ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {mc.ad_watched ? '시청' : '미시청'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {mc.points_earned > 0
                          ? <span className="text-green-600">+{mc.points_earned} P</span>
                          : <span className="text-gray-400 text-xs">퀘스트박스</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-right text-gray-400 text-xs">
                        {new Date(mc.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  )
                })}
                {(missionCompletions ?? []).length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">오늘 미션 완료 기록 없음</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
