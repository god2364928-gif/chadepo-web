import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLanguage } from '../../contexts/LanguageContext'
import { formatJstDateTime } from '../../utils/jstFormat'

function ItemModal({ item, onClose }) {
  const qc = useQueryClient()
  const { t } = useLanguage()
  const [form, setForm] = useState({
    title_ja: item?.title_ja ?? '',
    point_cost: item?.point_cost ?? '',
    min_points: item?.min_points ?? '',
    face_value: item?.face_value ?? '',
    daily_limit: item?.daily_limit ?? '',
    method: item?.method ?? '',
    sort_order: item?.sort_order ?? 0,
    is_active: item?.is_active ?? true,
  })
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    const payload = {
      ...form,
      point_cost: Number(form.point_cost),
      min_points: Number(form.min_points),
      face_value: form.face_value !== '' ? Number(form.face_value) : null,
      daily_limit: form.daily_limit !== '' ? Number(form.daily_limit) : null,
      sort_order: Number(form.sort_order),
    }
    const q = item
      ? supabase.from('exchange_items').update(payload).eq('id', item.id)
      : supabase.from('exchange_items').insert(payload)
    const { error } = await q
    setLoading(false)
    if (!error) {
      qc.invalidateQueries({ queryKey: ['exchange-items'] })
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">{item ? t('exchange.item.editTitle') : t('exchange.item.addTitle')}</h3>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {[
            {
              label: t('exchange.item.field.titleJa'),
              key: 'title_ja',
              type: 'text',
              placeholder: 'Amazonギフトカード 500円',
              required: true,
            },
            {
              label: t('exchange.item.field.method'),
              key: 'method',
              type: 'text',
              placeholder: 'amazon_gift',
              required: true,
            },
            {
              label: t('exchange.item.field.faceValue'),
              key: 'face_value',
              type: 'number',
              placeholder: '500',
              required: false,
            },
            {
              label: t('exchange.item.field.pointCost'),
              key: 'point_cost',
              type: 'number',
              placeholder: '5000',
              required: true,
            },
            {
              label: t('exchange.item.field.minPoints'),
              key: 'min_points',
              type: 'number',
              placeholder: '5000',
              required: true,
            },
            {
              label: t('exchange.item.field.dailyLimit'),
              key: 'daily_limit',
              type: 'number',
              placeholder: t('exchange.item.field.dailyLimitPlaceholder'),
              required: false,
            },
            {
              label: t('exchange.item.field.sortOrder'),
              key: 'sort_order',
              type: 'number',
              placeholder: '0',
              required: true,
            },
          ].map(({ label, key, type, placeholder, required }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input
                type={type}
                className="input"
                placeholder={placeholder}
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                required={required}
              />
            </div>
          ))}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            />
            <label htmlFor="is_active" className="text-sm text-gray-700">
              {t('exchange.item.activeLabel')}
            </label>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="btn-secondary">
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const PAGE = 50

