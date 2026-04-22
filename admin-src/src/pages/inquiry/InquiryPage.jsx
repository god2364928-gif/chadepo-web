import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

const INQUIRY_BUCKET = 'inquiry-attachments'

// PR-2.2 #6: バケットを private 化したため、画像表示時に signedUrl を発行する。
// path 形式 (例: "<uid>/123_0.png") を受け取り、TTL 1h の URL を返す。
// 万一 http(s) で始まる legacy データが残っていればそのまま返す。
function SignedImage({ path, alt, className, openOnClick = false }) {
  const [url, setUrl] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!path) { setFailed(true); return }
    if (path.startsWith('http://') || path.startsWith('https://')) {
      setUrl(path)
      return
    }
    supabase.storage
      .from(INQUIRY_BUCKET)
      .createSignedUrl(path, 3600)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data?.signedUrl) {
          setFailed(true)
        } else {
          setUrl(data.signedUrl)
        }
      })
    return () => { cancelled = true }
  }, [path])

  if (failed) {
    return (
      <div className={`${className ?? ''} bg-gray-100 flex items-center justify-center text-gray-400 text-[10px]`}>
        画像なし
      </div>
    )
  }
  if (!url) {
    return (
      <div className={`${className ?? ''} bg-gray-100 animate-pulse`} />
    )
  }
  const img = <img src={url} alt={alt} className={className} />
  return openOnClick
    ? <a href={url} target="_blank" rel="noopener noreferrer">{img}</a>
    : img
}

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

// 不満理由コード → 表示ラベル (앱과 동일하게 유지)
const NEGATIVE_REASON_LABELS = {
  hard_to_understand: '理解しづらい',
  not_resolved:       '問題が解決しない',
  slow_response:      '応答が遅い',
  off_topic:          '質問の意図と違う',
  other:              'その他',
}

