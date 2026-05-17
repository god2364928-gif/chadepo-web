import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import GameTimeStats from './GameTimeStats'
import { useLanguage } from '../../contexts/LanguageContext'
import { formatJstTimeHm } from '../../utils/jstFormat'

// ── 6개 퀘스트 정의 (앱 코드 기준) ──
const QUESTS = [
  { key: 'daily_attendance', icon: '📅', title: '毎日出席', desc: 'アプリを起動する' },
  {
    key: 'play_game',
    icon: '🎮',
    title: 'ゲームを2回プレイ',
    desc: 'ゲームタブのゲームを2回プレイ',
  },
  {
    key: 'energy_20',
    icon: '⚡',
    title: 'エネルギーを20回受け取る',
    desc: 'ホーム画面でエネルギーを20回タップ',
  },
  { key: 'feed_20', icon: '🍚', title: 'ごはんを20回あげる', desc: '万歩計でキャラにごはんを20回あげる' },
  { key: 'raffle_20', icon: '🎰', title: 'くじを20回引く', desc: 'くじ・抽選を合計20回行う' },
  { key: 'sanpo', icon: '🐾', title: 'お散歩で2マス進む', desc: '1日に2,000歩以上歩く（2マス分）' },
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

// おすすめゲーム 신정책 (2026-05-14): プール = short tier 6種, 매일 1종 선정
// 근거: chadepo-app/sql/migrations/2026_05_14_recommended_short_only.sql
const RECOMMENDED_POOL = Object.entries(GAME_TIER)
  .filter(([, tier]) => tier === 'short')
  .map(([key]) => key)

const LOG_SIZE = 50

function jstToday() {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

// プレイ時刻は JST (運用 OS の TZ に依存しない).
function timeStr(ts) {
  return ts ? formatJstTimeHm(ts) : '—'
}

function nickOf(userId, nickname) {
  return nickname || `ユーザー${userId?.slice(0, 4)}`
}

// 날짜 선택기 컴포넌트
function DatePicker({ value, onChange, todayLabel }) {
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
        {todayLabel}
      </button>
    </div>
  )
}

export default function MissionsPage() {
  const { t } = useLanguage()
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

  // 날짜 바꾸면 페이지 초기화
  const handleDate = (d) => {
    setDate(d)
    setQuestPage(0)
    setGamePage(0)
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
        <span className="text-xs text-gray-400">{t('common.totalPrefix')} {total.toLocaleString()}{t('common.casesUnit')}</span>
        <div className="flex items-center gap-2">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
          >
            {t('common.prev')}
          </button>
          <span className="text-xs text-gray-500">
            {page + 1} / {maxPage + 1}
          </span>
          <button
            disabled={page >= maxPage}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 text-xs rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
          >
            {t('common.next')}
          </button>
        </div>
      </div>
    )
  }

  const TABS = [
    { id: 'quest', label: t('missions.tab.quest') },
    { id: 'game', label: t('missions.tab.game') },
    { id: 'time', label: `⏱️ ${t('missions.tab.time')}` },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('missions.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('missions.subtitle')}
          </p>
        </div>
        {tab !== 'time' && <DatePicker value={date} onChange={handleDate} todayLabel={t('common.today')} />}
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
            <div className="py-12 text-center text-gray-400">{t('common.loading')}</div>
          ) : (
            <>
              {/* 요약 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="card text-center">
                  <p className="text-sm text-gray-500 mb-1">{t('missions.quest.totalCompleted')}</p>
                  <p className="text-3xl font-bold text-gray-900">
                    {totalQuestCompleted.toLocaleString()}{t('common.casesUnit')}
                  </p>
                </div>
                <div className="card text-center">
                  <p className="text-sm text-gray-500 mb-1">{t('missions.quest.uniqueUsers')}</p>
                  <p className="text-3xl font-bold text-brand">
                    {Math.max(
                      ...(questStats ?? []).map((r) => Number(r.unique_users)),
                      0
                    ).toLocaleString()}
                    {t('common.peopleUnitPlus')}
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
                          {uniq > 0 && <p className="text-xs text-gray-400">{uniq}{t('common.peopleUnit')}</p>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* 최근 로그 */}
              <div className="card">
                <h2 className="font-semibold text-gray-900 mb-3">
                  {t('missions.quest.completionLog')}
                  {questLog?.total > 0 && (
                    <span className="ml-2 text-sm text-gray-400 font-normal">
                      {t('common.totalPrefix')} {questLog.total.toLocaleString()}{t('common.casesUnit')}
                    </span>
                  )}
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-gray-100">
                      <tr className="text-xs text-gray-500">
                        <th className="text-left pb-2">{t('missions.col.user')}</th>
                        <th className="text-left pb-2">{t('missions.col.quest')}</th>
                        <th className="text-right pb-2">{t('missions.col.time')}</th>
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
                            {t('common.noRecord')}
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
            <div className="py-12 text-center text-gray-400">{t('common.loading')}</div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-4">
                <div className="card text-center">
                  <p className="text-sm text-gray-500 mb-1">{t('missions.game.totalPlays')}</p>
                  <p className="text-3xl font-bold text-gray-900">
                    {totalGamePlays.toLocaleString()}{t('common.casesUnit')}
                  </p>
                </div>
                <div className="card text-center">
                  <p className="text-sm text-gray-500 mb-1">{t('missions.game.totalPoints')}</p>
                  <p className="text-3xl font-bold text-brand">
                    {totalGamePoints.toLocaleString()} P
                  </p>
                </div>
                <div className="card text-center">
                  <p className="text-sm text-gray-500 mb-1">{t('missions.game.recommendedBonus')}</p>
                  <p className="text-3xl font-bold text-orange-500">
                    +{totalGameBonus.toLocaleString()} P
                  </p>
                </div>
              </div>

              {/* おすすめゲーム 신정책 안내 (2026-05-14~) */}
              <div className="card bg-orange-50/50 border border-orange-200/60">
                <div className="flex items-start gap-2">
                  <span className="text-base">🔥</span>
                  <div className="text-xs text-gray-700 leading-relaxed">
                    <span className="font-semibold text-orange-700">
                      {t('missions.game.policyTitle')}
                    </span>
                    <span className="ml-2 text-gray-500">
                      {t('missions.game.policyDetail')}
                    </span>
                  </div>
                </div>
              </div>

              {/* 게임별 집계 테이블 */}
              <div className="card p-0 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">
                        {t('missions.game.col.game')}
                      </th>
                      <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">
                        {t('missions.game.col.plays')}
                      </th>
                      <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">
                        {t('missions.game.col.users')}
                      </th>
                      <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">
                        {t('missions.game.col.points')}
                      </th>
                      <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">
                        {t('missions.game.col.bonus')}
                      </th>
                      <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">
                        {t('missions.game.col.energyUsed')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(gameStats ?? []).map((g) => {
                      const tier = GAME_TIER[g.game_type]
                      const tm = TIER_META[tier]
                      const inPool = RECOMMENDED_POOL.includes(g.game_type)
                      const hasBonus = Number(g.total_bonus) > 0
                      // 신정책 위반: non-short인데 보너스 발생 = 구 정책 데이터 (2026-05-14 이전 또는 정책 위반)
                      const isLegacyBonus = !inPool && hasBonus
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
                              {inPool && (
                                <span
                                  className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 bg-orange-100 text-orange-700"
                                  title={t('missions.game.recommendedPoolTooltip')}
                                >
                                  🔥 {t('missions.game.recommendedPool')}
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
                          <td className="px-4 py-2.5 text-right">
                            {hasBonus ? (
                              <span
                                className={
                                  isLegacyBonus ? 'text-gray-400 line-through' : 'text-orange-500'
                                }
                                title={
                                  isLegacyBonus
                                    ? t('missions.game.legacyBonusTooltip')
                                    : undefined
                                }
                              >
                                +{Number(g.total_bonus).toLocaleString()}
                                {isLegacyBonus && (
                                  <span className="ml-1 text-[10px] not-italic">⚠️</span>
                                )}
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
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
                          {t('common.noRecord')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* 최근 플레이 로그 */}
              <div className="card">
                <h2 className="font-semibold text-gray-900 mb-3">
                  {t('missions.game.recentLog')}
                  {gameLog?.total > 0 && (
                    <span className="ml-2 text-sm text-gray-400 font-normal">
                      {t('common.totalPrefix')} {gameLog.total.toLocaleString()}{t('common.casesUnit')}
                    </span>
                  )}
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-gray-100">
                      <tr className="text-xs text-gray-500">
                        <th className="text-left pb-2">{t('missions.col.user')}</th>
                        <th className="text-left pb-2">{t('missions.game.col.game')}</th>
                        <th className="text-right pb-2">{t('missions.game.col.energy')}</th>
                        <th className="text-right pb-2">{t('missions.game.col.points')}</th>
                        <th className="text-right pb-2">{t('missions.col.time')}</th>
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
                            {t('common.noRecord')}
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

      {/* ── ⏱️ 게임 완료시간 통계 탭 ── */}
      {tab === 'time' && <GameTimeStats />}
    </div>
  )
}
