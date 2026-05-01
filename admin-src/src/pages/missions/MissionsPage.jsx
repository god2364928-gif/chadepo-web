import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import GameTimeStats from './GameTimeStats'

// ── 6개 퀘스트 정의 (앱 코드 기준) ──
const QUESTS = [
  { key: 'daily_attendance', icon: '📅', title: '毎日出席', desc: 'アプリを起動する' },
  {
    key: 'play_game',
    icon: '🎮',
    title: 'ゲームを1回プレイ',
    desc: 'ゲームタブのゲームを1回プレイ',
  },
  {
    key: 'energy_20',
    icon: '⚡',
    title: 'エネルギーを20回',
    desc: 'ホーム画面でエネルギーを20回タップ',
  },
  { key: 'feed_20', icon: '🍚', title: 'ごはんを20回', desc: '万歩計でキャラにごはんを20回あげる' },
  { key: 'raffle_20', icon: '🎰', title: 'くじを20回', desc: 'くじ・抽選を合計20回行う' },
  { key: 'sanpo', icon: '🐾', title: 'お散歩3マス', desc: '1日に3,000歩以上歩く' },
]

const GAME_TYPE_LABELS = {
  scratch: 'スクラッチくじ',
  fortune: 'フォーチュンクッキー',
  tap_battle: 'タップバトル',
  reaction_speed: 'はんのうそくど',
  math_puzzle: 'けいさんパズル',
  wordle: 'ひらがなワードル',
  memory_card: 'カード神経衰弱',
  crossword: 'ひらがなクロスワード',
  word_search: 'もじさがし',
  number_puzzle: '数字スライド',
  sudoku: 'チャデポ数独',
  sudoku_4x4: '数独(4×4)',
  sudoku_9x9: '数独(9×9ふつう)',
  sudoku_9x9_hard: '数独(9×9むずかしい)',
  nurie: 'ぬりえパズル',
}

const GAME_TIER = {
  scratch: 'short',
  fortune: 'short',
  tap_battle: 'short',
  reaction_speed: 'short',
  math_puzzle: 'short',
  wordle: 'short',
  memory_card: 'medium',
  crossword: 'medium',
  word_search: 'medium',
  number_puzzle: 'long',
  sudoku: 'long',
  sudoku_4x4: 'long',
  sudoku_9x9: 'long',
  sudoku_9x9_hard: 'long',
  nurie: 'long',
}

const TIER_META = {
  short: { label: 'かんたん', cls: 'bg-green-100 text-green-700' },
  medium: { label: 'ふつう', cls: 'bg-yellow-100 text-yellow-700' },
  long: { label: 'むずかしい', cls: 'bg-red-100 text-red-700' },
}

const LOG_SIZE = 50

function jstToday() {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

function timeStr(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
}

function nickOf(userId, nickname) {
  return nickname || `ユーザー${userId?.slice(0, 4)}`
}

// 날짜 선택기 컴포넌트
function DatePicker({ value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => {
          const d = new Date(value)
          d.setDate(d.getDate() - 1)
          onChange(d.toISOString().slice(0, 10))
        }}
        className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 text-sm"
      >
        ←
      </button>
      <input
        type="date"
        value={value}
        max={jstToday()}
        onChange={(e) => onChange(e.target.value)}
        className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
      <button
        onClick={() => {
          const d = new Date(value)
          d.setDate(d.getDate() + 1)
          if (d.toISOString().slice(0, 10) <= jstToday()) onChange(d.toISOString().slice(0, 10))
        }}
        className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 text-sm"
      >
        →
      </button>
      <button
        onClick={() => onChange(jstToday())}
        className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs text-gray-600 font-medium"
      >
        오늘
      </button>
    </div>
  )
}

