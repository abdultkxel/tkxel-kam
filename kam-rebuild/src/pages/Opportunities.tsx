import { useSearchParams } from 'react-router-dom'
import { OpportunityBoard } from '@/components/opportunities/OpportunityBoard'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { FilterBar } from '@/components/ui/FilterBar'
import { PageHeader } from '@/components/ui/PageHeader'
import { users } from '@/data/mock'
import { useOpportunityStore } from '@/stores/opportunityStore'
import { formatCompactCurrency } from '@/utils/formatters'

function PipelineStat({ label, value, tone = 'default', format }: { label: string; value: number; tone?: 'default' | 'warning' | 'success'; format?: (value: number) => string }) {
  const valueClass = tone === 'warning' ? 'text-brand-orange' : tone === 'success' ? 'text-rag-green' : 'text-ink'

  return (
    <div className="rounded-lg bg-surface-secondary px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">{label}</p>
      <AnimatedNumber value={value} format={format} className={`mt-1 block text-2xl font-bold ${valueClass}`} />
    </div>
  )
}

export function Opportunities() {
  const [params, setParams] = useSearchParams()
  const opportunities = useOpportunityStore(state => state.opportunities)
  const account = params.get('account') ?? ''
  const owner = params.get('owner') ?? ''
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const minValue = params.get('minValue') ?? ''
  const maxValue = params.get('maxValue') ?? ''

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  function clearFilters() {
    setParams({}, { replace: true })
  }

  const filtered = opportunities.filter(opportunity => {
    const accountNeedle = account.toLowerCase()
    const matchesAccount = !accountNeedle || opportunity.accountName.toLowerCase().includes(accountNeedle) || opportunity.name.toLowerCase().includes(accountNeedle)
    const matchesOwner = !owner || opportunity.ownerId === owner
    const closeTime = new Date(opportunity.closeDate).getTime()
    const matchesFrom = !from || closeTime >= new Date(`${from}T00:00:00`).getTime()
    const matchesTo = !to || closeTime <= new Date(`${to}T23:59:59`).getTime()
    const matchesMin = !minValue || opportunity.estimatedValue >= Number(minValue)
    const matchesMax = !maxValue || opportunity.estimatedValue <= Number(maxValue)
    return matchesAccount && matchesOwner && matchesFrom && matchesTo && matchesMin && matchesMax
  })

  const openOpportunities = filtered.filter(opportunity => opportunity.stage !== 'Won' && opportunity.stage !== 'Lost')
  const openPipeline = openOpportunities.reduce((sum, opportunity) => sum + opportunity.estimatedValue, 0)
  const closingSoon = openOpportunities.filter(opportunity => new Date(opportunity.closeDate).getTime() <= Date.now() + 30 * 24 * 60 * 60 * 1000).length
  const wonValue = filtered.filter(opportunity => opportunity.stage === 'Won').reduce((sum, opportunity) => sum + opportunity.estimatedValue, 0)
  const averageDeal = filtered.length ? filtered.reduce((sum, opportunity) => sum + opportunity.estimatedValue, 0) / filtered.length : 0

  return (
    <div>
      <PageHeader eyebrow="Pipeline execution" title="Opportunities" description="Prioritize open pipeline, review close risk, and move deals through the KAM stage flow." />
      <FilterBar onClear={clearFilters} contentClassName="md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-[minmax(220px,1.1fr)_180px_150px_150px_140px_140px_auto]">
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Account</span>
          <input className="tk-input" value={account} onChange={event => setFilter('account', event.target.value)} placeholder="Account or opportunity" />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Owner</span>
          <select className="tk-input" value={owner} onChange={event => setFilter('owner', event.target.value)}>
            <option value="">All owners</option>
            {users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Close from</span>
          <input type="date" className="tk-input" value={from} onChange={event => setFilter('from', event.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Close to</span>
          <input type="date" className="tk-input" value={to} onChange={event => setFilter('to', event.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Min value</span>
          <input type="number" min={0} className="tk-input" value={minValue} onChange={event => setFilter('minValue', event.target.value)} placeholder="$0" />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Max value</span>
          <input type="number" min={0} className="tk-input" value={maxValue} onChange={event => setFilter('maxValue', event.target.value)} placeholder="$1M" />
        </label>
      </FilterBar>

      <section className="tk-card mb-4 p-4">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <PipelineStat label="Open pipeline" value={openPipeline} format={formatCompactCurrency} />
          <PipelineStat label="Closing in 30 days" value={closingSoon} tone={closingSoon ? 'warning' : 'success'} />
          <PipelineStat label="Won value" value={wonValue} tone="success" format={formatCompactCurrency} />
          <PipelineStat label="Avg deal" value={averageDeal} format={formatCompactCurrency} />
        </div>
      </section>

      <OpportunityBoard items={filtered} />
    </div>
  )
}
