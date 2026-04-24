import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

function AdjustModal({ type, userId, onClose }) {
  const qc = useQueryClient()
  const [amount, setAmount] = useState('')
  const [note, setNote]     = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!note.trim()) { setMsg('사유를 입력해주세요.'); return }
    setLoading(true)
    const fn = type === 'point' ? 'admin_adjust_points' : 'admin_adjust_energy'
    const { error } = await supabase.rpc(fn, {
      p_user_id: userId,
      p_amount: Number(amount),
      p_note: note,
    })
    setLoading(false)
    if (error) { setMsg('오류: ' + error.message); return }
    qc.invalidateQueries(['user', userId])
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">
            {type === 'point' ? '포인트' : '에너지'} 수동 조정
          </h3>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              조정 금액 (음수 입력 시 차감)
            </label>
            <input
              type="number"
              className="input"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="예: 1000 또는 -500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">사유 (필수)</label>
            <textarea
              className="input h-20 resize-none"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="예: 버그로 인한 누락 보상 지급"
              required
            />
          </div>
          {msg && <p className="text-red-600 text-sm">{msg}</p>}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="btn-secondary">취소</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? '처리 중...' : '적용'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function UserDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [modal, setModal]   = useState(null)
  const [activeTab, setActiveTab] = useState('points')

  const { data: user, isLoading } = useQuery({
    queryKey: ['user', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    },
  })

  const { data: pointLogs } = useQuery({
    queryKey: ['point-logs', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('point_logs')
        .select('*')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(50)
      return data ?? []
    },
    enabled: activeTab === 'points',
  })

  const { data: energyLogs } = useQuery({
    queryKey: ['energy-logs', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('energy_logs')
        .select('*')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(50)
      return data ?? []
    },
    enabled: activeTab === 'energy',
  })

  const { data: exchangeLogs } = useQuery({
    queryKey: ['exchange-logs', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('exchange_requests')
        .select('*, exchange_items(title_ja)')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(30)
      return data ?? []
    },
    enabled: activeTab === 'exchange',
  })

  const { data: referralData } = useQuery({
    queryKey: ['referral-data', id],
    queryFn: async () => {
      const [referred, referrals] = await Promise.all([
        supabase.from('referral_events').select('*, profiles!referrer_id(nickname)').eq('referee_id', id).maybeSingle(),
        supabase.from('referral_events').select('*, profiles!referee_id(nickname)').eq('referrer_id', id).order('created_at', { ascending: false }).limit(20),
      ])
      return { referred: referred.data, referrals: referrals.data ?? [] }
    },
    enabled: activeTab === 'referral',
  })

  const toggleFlag = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('profiles')
        .update({ is_flagged: !user.is_flagged })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries(['user', id]),
  })

  const toggleBan = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('profiles')
        .update({ is_banned: !user.is_banned })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries(['user', id]),
  })

  if (isLoading) return <div className="text-gray-400 text-sm">読み込み中...</div>
  if (!user) return <div className="text-red-500">유저를 찾을 수 없습니다.</div>

  const tabs = [
    { key: 'points', label: '포인트 이력' },
    { key: 'energy', label: '에너지 이력' },
    { key: 'exchange', label: '교환 이력' },
    { key: 'referral', label: '추천 관계' },
  ]

  return (
    <div className="space-y-6">
      {modal && <AdjustModal type={modal} userId={id} onClose={() => setModal(null)} />}

      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600 text-sm">← 뒤로</button>
        <h1 className="text-2xl font-bold text-gray-900">{user.nickname || `ユーザー${user.id.slice(0, 4)}`}</h1>
        {user.is_banned && <span className="badge-red">정지</span>}
        {user.is_flagged && <span className="badge-yellow">의심</span>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 기본 정보 */}
        <div className="card space-y-3">
          <h2 className="font-semibold text-gray-900">기본 정보</h2>
          <dl className="space-y-2 text-sm">
            {[
              ['플랫폼', user.social_provider],
              ['추천코드', user.referral_code],
              ['가입일', user.created_at ? new Date(user.created_at).toLocaleString('ko-KR') : '—'],
              ['마지막 접속', user.last_seen_at ? new Date(user.last_seen_at).toLocaleString('ko-KR') : '—'],
              ['가입 IP', user.signup_ip ?? '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <dt className="text-gray-500">{k}</dt>
                <dd className="text-gray-900 font-medium text-right max-w-[160px] break-all">{v ?? '—'}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* 잔액 */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-900">잔액</h2>
          <div className="space-y-3">
            <div className="bg-orange-50 rounded-lg p-4">
              <div className="text-xs text-orange-600 font-medium">포인트</div>
              <div className="text-2xl font-bold text-orange-700 mt-1">{user.points?.toLocaleString()} P</div>
              <div className="text-xs text-orange-400 mt-0.5">자체획득: {user.self_earned_points?.toLocaleString()} P</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-xs text-blue-600 font-medium">에너지</div>
              <div className="text-2xl font-bold text-blue-700 mt-1">{user.energy?.toLocaleString()} E</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setModal('point')} className="btn-primary flex-1 text-xs py-1.5">포인트 조정</button>
            <button onClick={() => setModal('energy')} className="btn-secondary flex-1 text-xs py-1.5">에너지 조정</button>
          </div>
        </div>

        {/* 계정 관리 */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-900">계정 관리</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <div className="text-sm font-medium text-gray-900">의심 플래그</div>
                <div className="text-xs text-gray-500">부정이용 의심 표시</div>
              </div>
              <button
                onClick={() => toggleFlag.mutate()}
                className={user.is_flagged ? 'badge-yellow cursor-pointer' : 'badge-gray cursor-pointer'}
              >
                {user.is_flagged ? '설정됨 (해제)' : '미설정 (설정)'}
              </button>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <div className="text-sm font-medium text-gray-900">계정 정지</div>
                <div className="text-xs text-gray-500">앱 접근 차단</div>
              </div>
              <button
                onClick={() => toggleBan.mutate()}
                className={user.is_banned ? 'badge-red cursor-pointer' : 'badge-gray cursor-pointer'}
              >
                {user.is_banned ? '정지됨 (해제)' : '정상 (정지)'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 이력 탭 */}
      <div className="card p-0 overflow-hidden">
        <div className="flex border-b border-gray-100 bg-gray-50">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-5 py-3 text-sm font-medium transition-colors ${
                activeTab === t.key
                  ? 'text-brand border-b-2 border-brand bg-white'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="p-4 overflow-x-auto max-h-96 overflow-y-auto">
          {activeTab === 'points' && (
            <table className="w-full text-sm">
              <thead><tr className="text-gray-500 text-xs">
                <th className="text-left pb-2">일시</th><th className="text-left pb-2">출처</th>
                <th className="text-right pb-2">금액</th><th className="text-left pb-2 pl-4">메모</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {(pointLogs ?? []).map(l => (
                  <tr key={l.id}>
                    <td className="py-2 text-gray-400 text-xs whitespace-nowrap">{new Date(l.created_at).toLocaleString('ko-KR')}</td>
                    <td className="py-2"><span className="badge-gray text-xs">{l.source}</span></td>
                    <td className={`py-2 text-right font-medium ${l.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {l.amount > 0 ? '+' : ''}{l.amount?.toLocaleString()} P
                    </td>
                    <td className="py-2 pl-4 text-gray-500 text-xs">{l.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {activeTab === 'energy' && (
            <table className="w-full text-sm">
              <thead><tr className="text-gray-500 text-xs">
                <th className="text-left pb-2">일시</th><th className="text-left pb-2">출처</th>
                <th className="text-right pb-2">금액</th><th className="text-left pb-2 pl-4">메모</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {(energyLogs ?? []).map(l => (
                  <tr key={l.id}>
                    <td className="py-2 text-gray-400 text-xs whitespace-nowrap">{new Date(l.created_at).toLocaleString('ko-KR')}</td>
                    <td className="py-2"><span className="badge-gray text-xs">{l.source}</span></td>
                    <td className={`py-2 text-right font-medium ${l.amount > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {l.amount > 0 ? '+' : ''}{l.amount?.toLocaleString()} E
                    </td>
                    <td className="py-2 pl-4 text-gray-500 text-xs">{l.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {activeTab === 'exchange' && (
            <table className="w-full text-sm">
              <thead><tr className="text-gray-500 text-xs">
                <th className="text-left pb-2">일시</th><th className="text-left pb-2">상품</th>
                <th className="text-right pb-2">소비 P</th><th className="text-right pb-2">상태</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {(exchangeLogs ?? []).map(l => (
                  <tr key={l.id}>
                    <td className="py-2 text-gray-400 text-xs whitespace-nowrap">{new Date(l.created_at).toLocaleString('ko-KR')}</td>
                    <td className="py-2">{l.exchange_items?.title_ja}</td>
                    <td className="py-2 text-right font-medium text-red-600">-{l.points_spent?.toLocaleString()} P</td>
                    <td className="py-2 text-right">
                      <span className={l.status === 'pending' ? 'badge-yellow' : 'badge-green'}>{l.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {activeTab === 'referral' && (
            <div className="space-y-4 text-sm">
              <div>
                <div className="font-medium text-gray-700 mb-2">초대해 준 사람</div>
                {referralData?.referred
                  ? <div className="p-3 bg-blue-50 rounded-lg">{referralData.referred.profiles?.nickname ?? '알 수 없음'}</div>
                  : <div className="text-gray-400">없음 (자체 가입)</div>}
              </div>
              <div>
                <div className="font-medium text-gray-700 mb-2">내가 초대한 사람 ({referralData?.referrals?.length ?? 0}명)</div>
                <div className="space-y-1">
                  {(referralData?.referrals ?? []).map(r => (
                    <div key={r.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <span>{r.profiles?.nickname ?? '알 수 없음'}</span>
                      <span className={r.status === 'rewarded' ? 'badge-green' : 'badge-gray'}>{r.status}</span>
                    </div>
                  ))}
                  {referralData?.referrals?.length === 0 && <div className="text-gray-400">초대한 사람 없음</div>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
