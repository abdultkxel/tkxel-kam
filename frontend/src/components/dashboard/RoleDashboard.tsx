import {
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isSameDay,
  startOfMonth,
  subMonths,
} from 'date-fns'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Building2,
  CalendarCheck2,
  CalendarDays,
  Check,
  ExternalLink,
  Filter,
  Info,
  LineChart,
  ListChecks,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { Skeleton } from '@/components/ui/Skeleton'
import { DashboardRead, DashboardWidget } from '@/services/notificationsReporting'
import { listGovernanceCalendarItems } from '@/services/governance'
import { GovernanceCalendarItemRecord } from '@/types/governance'
import { cn } from '@/utils/cn'
import { formatCompactCurrency } from '@/utils/formatters'

type DashboardProps = {
  dashboard: DashboardRead | null
  userName: string
  userId?: string
  token: string | null
  draftSearch: string
  risk: string
  accountId: string
  amId: string
  loading: boolean
  error: string
  refreshingSummary: boolean
  canRefreshSummary: boolean
  onDraftSearchChange: (value: string) => void
  onRiskChange: (value: string) => void
  onAccountChange: (value: string) => void
  onAmChange: (value: string) => void
  onSearchSubmit: (event: FormEvent) => void
  onPageChange: (page: number) => void
  onRefreshSummary: () => void
}

type AccountOption = {
  id: string
  name: string
}

type OwnerOption = {
  id: string
  name: string
}

const knownWidgetKeys = new Set([
  'summary',
  'ai_task_summary',
  'forecast_chart',
  'opportunities',
  'growth',
  'account_portfolio',
  'accounts',
  'high_risk_accounts',
  'signals',
  'critical_tasks',
  'tasks',
  'stale_kyc',
  'renewal_focus',
  'am_workload',
  'engagement_health',
  'retention',
  'revenue_risk',
  'executive_summaries',
  'governance',
  'governance_cadence',
  'governance_calendar',
  'overdue_actions',
  'admin_system',
])

export function RoleDashboard({
  dashboard,
  userName,
  userId,
  token,
  draftSearch,
  risk,
  accountId,
  amId,
  loading,
  error,
  refreshingSummary,
  canRefreshSummary,
  onDraftSearchChange,
  onRiskChange,
  onAccountChange,
  onAmChange,
  onSearchSubmit,
  onPageChange,
  onRefreshSummary,
}: DashboardProps) {
  const widgets = dashboard?.widgets ?? []
  const widgetByKey = useMemo(() => new Map(widgets.map(widget => [widget.key, widget])), [widgets])
  const isAccountManagerDashboard = dashboard?.dashboard === 'am_home' || dashboard?.role_group === 'account_manager'
  const summary = widgetByKey.get('summary')
  const taskSummary = widgetByKey.get('ai_task_summary')
  const taskPanel = taskSummary ?? (isAccountManagerDashboard ? widgetByKey.get('tasks') : undefined)
  const opportunities = widgetByKey.get('opportunities') ?? widgetByKey.get('growth')
  const portfolio = widgetByKey.get('account_portfolio') ?? widgetByKey.get('accounts')
  const forecast = widgetByKey.get('forecast_chart')
  const calendar = widgetByKey.get('governance_calendar')
  const accountOptions = useMemo(() => collectAccountOptions(widgets), [widgets])
  const ownerOptions = useMemo(() => collectOwnerOptions(widgets), [widgets])
  const allowedFilters = dashboard?.allowed_filters ?? []
  const fallbackWidgets = widgets.filter(widget => !knownWidgetKeys.has(widget.key))

  return (
    <div className="space-y-5">
      <DashboardHeader
        title={dashboard?.display_name ?? 'Dashboard'}
        userName={userName}
        roleGroup={dashboard?.role_group}
        dataScope={dashboard?.data_scope}
        readOnly={Boolean(dashboard?.read_only)}
        canRefreshSummary={canRefreshSummary}
        refreshingSummary={refreshingSummary}
        onRefreshSummary={onRefreshSummary}
      />

      <DashboardControls
        draftSearch={draftSearch}
        risk={risk}
        accountId={accountId}
        amId={amId}
        allowedFilters={allowedFilters}
        accountOptions={accountOptions}
        ownerOptions={ownerOptions}
        onDraftSearchChange={onDraftSearchChange}
        onRiskChange={onRiskChange}
        onAccountChange={onAccountChange}
        onAmChange={onAmChange}
        onSearchSubmit={onSearchSubmit}
      />

      {loading ? <DashboardLoading /> : null}
      {error ? <section className="rounded-lg border border-rag-red/20 bg-rag-red/10 p-4 text-sm font-medium text-rag-red">{error}</section> : null}
      {!loading && !error && widgets.length === 0 ? <EmptyDashboard /> : null}

      {!loading && !error && widgets.length ? (
        <>
          <MetricGrid summary={summary} />

          {taskPanel ? (
            <TaskSummaryPanel
              widget={taskPanel}
              refreshing={refreshingSummary}
              canRefresh={taskPanel.key === 'ai_task_summary' && canRefreshSummary}
              onRefresh={onRefreshSummary}
            />
          ) : null}

          {(opportunities || forecast) ? (
          <section className={cn('grid gap-4', opportunities && forecast ? 'xl:grid-cols-[minmax(0,0.95fr)_minmax(320px,0.65fr)]' : '')}>
            {opportunities ? <PipelinePanel widget={opportunities} /> : null}
            {forecast ? <ForecastPanel widget={forecast} accountOptions={accountOptions} accountId={accountId} onAccountChange={onAccountChange} /> : null}
          </section>
          ) : null}

          {portfolio ? <PortfolioTable widget={portfolio} onPageChange={onPageChange} /> : null}

          <section className="grid gap-4 xl:grid-cols-2">
            {[
              widgetByKey.get('high_risk_accounts'),
              widgetByKey.get('critical_tasks') ?? widgetByKey.get('signals'),
              taskPanel?.key === 'tasks' ? undefined : widgetByKey.get('tasks'),
              widgetByKey.get('am_workload'),
              widgetByKey.get('engagement_health'),
              widgetByKey.get('retention'),
              widgetByKey.get('revenue_risk'),
              widgetByKey.get('executive_summaries'),
              widgetByKey.get('overdue_actions'),
              widgetByKey.get('admin_system'),
              ...fallbackWidgets,
            ].filter(isWidget).map(widget => (
              <WidgetListPanel key={widget.key} widget={widget} />
            ))}
          </section>

          {calendar && token ? (
            <GovernanceCalendarPanel
              token={token}
              userId={userId}
              dashboardReadOnly={Boolean(dashboard?.read_only)}
              calendarWidget={calendar}
              accountOptions={accountOptions}
            />
          ) : null}
        </>
      ) : null}
    </div>
  )
}