export default function ExchangePage() {
  const qc = useQueryClient()
  const { t } = useLanguage()
  const [tab, setTab] = useState('requests')
  const [editItem, setEditItem] = useState(undefined)
  const [filter, setFilter] = useState('pending')
  const [page, setPage] = useState(0)

  const handleFilter = (f) => {
    setFilter(f)
    setPage(0)
  }

  const { data: requests, isLoading: reqLoading } = useQuery({
    queryKey: ['exchange-requests', filter, page],
    queryFn: async () => {
      let q = supabase
        .from('exchange_requests')
        .select('*, profiles!user_id(nickname), exchange_items!item_id(title_ja, method)', {
          count: 'exact',
        })
        .order('created_at', { ascending: false })
        .range(page * PAGE, (page + 1) * PAGE - 1)
      if (filter !== 'all') q = q.eq('status', filter)
      const { data, count } = await q
      return { rows: data ?? [], total: count ?? 0 }
    },
    keepPreviousData: true,
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
      const { error } = await supabase
        .from('exchange_requests')
        .update({ status: 'completed' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exchange-requests', filter] }),
  })

  const toggleActive = useMutation({
    mutationFn: async ({ id, val }) => {
      const { error } = await supabase
        .from('exchange_items')
        .update({ is_active: val })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exchange-items'] }),
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">{t('exchange.title')}</h1>

      <div className="flex gap-2 border-b border-gray-200">
        {[
          ['requests', t('exchange.tab.requests')],
          ['items', t('exchange.tab.items')],
        ].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === k
                ? 'border-brand text-brand'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === 'requests' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            {[
              ['pending', t('exchange.filter.pending')],
              ['completed', t('exchange.filter.completed')],
              ['all', t('exchange.filter.all')],
            ].map(([v, l]) => (
              <button
                key={v}
                onClick={() => handleFilter(v)}
                className={
                  filter === v
                    ? 'btn-primary text-xs py-1.5 px-3'
                    : 'btn-secondary text-xs py-1.5 px-3'
                }
              >
                {l}
              </button>
            ))}
            {requests?.total > 0 && (
              <span className="ml-auto text-xs text-gray-400">
                {t('exchange.totalLabel')} {requests.total.toLocaleString()}{t('exchange.countSuffix')}
              </span>
            )}
          </div>
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">{t('exchange.col.requestedAt')}</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">{t('exchange.col.user')}</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">{t('exchange.col.item')}</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">{t('exchange.col.pointsSpent')}</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">{t('exchange.col.status')}</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">{t('exchange.col.action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(requests?.rows ?? []).map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {formatJstDateTime(r.created_at)}
                    </td>
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
                    <td className="px-4 py-3 text-right font-medium">
                      {r.points_spent?.toLocaleString()} P
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={
                          r.status === 'pending'
                            ? 'badge-yellow'
                            : r.status === 'processing'
                              ? 'badge-blue'
                              : r.status === 'completed'
                                ? 'badge-green'
                                : 'badge-gray'
                        }
                      >
                        {r.status === 'pending'
                          ? t('exchange.status.pending')
                          : r.status === 'processing'
                            ? t('exchange.status.processing')
                            : r.status === 'completed'
                              ? t('exchange.status.completed')
                              : r.status === 'failed'
                                ? t('exchange.status.failed')
                                : r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {(r.status === 'pending' || r.status === 'processing') && (
                        <button
                          onClick={() => deliver.mutate(r.id)}
                          className="text-xs text-brand hover:underline"
                        >
                          {t('exchange.action.complete')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {(requests?.rows ?? []).length === 0 && !reqLoading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      {t('exchange.empty.requests')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {requests?.total > PAGE && (
            <div className="flex items-center justify-between text-sm text-gray-500 mt-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                {t('common.prev')}
              </button>
              <span>
                {page + 1} / {Math.ceil(requests.total / PAGE)} {t('common.pageSuffix')}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={(page + 1) * PAGE >= requests.total}
                className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                {t('common.next')}
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'items' && (
        <div className="space-y-4">
          {editItem !== undefined && (
            <ItemModal item={editItem || null} onClose={() => setEditItem(undefined)} />
          )}
          <div className="flex justify-end">
            <button onClick={() => setEditItem(null)} className="btn-primary text-sm">
              {t('exchange.item.addButton')}
            </button>
          </div>
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">{t('exchange.col.itemName')}</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">{t('exchange.col.method')}</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">{t('exchange.col.requiredP')}</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">{t('exchange.col.minP')}</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">{t('exchange.col.dailyLimit')}</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">{t('exchange.col.order')}</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">{t('exchange.col.visible')}</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">{t('exchange.col.edit')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(items ?? []).map((it) => (
                  <tr
                    key={it.id}
                    className={`hover:bg-gray-50 ${!it.is_active ? 'opacity-50' : ''}`}
                  >
                    <td className="px-4 py-3 font-medium">{it.title_ja}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{it.method ?? '—'}</td>
                    <td className="px-4 py-3 text-right">{it.point_cost?.toLocaleString()} P</td>
                    <td className="px-4 py-3 text-right">{it.min_points?.toLocaleString()} P</td>
                    <td className="px-4 py-3 text-right text-gray-500">
                      {it.daily_limit ?? t('exchange.unlimited')}
                    </td>
                    <td className="px-4 py-3 text-right">{it.sort_order}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => toggleActive.mutate({ id: it.id, val: !it.is_active })}
                        className={
                          it.is_active ? 'badge-green cursor-pointer' : 'badge-gray cursor-pointer'
                        }
                      >
                        {it.is_active ? 'ON' : 'OFF'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setEditItem(it)}
                        className="text-xs text-brand hover:underline"
                      >
                        {t('common.edit')}
                      </button>
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
