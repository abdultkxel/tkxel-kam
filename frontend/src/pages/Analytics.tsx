import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, BarChart3, Download, FileDown, Loader2, Lock, Search } from 'lucide-react'
import { ReactNode, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { useAuth } from '@/contexts/AuthContext'
import { useCapabilities } from '@/hooks/useCapabilities'
import { AnalyticsPortfolio as AnalyticsPortfolioRead, getAccountChangeAlerts, getAnalyticsPortfolio, getKamPerformance, KamPerformance } from '@/services/analytics'
import { formatCompactCurrency } from '@/utils/formatters'

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

function seriesRows(portfolio: AnalyticsPortfolioRead | null, name: string) {
  return portfolio?.series.find(series => series.name === name)?.rows ?? []
}

function metricValue(portfolio: AnalyticsPortfolioRead | null, label: string, fallback: string | number = 0) {
  return portfolio?.metrics.find(metric => metric.label === label)?.value ?? fallback
}

function ChartActions({ chartId, rows }: { chartId: string; rows: Record<string, unknown>[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button className="tk-button-secondary" type="button" onClick={() => downloadSvg(chartId, `${chartId}.svg`)}>
        <Download className="h-4 w-4" />
        Download SVG
      </button>
      <button className="tk-button-secondary" type="button" onClick={() => exportCsv(`${chartId}.csv`, rows)}>
        <FileDown className="h-4 w-4" />
        Export CSV
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

function AnalyticsMetric({ label, value, tone = 'default' }: { label: string; value: string | number; tone?: string }) {
  const toneClass = tone === 'warning' ? 'text-brand-orange' : tone === 'success' ? 'text-rag-green' : 'text-ink'

  return (
    <div className="rounded-lg bg-surface-secondary px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">{label}</p>
      <p className={`mt-1 font-display text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  )
}

function normalizeDate(value: string | null) {
  return value ? new Date(`${value}T00:00:00`).toISOString() : undefined
}

function DashboardAnalytics({ portfolio, kamRows, alerts }: { portfolio: AnalyticsPortfolioRead; kamRows: KamPerformance[]; alerts: number }) {
  const healthTrend = seriesRows(portfolio, 'health_trend')
  const kamSeries = kamRows.map(row => ({ owner_name: row.owner_name, average_health: row.average_health, open_pipeline: row.open_pipeline, open_escalations: row.open_escalations }))

  return (
    <section id="analytics" className="mt-6 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {portfolio.metrics.map(metric => (
          <AnalyticsMetric key={metric.label} label={metric.label} value={metric.label === 'Open pipeline' ? formatCompactCurrency(Number(metric.value || 0)) : metric.value} tone={metric.tone} />
        ))}
        <AnalyticsMetric label="Open alerts" value={alerts} tone={alerts ? 'warning' : 'success'} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <AnalyticsCard title="Portfolio Health Trend" kicker="Persisted scores" chartId="dashboard-health-trend" rows={healthTrend}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={healthTrend}>
              <CartesianGrid stroke="currentColor" className="text-surface-border" vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: 'currentColor' }} className="text-ink-secondary" />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: 'currentColor' }} className="text-ink-secondary" />
              <Tooltip />
              <Line type="monotone" dataKey="average_health" stroke="currentColor" className="text-brand-blue" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </AnalyticsCard>
        <AnalyticsCard title="KAM Performance" kicker="Owners" chartId="dashboard-kam-performance" rows={kamSeries}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={kamSeries}>
              <XAxis dataKey="owner_name" tickLine={false} axisLine={false} tick={{ fill: 'currentColor' }} className="text-ink-secondary" />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: 'currentColor' }} className="text-ink-secondary" />
              <Tooltip />
              <Bar dataKey="average_health" fill="currentColor" className="text-rag-green" radius={[6, 6, 0, 0]} />
              <Bar dataKey="open_escalations" fill="currentColor" className="text-brand-orange" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </AnalyticsCard>
      </div>
    </section>
  )
}

export function PortfolioAnalytics({ embedded = false }: { embedded?: boolean }) {
  const { token } = useAuth()
  const { capabilities } = useCapabilities()
  const [params, setParams] = useSearchParams()
  const [portfolio, setPortfolio] = useState<AnalyticsPortfolioRead | null>(null)
  const [kamRows, setKamRows] = useState<KamPerformance[]>([])
  const [alertCount, setAlertCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const filters = useMemo(() => ({
    search: params.get('search') ?? undefined,
    am_id: params.get('am_id') ?? undefined,
    segment: params.get('segment') ?? undefined,
    region: params.get('region') ?? undefined,
    lifecycle_status: params.get('lifecycle_status') ?? undefined,
    risk: params.get('risk') ?? undefined,
    date_from: normalizeDate(params.get('date_from')),
    date_to: normalizeDate(params.get('date_to')),
  }), [params])

  useEffect(() => {
    if (!token) return
    let active = true
    setLoading(true)
    setError('')
    Promise.all([
      getAnalyticsPortfolio(token, filters),
      getKamPerformance(token, { page: 1, page_size: 50 }),
      getAccountChangeAlerts(token, { page: 1, page_size: 1, refresh: true, status: 'open' }),
    ])
      .then(([portfolioResult, kamResult, alertResult]) => {
        if (!active) return
        setPortfolio(portfolioResult)
        setKamRows(kamResult.items)
        setAlertCount(alertResult.total)
      })
      .catch(err => {
        if (active) setError(err instanceof Error ? err.message : 'Analytics could not be loaded')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [filters, token])

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  if (!capabilities.can_view_portfolio && !capabilities.permission_keys.includes('analytics:view_portfolio')) {
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

  if (embedded && portfolio && !loading && !error) {
    return <DashboardAnalytics portfolio={portfolio} kamRows={kamRows} alerts={alertCount} />
  }

  const healthTrend = seriesRows(portfolio, 'health_trend')
  const dimensionRows = seriesRows(portfolio, 'dimension_drivers')
  const escalationRows = seriesRows(portfolio, 'escalation_intelligence')
  const kamSeries = kamRows.map(row => ({
    owner_name: row.owner_name,
    account_count: row.account_count,
    average_health: row.average_health,
    overdue_action_rate: row.overdue_action_rate,
    governance_cadence_rate: row.governance_cadence_rate,
    renewal_readiness: row.renewal_readiness,
    open_pipeline: row.open_pipeline,
    open_escalations: row.open_escalations,
  }))

  return (
    <div className="space-y-5">
      {!embedded ? (
        <PageHeader
          eyebrow="Portfolio intelligence"
          title="Analytics"
          description="Health movement, risk concentration, account-change alerts, pipeline visibility, and KAM performance from persisted account data."
          actions={<BarChart3 className="h-6 w-6 text-brand-blue" />}
        />
      ) : null}

      <section className="tk-card p-4">
        <div className="grid gap-3 md:grid-cols-[1.2fr_repeat(5,minmax(0,1fr))]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
            <input className="tk-input pl-9" value={params.get('search') ?? ''} onChange={event => setFilter('search', event.target.value)} placeholder="Search accounts" />
          </label>
          <input className="tk-input" type="date" value={params.get('date_from') ?? ''} onChange={event => setFilter('date_from', event.target.value)} aria-label="From date" />
          <input className="tk-input" type="date" value={params.get('date_to') ?? ''} onChange={event => setFilter('date_to', event.target.value)} aria-label="To date" />
          <input className="tk-input" value={params.get('region') ?? ''} onChange={event => setFilter('region', event.target.value)} placeholder="Region" />
          <select className="tk-input" value={params.get('risk') ?? ''} onChange={event => setFilter('risk', event.target.value)}>
            <option value="">All risks</option>
            <option value="healthy">Healthy</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
          <input className="tk-input" value={params.get('lifecycle_status') ?? ''} onChange={event => setFilter('lifecycle_status', event.target.value)} placeholder="Lifecycle" />
        </div>
      </section>

      {loading ? <div className="tk-card flex items-center gap-2 p-5 text-sm text-ink-secondary"><Loader2 className="h-4 w-4 animate-spin" />Loading portfolio analytics</div> : null}
      {error ? <div className="rounded-md border border-rag-red/20 bg-rag-red/10 px-3 py-2 text-sm font-medium text-rag-red">{error}</div> : null}
      {!loading && !error && !portfolio ? <EmptyState icon={BarChart3} heading="No analytics yet" body="Analytics will appear after account and scoring data is available." /> : null}

      {portfolio ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {portfolio.metrics.map(metric => (
              <AnalyticsMetric key={metric.label} label={metric.label} value={metric.label === 'Open pipeline' ? formatCompactCurrency(Number(metric.value || 0)) : metric.value} tone={metric.tone} />
            ))}
            <AnalyticsMetric label="Open alerts" value={alertCount} tone={alertCount ? 'warning' : 'success'} />
          </div>

          {Number(metricValue(portfolio, 'Authorized accounts', 0)) === 0 ? (
            <section className="tk-card">
              <EmptyState icon={BarChart3} heading="No matching accounts" body="Adjust filters to include accounts in your authorized scope." />
            </section>
          ) : (
            <div className="space-y-4">
              <AnalyticsCard title="Portfolio Health Trend" kicker="Persisted scores" chartId="portfolio-health-trends" rows={healthTrend}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={healthTrend}>
                    <CartesianGrid stroke="currentColor" className="text-surface-border" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: 'currentColor' }} className="text-ink-secondary" />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: 'currentColor' }} className="text-ink-secondary" />
                    <Tooltip />
                    <Line type="monotone" dataKey="average_health" stroke="currentColor" className="text-brand-blue" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </AnalyticsCard>

              <div className="grid gap-4 xl:grid-cols-2">
                <AnalyticsCard title="Dimension Drivers" kicker="Health drivers" chartId="dimension-breakdown" rows={dimensionRows}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dimensionRows}>
                      <XAxis dataKey="dimension" tickLine={false} axisLine={false} tick={{ fill: 'currentColor' }} className="text-ink-secondary" />
                      <YAxis tickLine={false} axisLine={false} tick={{ fill: 'currentColor' }} className="text-ink-secondary" />
                      <Tooltip />
                      <Bar dataKey="average" fill="currentColor" className="text-brand-blue" radius={[8, 8, 0, 0]} />
                      <Bar dataKey="at_risk_count" fill="currentColor" className="text-brand-orange" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </AnalyticsCard>

                <AnalyticsCard title="Escalation Intelligence" kicker="Open escalations" chartId="escalation-intelligence" rows={escalationRows}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={escalationRows}>
                      <XAxis dataKey="segment" tickLine={false} axisLine={false} tick={{ fill: 'currentColor' }} className="text-ink-secondary" />
                      <YAxis tickLine={false} axisLine={false} tick={{ fill: 'currentColor' }} className="text-ink-secondary" />
                      <Tooltip />
                      <Bar dataKey="escalations" fill="currentColor" className="text-brand-orange" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </AnalyticsCard>
              </div>

              <AnalyticsCard title="KAM Performance" kicker="Owners" chartId="kam-performance" rows={kamSeries}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={kamSeries}>
                    <XAxis dataKey="owner_name" tickLine={false} axisLine={false} tick={{ fill: 'currentColor' }} className="text-ink-secondary" />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: 'currentColor' }} className="text-ink-secondary" />
                    <Tooltip />
                    <Bar dataKey="average_health" fill="currentColor" className="text-rag-green" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="open_escalations" fill="currentColor" className="text-brand-orange" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </AnalyticsCard>
            </div>
          )}

          <section className="tk-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Alerts</p>
                <h2 className="text-base font-semibold text-ink">Account-Change Alerts</h2>
              </div>
              <AlertTriangle className="h-5 w-5 text-brand-orange" />
            </div>
            <p className="mt-3 text-sm text-ink-secondary">
              {alertCount ? `${alertCount} open persisted alert${alertCount === 1 ? '' : 's'} need owner review.` : 'No open account-change alerts in this view.'}
            </p>
          </section>
        </>
      ) : null}
    </div>
  )
}

export function Analytics() {
  return <PortfolioAnalytics />
}