function DashboardHeader({
  title,
  userName,
  roleGroup,
  dataScope,
  readOnly,
  canRefreshSummary,
  refreshingSummary,
  onRefreshSummary,
}: {
  title: string
  userName: string
  roleGroup?: string | null
  dataScope?: string
  readOnly: boolean
  canRefreshSummary: boolean
  refreshingSummary: boolean
  onRefreshSummary: () => void
}) {
  return (
    <header className="v4-glass flex flex-col gap-4 rounded-2xl p-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">What needs attention today</p>
        <h1 className="mt-1 font-display text-4xl font-bold leading-tight text-ink">{title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-base text-ink-secondary">
          <span>Welcome back, {userName}</span>
          {roleGroup ? <span className="rounded-full bg-surface-tertiary px-3 py-1 text-xs font-semibold text-brand-blue-dark">{roleGroup.replace(/_/g, ' ')}</span> : null}
          {dataScope ? <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-ink-secondary">{dataScope.replace(/_/g, ' ')}</span> : null}
          {readOnly ? <span className="rounded-full border border-surface-border bg-white/80 px-3 py-1 text-xs font-semibold text-ink-secondary">Read only</span> : null}
        </div>
      </div>
      {canRefreshSummary ? (
        <button className="tk-button-secondary w-fit" type="button" onClick={onRefreshSummary} disabled={refreshingSummary}>
          <RefreshCw className={refreshingSummary ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          Refresh AI Data
        </button>
      ) : null}
    </header>
  )
}

function DashboardControls({
  draftSearch,
  risk,
  accountId,
  amId,
  allowedFilters,
  accountOptions,
  ownerOptions,
  onDraftSearchChange,
  onRiskChange,
  onAccountChange,
  onAmChange,
  onSearchSubmit,
}: {
  draftSearch: string
  risk: string
  accountId: string
  amId: string
  allowedFilters: string[]
  accountOptions: AccountOption[]
  ownerOptions: OwnerOption[]
  onDraftSearchChange: (value: string) => void
  onRiskChange: (value: string) => void
  onAccountChange: (value: string) => void
  onAmChange: (value: string) => void
  onSearchSubmit: (event: FormEvent) => void
}) {
  const showAccountFilter = allowedFilters.includes('account_id') && accountOptions.length > 0
  const showAmFilter = allowedFilters.includes('am_id') && ownerOptions.length > 0
  const gridClass = showAccountFilter || showAmFilter
    ? 'md:grid-cols-[1fr_180px_220px_auto] xl:grid-cols-[minmax(220px,1fr)_160px_220px_220px_auto]'
    : 'md:grid-cols-[1fr_180px_auto]'
  return (
    <section className="tk-card p-3">
      <form className={cn('grid gap-3', gridClass)} onSubmit={onSearchSubmit}>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
          <input className="tk-input pl-9" value={draftSearch} onChange={event => onDraftSearchChange(event.target.value)} placeholder="Search accounts and decisions" />
        </label>
        <select className="tk-input" value={risk} onChange={event => onRiskChange(event.target.value)} disabled={!allowedFilters.includes('risk')}>
          <option value="">All risk</option>
          <option value="at_risk">At risk</option>
          <option value="healthy">Healthy</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical</option>
        </select>
        {showAccountFilter ? (
          <select className="tk-input" value={accountId} onChange={event => onAccountChange(event.target.value)}>
            <option value="">All accounts</option>
            {accountOptions.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
        ) : null}
        {showAmFilter ? (
          <select className="tk-input" value={amId} onChange={event => onAmChange(event.target.value)}>
            <option value="">All account managers</option>
            {ownerOptions.map(owner => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
          </select>
        ) : null}
        <button className="tk-button-primary" type="submit"><Search className="h-4 w-4" />Search</button>
      </form>
    </section>
  )
}

function MetricGrid({ summary }: { summary?: DashboardWidget }) {
  const value = isRecord(summary?.value) ? summary.value : {}
  const metadataTiles = Array.isArray(summary?.metadata.tiles) ? summary.metadata.tiles.filter(isRecord) : []
  const metrics = metadataTiles.length
    ? metadataTiles.slice(0, 4).map(tile => ({
      key: getString(tile.key) || getString(tile.label),
      label: getString(tile.label) || labelize(getString(tile.key)),
      value: tile.value,
      route: getString(tile.route) || dashboardMetricRoute(getString(tile.key) || getString(tile.label)),
      detail: getString(tile.detail),
    }))
    : Object.entries(value).slice(0, 4).map(([key, item]) => ({
      key,
      label: labelize(key),
      value: item,
      route: dashboardMetricRoute(key),
      detail: metricDetail(key, item),
    }))
  if (!metrics.length) return null

  return (
    <section className="grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric, index) => {
        const key = metric.key || metric.label
        const tone = metricTone(key, index)
        const Icon = metricIcon(key)
        const content = (
          <>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">{metric.label}</p>
                <div className="mt-3 flex min-h-[44px] items-baseline gap-1 text-ink">
                  {typeof metric.value === 'number' ? (
                    <AnimatedNumber value={metric.value} format={metricFormatter(key)} className="block font-display text-4xl font-bold leading-none text-current" />
                  ) : (
                    <span className="block font-display text-4xl font-bold leading-none text-current">{formatValue(metric.value, key)}</span>
                  )}
                </div>
              </div>
              <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-lg', tone)}>
                <Icon className="h-6 w-6" />
              </span>
            </div>
            <p className="mt-4 line-clamp-2 text-sm leading-5 text-ink-secondary">{metric.detail || metricDetail(key, metric.value)}</p>
          </>
        )
        return metric.route ? (
          <Link key={key} to={metric.route} className={cn('tk-card flex min-h-[152px] flex-col justify-between p-5 animate-fade-in transition hover:-translate-y-0.5 hover:border-brand-blue/40 hover:shadow-md', staggerClass(index))}>
            {content}
          </Link>
        ) : (
          <article key={key} className={cn('tk-card flex min-h-[152px] flex-col justify-between p-5 animate-fade-in', staggerClass(index))}>
            {content}
          </article>
        )
      })}
    </section>
  )
}

function TaskSummaryPanel({ widget, refreshing, canRefresh, onRefresh }: { widget: DashboardWidget; refreshing: boolean; canRefresh: boolean; onRefresh: () => void }) {
  if (widget.key === 'tasks') return <TaskBreakdownPanel widget={widget} />

  const value = isRecord(widget.value) ? widget.value : {}
  const blockers = Array.isArray(value.top_blockers) ? value.top_blockers.map(String) : []
  const sourceCounts = isRecord(value.source_counts) ? value.source_counts : {}
  return (
    <section className="tk-card overflow-hidden">
      <div className="grid gap-4 p-5 2xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] 2xl:items-start">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-tint-20 text-brand-blue">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">KAM AI</p>
              <h2 className="text-lg font-semibold text-ink">Task summary</h2>
            </div>
          </div>
          <p className="mt-4 text-xl font-semibold leading-7 text-ink">{String(value.headline ?? widget.title)}</p>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-secondary">{String(value.narrative ?? '')}</p>
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-2 rounded-lg border border-surface-border bg-surface-secondary p-2 sm:grid-cols-4 2xl:grid-cols-2">
          {Object.entries(sourceCounts).map(([key, count]) => <MiniMetric key={key} label={key} value={count} route={dashboardMetricRoute(key)} />)}
          {canRefresh ? (
            <button className="tk-button-secondary col-span-2 min-h-[44px] sm:col-span-4 2xl:col-span-2" type="button" onClick={onRefresh} disabled={refreshing}>
              <RefreshCw className={refreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
              Refresh
            </button>
          ) : null}
        </div>
      </div>
      <div className="grid border-t border-surface-border xl:grid-cols-[minmax(0,0.92fr)_minmax(320px,0.58fr)]">
        <div className="grid border-b border-surface-border md:grid-cols-3 xl:border-b-0 xl:border-r xl:border-surface-border xl:divide-x xl:divide-surface-border">
          {(blockers.length ? blockers.slice(0, 3) : ['No blockers in scope.']).map(item => (
            <div key={item} className="border-b border-surface-border p-4 last:border-b-0 md:border-b-0">
              <p className="text-sm leading-6 text-ink-secondary">{item}</p>
            </div>
          ))}
        </div>
        <div className="bg-surface-secondary p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Focus</p>
          <p className="mt-3 rounded-md border border-surface-border bg-white px-3 py-2 text-sm leading-5 text-ink-secondary">{String(value.recommended_focus ?? 'Review active account work.')}</p>
        </div>
      </div>
      <div className="border-t border-surface-border bg-surface-secondary px-5 py-3">
        <p className="text-xs font-medium text-ink-secondary">Refreshed {formatDateTime(String(value.refreshed_at ?? widget.generated_at))}</p>
      </div>
    </section>
  )
}

function TaskBreakdownPanel({ widget }: { widget: DashboardWidget }) {
  const value = isRecord(widget.value) ? widget.value : {}
  const cards = [
    { key: 'open', label: 'Open', value: value.open, detail: `across ${formatValue(value.accounts_with_open_tasks)} accounts`, tone: 'text-ink', route: '/tasks?status=open' },
    { key: 'in_progress', label: 'In progress', value: value.in_progress, detail: 'assigned to me', tone: 'text-brand-blue', route: '/tasks?status=in_progress&my_items=true' },
    { key: 'overdue', label: 'Overdue', value: value.overdue, detail: 'needs action today', tone: 'text-rag-red', route: '/tasks?due=overdue' },
    { key: 'due_this_week', label: 'Due this week', value: value.due_this_week, detail: 'across all accounts', tone: 'text-brand-orange', route: '/tasks?due=next7' },
  ]

  return (
    <section className="tk-card overflow-hidden p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-orange/10 text-brand-orange">
            <ListChecks className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-xl font-semibold text-ink">{widget.title}</h2>
            <p className="mt-1 text-sm leading-6 text-ink-secondary">Full task status breakdown across assigned accounts</p>
          </div>
        </div>
        {widget.primary_route ? <Link to={widget.primary_route} className="tk-button-secondary w-fit">Open tasks <ArrowRight className="h-4 w-4" /></Link> : null}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {cards.map(card => (
          <Link key={card.key} to={card.route} className="rounded-lg bg-surface-secondary p-5 transition hover:-translate-y-0.5 hover:bg-blue-tint-20/60 hover:shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">{card.label}</p>
            <p className={cn('mt-4 font-display text-4xl font-bold leading-none', card.tone)}>{formatValue(card.value)}</p>
            <p className="mt-3 text-sm font-medium text-ink-secondary">{card.detail}</p>
          </Link>
        ))}
      </div>

      <div className="mt-5 divide-y divide-surface-border border-y border-surface-border">
        <div className="grid gap-3 py-4 md:grid-cols-[220px_minmax(0,1fr)] md:items-center">
          <p className="flex items-center gap-3 text-sm font-semibold text-ink-secondary"><span className="h-2.5 w-2.5 rounded-full bg-brand-blue" />Data source</p>
          <p className="text-sm font-semibold text-ink">{getString(widget.metadata.data_source) || 'Task records filtered to assigned account scope'}</p>
        </div>
        {widget.items.length ? (
          <div className="py-2">
            {widget.items.slice(0, 5).map(item => <RowLink key={String(item.id ?? item.title)} item={item} dateKey="due_at" />)}
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-lg border border-brand-blue/40 bg-blue-tint-20 px-4 py-3 text-sm font-medium text-brand-blue-dark">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>Task completion does NOT improve health scores; only underlying account data changes do.</p>
      </div>
    </section>
  )
}

function MiniMetric({ label, value, route }: { label: string; value: unknown; route?: string }) {
  const content = (
    <>
      <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-ink-secondary" title={label}>{labelize(label)}</p>
      <p className="mt-1 font-display text-2xl font-bold leading-none text-ink">{formatValue(value)}</p>
    </>
  )
  return route ? (
    <Link to={route} className="min-w-0 rounded-md bg-white p-3 transition hover:-translate-y-0.5 hover:bg-blue-tint-20/60 hover:shadow-sm">
      {content}
    </Link>
  ) : (
    <div className="min-w-0 rounded-md bg-white p-3">
      {content}
    </div>
  )
}

function PipelinePanel({ widget }: { widget: DashboardWidget }) {
  const value = isRecord(widget.value) ? widget.value : {}
  const series = Array.isArray(value.series) ? value.series.filter(isRecord) : []
  const max = Math.max(1, ...series.map(item => Number(item.value) || 0))
  const masked = Boolean(widget.metadata.masked)
  const stalledDays = Number(widget.metadata.stalled_after_days) || 90
  const referenceLayout = widget.data_scope === 'assigned_accounts'
  const openRoute = '/opportunities?openOnly=true'
  const stalledRoute = '/opportunities?stalled=true'

  return (
    <section className="tk-card overflow-hidden p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rag-green/10 text-rag-green">
            <LineChart className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-xl font-semibold text-ink">{widget.title}</h2>
            <p className="mt-1 text-sm leading-6 text-ink-secondary">Active opportunities across assigned accounts</p>
          </div>
        </div>
        {widget.primary_route ? <Link to={widget.primary_route} className="tk-button-secondary w-fit">View all <ArrowRight className="h-4 w-4" /></Link> : null}
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <Link to={openRoute} className="rounded-lg bg-surface-secondary p-5 transition hover:-translate-y-0.5 hover:bg-rag-green/10 hover:shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Open opps</p>
          <p className="mt-4 font-display text-4xl font-bold leading-none text-rag-green">{formatValue(value.open_opportunities)}</p>
        </Link>
        <Link to={openRoute} className="rounded-lg bg-surface-secondary p-5 transition hover:-translate-y-0.5 hover:bg-blue-tint-20/60 hover:shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Total value</p>
          <p className="mt-4 font-display text-4xl font-bold leading-none text-ink">{formatValue(value.pipeline_value, 'pipeline_value')}</p>
        </Link>
        <Link to={stalledRoute} className="rounded-lg bg-surface-secondary p-5 transition hover:-translate-y-0.5 hover:bg-brand-orange/10 hover:shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Stalled</p>
          <p className="mt-4 font-display text-4xl font-bold leading-none text-brand-orange">{formatValue(value.stalled)}</p>
          <p className="mt-3 text-sm font-medium text-ink-secondary">&gt;{stalledDays} days no move</p>
        </Link>
      </div>

      <div className="mt-5 divide-y divide-surface-border border-y border-surface-border">
        <div className="grid gap-3 py-4 md:grid-cols-[320px_minmax(0,1fr)] md:items-center">
          <p className="flex items-center gap-3 text-sm font-semibold text-ink-secondary"><span className="h-2.5 w-2.5 rounded-full bg-rag-green" />Data source</p>
          <p className="text-sm font-semibold text-ink">Opportunity records filtered to assigned accounts; stage not Won/Lost</p>
        </div>
        <div className="grid gap-3 py-4 md:grid-cols-[320px_minmax(0,1fr)] md:items-center">
          <p className="flex items-center gap-3 text-sm font-semibold text-ink-secondary"><span className="h-2.5 w-2.5 rounded-full bg-brand-orange" />Stalled signal</p>
          <p className="text-sm font-semibold text-ink">Opportunity with no recorded update &gt; {stalledDays} days surfaces as a signal</p>
        </div>
      </div>

      {referenceLayout ? null : (
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Pipeline by stage</p>
          <div className="mt-4 space-y-3">
            {series.length ? series.map(item => (
              <div key={String(item.label)} className="grid grid-cols-[120px_minmax(0,1fr)_90px] items-center gap-3 text-sm">
                <span className="truncate text-ink-secondary">{String(item.label)}</span>
                <span className="h-8 overflow-hidden rounded-md bg-surface-tertiary">
                  <span className="block h-full rounded-md bg-brand-blue-dark" style={{ width: `${Math.max(8, ((Number(item.value) || 0) / max) * 100)}%` }} />
                </span>
                <span className="text-right font-semibold text-ink">{formatValue(item.display_value ?? item.value, 'pipeline_value')}</span>
              </div>
            )) : <p className="rounded-md bg-surface-tertiary p-3 text-sm text-ink-secondary">No pipeline items in this view.</p>}
          </div>
        </div>

        <div className="rounded-lg border border-surface-border bg-surface-secondary p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">{masked ? 'Visible opportunities' : 'Next closes'}</p>
          <div className="mt-2 divide-y divide-surface-border">
            {widget.items.slice(0, 4).map(item => (
              <RowLink key={String(item.id ?? item.name)} item={item} valueKey="value" dateKey="target_date" />
            ))}
            {!widget.items.length ? <p className="rounded-md bg-white p-3 text-sm text-ink-secondary">No open opportunities in scope.</p> : null}
          </div>
        </div>
      </div>
      )}
    </section>
  )
}

function ForecastPanel({
  widget,
  accountOptions,
  accountId,
  onAccountChange,
}: {
  widget: DashboardWidget
  accountOptions: AccountOption[]
  accountId: string
  onAccountChange: (value: string) => void
}) {
  const value = isRecord(widget.value) ? widget.value : {}
  const points = Array.isArray(value.points) ? value.points.filter(isRecord) : []
  const totals = isRecord(value.totals) ? value.totals : {}
  const series = Array.isArray(value.series) ? value.series.filter(isRecord) : []
  const missingData = Array.isArray(value.missing_data) ? value.missing_data.map(String) : []
  const masked = Boolean(widget.metadata.masked)
  const sharedForecast = points.length > 0
  const noAuthorizedScope = missingData.some(note => note.toLowerCase().includes('no authorized accounts'))
  const forecastUnavailable = (String(value.confidence) === 'not_available' || noAuthorizedScope) && numericValue(totals.forecast_revenue) <= 0
  const maxPoint = Math.max(1, ...points.map(point => numericValue(point.forecast_revenue)))
  const maxSeries = Math.max(1, ...series.map(item => Number(item.value) || 0))
  const chartWidth = 500
  const chartHeight = 162
  const left = 34
  const right = 16
  const top = 18
  const bottom = 32
  const plotWidth = chartWidth - left - right
  const plotHeight = chartHeight - top - bottom
  const xFor = (index: number) => left + (plotWidth / Math.max(1, points.length - 1)) * index
  const yFor = (amount: number) => top + plotHeight - (amount / maxPoint) * plotHeight
  const forecastLine = points.map((point, index) => `${xFor(index)},${yFor(numericValue(point.forecast_revenue))}`).join(' ')
  const metrics = sharedForecast
    ? [
        ['forecast_revenue', totals.forecast_revenue],
        ['baseline_revenue', totals.baseline_revenue],
        ['weighted_opportunity', totals.weighted_opportunity],
        ['risk_adjustment', totals.risk_adjustment],
      ]
    : Object.entries(value).filter(([key]) => key !== 'series').slice(0, 4)
  const accountCount = Number(widget.metadata.account_count) || 0
  const selectedAccount = accountOptions.find(account => account.id === accountId)
  const scopeLabel = selectedAccount ? `Single account: ${selectedAccount.name}` : accountCount ? `Portfolio forecast across ${accountCount} account${accountCount === 1 ? '' : 's'}` : 'Forecast scope'

  if (forecastUnavailable) {
    return (
      <section className="tk-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-brand-blue" />
              <h2 className="text-lg font-semibold text-ink">Forecast outlook</h2>
            </div>
            <p className="mt-1 text-sm text-ink-secondary">Next 6 months | {scopeLabel}</p>
          </div>
          {accountOptions.length ? (
            <select className="tk-input w-full sm:w-[240px]" value={accountId} onChange={event => onAccountChange(event.target.value)}>
              <option value="">All accounts</option>
              {accountOptions.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          ) : null}
          <span className="w-fit rounded-full border border-brand-orange/20 bg-brand-orange/10 px-3 py-1.5 text-xs font-semibold text-brand-orange">
            Insufficient data
          </span>
        </div>
        <div className="mt-5 rounded-md border border-brand-orange/20 bg-brand-orange/10 p-3">
          <p className="text-xs font-semibold uppercase text-brand-orange">Forecast notes</p>
          <p className="mt-2 text-sm leading-5 text-ink-secondary">{missingData[0] ?? 'No authorized accounts are available in the forecast scope.'}</p>
        </div>
      </section>
    )
  }

  return (
    <section className="tk-card overflow-hidden p-4">
      <div className="flex flex-col gap-3 border-b border-surface-border pb-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-brand-blue" />
            <h2 className="text-base font-semibold text-ink">{widget.title}</h2>
          </div>
          <p className="mt-1 text-xs font-medium text-ink-secondary">{scopeLabel}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {metrics.map(([key, item]) => <ForecastMetric key={String(key)} label={String(key)} value={formatValue(item, String(key))} />)}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          {accountOptions.length ? (
            <select className="tk-input w-full sm:w-[240px]" value={accountId} onChange={event => onAccountChange(event.target.value)} aria-label="Filter forecast by account">
              <option value="">All accounts</option>
              {accountOptions.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          ) : null}
          {masked ? <span className="w-fit rounded-full border border-surface-border bg-white px-2.5 py-1.5 text-xs font-semibold text-ink-secondary">Masked</span> : null}
        </div>
      </div>

      {sharedForecast ? (
        <div className="mt-4">
          {masked ? (
            <div className="grid gap-2 sm:grid-cols-3">
              {points.map(point => (
                <div key={String(point.month)} className="rounded-md border border-surface-border bg-surface-secondary p-3">
                  <p className="text-xs font-semibold text-ink">{String(point.month)}</p>
                  <p className="mt-1 text-xs text-ink-secondary">Restricted</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-hidden">
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-[170px] w-full min-w-0" role="img" aria-label="Dashboard six-month forecast chart">
                {[0, 1, 2].map(index => {
                  const y = top + (plotHeight / 2) * index
                  return <line key={index} x1={left} x2={chartWidth - right} y1={y} y2={y} className="stroke-surface-border" />
                })}
                {points.map((point, index) => {
                  const x = xFor(index)
                  const y = yFor(numericValue(point.forecast_revenue))
                  return (
                    <g key={String(point.month)}>
                      <rect x={x - 10} y={y} width="20" height={top + plotHeight - y} rx="4" className="fill-blue-tint-40" />
                      <text x={x} y={chartHeight - 10} textAnchor="middle" className="fill-ink-secondary text-[10px] font-semibold">{String(point.month).split(' ')[0]}</text>
                    </g>
                  )
                })}
                <polyline points={forecastLine} fill="none" className="stroke-brand-blue" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          )}
          {typeof value.summary === 'string' ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-ink-secondary">{value.summary}</p> : null}
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {series.map(item => (
            <div key={String(item.label)} className="grid gap-2 sm:grid-cols-[150px_1fr_120px] sm:items-center">
              <span className="text-sm font-medium text-ink">{String(item.label)}</span>
              <div className="h-3 overflow-hidden rounded-full bg-surface-tertiary">
                <div className="h-full rounded-full bg-brand-blue" style={{ width: `${Math.max(6, ((Number(item.value) || 0) / maxSeries) * 100)}%` }} />
              </div>
              <span className="text-sm font-semibold text-ink-secondary">{formatValue(item.display_value ?? item.value, 'pipeline_value')}</span>
            </div>
          ))}
          {!series.length ? (
            <p className="rounded-md bg-surface-secondary p-4 text-sm text-ink-secondary">No forecast data is available for this scope.</p>
          ) : null}
        </div>
      )}

      {sharedForecast && missingData.length ? (
        <div className="mt-3 rounded-md border border-brand-orange/20 bg-brand-orange/10 p-3">
          <p className="text-xs font-semibold uppercase text-brand-orange">Forecast notes</p>
          <div className="mt-2 grid gap-1 text-xs leading-5 text-ink-secondary">
            {missingData.slice(0, 2).map(item => (
              <p key={item}>{item}</p>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function ForecastMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-surface-secondary px-3 py-2">
      <p className="truncate text-[10px] font-semibold uppercase text-ink-secondary" title={label}>{labelize(label)}</p>
      <p className="mt-1 truncate text-base font-bold leading-none text-ink" title={value}>{value}</p>
    </div>
  )
}

function PortfolioTable({ widget, onPageChange }: { widget: DashboardWidget; onPageChange: (page: number) => void }) {
  const page = Math.max(1, Number(widget.metadata.page) || 1)
  const pageSize = Math.max(1, Number(widget.metadata.page_size) || widget.items.length || 1)
  const total = Math.max(widget.items.length, Number(widget.metadata.total) || widget.items.length)
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const firstItem = total ? (page - 1) * pageSize + 1 : 0
  const lastItem = Math.min(total, firstItem + widget.items.length - 1)

  return (
    <section className="tk-card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-surface-border p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">{widget.title}</h2>
          <p className="mt-1 text-xs font-medium text-ink-secondary">
            {total ? `Showing ${firstItem}-${lastItem} of ${total}` : 'No accounts in this view'}
          </p>
        </div>
        {pages > 1 ? (
          <div className="flex items-center gap-2">
            <button className="tk-icon-button" type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Previous portfolio page">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[96px] text-center text-sm font-semibold text-ink-secondary">Page {page} of {pages}</span>
            <button className="tk-icon-button" type="button" onClick={() => onPageChange(page + 1)} disabled={page >= pages} aria-label="Next portfolio page">
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-surface-border text-xs font-semibold uppercase tracking-wider text-ink-secondary">
            <tr>
              <th className="px-5 py-4">Account</th>
              <th className="px-5 py-4">Status</th>
              <th className="px-5 py-4">Health</th>
              <th className="px-5 py-4">Segment</th>
              <th className="px-5 py-4">Owner</th>
              <th className="px-5 py-4">Next Gov.</th>
              {widget.items.some(item => 'commercial_value' in item) ? <th className="px-5 py-4">Value</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {widget.items.map(item => {
              const route = getString(item.route)
              return (
                <tr key={String(item.id ?? item.account_id)}>
                  <td className="px-5 py-4">
                    {route ? <Link to={route} className="inline-flex min-h-[44px] min-w-[44px] items-center font-semibold text-ink hover:text-brand-blue">{itemName(item)}</Link> : <span className="font-semibold text-ink">{itemName(item)}</span>}
                  </td>
                  <td className="px-5 py-4"><StatusPill status={getString(item.risk_status)} /></td>
                  <td className="px-5 py-4 font-semibold text-ink">{formatValue(item.health_score ?? item.health)}</td>
                  <td className="px-5 py-4 text-ink-secondary">{formatValue(item.segment)}</td>
                  <td className="px-5 py-4 text-ink-secondary">{formatValue(item.owner)}</td>
                  <td className="px-5 py-4 text-ink-secondary">{formatDateTime(getString(item.next_governance_at))}</td>
                  {'commercial_value' in item ? <td className="px-5 py-4 font-semibold text-ink">{formatValue(item.commercial_value, 'commercial_value')}</td> : null}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function WidgetListPanel({ widget }: { widget: DashboardWidget }) {
  const value = isRecord(widget.value) ? widget.value : {}
  return (
    <section className="tk-card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-surface-border p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-ink">{widget.title}</h2>
          {widget.metadata.masked ? <p className="mt-1 text-xs font-medium text-ink-secondary">Sensitive values are masked.</p> : null}
        </div>
        {widget.primary_route ? <Link className="tk-button-secondary w-fit px-3 text-xs" to={widget.primary_route}>Open <ExternalLink className="h-4 w-4" /></Link> : null}
      </div>
      {widget.error ? <div className="m-4 rounded-md border border-rag-red/20 bg-rag-red/10 p-3 text-sm text-rag-red">{widget.error}</div> : null}
      {Object.keys(value).length ? (
        <div className="grid gap-2 border-b border-surface-border bg-surface-secondary p-4 sm:grid-cols-3">
          {Object.entries(value).filter(([, item]) => !Array.isArray(item)).slice(0, 3).map(([key, item]) => <MiniMetric key={key} label={key} value={formatValue(item, key)} />)}
        </div>
      ) : null}
      <div className="divide-y divide-surface-border">
        {widget.items.slice(0, 6).map(item => <RowLink key={`${String(item.source_type ?? 'item')}-${String(item.id ?? item.title ?? item.name)}`} item={item} />)}
        {!widget.items.length ? <p className="p-5 text-sm text-ink-secondary">No items in this view.</p> : null}
      </div>
    </section>
  )
}

function RowLink({ item, valueKey, dateKey }: { item: Record<string, unknown>; valueKey?: string; dateKey?: string }) {
  const route = getString(item.route)
  const title = itemName(item)
  const account = getString(item.account_name ?? item.account)
  const riskReason = getString(item.risk_reason)
  const status = getString(item.severity ?? item.priority ?? item.risk_status ?? item.status)
  const value = valueKey ? item[valueKey] : item.value ?? item.accounts ?? item.delivery_health ?? item.affected_metric
  const date = dateKey ? getString(item[dateKey]) : getString(item.due_at ?? item.sla_due_at ?? item.scheduled_at ?? item.target_date ?? item.renewal_date ?? item.created_at)

  const content = (
    <>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink">{title}</span>
        <span className="mt-1 block truncate text-xs text-ink-secondary">{riskReason || account || formatValue(item.owner)}</span>
      </span>
      <span className="hidden text-sm font-semibold text-ink sm:block">{formatValue(value, valueKey)}</span>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-blue">{date ? shortDate(date) : status}</span>
    </>
  )

  return route ? (
    <Link to={route} className="grid min-h-[64px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 hover:bg-surface-secondary sm:grid-cols-[minmax(0,1fr)_auto_auto]">
      {content}
    </Link>
  ) : (
    <div className="grid min-h-[64px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
      {content}
    </div>
  )
}

function GovernanceCalendarPanel({
  token,
  userId,
  dashboardReadOnly,
  calendarWidget,
  accountOptions,
}: {
  token: string
  userId?: string
  dashboardReadOnly: boolean
  calendarWidget?: DashboardWidget
  accountOptions: AccountOption[]
}) {
  const [monthAnchor, setMonthAnchor] = useState(startOfMonth(new Date()))
  const [selectedDay, setSelectedDay] = useState<Date | null>(new Date())
  const [selectedItem, setSelectedItem] = useState<GovernanceCalendarItemRecord | null>(null)
  const [accountFilter, setAccountFilter] = useState('')
  const [mineOnly, setMineOnly] = useState(false)
  const [items, setItems] = useState<GovernanceCalendarItemRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    listGovernanceCalendarItems(token, {
      accountId: accountFilter || undefined,
      ownerId: mineOnly && userId ? userId : undefined,
      dateFrom: startOfMonth(monthAnchor).toISOString(),
      dateTo: endOfMonth(monthAnchor).toISOString(),
      page: 1,
      pageSize: 100,
    })
      .then(result => {
        if (active) setItems(result.items)
      })
      .catch(err => {
        if (active) setError(err instanceof Error ? err.message : 'Calendar could not be loaded')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [accountFilter, mineOnly, monthAnchor, token, userId])

  const selectedCalendarDate = new Date()
  const days = eachDayOfInterval({ start: startOfMonth(monthAnchor), end: endOfMonth(monthAnchor) })
  const leadingDays = Array.from({ length: getDay(startOfMonth(monthAnchor)) })
  const selectedDayItems = selectedDay ? items.filter(item => isSameDay(new Date(item.date), selectedDay)) : []
  const upcoming = items
    .filter(item => differenceInCalendarDays(new Date(item.date), selectedCalendarDate) >= 0 && differenceInCalendarDays(new Date(item.date), selectedCalendarDate) <= 30)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 7)
  const readOnly = dashboardReadOnly || Boolean(calendarWidget?.metadata.read_only)

  return (
    <section className="tk-card overflow-hidden p-5">
      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="min-w-0">
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <CalendarDays className="h-5 w-5 text-brand-blue" />
              <div>
                <h2 className="text-lg font-semibold text-ink">{calendarWidget?.title ?? 'Global / Governance Calendar'}</h2>
                {readOnly ? <p className="mt-1 text-xs font-medium text-ink-secondary">Read-only source links</p> : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="h-4 w-4 text-ink-secondary" />
              <select className="tk-input w-[220px]" value={accountFilter} onChange={event => setAccountFilter(event.target.value)}>
                <option value="">All Accounts</option>
                {accountOptions.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
              <button
                type="button"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-surface-border bg-white px-3 text-sm font-semibold text-ink transition-colors hover:bg-surface-tertiary"
                onClick={() => setMineOnly(value => !value)}
                aria-pressed={mineOnly}
              >
                <span className={cn('flex h-5 w-5 items-center justify-center rounded-sm border', mineOnly ? 'border-brand-blue bg-brand-blue text-white' : 'border-surface-border bg-white')}>
                  {mineOnly ? <Check className="h-3 w-3" /> : null}
                </span>
                My accounts only
              </button>
              <button className="tk-icon-button" type="button" onClick={() => setMonthAnchor(value => subMonths(value, 1))} aria-label="Previous month"><ArrowLeft className="h-4 w-4" /></button>
              <p className="min-w-[120px] text-center text-lg font-semibold text-ink">{format(monthAnchor, 'MMM yyyy')}</p>
              <button className="tk-icon-button" type="button" onClick={() => setMonthAnchor(value => addMonths(value, 1))} aria-label="Next month"><ArrowRight className="h-4 w-4" /></button>
            </div>
          </div>

          {error ? <div className="mb-4 rounded-md border border-rag-red/20 bg-rag-red/10 p-3 text-sm text-rag-red">{error}</div> : null}
          <div className="grid grid-cols-7 border-b border-surface-border text-center text-xs font-semibold text-ink-secondary">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <div key={day} className="py-3">{day}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {leadingDays.map((_, index) => <div key={`empty-${index}`} className="min-h-[96px]" />)}
            {days.map(day => {
              const dayItems = items.filter(item => isSameDay(new Date(item.date), day)).slice(0, 4)
              const selected = isSameDay(day, selectedDay ?? selectedCalendarDate)
              return (
                <div key={day.toISOString()} className={cn('min-h-[96px] rounded-lg p-2 text-center', selected ? 'border border-surface-border-strong bg-surface-tertiary' : '')}>
                  <button
                    type="button"
                    className={cn('mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold hover:bg-blue-tint-20', selected ? 'bg-blue-tint-20 text-brand-blue-dark' : 'text-ink')}
                    onClick={() => setSelectedDay(day)}
                    aria-label={`Show calendar items for ${format(day, 'MMMM d, yyyy')}`}
                  >
                    {format(day, 'd')}
                  </button>
                  <div className="mt-2 space-y-1">
                    {dayItems.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        className="flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left text-[11px] font-semibold text-ink-secondary hover:bg-white"
                        onClick={() => {
                          setSelectedDay(day)
                          setSelectedItem(item)
                        }}
                        title={item.title}
                      >
                        <span className={cn('h-2 w-2 shrink-0 rounded-full', calendarDotClass(item))} />
                        <span className="truncate">{item.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-surface-border pt-4 text-xs font-medium text-ink-secondary">
            {loading ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading calendar</span> : null}
            {['Governance', 'Overdue', 'Review'].map(label => (
              <span key={label} className="inline-flex items-center gap-2">
                <span className={cn('h-3 w-3 rounded-full', label === 'Overdue' ? 'bg-rag-red' : label === 'Review' ? 'bg-brand-orange' : 'bg-brand-blue')} />
                {label}
              </span>
            ))}
          </div>
        </div>

        <aside className="border-t border-surface-border pt-5 2xl:border-l 2xl:border-t-0 2xl:pl-5 2xl:pt-0">
          <div className="rounded-lg border border-surface-border bg-surface-secondary p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-secondary">
              {selectedDay ? format(selectedDay, 'MMM d, yyyy') : 'Selected date'}
            </h3>
            <div className="mt-3 space-y-2">
              {selectedDayItems.length ? selectedDayItems.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className="grid w-full grid-cols-[12px_minmax(0,1fr)_auto] items-center gap-2 rounded-md bg-white p-3 text-left hover:bg-blue-tint-20"
                  onClick={() => setSelectedItem(item)}
                >
                  <span className={cn('h-2.5 w-2.5 rounded-full', calendarDotClass(item))} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{item.title}</span>
                    <span className="mt-1 block truncate text-xs text-ink-secondary">{item.accountName}</span>
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-blue">{item.kind}</span>
                </button>
              )) : <p className="rounded-md bg-white p-3 text-sm text-ink-secondary">No calendar items on this date.</p>}
            </div>
          </div>

          {selectedItem ? (
            <div className="mt-4 rounded-lg border border-surface-border bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">{selectedItem.kind}</p>
                  <h3 className="mt-1 text-base font-semibold text-ink">{selectedItem.title}</h3>
                  <p className="mt-1 text-xs font-medium text-ink-secondary">{selectedItem.accountName} | {formatDateTime(selectedItem.date)}</p>
                </div>
                <span className={cn('mt-1 h-3 w-3 shrink-0 rounded-full', calendarDotClass(selectedItem))} />
              </div>
              <p className="mt-3 text-sm leading-6 text-ink-secondary">{selectedItem.detail}</p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-ink-tertiary">Status: {selectedItem.status}</p>
              <Link to={selectedItem.route} className="tk-button-primary mt-4 w-full">
                Open source view
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : null}

          <h3 className="mt-5 text-sm font-semibold uppercase tracking-wider text-ink-secondary">Upcoming (30 days)</h3>
          <div className="mt-5 space-y-3">
            {upcoming.map(item => (
              <button key={item.id} type="button" className="grid w-full grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg p-2 text-left hover:bg-surface-tertiary" onClick={() => setSelectedItem(item)}>
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-tint-20 text-brand-blue-dark">
                  <CalendarCheck2 className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{item.title}</p>
                  <p className="mt-1 truncate text-xs text-ink-secondary">{item.accountName}</p>
                </div>
                <span className="rounded-full border border-surface-border bg-white px-2 py-1 text-[11px] font-semibold text-brand-blue-dark">{shortDate(item.date)}</span>
              </button>
            ))}
            {!upcoming.length && calendarWidget?.items.length ? calendarWidget.items.slice(0, 4).map(item => <RowLink key={String(item.id)} item={item} />) : null}
            {!upcoming.length && !calendarWidget?.items.length ? <p className="rounded-md bg-surface-tertiary p-3 text-sm text-ink-secondary">No upcoming calendar items in the next 30 days.</p> : null}
          </div>
        </aside>
      </div>
    </section>
  )
}

function DashboardLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full" />
      <div className="grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-40 w-full" />)}
      </div>
      <Skeleton className="h-[360px] w-full" />
    </div>
  )
}

function EmptyDashboard() {
  return (
    <section className="tk-card grid justify-items-center gap-3 p-8 text-center">
      <ShieldAlert className="h-9 w-9 text-brand-blue" />
      <p className="text-sm font-medium text-ink-secondary">No dashboard widgets are available for your role or account scope.</p>
    </section>
  )
}

function StatusPill({ status }: { status: string }) {
  const normalized = status.toLowerCase()
  const tone = normalized === 'healthy' || normalized === 'green' ? 'green' : normalized === 'critical' || normalized === 'red' ? 'red' : 'amber'
  const className = tone === 'green' ? 'bg-rag-green/10 text-rag-green' : tone === 'red' ? 'bg-rag-red/10 text-rag-red' : 'bg-brand-orange/10 text-brand-orange'
  return (
    <span className={cn('inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold capitalize', className)}>
      <span className={cn('h-2.5 w-2.5 rounded-full', tone === 'green' ? 'bg-rag-green' : tone === 'red' ? 'bg-rag-red' : 'bg-brand-orange')} />
      {status || '-'}
    </span>
  )
}

function metricIcon(key: string): LucideIcon {
  if (key.includes('account')) return Building2
  if (key.includes('risk') || key.includes('critical')) return AlertCircle
  if (key.includes('signal')) return AlertTriangle
  if (key.includes('governance')) return CalendarCheck2
  if (key.includes('task')) return Users
  return BarChart3
}

function metricTone(key: string, index: number) {
  if (key.includes('risk') || key.includes('critical')) return 'text-rag-red bg-rag-red/10'
  if (key.includes('signal') || key.includes('task')) return 'text-brand-orange bg-brand-orange/10'
  if (key.includes('governance')) return 'text-brand-blue bg-blue-tint-20'
  return index % 2 === 0 ? 'text-brand-blue bg-blue-tint-20' : 'text-rag-green bg-rag-green/10'
}

function staggerClass(index: number) {
  if (index === 0) return 'animate-stagger-1'
  if (index === 1) return 'animate-stagger-2'
  if (index === 2) return 'animate-stagger-3'
  return 'animate-stagger-4'
}

function metricFormatter(key: string) {
  return key.includes('value') || key.includes('revenue') || key.includes('pipeline') ? formatCompactCurrency : undefined
}

function dashboardMetricRoute(key: string) {
  const normalized = key.toLowerCase().replace(/\s+/g, '_')
  if (['my_accounts', 'accounts', 'authorized_accounts', 'account_portfolio'].includes(normalized)) return '/accounts'
  if (normalized === 'at_risk' || normalized.includes('at_risk') || normalized.includes('critical_accounts')) return '/accounts?risk=at_risk'
  if (normalized.includes('governance')) return '/governance'
  if (normalized.includes('critical_task')) return '/tasks?priority=critical'
  if (normalized.includes('task')) return '/tasks'
  if (normalized.includes('signal')) return '/tasks'
  if (normalized.includes('opportunit') || normalized.includes('pipeline') || normalized.includes('forecast')) return '/opportunities?openOnly=true'
  if (normalized.includes('revenue')) return '/accounts?risk=at_risk'
  return ''
}

function metricDetail(key: string, value: unknown) {
  if (key.includes('risk')) return 'Accounts that need active attention.'
  if (key.includes('critical_tasks')) return 'Critical and blocked tasks only.'
  if (key.includes('signal')) return 'Source-backed attention items.'
  if (key.includes('governance')) return 'Scheduled governance coverage.'
  if (key.includes('task')) return 'Open operational work in scope.'
  return `${formatValue(value)} in this dashboard scope.`
}

function collectAccountOptions(widgets: DashboardWidget[]): AccountOption[] {
  const accounts = new Map<string, string>()
  widgets.forEach(widget => {
    if (Array.isArray(widget.metadata.account_options)) {
      widget.metadata.account_options.filter(isRecord).forEach(item => {
        const id = getString(item.id)
        const name = getString(item.name)
        if (id && name) accounts.set(id, name)
      })
    }
    widget.items.forEach(item => {
      const id = getString(item.account_id)
      const name = getString(item.account_name ?? item.account ?? item.name)
      if (id && name) accounts.set(id, name)
    })
  })
  return [...accounts.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
}

function collectOwnerOptions(widgets: DashboardWidget[]): OwnerOption[] {
  const owners = new Map<string, string>()
  widgets.forEach(widget => {
    widget.items.forEach(item => {
      const id = getString(item.owner_id)
      const name = getString(item.owner)
      if (id && name) owners.set(id, name)
    })
  })
  return [...owners.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
}

function calendarDotClass(item: GovernanceCalendarItemRecord) {
  if (new Date(item.date) < new Date() && item.status !== 'completed') return 'bg-rag-red'
  if (item.status === 'review_required' || item.status === 'draft') return 'bg-brand-orange'
  return 'bg-brand-blue'
}

function itemName(item: Record<string, unknown>) {
  return getString(item.title ?? item.name ?? item.account_name ?? item.account ?? item.owner ?? item.summary) || '-'
}

function isWidget(value: DashboardWidget | undefined): value is DashboardWidget {
  return Boolean(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function labelize(value: string) {
  return value.replace(/_/g, ' ')
}

function shortDate(value: string) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : format(date, 'MMM d')
}

function formatDateTime(value: string) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : format(date, 'MMM d, yyyy')
}

function formatValue(value: unknown, key = ''): string {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'number') {
    if (key.includes('value') || key.includes('revenue') || key.includes('pipeline') || key.includes('forecast')) return formatCompactCurrency(value)
    return Number.isInteger(value) ? String(value) : value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return `${value.length} items`
  if (isRecord(value)) return JSON.stringify(value)
  return String(value)
}

function numericValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
