import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  utcToJstInputValue,
  jstInputValueToUtcIso,
  formatJstDateTimeShort,
} from '../../utils/jstFormat'

// ───────────────────────── 상수 ─────────────────────────

const ANDROID_CHANNELS = ['default', 'raffle_winner', 'referral_signup', 'inquiry_reply']

function useCampaignTypes() {
  const { t } = useLanguage()
  return [
    { value: 'campaign', label: t('campaigns.type.campaign'), requiresMarketingOptIn: true },
    { value: 'notice', label: t('campaigns.type.notice') },
    { value: 'maintenance', label: t('campaigns.type.maintenance') },
    { value: 'reward_reminder', label: t('campaigns.type.reward_reminder') },
  ]
}

function useStatusLabels() {
  const { t } = useLanguage()
  return {
    draft: { label: t('campaigns.status.draft'), color: 'bg-gray-100 text-gray-700' },
    approved: { label: t('campaigns.status.approved'), color: 'bg-blue-100 text-blue-700' },
    scheduled: { label: t('campaigns.status.scheduled'), color: 'bg-indigo-100 text-indigo-700' },
    sending: { label: t('campaigns.status.sending'), color: 'bg-yellow-100 text-yellow-800' },
    sent: { label: t('campaigns.status.sent'), color: 'bg-green-100 text-green-700' },
    cancelled: { label: t('campaigns.status.cancelled'), color: 'bg-gray-200 text-gray-600' },
    failed: { label: t('campaigns.status.failed'), color: 'bg-red-100 text-red-700' },
  }
}

// キャンペーン関連の表示時刻はすべて JST 固定 (運用 PC の TZ に左右されない).
function useFmtDt() {
  return (s) => (s ? formatJstDateTimeShort(s) : '-')
}

// ─────────────────────── 메인 페이지 ───────────────────────

