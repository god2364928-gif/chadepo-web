const PERIODS = [
  { id: '1d', label: '오늘' },
  { id: '7d', label: '7일' },
  { id: '30d', label: '30일' },
  { id: '90d', label: '90일' },
]

export default function PeriodSelector({ value, onChange, disabled = false }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500">기간</span>
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
          {p.label}
        </button>
      ))}
    </div>
  )
}

export { PERIODS }
