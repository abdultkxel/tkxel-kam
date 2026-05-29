import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'
import { BarChart3, Download, FileDown, Lock } from 'lucide-react'
import { ReactNode, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { useRole } from '@/hooks/useRole'
import { useAccountStore } from '@/stores/accountStore'
import { useOpportunityStore } from '@/stores/opportunityStore'
import { useTimelineStore } from '@/stores/timelineStore'
import { Account } from '@/types/account'
import { Opportunity } from '@/types/opportunity'
import { TimelineEntry } from '@/types/timeline'
import { formatCompactCurrency } from '@/utils/formatters'

const healthTrend = [
  { month: 'Jun', Onboarding: 66, Adoption: 70, Expansion: 80, Renewal: 64, Recovery: 52 },
  { month: 'Jul', Onboarding: 68, Adoption: 72, Expansion: 81, Renewal: 65, Recovery: 54 },
  { month: 'Aug', Onboarding: 69, Adoption: 74, Expansion: 83, Renewal: 67, Recovery: 53 },
  { month: 'Sep', Onboarding: 70, Adoption: 73, Expansion: 84, Renewal: 66, Recovery: 55 },
  { month: 'Oct', Onboarding: 72, Adoption: 76, Expansion: 85, Renewal: 68, Recovery: 57 },
  { month: 'Nov', Onboarding: 71, Adoption: 77, Expansion: 86, Renewal: 69, Recovery: 58 },
  { month: 'Dec', Onboarding: 73, Adoption: 78, Expansion: 87, Renewal: 70, Recovery: 60 },
  { month: 'Jan', Onboarding: 74, Adoption: 79, Expansion: 86, Renewal: 71, Recovery: 59 },
  { month: 'Feb', Onboarding: 75, Adoption: 80, Expansion: 88, Renewal: 72, Recovery: 61 },
  { month: 'Mar', Onboarding: 76, Adoption: 79, Expansion: 89, Renewal: 70, Recovery: 62 },
  { month: 'Apr', Onboarding: 77, Adoption: 81, Expansion: 90, Renewal: 73, Recovery: 63 },
  { month: 'May', Onboarding: 78, Adoption: 82, Expansion: 91, Renewal: 74, Recovery: 64 },
]

const dimensionDrivers = [
  { dimension: 'Relationship', changes: 18 },
  { dimension: 'Usage', changes: 27 },
  { dimension: 'Delivery', changes: 21 },
  { dimension: 'Commercial', changes: 15 },
]

const escalationHeat = [
  { segment: 'Strategic', escalations: 3 },
  { segment: 'Enterprise', escalations: 6 },
  { segment: 'Growth', escalations: 4 },
  { segment: 'APAC', escalations: 5 },
]

const contentEffect = [
  { content: 3, csat: 7.2 },
  { content: 5, csat: 8.1 },
  { content: 2, csat: 6.5 },
  { content: 7, csat: 8.8 },
  { content: 4, csat: 7.6 },
]

function exportCsv(filename: string, rows: Record<string, unknown>[]) {
  const headers = Object.keys(rows[0] ?? { value: '' })
  const csv = [headers.join(','), ...rows.map(row => headers.map(header => JSON.stringify(row[header] ?? '')).join(','))].join('\n')
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

function downloadSvg(chartId: string, filename: string) {
  const svg = document.querySelector(`[data-chart="${chartId}"] svg`)
  if (!svg) return
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }))
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

