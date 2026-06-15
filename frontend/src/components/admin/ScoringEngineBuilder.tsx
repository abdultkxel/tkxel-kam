import { Calculator, Save } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { useAccountOptions } from '@/hooks/useAccountOptions'
import { createScoringMetric, listScoringMetrics, publishScoringMetric, ScoringMetric, updateScoringMetric } from '@/services/scoringSignalsTasks'

type Dimension = 'relationship' | 'usage' | 'delivery' | 'commercial'

const dimensions: Dimension[] = ['relationship', 'usage', 'delivery', 'commercial']
const metricSlugByDimension: Record<Dimension, string> = {
  relationship: 'relationship_health',
  usage: 'usage_adoption_health',
  delivery: 'delivery_health',
  commercial: 'commercial_health',
}
const metricNameByDimension: Record<Dimension, string> = {
  relationship: 'Relationship Health',
  usage: 'Usage and Adoption Health',
  delivery: 'Delivery Health',
  commercial: 'Commercial Health',
}

function weightedScore(health: Record<Dimension, number>, weights: Record<Dimension, number>) {
  return Math.round(dimensions.reduce((sum, dimension) => sum + health[dimension] * (weights[dimension] / 100), 0))
}

export function ScoringEngineBuilder() {
  const { token } = useAuth()
  const { accounts } = useAccountOptions()
  const [weights, setWeights] = useState<Record<Dimension, number>>({ relationship: 30, usage: 25, delivery: 25, commercial: 20 })
  const [thresholds, setThresholds] = useState({ green: 75, amber: 60, red: 45 })
  const [metrics, setMetrics] = useState<ScoringMetric[]>([])
  const [loading, setLoading] = useState(Boolean(token))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
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

  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }
    void loadMetrics()
  }, [token])

  async function loadMetrics() {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const page = await listScoringMetrics(token, { page: 1, page_size: 100, active_state: 'all' })
      setMetrics(page.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load scoring metrics')
    } finally {
      setLoading(false)
    }
  }

  function updateWeight(dimension: Dimension, value: number) {
    const clamped = Math.max(0, Math.min(100, value))
    const balancingDimension = dimension === 'commercial' ? 'relationship' : 'commercial'
    const otherTotal = dimensions.filter(item => item !== dimension && item !== balancingDimension).reduce((total, item) => total + weights[item], 0)
    const balancingValue = Math.max(0, 100 - clamped - otherTotal)
    setWeights({ ...weights, [dimension]: clamped, [balancingDimension]: balancingValue })
  }

  async function publish() {
    if (!token) {
      toast.error('You must be logged in to publish scoring metrics')
      return
    }
    setSaving(true)
    setError('')
    try {
      for (const dimension of dimensions) {
        const slug = metricSlugByDimension[dimension]
        const payload = {
          slug,
          name: metricNameByDimension[dimension],
          description: `Configured account ${dimension} score dimension.`,
          scope: 'account',
          weight: weights[dimension],
          thresholds: { red_max: thresholds.amber - 1, amber_min: thresholds.amber, green_min: thresholds.green },
          formula: { op: 'field', field: `health_${dimension}` },
          freshness_rule: { stale_after_days: 30 },
          owner_role: 'kam_head',
          source: 'admin_builder',
          status: 'published',
          is_active: true,
        }
        const existing = metrics.find(metric => metric.slug === slug)
        const metric = existing ? await updateScoringMetric(token, existing.id, payload) : await createScoringMetric(token, payload)
        await publishScoringMetric(token, metric.id)
      }
      await loadMetrics()
      toast.success('Scoring metrics published')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to publish scoring metrics'
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="tk-card overflow-hidden">
      <div className="border-b border-surface-border p-5">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">No-code scoring</p>
        <h2 className="text-base font-semibold text-ink">Scoring Engine Builder</h2>
        {loading ? <p className="mt-2 text-sm text-ink-secondary">Loading published metric definitions...</p> : null}
        {error ? (
          <div className="mt-3 rounded-md border border-rag-red/20 bg-rag-red/10 p-3 text-sm text-rag-red">
            <p className="font-semibold">Scoring configuration could not be loaded</p>
            <p>{error}</p>
            <button className="tk-button-secondary mt-2 bg-white" onClick={loadMetrics}>Retry</button>
          </div>
        ) : null}
        {!loading && !error && !metrics.length ? (
          <p className="mt-2 rounded-md border border-dashed border-surface-border bg-surface-tertiary p-3 text-sm text-ink-secondary">No scoring metrics have been configured yet. Publishing from this builder will create the default account-health metrics.</p>
        ) : null}
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
          <button className="tk-button-primary w-full" disabled={sum !== 100 || saving || !token} onClick={publish}>
            <Save className="h-4 w-4" />
            {saving ? 'Publishing...' : 'Publish metrics'}
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
            {metrics.slice(0, 8).map(metric => (
              <span key={metric.id} className="rounded-full border border-surface-border bg-white px-3 py-1 text-xs font-semibold text-ink-secondary">
                {metric.name} v{metric.current_version || 0} {metric.status}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
