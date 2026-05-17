import { useLanguage } from '../../contexts/LanguageContext'

const PERIODS = [
  { id: '1d', labelKey: 'ads.period.today' },
  { id: '7d', labelKey: 'ads.period.7d' },
  { id: '30d', labelKey: 'ads.period.30d' },
  { id: '90d', labelKey: 'ads.period.90d' },
]

export default function PeriodSelector({ value, onChange, disabled = false }) {
  const { t } = useLanguage()
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500">{t('ads.period.label')}</span>
      {PERIODS.map((p) => (
        <button
          key={p.id}
          onClick={() => onChange(p.id)}
          disabled={disabled}
          className={`px-3 py-1.5 text-xs rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            value === p.id
              ? 'bg-brand text-white border-brand font-medium'
              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          {t(p.labelKey)}
        </button>
      ))}
    </div>
  )
}

export { PERIODS }
