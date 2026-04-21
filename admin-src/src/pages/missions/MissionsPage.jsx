import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

// ── 실제 앱의 6개 퀘스트 (mission_today_tab.dart 기준) ──
const QUESTS = [
  { key: 'daily_attendance', icon: '📅', title: '毎日出席',         desc: 'アプリを起動する' },
  { key: 'play_game',        icon: '🎮', title: 'ゲームを1回プレイ', desc: 'ゲームタブのゲームを1回プレイ' },
  { key: 'energy_20',        icon: '⚡', title: 'エネルギーを20回',  desc: 'ホーム画面でエネルギーを20回タップ' },
  { key: 'feed_20',          icon: '🍚', title: 'ごはんを20回',      desc: '万歩計でキャラにごはんを20回あげる' },
  { key: 'raffle_20',        icon: '🎰', title: 'くじを20回',        desc: 'くじ・抽選を合計20回行う' },
  { key: 'sanpo',            icon: '🐾', title: 'お散歩3マス',       desc: '1日に3,000歩以上歩く' },
]

// ── 실제 게임 타입 (game_tab.dart 기준) ──
const GAME_TYPE_LABELS = {
  scratch:        'スクラッチくじ',
  fortune:        'フォーチュンクッキー',
  tap_battle:     'タップバトル',
  reaction_speed: 'はんのうそくど',
  math_puzzle:    'けいさんパズル',
  wordle:         'ひらがなワードル',
  memory_card:    'カード神経衰弱',
  crossword:      'ひらがなクロスワード',
  word_search:    'もじさがし',
  number_puzzle:  '数字スライド',
  sudoku:         'チャデポ数独',
  sudoku_4x4:     '数独 (4×4)',
  sudoku_9x9:     '数独 (9×9 ふつう)',
  sudoku_9x9_hard:'数独 (9×9 むずかしい)',
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
  short:  { label: 'かんたん',   cls: 'bg-green-100 text-green-700' },
  medium: { label: 'ふつう',     cls: 'bg-yellow-100 text-yellow-700' },
  long:   { label: 'むずかしい', cls: 'bg-red-100 text-red-700' },
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function timeStr(ts) {
  return new Date(ts).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
}

function nickOf(userId, nickname) {
  return nickname || `ユーザー${userId?.slice(0, 4)}`
}

export default function MissionsPage() {
  const [tab, setTab] = useState('quest')

  // ── 오늘 퀘스트 완료 전체 (mission_key 기반) ──
  const { data: questRows } = useQuery({
    queryKey: ['quest-completions-today'],
    queryFn: async () => {
      const { data } = await supabase
        .from('mission_completions')
        .select('user_id, mission_key, completion_date, created_at, profiles!user_id(nickname)')
        .eq('completion_date', todayStr())
        .not('mission_key', 'is', null)
        .order('created_at', { ascending: false })
        .limit(500)
      return data ?? []
    },
    enabled: tab === 'quest',
  })

  // ── 오늘 게임 플레이 ──
  const { data: gamePlays } = useQuery({
    queryKey: ['game-plays-today'],
    queryFn: async () => {
      const { data } = await supabase
        .from('game_plays')
        .select('game_type, user_id, points_earned, recommended_bonus, energy_spent, created_at, profiles!user_id(nickname)')
        .eq('play_date', todayStr())
        .order('created_at', { ascending: false })
        .limit(500)
      return data ?? []
    },
    enabled: tab === 'game',
  })

  // ── 퀘스트 박스 개봉 ──
  const { data: boxOpens } = useQuery({
    queryKey: ['quest-box-opens-today'],
    queryFn: async () => {
      const { data } = await supabase
        .from('quest_box_opens')
        .select('user_id, points_awarded, open_date, created_at, profiles!user_id(nickname)')
        .eq('open_date', todayStr())
        .order('created_at', { ascending: false })
        .limit(200)
      return data ?? []
    },
    enabled: tab === 'box',
  })

  // ── 퀘스트별 집계 ──
  const questStats = QUESTS.map(q => {
    const rows = (questRows ?? []).filter(r => r.mission_key === q.key)
    return { ...q, count: rows.length, rows }
  })
  const totalQuestCompleted = questRows?.length ?? 0

  // ── 게임별 집계 ──
  const gameStats = gamePlays
    ? Object.entries(
        gamePlays.reduce((acc, g) => {
          if (!acc[g.game_type]) acc[g.game_type] = { count: 0, points: 0, bonus: 0 }
          acc[g.game_type].count  += 1
          acc[g.game_type].points += g.points_earned ?? 0
          acc[g.game_type].bonus  += g.recommended_bonus ?? 0
          return acc
        }, {})
      ).sort((a, b) => b[1].count - a[1].count)
    : []
  const totalGamePlays  = gamePlays?.length ?? 0
  const totalGamePoints = gamePlays?.reduce((s, g) => s + (g.points_earned ?? 0), 0) ?? 0

  // ── 박스 집계 ──
  const totalBoxOpens  = boxOpens?.length ?? 0
  const totalBoxPoints = boxOpens?.reduce((s, b) => s + (b.points_awarded ?? 0), 0) ?? 0

  const TABS = [
    { id: 'quest', label: '오늘 퀘스트' },
    { id: 'game',  label: '오늘 게임' },
    { id: 'box',   label: '퀘스트 박스' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">게임·미션 관리</h1>
        <p className="text-sm text-gray-500 mt-1">앱 "あそぶ" 탭 기준 — 퀘스트 6종 / 게임 15종 / 퀘스트 보상 박스</p>
      </div>

      {/* 탭 */}
      <div className="flex gap-2 border-b border-gray-200">
        {TABS.map(({ id, label }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === id ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>{label}</button>
        ))}
      </div>

      {/* ── 오늘 퀘스트 탭 ── */}
      {tab === 'quest' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="card text-center">
              <p className="text-sm text-gray-500 mb-1">오늘 퀘스트 완료 (총)</p>
              <p className="text-3xl font-bold text-gray-900">{totalQuestCompleted}건</p>
            </div>
            <div className="card text-center">
              <p className="text-sm text-gray-500 mb-1">완료한 유저 수</p>
              <p className="text-3xl font-bold text-brand">
                {new Set((questRows ?? []).map(r => r.user_id)).size}명
              </p>
            </div>
          </div>

          {/* 6개 퀘스트 카드 */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {questStats.map(q => (
              <div key={q.key} className="card space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{q.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">{q.title}</p>
                    <p className="text-xs text-gray-400 truncate">{q.desc}</p>
                  </div>
                  <span className={`text-2xl font-bold ${q.count > 0 ? 'text-brand' : 'text-gray-300'}`}>
                    {q.count}
                  </span>
                </div>

                {/* 완료 유저 목록 */}
                {q.rows.length > 0 ? (
                  <div className="space-y-1 border-t border-gray-50 pt-2 max-h-28 overflow-y-auto">
                    {q.rows.map((r, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-gray-700">{nickOf(r.user_id, r.profiles?.nickname)}</span>
                        <span className="text-gray-400">{timeStr(r.created_at)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-300 pt-1 border-t border-gray-50">오늘 완료 없음</p>
                )}
              </div>
            ))}
          </div>

          {/* 최근 완료 로그 (전체) */}
          <div className="card">
            <h2 className="font-semibold text-gray-900 mb-3">최근 퀘스트 완료 로그</h2>
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white border-b border-gray-100">
                  <tr className="text-xs text-gray-500">
                    <th className="text-left pb-2">유저</th>
                    <th className="text-left pb-2">퀘스트</th>
                    <th className="text-right pb-2">시각</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(questRows ?? []).map((r, i) => {
                    const q = QUESTS.find(q => q.key === r.mission_key)
                    return (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="py-1.5 text-xs text-gray-700">
                          {nickOf(r.user_id, r.profiles?.nickname)}
                        </td>
                        <td className="py-1.5">
                          <span className="text-xs">
                            {q ? `${q.icon} ${q.title}` : r.mission_key}
                          </span>
                        </td>
                        <td className="py-1.5 text-right text-xs text-gray-400">
                          {timeStr(r.created_at)}
                        </td>
                      </tr>
                    )
                  })}
                  {(questRows ?? []).length === 0 && (
                    <tr><td colSpan={3} className="py-6 text-center text-gray-400 text-xs">오늘 완료 기록 없음</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── 오늘 게임 탭 ── */}
      {tab === 'game' && (
        <div className="space-y-6">
          <p className="text-xs text-gray-400">ゲームタブ — 에너지 소비 → 포인트 획득, 하루 각 3회 제한</p>

          <div className="grid grid-cols-3 gap-4">
            <div className="card text-center">
              <p className="text-sm text-gray-500 mb-1">오늘 총 플레이</p>
              <p className="text-3xl font-bold text-gray-900">{totalGamePlays}건</p>
            </div>
            <div className="card text-center">
              <p className="text-sm text-gray-500 mb-1">지급 포인트</p>
              <p className="text-3xl font-bold text-brand">{totalGamePoints.toLocaleString()} P</p>
            </div>
            <div className="card text-center">
              <p className="text-sm text-gray-500 mb-1">추천 보너스</p>
              <p className="text-3xl font-bold text-orange-500">
                +{(gamePlays ?? []).reduce((s, g) => s + (g.recommended_bonus ?? 0), 0).toLocaleString()} P
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 게임별 집계 */}
            <div className="card">
              <h2 className="font-semibold text-gray-900 mb-4">게임별 집계</h2>
              {gameStats.length === 0
                ? <p className="text-gray-400 text-sm py-4 text-center">오늘 기록 없음</p>
                : (
                  <div className="space-y-2">
                    {gameStats.map(([type, stat]) => {
                      const tier = GAME_TIER[type]
                      const tm   = TIER_META[tier]
                      return (
                        <div key={type} className="flex items-center gap-2 text-sm py-1 border-b border-gray-50 last:border-0">
                          {tm && (
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${tm.cls}`}>
                              {tm.label}
                            </span>
                          )}
                          <span className="text-gray-700 flex-1 truncate text-xs">
                            {GAME_TYPE_LABELS[type] ?? type}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="w-14 bg-gray-100 rounded-full h-1.5">
                              <div className="bg-brand h-1.5 rounded-full"
                                style={{ width: `${Math.min(100, (stat.count / Math.max(totalGamePlays, 1)) * 100)}%` }} />
                            </div>
                            <span className="text-gray-600 w-8 text-right text-xs">{stat.count}회</span>
                            <span className="text-green-600 font-medium w-14 text-right text-xs">+{stat.points}P</span>
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
                {(gamePlays ?? []).map((g, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0 text-xs">
                    <span className="text-gray-700 truncate max-w-[100px]">
                      {nickOf(g.user_id, g.profiles?.nickname)}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                        {GAME_TYPE_LABELS[g.game_type] ?? g.game_type}
                      </span>
                      <span className="text-orange-500">-{g.energy_spent}⚡</span>
                      <span className="text-green-600 font-medium">+{g.points_earned}P</span>
                      {(g.recommended_bonus ?? 0) > 0 && (
                        <span className="text-orange-400">🔥+{g.recommended_bonus}</span>
                      )}
                    </div>
                  </div>
                ))}
                {totalGamePlays === 0 && (
                  <p className="text-gray-400 text-sm py-4 text-center">오늘 기록 없음</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 퀘스트 박스 탭 ── */}
      {tab === 'box' && (
        <div className="space-y-6">
          <p className="text-xs text-gray-400">6개 퀘스트 완료 시 박스 획득 → 개봉하면 랜덤 포인트 지급</p>

          <div className="grid grid-cols-2 gap-4">
            <div className="card text-center">
              <p className="text-sm text-gray-500 mb-1">오늘 박스 개봉</p>
              <p className="text-3xl font-bold text-gray-900">{totalBoxOpens}개</p>
            </div>
            <div className="card text-center">
              <p className="text-sm text-gray-500 mb-1">박스 지급 포인트</p>
              <p className="text-3xl font-bold text-brand">{totalBoxPoints.toLocaleString()} P</p>
            </div>
          </div>

          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium text-xs">유저</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium text-xs">획득 P</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium text-xs">등급</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium text-xs">시각</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(boxOpens ?? []).map((b, i) => {
                  const pts = b.points_awarded ?? 0
                  const grade = pts >= 7 ? { label: '✨ 大当たり', cls: 'text-orange-500' }
                              : pts >= 4 ? { label: '🌟 当たり',   cls: 'text-indigo-500' }
                              :            { label: '🎉 ゲット',   cls: 'text-green-600' }
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-xs font-medium text-gray-700">
                        {nickOf(b.user_id, b.profiles?.nickname)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-brand text-sm">
                        +{pts} P
                      </td>
                      <td className={`px-4 py-2.5 text-right text-xs font-medium ${grade.cls}`}>
                        {grade.label}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-gray-400">
                        {timeStr(b.created_at)}
                      </td>
                    </tr>
                  )
                })}
                {totalBoxOpens === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-400 text-sm">
                      오늘 박스 개봉 기록 없음
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