export default function MissionsPage() {
  const [tab, setTab] = useState('quest')
  const [date, setDate] = useState(jstToday)

  // ── 퀘스트 집계 (RPC) ──
  const { data: questStats, isLoading: questLoading } = useQuery({
    queryKey: ['quest-stats', date],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_quest_stats', { p_date: date })
      if (error) throw error
      return data ?? []
    },
    enabled: tab === 'quest',
  })

  // 퀘스트 최근 로그 (페이징, 50건씩)
  const [questPage, setQuestPage] = useState(0)
  const { data: questLog } = useQuery({
    queryKey: ['quest-log', date, questPage],
    queryFn: async () => {
      const { data, count, error } = await supabase
        .from('mission_completions')
        .select('user_id, mission_key, created_at, profiles!user_id(nickname)', { count: 'exact' })
        .eq('completion_date', date)
        .not('mission_key', 'is', null)
        .order('created_at', { ascending: false })
        .range(questPage * LOG_SIZE, (questPage + 1) * LOG_SIZE - 1)
      if (error) throw error
      return { rows: data ?? [], total: count ?? 0 }
    },
    enabled: tab === 'quest',
    keepPreviousData: true,
  })

  // ── 게임 집계 (RPC) ──
  const { data: gameStats, isLoading: gameLoading } = useQuery({
    queryKey: ['game-stats', date],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_game_stats', { p_date: date })
      if (error) throw error
      return data ?? []
    },
    enabled: tab === 'game',
  })

  // 게임 최근 로그 (50건씩)
  const [gamePage, setGamePage] = useState(0)
  const { data: gameLog } = useQuery({
    queryKey: ['game-log', date, gamePage],
    queryFn: async () => {
      const { data, count, error } = await supabase
        .from('game_plays')
        .select(
          'game_type, user_id, points_earned, recommended_bonus, energy_spent, created_at, profiles!user_id(nickname)',
          { count: 'exact' }
        )
        .eq('play_date', date)
        .order('created_at', { ascending: false })
        .range(gamePage * LOG_SIZE, (gamePage + 1) * LOG_SIZE - 1)
      if (error) throw error
      return { rows: data ?? [], total: count ?? 0 }
    },
    enabled: tab === 'game',
    keepPreviousData: true,
  })

  // ── 박스 집계 (RPC) ──
  const { data: boxStats, isLoading: boxLoading } = useQuery({
    queryKey: ['box-stats', date],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_box_stats', { p_date: date })
      if (error) throw error
      return data?.[0] ?? null
    },
    enabled: tab === 'box',
  })

  // 박스 최근 로그 (50건씩)
  const [boxPage, setBoxPage] = useState(0)
  const { data: boxLog } = useQuery({
    queryKey: ['box-log', date, boxPage],
    queryFn: async () => {
      const { data, count, error } = await supabase
        .from('quest_box_opens')
        .select('user_id, points_awarded, created_at, profiles!user_id(nickname)', {
          count: 'exact',
        })
        .eq('open_date', date)
        .order('created_at', { ascending: false })
        .range(boxPage * LOG_SIZE, (boxPage + 1) * LOG_SIZE - 1)
      if (error) throw error
      return { rows: data ?? [], total: count ?? 0 }
    },
    enabled: tab === 'box',
    keepPreviousData: true,
  })

  // 날짜 바꾸면 페이지 초기화
  const handleDate = (d) => {
    setDate(d)
    setQuestPage(0)
    setGamePage(0)
    setBoxPage(0)
  }

  // 게임 합계
  const totalGamePlays = gameStats?.reduce((s, g) => s + Number(g.play_count), 0) ?? 0
  const totalGamePoints = gameStats?.reduce((s, g) => s + Number(g.total_points), 0) ?? 0
  const totalGameBonus = gameStats?.reduce((s, g) => s + Number(g.total_bonus), 0) ?? 0

  // 퀘스트 합계
  const questStatMap = Object.fromEntries((questStats ?? []).map((r) => [r.mission_key, r]))
  const totalQuestCompleted = questStats?.reduce((s, r) => s + Number(r.completed_count), 0) ?? 0

  const Pager = ({ page, setPage, total }) => {
    const maxPage = Math.ceil(total / LOG_SIZE) - 1
    if (total <= LOG_SIZE) return null
    return (
      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        <span className="text-xs text-gray-400">총 {total.toLocaleString()}건</span>
        <div className="flex items-center gap-2">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
          >
            이전
          </button>
          <span className="text-xs text-gray-500">
            {page + 1} / {maxPage + 1}
          </span>
          <button
            disabled={page >= maxPage}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
          >
            다음
          </button>
        </div>
      </div>
    )
  }

  const TABS = [
    { id: 'quest', label: '오늘 퀘스트' },
    { id: 'game', label: '오늘 게임' },
    { id: 'box', label: '퀘스트 박스' },
    { id: 'time', label: '⏱️ 게임 완료시간 통계' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">게임·미션 관리</h1>
          <p className="text-sm text-gray-500 mt-1">
            앱 &quot;あそぶ&quot; 기준 — 퀘스트 6종 / 게임 15종 / 퀘스트 박스
          </p>
        </div>
        {tab !== 'time' && <DatePicker value={date} onChange={handleDate} />}
      </div>

      {/* 탭 */}
      <div className="flex gap-2 border-b border-gray-200">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === id
                ? 'border-brand text-brand'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── 오늘 퀘스트 탭 ── */}
      {tab === 'quest' && (
        <div className="space-y-6">
          {questLoading ? (
            <div className="py-12 text-center text-gray-400">불러오는 중...</div>
          ) : (
            <>
              {/* 요약 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="card text-center">
                  <p className="text-sm text-gray-500 mb-1">총 퀘스트 완료</p>
                  <p className="text-3xl font-bold text-gray-900">
                    {totalQuestCompleted.toLocaleString()}건
                  </p>
                </div>
                <div className="card text-center">
                  <p className="text-sm text-gray-500 mb-1">완료한 유저 수</p>
                  <p className="text-3xl font-bold text-brand">
                    {Math.max(
                      ...(questStats ?? []).map((r) => Number(r.unique_users)),
                      0
                    ).toLocaleString()}
                    명+
                  </p>
                </div>
              </div>

              {/* 6개 퀘스트 카드 */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {QUESTS.map((q) => {
                  const stat = questStatMap[q.key]
                  const cnt = Number(stat?.completed_count ?? 0)
                  const uniq = Number(stat?.unique_users ?? 0)
                  return (
                    <div key={q.key} className="card">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{q.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 text-sm">{q.title}</p>
                          <p className="text-xs text-gray-400 truncate">{q.desc}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p
                            className={`text-2xl font-bold ${cnt > 0 ? 'text-brand' : 'text-gray-300'}`}
                          >
                            {cnt.toLocaleString()}
                          </p>
                          {uniq > 0 && <p className="text-xs text-gray-400">{uniq}명</p>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* 최근 로그 */}
              <div className="card">
                <h2 className="font-semibold text-gray-900 mb-3">
                  퀘스트 완료 로그
                  {questLog?.total > 0 && (
                    <span className="ml-2 text-sm text-gray-400 font-normal">
                      총 {questLog.total.toLocaleString()}건
                    </span>
                  )}
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-gray-100">
                      <tr className="text-xs text-gray-500">
                        <th className="text-left pb-2">유저</th>
                        <th className="text-left pb-2">퀘스트</th>
                        <th className="text-right pb-2">시각</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {(questLog?.rows ?? []).map((r, i) => {
                        const q = QUESTS.find((q) => q.key === r.mission_key)
                        return (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="py-1.5 text-xs text-gray-700">
                              {nickOf(r.user_id, r.profiles?.nickname)}
                            </td>
                            <td className="py-1.5 text-xs">
                              {q ? `${q.icon} ${q.title}` : r.mission_key}
                            </td>
                            <td className="py-1.5 text-right text-xs text-gray-400">
                              {timeStr(r.created_at)}
                            </td>
                          </tr>
                        )
                      })}
                      {(questLog?.rows ?? []).length === 0 && (
                        <tr>
                          <td colSpan={3} className="py-6 text-center text-gray-400 text-xs">
                            기록 없음
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <Pager page={questPage} setPage={setQuestPage} total={questLog?.total ?? 0} />
              </div>
            </>
          )}
        </div>
      )}

      {/* ── 오늘 게임 탭 ── */}
      {tab === 'game' && (
        <div className="space-y-6">
          {gameLoading ? (
            <div className="py-12 text-center text-gray-400">불러오는 중...</div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-4">
                <div className="card text-center">
                  <p className="text-sm text-gray-500 mb-1">총 플레이</p>
                  <p className="text-3xl font-bold text-gray-900">
                    {totalGamePlays.toLocaleString()}건
                  </p>
                </div>
                <div className="card text-center">
                  <p className="text-sm text-gray-500 mb-1">지급 포인트</p>
                  <p className="text-3xl font-bold text-brand">
                    {totalGamePoints.toLocaleString()} P
                  </p>
                </div>
                <div className="card text-center">
                  <p className="text-sm text-gray-500 mb-1">추천 보너스</p>
                  <p className="text-3xl font-bold text-orange-500">
                    +{totalGameBonus.toLocaleString()} P
                  </p>
                </div>
              </div>

              {/* 게임별 집계 테이블 */}
              <div className="card p-0 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">
                        게임
                      </th>
                      <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">
                        플레이
                      </th>
                      <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">
                        유저
                      </th>
                      <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">
                        포인트
                      </th>
                      <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">
                        보너스
                      </th>
                      <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">
                        에너지 소비
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(gameStats ?? []).map((g) => {
                      const tier = GAME_TIER[g.game_type]
                      const tm = TIER_META[tier]
                      return (
                        <tr key={g.game_type} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              {tm && (
                                <span
                                  className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${tm.cls}`}
                                >
                                  {tm.label}
                                </span>
                              )}
                              <span className="text-xs text-gray-700">
                                {GAME_TYPE_LABELS[g.game_type] ?? g.game_type}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium">
                            {Number(g.play_count).toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-500">
                            {Number(g.unique_users).toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 text-right text-green-600 font-medium">
                            +{Number(g.total_points).toLocaleString()} P
                          </td>
                          <td className="px-4 py-2.5 text-right text-orange-500">
                            {Number(g.total_bonus) > 0
                              ? `+${Number(g.total_bonus).toLocaleString()}`
                              : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-400">
                            {Number(g.total_energy).toLocaleString()} ⚡
                          </td>
                        </tr>
                      )
                    })}
                    {(gameStats ?? []).length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">
                          기록 없음
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* 최근 플레이 로그 */}
              <div className="card">
                <h2 className="font-semibold text-gray-900 mb-3">
                  최근 플레이 로그
                  {gameLog?.total > 0 && (
                    <span className="ml-2 text-sm text-gray-400 font-normal">
                      총 {gameLog.total.toLocaleString()}건
                    </span>
                  )}
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-gray-100">
                      <tr className="text-xs text-gray-500">
                        <th className="text-left pb-2">유저</th>
                        <th className="text-left pb-2">게임</th>
                        <th className="text-right pb-2">에너지</th>
                        <th className="text-right pb-2">포인트</th>
                        <th className="text-right pb-2">시각</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {(gameLog?.rows ?? []).map((g, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="py-1.5 text-xs text-gray-700">
                            {nickOf(g.user_id, g.profiles?.nickname)}
                          </td>
                          <td className="py-1.5 text-xs">
                            {GAME_TYPE_LABELS[g.game_type] ?? g.game_type}
                          </td>
                          <td className="py-1.5 text-right text-xs text-orange-500">
                            -{g.energy_spent}⚡
                          </td>
                          <td className="py-1.5 text-right text-xs text-green-600 font-medium">
                            +{g.points_earned}P
                            {(g.recommended_bonus ?? 0) > 0 && (
                              <span className="text-orange-400 ml-1">🔥+{g.recommended_bonus}</span>
                            )}
                          </td>
                          <td className="py-1.5 text-right text-xs text-gray-400">
                            {timeStr(g.created_at)}
                          </td>
                        </tr>
                      ))}
                      {(gameLog?.rows ?? []).length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-gray-400 text-xs">
                            기록 없음
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <Pager page={gamePage} setPage={setGamePage} total={gameLog?.total ?? 0} />
              </div>
            </>
          )}
        </div>
      )}

      {/* ── 퀘스트 박스 탭 ── */}
      {tab === 'box' && (
        <div className="space-y-6">
          {boxLoading ? (
            <div className="py-12 text-center text-gray-400">불러오는 중...</div>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-4">
                {[
                  {
                    label: '박스 개봉',
                    value: Number(boxStats?.open_count ?? 0).toLocaleString() + '개',
                    cls: 'text-gray-900',
                  },
                  {
                    label: '개봉 유저',
                    value: Number(boxStats?.unique_users ?? 0).toLocaleString() + '명',
                    cls: 'text-brand',
                  },
                  {
                    label: '총 지급 P',
                    value: Number(boxStats?.total_points ?? 0).toLocaleString() + ' P',
                    cls: 'text-green-600',
                  },
                  {
                    label: '평균 P',
                    value: Number(boxStats?.avg_points ?? 0) + ' P',
                    cls: 'text-gray-700',
                  },
                ].map(({ label, value, cls }) => (
                  <div key={label} className="card text-center">
                    <p className="text-sm text-gray-500 mb-1">{label}</p>
                    <p className={`text-2xl font-bold ${cls}`}>{value}</p>
                  </div>
                ))}
              </div>

              <div className="card">
                <h2 className="font-semibold text-gray-900 mb-3">
                  박스 개봉 로그
                  {boxLog?.total > 0 && (
                    <span className="ml-2 text-sm text-gray-400 font-normal">
                      총 {boxLog.total.toLocaleString()}건
                    </span>
                  )}
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-gray-100">
                      <tr className="text-xs text-gray-500">
                        <th className="text-left pb-2">유저</th>
                        <th className="text-right pb-2">획득 P</th>
                        <th className="text-right pb-2">등급</th>
                        <th className="text-right pb-2">시각</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {(boxLog?.rows ?? []).map((b, i) => {
                        const pts = b.points_awarded ?? 0
                        const grade =
                          pts >= 7
                            ? { label: '✨ 大当たり', cls: 'text-orange-500' }
                            : pts >= 4
                              ? { label: '🌟 当たり', cls: 'text-indigo-500' }
                              : { label: '🎉 ゲット', cls: 'text-green-600' }
                        return (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="py-1.5 text-xs text-gray-700">
                              {nickOf(b.user_id, b.profiles?.nickname)}
                            </td>
                            <td className="py-1.5 text-right font-bold text-brand text-sm">
                              +{pts} P
                            </td>
                            <td className={`py-1.5 text-right text-xs font-medium ${grade.cls}`}>
                              {grade.label}
                            </td>
                            <td className="py-1.5 text-right text-xs text-gray-400">
                              {timeStr(b.created_at)}
                            </td>
                          </tr>
                        )
                      })}
                      {(boxLog?.rows ?? []).length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-6 text-center text-gray-400 text-xs">
                            기록 없음
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <Pager page={boxPage} setPage={setBoxPage} total={boxLog?.total ?? 0} />
              </div>
            </>
          )}
        </div>
      )}

      {/* ── ⏱️ 게임 완료시간 통계 탭 ── */}
      {tab === 'time' && <GameTimeStats />}
    </div>
  )
}
