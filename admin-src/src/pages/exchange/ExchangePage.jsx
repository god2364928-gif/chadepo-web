import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

function ItemModal({ item, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    title_ja:    item?.title_ja ?? '',
    point_cost:  item?.point_cost ?? '',
    min_points:  item?.min_points ?? '',
    face_value:  item?.face_value ?? '',
    daily_limit: item?.daily_limit ?? '',
    method:      item?.method ?? '',
    sort_order:  item?.sort_order ?? 0,
    is_active:   item?.is_active ?? true,
  })
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    const payload = {
      ...form,
      point_cost:  Number(form.point_cost),
      min_points:  Number(form.min_points),
      face_value:  form.face_value !== '' ? Number(form.face_value) : null,
      daily_limit: form.daily_limit !== '' ? Number(form.daily_limit) : null,
      sort_order:  Number(form.sort_order),
    }
    const q = item
      ? supabase.from('exchange_items').update(payload).eq('id', item.id)
      : supabase.from('exchange_items').insert(payload)
    const { error } = await q
    setLoading(false)
    if (!error) { qc.invalidateQueries(['exchange-items']); onClose() }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">{item ? '상품 수정' : '상품 추가'}</h3>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {[
            { label: '상품명 (일본어)', key: 'title_ja',    type: 'text',   placeholder: 'Amazonギフトカード 500円', required: true },
            { label: '방식 (method)', key: 'method',       type: 'text',   placeholder: 'amazon_gift',            required: true },
            { label: '액면가 (円)',   key: 'face_value',   type: 'number', placeholder: '500',                    required: false },
            { label: '필요 포인트',   key: 'point_cost',   type: 'number', placeholder: '5000',                   required: true },
            { label: '최소 보유 P',   key: 'min_points',   type: 'number', placeholder: '5000',                   required: true },
            { label: '일일 한도',     key: 'daily_limit',  type: 'number', placeholder: '비워두면 무제한',         required: false },
            { label: '정렬 순서',     key: 'sort_order',   type: 'number', placeholder: '0',                      required: true },
          ].map(({ label, key, type, placeholder, required }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input type={type} className="input" placeholder={placeholder}
                value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} required={required} />
            </div>
          ))}
          <div className="flex items-center gap-2">
            <input type="checkbox" id="is_active" checked={form.is_active}
              onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
            <label htmlFor="is_active" className="text-sm text-gray-700">노출 활성화</label>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="btn-secondary">취소</button>
            <button type="submit" className="btn-primary" disabled={loading}>{loading ? '저장 중...' : '저장'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

const PAGE = 50

export default function ExchangePage() {
  const qc = useQueryClient()
  const [tab, setTab]       = useState('requests')
  const [editItem, setEditItem] = useState(undefined)
  const [filter, setFilter] = useState('pending')
  const [page, setPage]     = useState(0)

  const handleFilter = (f) => { setFilter(f); setPage(0) }

  const { data: requests, isLoading: reqLoading } = useQuery({
    queryKey: ['exchange-requests', filter, page],
    queryFn: async () => {
      let q = supabase
        .from('exchange_requests')
        .select('*, profiles!user_id(nickname), exchange_items!item_id(title_ja, method)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * PAGE, (page + 1) * PAGE - 1)
      if (filter !== 'all') q = q.eq('status', filter)
      const { data, count } = await q
      return { rows: data ?? [], total: count ?? 0 }
    },
    keepPreviousData: true,
  })

  const { data: reqSummary } = useQuery({
    queryKey: ['exchange-summary'],
    queryFn: async () => {
      const { data } = await supabase
        .from('exchange_requests')
        .select('status')
      if (!data) return {}
      return data.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc }, {})
    },
  })

  const { data: items } = useQuery({
    queryKey: ['exchange-items'],
    queryFn: async () => {
      const { data } = await supabase.from('exchange_items').select('*').order('sort_order')
      return data ?? []
    },
  })

  const deliver = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('exchange_requests').update({ status: 'completed' }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries(['exchange-requests', filter]),
  })

  const toggleActive = useMutation({
    mutationFn: async ({ id, val }) => {
      const { error } = await supabase.from('exchange_items').update({ is_active: val }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries(['exchange-items']),
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">교환 관리</h1>

      <div className="flex gap-2 border-b border-gray-200">
        {[['requests', '교환 신청'], ['items', '상품 목록']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === k ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>{l}</button>
        ))}
      </div>

      {tab === 'requests' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            {[['pending', '대기 중'], ['completed', '처리완료'], ['all', '전체']].map(([v, l]) => (
              <button key={v} onClick={() => handleFilter(v)}
                className={filter === v ? 'btn-primary text-xs py-1.5 px-3' : 'btn-secondary text-xs py-1.5 px-3'}>{l}</button>
            ))}
            {requests?.total > 0 && (
              <span className="ml-auto text-xs text-gray-400">전체 {requests.total.toLocaleString()}건</span>
            )}
          </div>
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">신청일</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">유저</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">상품</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">소비 P</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">상태</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">처리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(requests?.rows ?? []).map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleString('ko-KR')}</td>
                    <td className="px-4 py-3">
                      <Link to={`/admin/users/${r.user_id}`} className="text-brand hover:underline">
                        {r.profiles?.nickname || `ユーザー${r.user_id?.slice(0, 4)}`}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div>{r.exchange_items?.title_ja ?? '—'}</div>
                      {r.exchange_items?.method && (
                        <div className="text-xs text-gray-400">{r.exchange_items.method}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{r.points_spent?.toLocaleString()} P</td>
                    <td className="px-4 py-3 text-right">
                      <span className={
                        r.status === 'pending'    ? 'badge-yellow' :
                        r.status === 'processing' ? 'badge-blue'   :
                        r.status === 'completed'  ? 'badge-green'  : 'badge-gray'
                      }>
                        {r.status === 'pending'    ? '대기중'   :
                         r.status === 'processing' ? '처리중'   :
                         r.status === 'completed'  ? '완료'     :
                         r.status === 'failed'     ? '실패'     : r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {(r.status === 'pending' || r.status === 'processing') && (
                        <button onClick={() => deliver.mutate(r.id)} className="text-xs text-brand hover:underline">완료 처리</button>
                      )}
                    </td>
                  </tr>
                ))}
                {(requests?.rows ?? []).length === 0 && !reqLoading && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">신청 내역이 없습니다</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {requests?.total > PAGE && (
            <div className="flex items-center justify-between text-sm text-gray-500 mt-1">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-gray-50">← 이전</button>
              <span>{page + 1} / {Math.ceil(requests.total / PAGE)} 페이지</span>
              <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * PAGE >= requests.total}
                className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-gray-50">다음 →</button>
            </div>
          )}
        </div>
      )}

      {tab === 'items' && (
        <div className="space-y-4">
          {editItem !== undefined && <ItemModal item={editItem || null} onClose={() => setEditItem(undefined)} />}
          <div className="flex justify-end">
            <button onClick={() => setEditItem(null)} className="btn-primary text-sm">+ 상품 추가</button>
          </div>
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">상품명</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">방식</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">필요 P</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">최소 P</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">일일 한도</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">순서</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">노출</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">수정</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(items ?? []).map(it => (
                  <tr key={it.id} className={`hover:bg-gray-50 ${!it.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-medium">{it.title_ja}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{it.method ?? '—'}</td>
                    <td className="px-4 py-3 text-right">{it.point_cost?.toLocaleString()} P</td>
                    <td className="px-4 py-3 text-right">{it.min_points?.toLocaleString()} P</td>
                    <td className="px-4 py-3 text-right text-gray-500">{it.daily_limit ?? '무제한'}</td>
                    <td className="px-4 py-3 text-right">{it.sort_order}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => toggleActive.mutate({ id: it.id, val: !it.is_active })}
                        className={it.is_active ? 'badge-green cursor-pointer' : 'badge-gray cursor-pointer'}>
                        {it.is_active ? 'ON' : 'OFF'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setEditItem(it)} className="text-xs text-brand hover:underline">수정</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
