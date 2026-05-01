const FORMATS = [
  { id: '', label: '전체' },
  { id: 'banner', label: 'Banner' },
  { id: 'mrec', label: 'MREC' },
  { id: 'interstitial', label: 'Interstitial' },
  { id: 'rewarded', label: 'Rewarded' },
]

export default function AdFormatFilter({ value, onChange, disabled = false }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500">광고 포맷</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled}
        className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {FORMATS.map((f) => (
          <option key={f.id || 'all'} value={f.id}>
            {f.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export { FORMATS }
