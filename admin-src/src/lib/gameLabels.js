// 게임 종류별 표시 라벨 (앱 코드 기준).
// MissionsPage / GameTimeStats / GameAbuseLog 등에서 공유.

export const GAME_TYPE_LABELS = {
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

// 측정 의미: 「퍼즐형(시간 측정 의미 있음)」 / 「운형·고정형(시간 측정 의미 없음)」
// 단, reaction_speed 는 score_ms 로 측정.
export const PUZZLE_GAME_TYPES = new Set([
  'sudoku',
  'sudoku_4x4',
  'sudoku_9x9',
  'sudoku_9x9_hard',
  'nurie',
  'word_search',
  'number_puzzle',
  'wordle',
  'math_puzzle',
  'crossword',
  'memory_card',
])

// 게임 그룹 (운영 화면에서 색상 배지용).
export const GAME_TIER = {
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

export const TIER_META = {
  short: { label: 'かんたん', cls: 'bg-green-100 text-green-700' },
  medium: { label: 'ふつう', cls: 'bg-yellow-100 text-yellow-700' },
  long: { label: 'むずかしい', cls: 'bg-red-100 text-red-700' },
}

// 닉네임 폴백 (UUID 앞 4자리 표시).
export function nickOf(userId, nickname) {
  return nickname || `ユーザー${userId?.slice(0, 4) ?? '????'}`
}
