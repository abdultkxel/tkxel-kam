import { AnimatedNumber } from '@/components/ui/AnimatedNumber'

export function HealthScoreRing({ value, size = 188 }: { value: number; size?: number }) {
  const radius = (size - 18) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (value / 100) * circumference

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`Health score ${value} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth="12" className="stroke-surface-tertiary" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth="12"
          className="stroke-brand-blue"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute text-center">
        <AnimatedNumber value={value} className="font-display text-5xl font-bold text-ink" />
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Health</p>
      </div>
    </div>
  )
}