export default function CampaignsPage() {
  const { t } = useLanguage()
  const fmtDt = useFmtDt()
  const [selectedId, setSelectedId] = useState(null)
  const [creating, setCreating] = useState(false)

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ['notification_campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_campaigns')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{t('campaigns.title')}</h1>
          <p className="text-xs text-gray-500 mt-1">
            {t('campaigns.subtitle')}
          </p>
        </div>
        <button
          onClick={() => {
            setSelectedId(null)
            setCreating(true)
          }}
          className="px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:opacity-90"
        >
          {t('campaigns.newButton')}
        </button>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* 좌측: 리스트 */}
        <div className="col-span-5 bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 text-xs font-medium text-gray-500">
            {t('campaigns.recent100')}
          </div>
          {isLoading ? (
            <div className="p-8 text-center text-sm text-gray-400">{t('common.loading')}</div>
          ) : !campaigns?.length ? (
            <div className="p-8 text-center text-sm text-gray-400">{t('campaigns.emptyList')}</div>
          ) : (
            <div className="divide-y divide-gray-100 max-h-[70vh] overflow-y-auto">
              {campaigns.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedId(c.id)
                    setCreating(false)
                  }}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${
                    selectedId === c.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <StatusBadge status={c.status} />
                    <span className="text-[10px] text-gray-400">{c.type}</span>
                  </div>
                  <div className="text-sm font-medium truncate">{c.title}</div>
                  <div className="text-[11px] text-gray-500 truncate mt-0.5">{c.body}</div>
                  <div className="text-[10px] text-gray-400 mt-1">{fmtDt(c.created_at)}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 우측: 디테일/생성 */}
        <div className="col-span-7">
          {creating ? (
            <CampaignEditor
              campaign={null}
              onSaved={(id) => {
                setCreating(false)
                setSelectedId(id)
              }}
              onCancel={() => setCreating(false)}
            />
          ) : selectedId ? (
            <CampaignDetail key={selectedId} campaignId={selectedId} />
          ) : (
            <div className="bg-white rounded-lg shadow-sm p-8 text-center text-sm text-gray-400">
              {t('campaigns.selectHint')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────── 상태 배지 ───────────────────────

function StatusBadge({ status }) {
  const STATUS_LABELS = useStatusLabels()
  const s = STATUS_LABELS[status] ?? { label: status, color: 'bg-gray-100 text-gray-700' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${s.color}`}>
      {s.label}
    </span>
  )
}

// ─────────────────────── 디테일 + 액션 ───────────────────────

function CampaignDetail({ campaignId }) {
  const { t } = useLanguage()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)

  const { data: c, isLoading } = useQuery({
    queryKey: ['notification_campaign', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_campaigns')
        .select('*')
        .eq('id', campaignId)
        .single()
      if (error) throw error
      return data
    },
  })

  if (isLoading) return <div className="bg-white p-8 rounded-lg text-center text-sm">{t('common.loading')}</div>
  if (!c) return <div className="bg-white p-8 rounded-lg text-center text-sm text-red-500">{t('campaigns.notFound')}</div>

  if (editing) {
    return (
      <CampaignEditor
        campaign={c}
        onSaved={() => {
          setEditing(false)
          qc.invalidateQueries({ queryKey: ['notification_campaign', campaignId] })
          qc.invalidateQueries({ queryKey: ['notification_campaigns'] })
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  const canEdit = c.status === 'draft'

  return (
    <div className="bg-white rounded-lg shadow-sm divide-y divide-gray-100">
      <div className="px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusBadge status={c.status} />
          <span className="text-xs text-gray-400">{c.type}</span>
        </div>
        {canEdit && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-blue-600 hover:underline"
          >
            {t('common.edit')}
          </button>
        )}
      </div>

      <div className="px-5 py-4">
        <div className="text-xs text-gray-500 mb-1">{t('campaigns.fields.title')}</div>
        <div className="text-sm font-medium">{c.title}</div>
        <div className="text-xs text-gray-500 mt-3 mb-1">{t('campaigns.fields.body')}</div>
        <div className="text-sm whitespace-pre-wrap">{c.body}</div>
        {c.deep_link && (
          <>
            <div className="text-xs text-gray-500 mt-3 mb-1">deep_link</div>
            <div className="text-sm font-mono text-blue-600">{c.deep_link}</div>
          </>
        )}
        {c.legal_memo && (
          <>
            <div className="text-xs text-gray-500 mt-3 mb-1">{t('campaigns.fields.legalMemo')}</div>
            <div className="text-xs whitespace-pre-wrap bg-yellow-50 p-2 rounded">{c.legal_memo}</div>
          </>
        )}
      </div>

      <ProgressSection campaign={c} />

      <DeliveryBreakdown campaignId={c.id} />

      <ActionsSection campaign={c} />

      <MetaSection campaign={c} />
    </div>
  )
}

function ProgressSection({ campaign: c }) {
  const { t } = useLanguage()
  if (!c.total_recipients && !c.sent_count && !c.failed_count && !c.skipped_count) return null
  const total = c.total_recipients ?? 0
  const done = (c.sent_count ?? 0) + (c.failed_count ?? 0) + (c.skipped_count ?? 0)
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
  return (
    <div className="px-5 py-4 bg-gray-50">
      <div className="text-xs font-medium text-gray-600 mb-2">{t('campaigns.progress.title')}</div>
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
          <div className="bg-brand h-full" style={{ width: `${pct}%` }} />
        </div>
        <div className="text-xs text-gray-600 font-mono">{pct}%</div>
      </div>
      <div className="grid grid-cols-4 gap-2 text-xs">
        <Stat label={t('campaigns.progress.target')} value={total} />
        <Stat label={t('campaigns.progress.success')} value={c.sent_count ?? 0} color="text-green-700" />
        <Stat label={t('campaigns.progress.failed')} value={c.failed_count ?? 0} color="text-red-600" />
        <Stat label={t('campaigns.progress.skipped')} value={c.skipped_count ?? 0} color="text-gray-600" />
      </div>
    </div>
  )
}

function DeliveryBreakdown({ campaignId }) {
  const { t } = useLanguage()
  const { data: rows, isLoading } = useQuery({
    queryKey: ['notification_deliveries_breakdown', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_deliveries')
        .select('status, fcm_error_code, skip_reason')
        .eq('campaign_id', campaignId)
      if (error) throw error
      return data
    },
    staleTime: 10_000,
  })

  if (isLoading) return null
  if (!rows?.length) return null

  // 실패 사유별 / 스킵 사유별 집계
  const failureMap = new Map()
  const skipMap = new Map()
  for (const r of rows) {
    if (r.status === 'failed') {
      const key = r.fcm_error_code ?? 'UNKNOWN'
      failureMap.set(key, (failureMap.get(key) ?? 0) + 1)
    } else if (r.status === 'skipped') {
      const key = r.skip_reason ?? 'unknown'
      skipMap.set(key, (skipMap.get(key) ?? 0) + 1)
    }
  }

  if (failureMap.size === 0 && skipMap.size === 0) return null

  return (
    <div className="px-5 py-4 bg-white">
      <div className="text-xs font-medium text-gray-600 mb-2">{t('campaigns.breakdown.title')}</div>
      {failureMap.size > 0 && (
        <div className="mb-3">
          <div className="text-[11px] text-red-600 font-medium mb-1">{t('campaigns.breakdown.failureReason')}</div>
          <div className="space-y-1">
            {Array.from(failureMap.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([code, count]) => (
                <div key={code} className="flex justify-between text-xs">
                  <span className="font-mono text-gray-700">{code}</span>
                  <span className="text-gray-600">{count.toLocaleString()}</span>
                </div>
              ))}
          </div>
        </div>
      )}
      {skipMap.size > 0 && (
        <div>
          <div className="text-[11px] text-gray-600 font-medium mb-1">{t('campaigns.breakdown.skipReason')}</div>
          <div className="space-y-1">
            {Array.from(skipMap.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([reason, count]) => (
                <div key={reason} className="flex justify-between text-xs">
                  <span className="font-mono text-gray-700">{reason}</span>
                  <span className="text-gray-600">{count.toLocaleString()}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, color = 'text-gray-700' }) {
  return (
    <div className="bg-white p-2 rounded">
      <div className="text-[10px] text-gray-400">{label}</div>
      <div className={`text-sm font-bold ${color}`}>{value.toLocaleString()}</div>
    </div>
  )
}

function ActionsSection({ campaign: c }) {
  const { t } = useLanguage()
  const qc = useQueryClient()
  const { user } = useAuth()
  const [busy, setBusy] = useState(null)
  const [testUserId, setTestUserId] = useState('')
  // scheduled_at は UTC で保存されている。datetime-local 入力には JST 壁時計で表示するため
  // utcToJstInputValue で変換 (TZ が JST 以外の運用 PC でも一致して見える).
  const [scheduledAt, setScheduledAt] = useState(
    c.scheduled_at ? utcToJstInputValue(c.scheduled_at) : '',
  )
  const [lastResult, setLastResult] = useState(null)

  async function invokeEdge(mode, extra = {}) {
    setBusy(mode)
    setLastResult(null)
    try {
      const { data, error } = await supabase.functions.invoke('send-campaign-push', {
        body: { campaign_id: c.id, mode, ...extra },
      })
      if (error) {
        setLastResult({ ok: false, error: error.message ?? String(error) })
      } else {
        setLastResult(data)
      }
      qc.invalidateQueries({ queryKey: ['notification_campaign', c.id] })
      qc.invalidateQueries({ queryKey: ['notification_campaigns'] })
    } finally {
      setBusy(null)
    }
  }

  async function updateStatus(next, extra = {}) {
    setBusy(next)
    try {
      const { error } = await supabase
        .from('notification_campaigns')
        .update({ status: next, ...extra })
        .eq('id', c.id)
      if (error) {
        setLastResult({ ok: false, error: error.message })
      } else {
        setLastResult({ ok: true, status: next })
      }
      qc.invalidateQueries({ queryKey: ['notification_campaign', c.id] })
      qc.invalidateQueries({ queryKey: ['notification_campaigns'] })
    } finally {
      setBusy(null)
    }
  }

  const canApprove = c.status === 'draft'
  const canSchedule = c.status === 'approved'
  const canSend = c.status === 'approved' || c.status === 'scheduled' || c.status === 'sending'
  const canCancel = ['draft', 'approved', 'scheduled'].includes(c.status)

  return (
    <div className="px-5 py-4 space-y-3">
      <div className="text-xs font-medium text-gray-600">{t('campaigns.actions.title')}</div>

      <div className="flex flex-wrap gap-2">
        <button
          disabled={!!busy}
          onClick={() => invokeEdge('dry_run')}
          className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
        >
          {t('campaigns.actions.dryRun')}
        </button>

        {canApprove && (
          <button
            disabled={!!busy}
            onClick={() =>
              updateStatus('approved', {
                approved_by: user?.id ?? null,
                approved_at: new Date().toISOString(),
              })
            }
            className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {t('campaigns.actions.approve')}
          </button>
        )}

        {canSend && (
          <button
            disabled={!!busy}
            onClick={() => {
              if (!confirm(`${t('campaigns.actions.sendConfirm')} ${c.total_recipients ?? '?'} ${t('campaigns.actions.recipientsUnit')}`)) return
              invokeEdge('send')
            }}
            className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
          >
            {t('campaigns.actions.send')}
          </button>
        )}

        {canCancel && (
          <button
            disabled={!!busy}
            onClick={() => {
              if (!confirm(t('campaigns.actions.cancelConfirm'))) return
              updateStatus('cancelled')
            }}
            className="px-3 py-1.5 text-xs bg-gray-300 text-gray-700 rounded hover:bg-gray-400 disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
        )}
      </div>

      <div className="border-t border-gray-100 pt-3">
        <div className="text-xs text-gray-500 mb-1">{t('campaigns.test.title')}</div>
        <div className="flex gap-2">
          <input
            type="text"
            value={testUserId}
            onChange={(e) => setTestUserId(e.target.value)}
            placeholder="profiles.id (uuid)"
            className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded"
          />
          <button
            disabled={!!busy || !testUserId}
            onClick={() => invokeEdge('test', { test_user_id: testUserId })}
            className="px-3 py-1.5 text-xs bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:opacity-50"
          >
            {t('campaigns.test.send')}
          </button>
        </div>
      </div>

      {canSchedule && (
        <div className="border-t border-gray-100 pt-3">
          <div className="text-xs text-gray-500 mb-1">{t('campaigns.schedule.title')}</div>
          <div className="flex gap-2">
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded"
            />
            <button
              disabled={!!busy || !scheduledAt}
              onClick={() => {
                // 入力値は JST 壁時計として解釈し UTC ISO に揃える (運用 OS の TZ に依存しない).
                const iso = jstInputValueToUtcIso(scheduledAt)
                if (!iso) return
                if (new Date(iso) <= new Date()) {
                  if (!confirm(t('campaigns.schedule.pastConfirm'))) return
                }
                updateStatus('scheduled', { scheduled_at: iso })
              }}
              className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {t('campaigns.schedule.button')}
            </button>
          </div>
          <div className="text-[10px] text-gray-400 mt-1">
            {t('campaigns.schedule.hint')}
          </div>
        </div>
      )}

      {busy && (
        <div className="text-xs text-gray-500 italic">{t('campaigns.actions.processing')} ({busy})</div>
      )}
      {lastResult && (
        <pre className="text-xs bg-gray-50 p-2 rounded overflow-x-auto max-h-40">
          {JSON.stringify(lastResult, null, 2)}
        </pre>
      )}
    </div>
  )
}

function MetaSection({ campaign: c }) {
  const { t } = useLanguage()
  const fmtDt = useFmtDt()
  return (
    <div className="px-5 py-3 text-[10px] text-gray-400 grid grid-cols-2 gap-y-1">
      <div>{t('campaigns.meta.created')}: {fmtDt(c.created_at)}</div>
      <div>{t('campaigns.meta.updated')}: {fmtDt(c.updated_at)}</div>
      <div>{t('campaigns.meta.approved')}: {c.approved_at ? fmtDt(c.approved_at) : '-'}</div>
      <div>{t('campaigns.meta.scheduled')}: {c.scheduled_at ? fmtDt(c.scheduled_at) : '-'}</div>
      <div>{t('campaigns.meta.startedAt')}: {c.started_at ? fmtDt(c.started_at) : '-'}</div>
      <div>{t('campaigns.meta.finishedAt')}: {c.finished_at ? fmtDt(c.finished_at) : '-'}</div>
      <div>id: <span className="font-mono">{c.id.slice(0, 8)}</span></div>
    </div>
  )
}

// ─────────────────────── 작성/편집 폼 ───────────────────────

function CampaignEditor({ campaign, onSaved, onCancel }) {
  const { t } = useLanguage()
  const CAMPAIGN_TYPES = useCampaignTypes()
  const { user } = useAuth()
  const isNew = !campaign
  const [form, setForm] = useState({
    type: campaign?.type ?? 'notice',
    title: campaign?.title ?? '',
    body: campaign?.body ?? '',
    deep_link: campaign?.deep_link ?? '',
    android_channel_id: campaign?.android_channel_id ?? 'default',
    target_filter_json: campaign?.target_filter
      ? JSON.stringify(campaign.target_filter, null, 2)
      : '{}',
    legal_memo: campaign?.legal_memo ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function save() {
    setError(null)
    setSaving(true)
    try {
      let target_filter
      try {
        target_filter = JSON.parse(form.target_filter_json || '{}')
      } catch (e) {
        setError(t('campaigns.editor.errorInvalidJson'))
        return
      }
      const payload = {
        type: form.type,
        title: form.title.trim(),
        body: form.body.trim(),
        deep_link: form.deep_link.trim() || null,
        android_channel_id: form.android_channel_id,
        target_filter,
        legal_memo: form.legal_memo.trim() || null,
      }
      if (!payload.title || !payload.body) {
        setError(t('campaigns.editor.errorRequired'))
        return
      }
      if (isNew) {
        const { data, error: e } = await supabase
          .from('notification_campaigns')
          .insert({ ...payload, created_by: user?.id ?? null, status: 'draft' })
          .select('id')
          .single()
        if (e) throw e
        onSaved(data.id)
      } else {
        const { error: e } = await supabase
          .from('notification_campaigns')
          .update(payload)
          .eq('id', campaign.id)
        if (e) throw e
        onSaved(campaign.id)
      }
    } catch (e) {
      setError(e.message ?? String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold">{isNew ? t('campaigns.editor.titleNew') : t('campaigns.editor.titleEdit')}</h2>
        <button onClick={onCancel} className="text-xs text-gray-500 hover:underline">
          {t('common.close')}
        </button>
      </div>

      <Field label={t('campaigns.editor.fieldType')}>
        <select
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded"
        >
          {CAMPAIGN_TYPES.map((tp) => (
            <option key={tp.value} value={tp.value}>
              {tp.label}
            </option>
          ))}
        </select>
        {form.type === 'campaign' && (
          <div className="text-[11px] text-amber-700 mt-1">
            {t('campaigns.editor.marketingNotice')}
          </div>
        )}
      </Field>

      <Field label={t('campaigns.editor.fieldTitleLabel')}>
        <input
          type="text"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          maxLength={100}
          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded"
        />
      </Field>

      <Field label={t('campaigns.editor.fieldBodyLabel')}>
        <textarea
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
          maxLength={500}
          rows={3}
          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded font-mono"
        />
      </Field>

      <Field label={t('campaigns.editor.fieldDeepLink')}>
        <input
          type="text"
          value={form.deep_link}
          onChange={(e) => setForm({ ...form, deep_link: e.target.value })}
          placeholder={t('campaigns.editor.deepLinkPlaceholder')}
          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded font-mono"
        />
      </Field>

      <Field label={t('campaigns.editor.fieldChannel')}>
        <select
          value={form.android_channel_id}
          onChange={(e) => setForm({ ...form, android_channel_id: e.target.value })}
          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded"
        >
          {ANDROID_CHANNELS.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </Field>

      <Field label={t('campaigns.editor.fieldTargetFilter')}>
        <textarea
          value={form.target_filter_json}
          onChange={(e) => setForm({ ...form, target_filter_json: e.target.value })}
          rows={4}
          className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded font-mono"
          placeholder={t('campaigns.editor.targetFilterPlaceholder')}
        />
        <div className="text-[10px] text-gray-400 mt-1">
          {t('campaigns.editor.targetFilterHint')}
        </div>
      </Field>

      <Field label={t('campaigns.editor.fieldLegalMemo')}>
        <textarea
          value={form.legal_memo}
          onChange={(e) => setForm({ ...form, legal_memo: e.target.value })}
          rows={2}
          className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded"
          placeholder={t('campaigns.editor.legalMemoPlaceholder')}
        />
      </Field>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 p-2 rounded">{error}</div>
      )}

      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
        >
          {t('common.cancel')}
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-1.5 text-xs bg-brand text-white rounded hover:opacity-90 disabled:opacity-50"
        >
          {saving ? t('campaigns.editor.saving') : t('campaigns.editor.saveDraft')}
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-xs font-medium text-gray-600 mb-1">{label}</div>
      {children}
    </div>
  )
}
