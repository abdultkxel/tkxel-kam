import { Calculator, Save } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useRole } from '@/hooks/useRole'
import { useAccountStore } from '@/stores/accountStore'
import { emitTimelineEvent } from '@/utils/emitTimelineEvent'

type Dimension = 'relationship' | 'usage' | 'delivery' | 'commercial'

const dimensions: Dimension[] = ['relationship', 'usage', 'delivery', 'commercial']

function weightedScore(health: Record<Dimension, number>, weights: Record<Dimension, number>) {
  return Math.round(dimensions.reduce((sum, dimension) => sum + health[dimension] * (weights[dimension] / 100), 0))
}

export function ScoringEngineBuilder() {
  const user = useRole()
  const accounts = useAccountStore(state => state.accounts)
  const [weights, setWeights] = useState<Record<Dimension, number>>({ relationship: 30, usage: 25, delivery: 25, commercial: 20 })
  const [thresholds, setThresholds] = useState({ green: 75, amber: 60, red: 45 })
  const sum = Object.values(weights).reduce((total, value) => total + value, 0)
  const preview = useMemo(
    () =>
      accounts.map(account => ({
        account,
        current: account.health.overall,
        next: weightedScore(account.health, weights),
      })),
    [accounts, weights],
  )

  function updateWeight(dimension: Dimension, value: number) {
    const clamped = Math.max(0, Math.min(100, value))
    const balancingDimension = dimension === 'commercial' ? 'relationship' : 'commercial'
    const otherTotal = dimensions.filter(item => item !== dimension && item !== balancingDimension).reduce((total, item) => total + weights[item], 0)
    const balancingValue = Math.max(0, 100 - clamped - otherTotal)
    setWeights({ ...weights, [dimension]: clamped, [balancingDimension]: balancingValue })
  }

  function publish() {
    accounts.forEach(account => {
      emitTimelineEvent({
        accountId: account.id,
        eventType: 'calculator_change',
        module: 'scoring',
        title: 'Scoring calculator published',
        description: 'Admin published scoring calculator v1.4 after previewing portfolio impact.',
        performedBy: user.id,
        performedByName: user.name,
        beforeValue: { calculatorVersion: 'v1.3' },
        afterValue: { calculatorVersion: 'v1.4', weights, thresholds },
        tags: ['scoring-builder', 'calculator-v1.4'],
        isSensitive: false,
        isSystemGenerated: true,
        isImmutable: true,
      })
    })
    toast.success('Scoring calculator v1.4 published')
  }

  return (
    <section className="tk-card overflow-hidden">
      <div className="border-b border-surface-border p-5">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">No-code scoring</p>
        <h2 className="text-base font-semibold text-ink">Scoring Engine Builder</h2>
      </div>
      <div className="grid gap-5 p-5 xl:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          {dimensions.map(dimension => (
            <label key={dimension} className="block">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold capitalize text-ink">{dimension}</span>
                <span className="font-display text-2xl font-bold text-ink">{weights[dimension]}%</span>
              </div>
              <input type="range" min={0} max={100} value={weights[dimension]} onChange={event => updateWeight(dimension, Number(event.target.value))} className="h-11 w-full accent-brand-blue" />
            </label>
          ))}
          <div className="rounded-lg border border-surface-border bg-surface-tertiary p-3 text-sm">
            <span className="font-semibold text-ink">Weight total:</span> <span className={sum === 100 ? 'text-rag-green' : 'text-brand-orange'}>{sum}%</span>
          </div>
          <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-1">
            {Object.entries(thresholds).map(([key, value]) => (
              <label key={key} className="text-sm font-semibold capitalize text-ink">
                {key} threshold
                <input className="tk-input mt-1" type="number" value={value} onChange={event => setThresholds(prev => ({ ...prev, [key]: Number(event.target.value) }))} />
              </label>
            ))}
          </div>
          <button className="tk-button-primary w-full" disabled={sum !== 100} onClick={publish}>
            <Save className="h-4 w-4" />
            Publish v1.4
          </button>
        </div>

        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-2">
            <Calculator className="h-4 w-4 text-brand-blue" />
            <h3 className="text-sm font-semibold text-ink">Preview impact</h3>
          </div>
          <div className="overflow-x-auto rounded-lg border border-surface-border">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-surface-tertiary text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                <tr>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3">Current</th>
                  <th className="px-4 py-3">Preview</th>
                  <th className="px-4 py-3">Impact</th>
                </tr>
              </thead>
              <tbody>
                {preview.map(row => (
                  <tr key={row.account.id} className="border-t border-surface-border">
                    <td className="px-4 py-3 font-semibold text-ink">{row.account.name}</td>
                    <td className="px-4 py-3 text-ink-secondary">{row.current}</td>
                    <td className="px-4 py-3 text-ink-secondary">{row.next}</td>
                    <td className={row.next === row.current ? 'px-4 py-3 text-ink-secondary' : 'px-4 py-3 font-semibold text-brand-orange'}>
                      {row.next - row.current > 0 ? '+' : ''}{row.next - row.current}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {['v1.4 Draft', 'v1.3 Published', 'v1.2 Archived'].map(version => (
              <span key={version} className="rounded-full border border-surface-border bg-white px-3 py-1 text-xs font-semibold text-ink-secondary">{version}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
