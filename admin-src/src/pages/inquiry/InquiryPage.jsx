import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

const FILTERS = [
  { value: 'all',      label: '전체' },
  { value: 'pending',  label: '미답변' },
  { value: 'answered', label: '답변완료' },
]

const CATEGORY_COLORS = {
  '利用方法（機能・使い方）':        'bg-blue-50 text-blue-700',
  'エネルギー／ポイント（積立・消費）': 'bg-yellow-50 text-yellow-700',
  'チャージ・交換（換金関連）':        'bg-green-50 text-green-700',
  'アカウント／退会':                  'bg-purple-50 text-purple-700',
  '不具合・エラー':                    'bg-red-50 text-red-700',
  'その他':                            'bg-gray-100 text-gray-600',
}

function fmt(dt) {
  return new Date(dt).toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─────────────────────────────────────────────
// 답변 모달
// ─────────────────────────────────────────────
function ReplyModal({ inquiry, onClose }) {
  const qc = useQueryClient()
  const [replyBody, setReplyBody] = useState('')
  const [adminNote, setAdminNote] = useState('')
  const [sending, setSending] = useState(false)

  const submit = async () => {
    if (!replyBody.trim()) return
    setSending(true)
    const { error } = await supabase.from('inquiry_replies').insert({
      inquiry_id: inquiry.id,
      reply_body: replyBody.trim(),
      admin_note: adminNote.trim() || null,
    })
    setSending(false)
    if (!error) {
      qc.invalidateQueries(['inquiries'])
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl shadow-xl flex flex-col max-h-[90vh]">
        {/* 헤더 */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">문의 답변</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {/* 문의 정보 */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[inquiry.category] ?? 'bg-gray-100 text-gray-600'}`}>
                {inquiry.category}
              </span>
              <span className="text-xs text-gray-400">{fmt(inquiry.created_at)}</span>
              <span className="text-xs text-gray-500 font-medium">
                {inquiry.profiles?.nickname ?? `ユーザー${inquiry.user_id?.slice(0, 4)}`}
              </span>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
              {inquiry.body}
            </div>
            {/* 첨부 이미지 */}
            {inquiry.image_urls?.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {inquiry.image_urls.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                    <img
                      src={url}
                      alt={`添付画像 ${i + 1}`}
                      className="w-24 h-24 object-cover rounded-lg border border-gray-200 hover:opacity-80 transition-opacity cursor-zoom-in"
                    />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* 이미 답변한 경우 */}
          {inquiry.status === 'answered' && inquiry.reply && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-green-600">✓ 송신된 답변</p>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                {inquiry.reply.reply_body}
              </div>
              <p className="text-xs text-gray-400">{fmt(inquiry.reply.created_at)}</p>
            </div>
          )}

          {/* 답변 입력 (미답변인 경우만) */}
          {inquiry.status === 'pending' && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  답변 내용 <span className="text-red-500">*</span>
                  <span className="text-gray-400 font-normal ml-1">(사용자에게 표시)</span>
                </label>
                <textarea
                  rows={7}
                  value={replyBody}
                  onChange={e => setReplyBody(e.target.value)}
                  placeholder="사용자에게 전달할 답변을 입력하세요..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  내부 메모
                  <span className="text-gray-400 font-normal ml-1">(사용자 비표시)</span>
                </label>
                <textarea
                  rows={3}
                  value={adminNote}
                  onChange={e => setAdminNote(e.target.value)}
                  placeholder="대응 이력, 참고사항 등 (선택)"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">닫기</button>
          {inquiry.status === 'pending' && (
            <button
              onClick={submit}
              disabled={!replyBody.trim() || sending}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? '전송 중...' : '답변 전송'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const INQ_PAGE = 50

// ─────────────────────────────────────────────
// 메인 페이지
// ─────────────────────────────────────────────
export default function InquiryPage() {
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [page, setPage] = useState(0)

  const handleFilter = (f) => { setFilter(f); setPage(0) }

  const { data: result, isLoading } = useQuery({
    queryKey: ['inquiries', filter, page],
    queryFn: async () => {
      let q = supabase
        .from('inquiries')
        .select(`
          *,
          profiles!user_id(nickname),
          reply:inquiry_replies(id, reply_body, created_at)
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * INQ_PAGE, (page + 1) * INQ_PAGE - 1)
      if (filter !== 'all') q = q.eq('status', filter)
      const { data, count, error } = await q
      if (error) throw error
      return {
        rows: (data ?? []).map(row => ({
          ...row,
          reply: Array.isArray(row.reply) ? row.reply[0] ?? null : row.reply,
        })),
        total: count ?? 0,
      }
    },
    keepPreviousData: true,
  })

  const { data: summary } = useQuery({
    queryKey: ['inquiry-summary'],
    queryFn: async () => {
      const { data } = await supabase.from('inquiries').select('status')
      if (!data) return { pending: 0, answered: 0 }
      return {
        pending:  data.filter(i => i.status === 'pending').length,
        answered: data.filter(i => i.status === 'answered').length,
      }
    },
  })

  const inquiries = result?.rows ?? []
  const total     = result?.total ?? 0

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">문의 관리</h1>
        <div className="flex gap-3 text-sm">
          <span className="bg-yellow-50 text-yellow-700 px-3 py-1 rounded-full font-medium">
            미답변 {summary?.pending ?? 0}건
          </span>
          <span className="bg-green-50 text-green-700 px-3 py-1 rounded-full font-medium">
            답변완료 {summary?.answered ?? 0}건
          </span>
        </div>
      </div>

      {/* 필터 탭 */}
      <div className="flex gap-2 border-b border-gray-200">
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => handleFilter(value)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              filter === value
                ? 'border-brand text-brand'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
        {total > 0 && (
          <span className="ml-auto self-center text-xs text-gray-400">전체 {total.toLocaleString()}건</span>
        )}
      </div>

      {/* 목록 */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-gray-400 text-sm">로딩 중...</div>
        ) : inquiries.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">문의가 없습니다</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">상태</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">접수일시</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">유저</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">유형</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">문의 내용</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">답변</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {inquiries.map(inq => (
                <tr
                  key={inq.id}
                  className={`hover:bg-gray-50 transition-colors ${inq.status === 'pending' ? 'bg-yellow-50/30' : ''}`}
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    {inq.status === 'pending' ? (
                      <span className="badge-yellow">미답변</span>
                    ) : (
                      <span className="badge-green">완료</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                    {fmt(inq.created_at)}
                  </td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                    {inq.profiles?.nickname ?? `ユーザー${inq.user_id?.slice(0, 4)}`}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${CATEGORY_COLORS[inq.category] ?? 'bg-gray-100 text-gray-600'}`}>
                      {inq.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700 max-w-xs">
                    <p className="truncate">{inq.body}</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setSelected(inq)}
                      className={inq.status === 'pending' ? 'btn-primary text-xs py-1.5 px-3' : 'btn-secondary text-xs py-1.5 px-3'}
                    >
                      {inq.status === 'pending' ? '답변하기' : '내용 보기'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {total > INQ_PAGE && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-gray-50">← 이전</button>
          <span>{page + 1} / {Math.ceil(total / INQ_PAGE)} 페이지</span>
          <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * INQ_PAGE >= total}
            className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-gray-50">다음 →</button>
        </div>
      )}

      {selected && (
        <ReplyModal inquiry={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