function ChartActions({ chartId, rows }: { chartId: string; rows: Record<string, unknown>[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button className="tk-button-secondary" onClick={() => downloadSvg(chartId, `${chartId}.svg`)}>
        <Download className="h-4 w-4" />
        Download SVG
      </button>
      <button className="tk-button-secondary" onClick={() => exportCsv(`${chartId}.csv`, rows)}>
        <FileDown className="h-4 w-4" />
        Export data CSV
      </button>
    </div>
  )
}

function AnalyticsCard({ title, kicker, chartId, rows, children }: { title: string; kicker: string; chartId: string; rows: Record<string, unknown>[]; children: ReactNode }) {
  return (
    <section className="tk-card p-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">{kicker}</p>
          <h2 className="text-base font-semibold text-ink">{title}</h2>
        </div>
        <ChartActions chartId={chartId} rows={rows} />
      </div>
      <div data-chart={chartId} className="h-[320px] text-brand-blue">
        {children}
      </div>
    </section>
  )
}

function AnalyticsSnapshotCard({ title, kicker, children }: { title: string; kicker: string; children: ReactNode }) {
  return (
    <section className="tk-card p-5">
      <div className="mb-4">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">{kicker}</p>
        <h3 className="text-base font-semibold text-ink">{title}</h3>
      </div>
      {children}
    </section>
  )
}

function AnalyticsMetric({ label, value, tone = 'default' }: { label: string; value: string | number; tone?: 'default' | 'warning' | 'success' }) {
  const toneClass = tone === 'warning' ? 'text-brand-orange' : tone === 'success' ? 'text-rag-green' : 'text-ink'

  return (
    <div className="rounded-lg bg-surface-secondary px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">{label}</p>
      <p className={`mt-1 font-display text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  )
}

function DashboardAnalytics({
  accounts,
  filteredAccounts,
  opportunities,
  entries,
  kamRows,
  params,
  setFilter,
}: {
  accounts: Account[]
  filteredAccounts: Account[]
  opportunities: Opportunity[]
  entries: TimelineEntry[]
  kamRows: Record<string, unknown>[]
  params: URLSearchParams
  setFilter: (key: string, value: string) => void
}) {
  const accountIds = new Set(filteredAccounts.map(account => account.id))
  const averageHealth = filteredAccounts.length
    ? Math.round(filteredAccounts.reduce((sum, account) => sum + account.health.overall, 0) / filteredAccounts.length)
    : 0
  const openPipeline = opportunities
    .filter(opportunity => accountIds.has(opportunity.accountId) && !['Won', 'Lost'].includes(opportunity.stage))
    .reduce((sum, opportunity) => sum + opportunity.estimatedValue, 0)
  const escalationCount = entries.filter(entry => accountIds.has(entry.accountId) && entry.module === 'escalation').length
  const topKamRows = kamRows.slice(0, 4)

  return (
    <section id="analytics" className="mt-6 space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Portfolio intelligence</p>
          <h2 className="text-base font-semibold text-ink">Analytics</h2>
          <p className="mt-1 max-w-3xl text-sm text-ink-secondary">
            Leadership view of health movement, risk concentration, pipeline velocity, and KAM performance.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <AnalyticsMetric label="Avg health" value={averageHealth} tone={averageHealth < 65 ? 'warning' : 'success'} />
          <AnalyticsMetric label="Open pipeline" value={formatCompactCurrency(openPipeline)} />
          <AnalyticsMetric label="Escalations" value={escalationCount} tone={escalationCount ? 'warning' : 'success'} />
        </div>
      </div>

      <section className="tk-card grid gap-3 p-4 md:grid-cols-5">
        <input className="tk-input" type="date" value={params.get('from') ?? ''} onChange={event => setFilter('from', event.target.value)} aria-label="Analytics from date" />
        <input className="tk-input" type="date" value={params.get('to') ?? ''} onChange={event => setFilter('to', event.target.value)} aria-label="Analytics to date" />
        <select className="tk-input" value={params.get('am') ?? ''} onChange={event => setFilter('am', event.target.value)} aria-label="Analytics AM filter">
          <option value="">All AMs</option>
          {[...new Map(accounts.map(account => [account.ownerId, account.ownerName])).entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select className="tk-input" value={params.get('segment') ?? ''} onChange={event => setFilter('segment', event.target.value)} aria-label="Analytics segment filter">
          <option value="">All segments</option>
          {[...new Set(accounts.flatMap(account => account.tags))].map(tag => <option key={tag}>{tag}</option>)}
        </select>
        <select className="tk-input" value={params.get('stage') ?? ''} onChange={event => setFilter('stage', event.target.value)} aria-label="Analytics stage filter">
          <option value="">All stages</option>
          {[...new Set(accounts.map(account => account.stage))].map(stage => <option key={stage}>{stage}</option>)}
        </select>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.8fr)]">
        <AnalyticsSnapshotCard title="Portfolio Health Trends" kicker="Health">
          <div className="h-[300px] text-brand-blue">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={healthTrend}>
                <CartesianGrid stroke="currentColor" className="text-surface-border" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: 'currentColor' }} className="text-ink-secondary" />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: 'currentColor' }} className="text-ink-secondary" />
                <Tooltip />
                <Line type="monotone" dataKey="Onboarding" stroke="currentColor" className="text-brand-blue" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Adoption" stroke="currentColor" className="text-rag-green" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Expansion" stroke="currentColor" className="text-brand-blue-dark" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Renewal" stroke="currentColor" className="text-brand-orange" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </AnalyticsSnapshotCard>

        <AnalyticsSnapshotCard title="KAM Performance" kicker="Leadership">
          <div className="space-y-3">
            {topKamRows.map(row => {
              const health = Number(row.health ?? 0)
              const pipeline = Number(row.pipeline ?? 0)
              return (
                <div key={`${row.am}-${row.health}-${row.pipeline}`} className="rounded-lg bg-surface-secondary p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-ink">{String(row.am)}</p>
                    <span className="text-xs font-semibold text-ink-secondary">{formatCompactCurrency(pipeline)}</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-surface-tertiary">
                    <div className="h-2 rounded-full bg-brand-blue" style={{ width: `${Math.max(8, Math.min(100, health))}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-ink-secondary">Health {health} | Escalations {String(row.escalations ?? 0)}</p>
                </div>
              )
            })}
          </div>
        </AnalyticsSnapshotCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <AnalyticsSnapshotCard title="Dimension Drivers" kicker="Score movement">
          <div className="space-y-3">
            {dimensionDrivers.map(driver => (
              <div key={driver.dimension}>
                <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                  <span className="font-semibold text-ink">{driver.dimension}</span>
                  <span className="text-ink-secondary">{driver.changes}</span>
                </div>
                <div className="h-2 rounded-full bg-surface-tertiary">
                  <div className="h-2 rounded-full bg-brand-orange" style={{ width: `${driver.changes / 28 * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </AnalyticsSnapshotCard>

        <AnalyticsSnapshotCard title="Escalation Intelligence" kicker="Risk">
          <div className="h-[180px] text-brand-blue-dark">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={escalationHeat}>
                <XAxis dataKey="segment" tickLine={false} axisLine={false} tick={{ fill: 'currentColor' }} className="text-ink-secondary" />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: 'currentColor' }} className="text-ink-secondary" />
                <Tooltip />
                <Bar dataKey="escalations" fill="currentColor" className="text-brand-blue-dark" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AnalyticsSnapshotCard>

        <AnalyticsSnapshotCard title="Content Effectiveness" kicker="Education">
          <div className="h-[180px] text-brand-blue">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart>
                <XAxis dataKey="content" name="Content" tickLine={false} axisLine={false} tick={{ fill: 'currentColor' }} className="text-ink-secondary" />
                <YAxis dataKey="csat" name="CSAT" tickLine={false} axisLine={false} tick={{ fill: 'currentColor' }} className="text-ink-secondary" />
                <Tooltip />
                <Scatter data={contentEffect} fill="currentColor" className="text-brand-blue" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </AnalyticsSnapshotCard>
      </div>
    </section>
  )
}

export function PortfolioAnalytics({ embedded = false }: { embedded?: boolean }) {
  const user = useRole()
  const accounts = useAccountStore(state => state.accounts)
  const opportunities = useOpportunityStore(state => state.opportunities)
  const entries = useTimelineStore(state => state.entries)
  const [params, setParams] = useSearchParams()
  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const filteredAccounts = useMemo(() => {
    const am = params.get('am') ?? ''
    const segment = params.get('segment') ?? ''
    const stage = params.get('stage') ?? ''
    return accounts.filter(account => {
      if (am && account.ownerId !== am) return false
      if (segment && !account.tags.includes(segment)) return false
      if (stage && account.stage !== stage) return false
      return true
    })
  }, [accounts, params])

  if (user.role === 'am' || user.role === 'account_manager') {
    const restricted = (
      <section className="tk-card">
        <EmptyState icon={Lock} heading="Analytics restricted" body="Portfolio analytics are available to leadership and admin users only." />
      </section>
    )

    return embedded ? restricted : (
      <div className="space-y-4">
        <PageHeader eyebrow="Portfolio intelligence" title="Analytics" description="Leadership analytics are restricted to leadership and admin roles." />
        {restricted}
      </div>
    )
  }

  const kamRows = filteredAccounts.map(account => ({
    am: account.ownerName,
    accounts: 1,
    health: account.health.overall,
    escalations: entries.filter(entry => entry.accountId === account.id && entry.module === 'escalation').length,
    pipeline: opportunities.filter(opportunity => opportunity.accountId === account.id && !['Won', 'Lost'].includes(opportunity.stage)).reduce((sum, opportunity) => sum + opportunity.estimatedValue, 0),
  }))

  if (embedded) {
    return (
      <DashboardAnalytics
        accounts={accounts}
        filteredAccounts={filteredAccounts}
        opportunities={opportunities}
        entries={entries}
        kamRows={kamRows}
        params={params}
        setFilter={setFilter}
      />
    )
  }

  return (
    <div className={embedded ? 'mt-6 space-y-4' : 'space-y-4'}>
      {embedded ? (
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Portfolio intelligence</p>
            <h2 className="text-base font-semibold text-ink">Analytics</h2>
            <p className="mt-1 max-w-3xl text-sm text-ink-secondary">
              Health trends, escalation patterns, opportunity movement, content impact, and KAM performance.
            </p>
          </div>
          <BarChart3 className="h-6 w-6 shrink-0 text-brand-blue" />
        </div>
      ) : (
        <PageHeader
          eyebrow="Portfolio intelligence"
          title="Analytics"
          description="Health trends, escalation intelligence, opportunity movement, content effectiveness, and KAM performance."
          actions={<BarChart3 className="h-6 w-6 text-brand-blue" />}
        />
      )}

      <section className="tk-card grid gap-3 p-4 md:grid-cols-5">
        <input className="tk-input" type="date" value={params.get('from') ?? ''} onChange={event => setFilter('from', event.target.value)} aria-label="From date" />
        <input className="tk-input" type="date" value={params.get('to') ?? ''} onChange={event => setFilter('to', event.target.value)} aria-label="To date" />
        <select className="tk-input" value={params.get('am') ?? ''} onChange={event => setFilter('am', event.target.value)}>
          <option value="">All AMs</option>
          {[...new Map(accounts.map(account => [account.ownerId, account.ownerName])).entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select className="tk-input" value={params.get('segment') ?? ''} onChange={event => setFilter('segment', event.target.value)}>
          <option value="">All segments</option>
          {[...new Set(accounts.flatMap(account => account.tags))].map(tag => <option key={tag}>{tag}</option>)}
        </select>
        <select className="tk-input" value={params.get('stage') ?? ''} onChange={event => setFilter('stage', event.target.value)}>
          <option value="">All stages</option>
          {[...new Set(accounts.map(account => account.stage))].map(stage => <option key={stage}>{stage}</option>)}
        </select>
      </section>

      <div className="space-y-4">
        <AnalyticsCard title="Portfolio Health Trends" kicker="Section 1" chartId="portfolio-health-trends" rows={healthTrend}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={healthTrend}>
              <CartesianGrid stroke="currentColor" className="text-surface-border" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: 'currentColor' }} className="text-ink-secondary" />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: 'currentColor' }} className="text-ink-secondary" />
              <Tooltip />
              <Line type="monotone" dataKey="Onboarding" stroke="currentColor" className="text-brand-blue" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Adoption" stroke="currentColor" className="text-rag-green" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Expansion" stroke="currentColor" className="text-brand-blue-dark" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Renewal" stroke="currentColor" className="text-brand-orange" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </AnalyticsCard>

        <div className="grid gap-4 xl:grid-cols-2">
          <AnalyticsCard title="Dimension Breakdown" kicker="Health drivers" chartId="dimension-breakdown" rows={dimensionDrivers}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dimensionDrivers}>
                <XAxis dataKey="dimension" tickLine={false} axisLine={false} tick={{ fill: 'currentColor' }} className="text-ink-secondary" />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: 'currentColor' }} className="text-ink-secondary" />
                <Tooltip />
                <Bar dataKey="changes" fill="currentColor" className="text-brand-orange" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </AnalyticsCard>

          <AnalyticsCard title="Escalation Intelligence" kicker="Section 2" chartId="escalation-intelligence" rows={escalationHeat}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={escalationHeat}>
                <XAxis dataKey="segment" tickLine={false} axisLine={false} tick={{ fill: 'currentColor' }} className="text-ink-secondary" />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: 'currentColor' }} className="text-ink-secondary" />
                <Tooltip />
                <Bar dataKey="escalations" fill="currentColor" className="text-brand-blue-dark" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </AnalyticsCard>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <AnalyticsCard title="Opportunity Intelligence" kicker="Section 3" chartId="opportunity-intelligence" rows={kamRows}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={kamRows}>
                <XAxis dataKey="am" tickLine={false} axisLine={false} tick={{ fill: 'currentColor' }} className="text-ink-secondary" />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: 'currentColor' }} tickFormatter={formatCompactCurrency} className="text-ink-secondary" />
                <Tooltip formatter={(value: number) => formatCompactCurrency(value)} />
                <Bar dataKey="pipeline" fill="currentColor" className="text-brand-blue" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </AnalyticsCard>

          <AnalyticsCard title="Content Effectiveness" kicker="Section 4" chartId="content-effectiveness" rows={contentEffect}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart>
                <XAxis dataKey="content" name="content sent" tickLine={false} axisLine={false} tick={{ fill: 'currentColor' }} className="text-ink-secondary" />
                <YAxis dataKey="csat" name="CSAT" tickLine={false} axisLine={false} tick={{ fill: 'currentColor' }} className="text-ink-secondary" />
                <Tooltip />
                <Scatter data={contentEffect} fill="currentColor" className="text-brand-blue" />
              </ScatterChart>
            </ResponsiveContainer>
          </AnalyticsCard>
        </div>

        <AnalyticsCard title="KAM Performance" kicker="Section 5" chartId="kam-performance" rows={kamRows}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={kamRows}>
              <XAxis dataKey="am" tickLine={false} axisLine={false} tick={{ fill: 'currentColor' }} className="text-ink-secondary" />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: 'currentColor' }} className="text-ink-secondary" />
              <Tooltip />
              <Bar dataKey="health" fill="currentColor" className="text-rag-green" radius={[8, 8, 0, 0]} />
              <Bar dataKey="escalations" fill="currentColor" className="text-brand-orange" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </AnalyticsCard>
      </div>
    </div>
  )
}

export function Analytics() {
  return <PortfolioAnalytics />
}
