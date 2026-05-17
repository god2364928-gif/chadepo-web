import { useLanguage } from '../../contexts/LanguageContext'

const FORMATS = [
  { id: '', labelKey: 'ads.format.all' },
  { id: 'banner', labelKey: null, label: 'Banner' },
  { id: 'mrec', labelKey: null, label: 'MREC' },
  { id: 'interstitial', labelKey: null, label: 'Interstitial' },
  { id: 'rewarded', labelKey: null, label: 'Rewarded' },
]

export default function AdFormatFilter({ value, onChange, disabled = false }) {
  const { t } = useLanguage()
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500">{t('ads.format.label')}</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled}
        className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {FORMATS.map((f) => (
          <option key={f.id || 'all'} value={f.id}>
            {f.labelKey ? t(f.labelKey) : f.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export { FORMATS }
