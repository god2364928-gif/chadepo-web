import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

const ACTION_META = {
  requested: { label: 'requested', cls: 'bg-yellow-100 text-yellow-700', desc: '삭제 신청' },
  cancelled: { label: 'cancelled', cls: 'bg-blue-100 text-blue-700', desc: '신청 취소' },
  purged: { label: 'purged', cls: 'bg-red-100 text-red-700', desc: '실삭제 완료' },
}

const LIMITS = [50, 100, 200, 500]

function fmtDateTime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('ko-KR', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function shortHash(h) {
  if (!h) return '—'
  if (h.length <= 16) return h
  return `${h.slice(0, 8)}…${h.slice(-6)}`
}

export default function AccountLifecyclePage() {
  // 삭제 로그 필터
  const [action, setAction] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [logLimit, setLogLimit] = useState(100)

  // 정지 해시 필터
  const [banSearch, setBanSearch] = useState('')
  const [banLimit, setBanLimit] = useState(100)

  const logArgs = {
    p_action: action || null,
    p_from: from || null,
    p_to: to || null,
    p_limit: logLimit,
  }

  const banArgs = {
    p_search: banSearch.trim() || null,
    p_limit: banLimit,
  }

  const {
    data: logs,
    isLoading: logsLoading,
    error: logsError,
  } = useQuery({
    queryKey: ['account-deletion-log', logArgs],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_account_deletion_log', logArgs)
      if (error) throw error
      return data ?? []
    },
    staleTime: 30_000,
  })

  const {
    data: hashes,
    isLoading: hashesLoading,
    error: hashesError,
  } = useQuery({
    queryKey: ['banned-user-hashes', banArgs],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_banned_user_hashes', banArgs)
      if (error) throw error
      return data ?? []
    },
    staleTime: 30_000,
  })

  // 삭제 로그 액션별 카운트
  const counts = (logs ?? []).reduce(
    (acc, r) => {
      acc[r.action] = (acc[r.action] ?? 0) + 1
      return acc
    },
    { requested: 0, cancelled: 0, purged: 0 }
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">🗑️ 계정 정지/삭제</h1>
        <p className="text-xs text-gray-500 mt-1">
          계정 삭제 감사 로그 + 정지된 이메일 해시 (재가입 차단)
        </p>
      </div>

      {/* ───────────── 1. 계정 삭제 로그 ───────────── */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-gray-900">계정 삭제 로그</h2>
          <div className="text-xs text-gray-400 flex gap-3 items-center">
            <span>
              requested <b className="text-yellow-700">{counts.requested}</b>
            </span>
            <span>
              cancelled <b className="text-blue-700">{counts.cancelled}</b>
            </span>
            <span>
              purged <b className="text-red-700">{counts.purged}</b>
            </span>
            <span className="text-[10px] text-gray-300" title="RPC 최대 limit 안에서 잡힌 행만 카운트한 값입니다. 전체 누적값이 아닙니다.">
              (표시된 {logs?.length ?? 0}건 기준)
            </span>
          </div>
        </div>

        {/* 필터 */}
        <div className="card">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">action</label>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30"
              >
                <option value="">전체</option>
                <option value="requested">requested (삭제 신청)</option>
                <option value="cancelled">cancelled (신청 취소)</option>
                <option value="purged">purged (실삭제)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">from</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">to</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">표시 건수</label>
              <select
                value={logLimit}
                onChange={(e) => setLogLimit(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30"
              >
                {LIMITS.map((n) => (
                  <option key={n} value={n}>
                    {n}건
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 결과 */}
        {logsError ? (
          <div className="card text-red-600 text-sm">로그 불러오기 실패: {logsError.message}</div>
        ) : logsLoading ? (
          <div className="card py-12 text-center text-gray-400 text-sm">불러오는 중...</div>
        ) : (logs ?? []).length === 0 ? (
          <div className="card py-12 text-center text-gray-400 text-sm">조건에 맞는 로그 없음</div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <span className="text-xs text-gray-500">
                총 {logs.length.toLocaleString()}건 (최신순)
              </span>
              <span className="text-[10px] text-gray-400">
                ※ purge 된 행은 profiles 가 삭제되어 상세를 열 수 없으므로 (purged) 로 표시됩니다
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                  <tr>
                    <th className="text-left  px-4 py-3 font-medium">시각</th>
                    <th className="text-left  px-4 py-3 font-medium">action</th>
                    <th className="text-left  px-4 py-3 font-medium">유저</th>
                    <th className="text-left  px-4 py-3 font-medium">email_hash</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map((r) => {
                    const meta = ACTION_META[r.action]
                    return (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-xs text-gray-500">
                          {fmtDateTime(r.created_at)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`text-xs px-2 py-0.5 rounded font-medium ${
                              meta?.cls ?? 'bg-gray-100 text-gray-600'
                            }`}
                            title={meta?.desc}
                          >
                            {meta?.label ?? r.action}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          {/* purge 후엔 profiles row 가 사라져 상세 페이지가 404 가 된다.
                              account_deletion_log.user_id 는 FK 가 없어 그대로 살아남으므로
                              action 으로 분기해 링크를 박지 않는다. */}
                          {r.action === 'purged' || !r.user_id ? (
                            <span className="text-gray-400 italic">(purged)</span>
                          ) : (
                            <Link
                              to={`/admin/users/${r.user_id}`}
                              className="text-brand hover:underline font-medium"
                            >
                              {r.nickname ?? `user-${r.user_id.slice(0, 4)}`}
                            </Link>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-500 font-mono">
                          {shortHash(r.email_hash)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ───────────── 2. 정지된 이메일 해시 ───────────── */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-gray-900">정지된 이메일 해시</h2>
          <span className="text-xs text-gray-400">
            ※ purge 시 자동 차단되어 동일 이메일로 재가입 불가
          </span>
        </div>

        {/* 필터 */}
        <div className="card">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">검색 (해시 또는 사유)</label>
              <input
                type="text"
                value={banSearch}
                onChange={(e) => setBanSearch(e.target.value)}
                placeholder="email_hash / banned_reason 부분일치"
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">표시 건수</label>
              <select
                value={banLimit}
                onChange={(e) => setBanLimit(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30"
              >
                {LIMITS.map((n) => (
                  <option key={n} value={n}>
                    {n}건
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 결과 */}
        {hashesError ? (
          <div className="card text-red-600 text-sm">
            정지 해시 불러오기 실패: {hashesError.message}
          </div>
        ) : hashesLoading ? (
          <div className="card py-12 text-center text-gray-400 text-sm">불러오는 중...</div>
        ) : (hashes ?? []).length === 0 ? (
          <div className="card py-12 text-center text-gray-400 text-sm">정지된 해시 없음 ✅</div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200">
              <span className="text-xs text-gray-500">
                총 {hashes.length.toLocaleString()}건 (최신 차단순)
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
                  <tr>
                    <th className="text-left  px-4 py-3 font-medium">차단 시각</th>
                    <th className="text-left  px-4 py-3 font-medium">email_hash</th>
                    <th className="text-left  px-4 py-3 font-medium">사유</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {hashes.map((h) => (
                    <tr key={h.email_hash} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-xs text-gray-500">{fmtDateTime(h.banned_at)}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-700 font-mono">
                        <span title={h.email_hash}>{shortHash(h.email_hash)}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-700">
                        {h.banned_reason || <span className="text-gray-400 italic">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