function fmt(dt) {
  return new Date(dt).toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtTime(dt) {
  return new Date(dt).toLocaleString('ja-JP', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─────────────────────────────────────────────
// 답변 모달 (PR-2: 채팅 형식 + 만족도 표시)
// ─────────────────────────────────────────────
function ReplyModal({ inquiry, onClose }) {
  const qc = useQueryClient()
  const [replyBody, setReplyBody] = useState('')
  const [adminNote, setAdminNote] = useState('')
  const [sending, setSending] = useState(false)

  // 시간순 정렬된 메시지
  const messages = (inquiry.messages ?? [])
    .slice()
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  // 만족도 (0건 또는 1건)
  const feedback = (inquiry.feedback ?? [])[0] ?? null

  // 마지막 메시지의 role — '추가 질문' 여부 판단용
  // PR-2.1: support 답변이 한 번이라도 있어야 "추가 질문"으로 판정.
  // (CS 미회신 상태에서 사용자가 첫 메시지에 보충 정보를 추가로 보낸
  //  경우는 "추가 질문"이 아니라 "추가 정보"일 뿐임)
  const lastMsg = messages[messages.length - 1]
  const hasSupportReply = messages.some(m => m.role === 'support')
  const hasNewUserMessage = lastMsg?.role === 'user' && hasSupportReply

  const submit = async () => {
    if (!replyBody.trim()) return
    setSending(true)
    const { error } = await supabase.from('inquiry_messages').insert({
      ticket_id:  inquiry.id,
      role:       'support',
      content:    replyBody.trim(),
      admin_note: adminNote.trim() || null,
    })
    setSending(false)
    if (!error) {
      qc.invalidateQueries({ queryKey: ['inquiries'] })
      qc.invalidateQueries({ queryKey: ['inquiry-summary'] })
      onClose()
    } else {
      // eslint-disable-next-line no-alert
      alert(`답변 전송 실패: ${error.message ?? '알 수 없는 오류'}`)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl shadow-xl flex flex-col max-h-[90vh]">
        {/* 헤더 */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">
              문의 답변
              {hasNewUserMessage && inquiry.status === 'pending' && (
                <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
                  추가 질문
                </span>
              )}
            </h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {/* 메타 정보 */}
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

            {/* 자동 수집된 사용자 식별 정보 (PR-1) */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs space-y-1.5">
              <InfoRow label="회원 ID"        value={inquiry.user_id ? `u_${inquiry.user_id.slice(0, 8)}` : '-'} mono />
              <InfoRow label="連絡先メール"   value={inquiry.email ?? '(미입력)'} mono copyable={!!inquiry.email} />
              <InfoRow label="端末情報"       value={inquiry.device_info ?? '(미수집 — 旧バージョン)'} />
              <InfoRow label="アプリバージョン" value={inquiry.app_version ?? '(미수집 — 旧バージョン)'} mono />
            </div>

            {/* 만족도 표시 (PR-2) */}
            {feedback && (
              <FeedbackBadge feedback={feedback} />
            )}
          </div>

          {/* 채팅 형식 메시지 스레드 (PR-2) */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">대화 내역 ({messages.length}건)</p>
            {messages.length === 0 ? (
              // 폴백: messages가 비어있으면 inquiry.body를 표시
              <ChatBubble role="user" content={inquiry.body} createdAt={inquiry.created_at} imageUrls={inquiry.image_urls} />
            ) : (
              messages.map((m) => (
                <ChatBubble
                  key={m.id}
                  role={m.role}
                  content={m.content}
                  createdAt={m.created_at}
                  imageUrls={m.image_urls}
                />
              ))
            )}
            {/* 첨부 이미지가 inquiry 차원에 있고 messages는 텍스트만 있는 경우 보강 */}
            {messages.length > 0 && (inquiry.image_urls?.length ?? 0) > 0 && !messages.some(m => (m.image_urls?.length ?? 0) > 0) && (
              <div className="pl-2">
                <p className="text-xs text-gray-400 mb-1">최초 문의 첨부:</p>
                <div className="flex flex-wrap gap-2">
                  {inquiry.image_urls.map((p, i) => (
                    <SignedImage
                      key={i}
                      path={p}
                      alt={`添付画像 ${i + 1}`}
                      openOnClick
                      className="w-20 h-20 object-cover rounded-lg border border-gray-200 hover:opacity-80 cursor-zoom-in"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 답변 입력 (미답변 또는 추가질문 들어온 경우) */}
          {inquiry.status === 'pending' && (
            <div className="space-y-3 border-t border-gray-100 pt-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  답변 내용 <span className="text-red-500">*</span>
                  <span className="text-gray-400 font-normal ml-1">(사용자에게 표시)</span>
                </label>
                <textarea
                  rows={6}
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
                  rows={2}
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
              {sending ? '전송 중...' : (hasNewUserMessage ? '추가 답변 전송' : '답변 전송')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// 채팅 말풍선 (user / support)
// ─────────────────────────────────────────────
function ChatBubble({ role, content, createdAt, imageUrls = [] }) {
  const isUser = role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        <div className="flex items-center gap-1.5 mb-1 text-[11px] text-gray-400">
          <span className={`font-medium ${isUser ? 'text-blue-600' : 'text-green-600'}`}>
            {isUser ? '🧑‍💼 사용자' : '🛟 사포트 답변'}
          </span>
          <span>{fmtTime(createdAt)}</span>
        </div>
        <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-blue-50 text-gray-800 border border-blue-100'
            : 'bg-green-50 text-gray-800 border border-green-100'
        }`}>
          {content}
          {imageUrls?.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {imageUrls.map((p, i) => (
                <SignedImage
                  key={i}
                  path={p}
                  alt={`添付画像 ${i + 1}`}
                  openOnClick
                  className="w-20 h-20 object-cover rounded-lg border border-gray-200 hover:opacity-80 cursor-zoom-in"
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// 만족도 배지 (모달 안)
// ─────────────────────────────────────────────
function FeedbackBadge({ feedback }) {
  const isPos = feedback.rating === 'positive'
  const reason = feedback.feedback_text ? (NEGATIVE_REASON_LABELS[feedback.feedback_text] ?? feedback.feedback_text) : null
  return (
    <div className={`rounded-lg p-3 text-sm flex items-center gap-2 border ${
      isPos
        ? 'bg-green-50 border-green-200 text-green-800'
        : 'bg-red-50 border-red-200 text-red-800'
    }`}>
      <span className="text-lg">{isPos ? '👍' : '👎'}</span>
      <div className="flex-1">
        <span className="font-medium">{isPos ? '解決した' : '不満'}</span>
        {reason && <span className="ml-2 text-xs opacity-80">理由: {reason}</span>}
      </div>
      <span className="text-xs opacity-60">{fmt(feedback.created_at)}</span>
    </div>
  )
}

// 개별 정보 행 (label + value, 선택적으로 모노스페이스/복사 버튼)
function InfoRow({ label, value, mono = false, copyable = false }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      // ignore
    }
  }
  return (
    <div className="flex items-start gap-2">
      <span className="w-28 shrink-0 text-gray-500">{label}</span>
      <span className={`flex-1 text-gray-800 break-all ${mono ? 'font-mono' : ''}`}>{value}</span>
      {copyable && (
        <button
          onClick={handleCopy}
          className="text-[11px] text-blue-600 hover:underline shrink-0"
          type="button"
        >
          {copied ? '✓ 복사됨' : '복사'}
        </button>
      )}
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
          id, user_id, category, body, status, created_at,
          email, device_info, app_version, image_urls, priority, is_read_by_user,
          profiles!user_id(nickname),
          messages:inquiry_messages(id, ticket_id, role, content, image_urls, created_at),
          feedback:inquiry_feedback(rating, feedback_text, created_at)
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * INQ_PAGE, (page + 1) * INQ_PAGE - 1)
      if (filter !== 'all') q = q.eq('status', filter)
      const { data, count, error } = await q
      if (error) throw error
      return {
        rows: data ?? [],
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
                <th className="text-left px-4 py-3 text-gray-500 font-medium">평가</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">접수일시</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">유저</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">유형</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">단말</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">대화</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium">답변</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {inquiries.map(inq => {
                const msgCount = (inq.messages?.length ?? 0)
                const userMsgCount = inq.messages?.filter(m => m.role === 'user').length ?? 0
                const supportReplyCount = inq.messages?.filter(m => m.role === 'support').length ?? 0
                // PR-2.1: support 답변이 1회 이상 있어야 "추가 질문"으로 판정
                const isReQuestion = inq.status === 'pending' && userMsgCount > 1 && supportReplyCount > 0
                const fb = inq.feedback?.[0]
                return (
                  <tr
                    key={inq.id}
                    className={`hover:bg-gray-50 transition-colors ${
                      isReQuestion ? 'bg-orange-50/40' : (inq.status === 'pending' ? 'bg-yellow-50/30' : '')
                    }`}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      {inq.status === 'pending' ? (
                        isReQuestion ? (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700">추가 질문</span>
                        ) : (
                          <span className="badge-yellow">미답변</span>
                        )
                      ) : (
                        <span className="badge-green">완료</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      {fb ? (
                        <span title={fb.feedback_text ? (NEGATIVE_REASON_LABELS[fb.feedback_text] ?? fb.feedback_text) : ''} className="text-base">
                          {fb.rating === 'positive' ? '👍' : '👎'}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">-</span>
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
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap max-w-[180px] truncate" title={inq.device_info ?? ''}>
                      {inq.device_info ?? <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-xs">
                      <p className="truncate">{inq.body}</p>
                      {msgCount > 1 && (
                        <p className="text-[11px] text-gray-400 mt-0.5">+{msgCount - 1}개 메시지</p>
                      )}
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
                )
              })}
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
