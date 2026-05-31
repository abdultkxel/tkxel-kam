import {
  addMonths,
  addDays,
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
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  Building2,
  CalendarCheck2,
  CalendarDays,
  Filter,
  LineChart,
  Minus,
  Sparkles,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CreateAccountDialog } from '@/components/account/CreateAccountDialog'
import { V4IntelligenceLayer } from '@/components/dashboard/V4IntelligenceLayer'
import { AddGovernanceEventDialog } from '@/components/governance/AddGovernanceEventDialog'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { Skeleton } from '@/components/ui/Skeleton'
import { useRole } from '@/hooks/useRole'
import { useAccountStore } from '@/stores/accountStore'
import { useGovernanceStore } from '@/stores/governanceStore'
import { useOpportunityStore } from '@/stores/opportunityStore'
import { useScoreActivityStore } from '@/stores/scoreActivityStore'
import { useV3Store } from '@/stores/v3Store'
import { Account, RiskStatus } from '@/types/account'
import { GovernanceEventRecord } from '@/types/governance'
import { Opportunity, Stage } from '@/types/opportunity'
import { ScoreActivityTask } from '@/types/scoreActivity'
import { EngagementRecord, SignalRecord } from '@/types/v3'
import { cn } from '@/utils/cn'
import { formatCompactCurrency } from '@/utils/formatters'

type TaskAISummary = {
  headline: string
  narrative: string
  bullets: string[]
  todayFocus: string[]
  openCount: number
  urgentCount: number
  dueSoonCount: number
  todayCount: number
  sourceCount: number
}
type CriticalOverdueRow = {
  label: string
  count: number
  critical: number
  overdue: number
}

const pipelineStages: Stage[] = ['Identified', 'Qualified', 'Proposal Sent', 'Negotiation']
export function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [calendarAccount, setCalendarAccount] = useState('')
  const user = useRole()
  const accounts = useAccountStore(state => state.accounts)
  const governanceEvents = useGovernanceStore(state => state.events)
  const opportunities = useOpportunityStore(state => state.opportunities)
  const tasks = useScoreActivityStore(state => state.tasks)
  const signals = useV3Store(state => state.signals)
  const engagements = useV3Store(state => state.engagements)

  const portfolioRevenue = accounts.reduce((sum, account) => sum + account.arr, 0)
  const atRiskAccounts = accounts.filter(account => account.riskStatus !== 'healthy')
  const atRiskArr = atRiskAccounts.reduce((sum, account) => sum + account.arr, 0)
  const lowestHealth = accounts.length ? Math.min(...accounts.map(account => account.health.overall)) : 0
  const nextGovernance = [...governanceEvents].filter(event => new Date(event.date) >= new Date()).sort(sortByDate)[0]
  const daysToNextGovernance = nextGovernance ? Math.max(0, differenceInCalendarDays(new Date(nextGovernance.date), new Date())) : 0
  const roleLabel = user.role === 'am' || user.role === 'account_manager' ? 'Account Manager' : user.role === 'super_admin' ? 'Super Admin' : user.role === 'admin' ? 'Admin' : 'KAM Head'

  const taskAISummary = useMemo(() => buildTaskAISummary(tasks, signals), [signals, tasks])
  const criticalOverdueRows = useMemo(() => buildCriticalOverdueRows(tasks, signals), [signals, tasks])
  const openPipeline = opportunities.filter(opportunity => opportunity.stage !== 'Won' && opportunity.stage !== 'Lost')
  const openPipelineValue = openPipeline.reduce((sum, opportunity) => sum + opportunity.estimatedValue, 0)
  const pipelineStageValues = pipelineStages.map(stage => ({
    stage,
    value: openPipeline.filter(opportunity => opportunity.stage === stage).reduce((sum, opportunity) => sum + opportunity.estimatedValue, 0),
  }))
  const maxStageValue = Math.max(1, ...pipelineStageValues.map(item => item.value))
  const portfolioRows = accounts.map(account => buildPortfolioRow(account, governanceEvents, engagements))
  const growthRows = accounts.filter(isGrowthAccount)
  const retentionRows = accounts.filter(account => !isGrowthAccount(account))
  const calendarItems = useMemo(
    () => buildCalendarItems(governanceEvents, tasks, opportunities, signals, calendarAccount),
    [calendarAccount, governanceEvents, opportunities, signals, tasks],
  )

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 450)
    return () => window.clearTimeout(timer)
  }, [])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <div className="grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
        <Skeleton className="h-[520px] w-full" />
      </div>
    )
  }

  return (
    <div>
      <header className="v4-glass mb-5 flex flex-col gap-4 rounded-2xl p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Tkxel KAM V4</p>
          <h1 className="mt-1 font-display text-4xl font-bold leading-tight text-ink">My Dashboard</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-base text-ink-secondary">
            <span>Welcome back, {user.name}</span>
            <span className="rounded-full bg-surface-tertiary px-3 py-1 text-xs font-semibold text-brand-blue-dark">{roleLabel}</span>
          </div>
        </div>
        <CreateAccountDialog />
      </header>

      <div className="flex flex-col">
        <div className="order-2 mt-6 lg:order-1 lg:mt-0">
          <V4IntelligenceLayer accounts={accounts} opportunities={opportunities} tasks={tasks} signals={signals} />
        </div>

        <div className="order-1 mt-5 grid auto-rows-fr gap-4 md:grid-cols-2 lg:order-2 lg:mt-6 xl:grid-cols-4">
          <DashboardMetric
            label="My accounts"
            value={accounts.length}
            detail={`${formatCompactCurrency(portfolioRevenue)} portfolio revenue`}
            icon={Building2}
            tone="blue"
            delayClass="animate-stagger-1"
            to="/accounts"
            actionLabel="Open my accounts"
          />
          <DashboardMetric
            label="At risk"
            value={atRiskArr}
            format={formatCompactCurrency}
            detail={atRiskAccounts[0]?.name ?? 'No accounts at risk'}
            icon={AlertCircle}
            tone="red"
            delayClass="animate-stagger-2"
            to="/accounts?risk=at_risk"
            actionLabel="Open at-risk accounts"
          />
          <DashboardMetric
            label="Needs attention"
            value={atRiskAccounts.length}
            detail={`Lowest health: ${((lowestHealth / 100) * 3).toFixed(1)}/3.0`}
            icon={AlertTriangle}
            tone="orange"
            delayClass="animate-stagger-3"
            to="/tasks"
            actionLabel="Open attention tasks"
          />
          <DashboardMetric
            label="Next governance"
            value={daysToNextGovernance}
            suffix="d"
            detail={nextGovernance ? `${nextGovernance.type} with ${nextGovernance.accountName}` : 'No upcoming governance'}
            icon={CalendarCheck2}
            tone="lightBlue"
            delayClass="animate-stagger-4"
            to="/governance"
            actionLabel="Open governance"
          />
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <TaskAISummaryPanel summary={taskAISummary} />
        <CriticalOverdueTasksChart rows={criticalOverdueRows} />
      </div>

      <div className="mt-6">
        <PipelinePanel
          opportunities={openPipeline}
          totalValue={openPipelineValue}
          stageValues={pipelineStageValues}
          maxStageValue={maxStageValue}
        />
      </div>

      <div className="mt-6 grid gap-4 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <AccountPortfolio rows={portfolioRows} />
        <GrowthRetentionPanel accounts={accounts} growthRows={growthRows} retentionRows={retentionRows} />
      </div>

      <GlobalMeetingsCalendar
        accounts={accounts}
        items={calendarItems}
        accountFilter={calendarAccount}
        onAccountFilterChange={setCalendarAccount}
      />
    </div>
  )
}

function TaskAISummaryPanel({ summary }: { summary: TaskAISummary }) {
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
          <p className="mt-4 text-xl font-semibold leading-7 text-ink">{summary.headline}</p>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-secondary">{summary.narrative}</p>
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-2 rounded-lg border border-surface-border bg-surface-secondary p-2 sm:grid-cols-4 2xl:grid-cols-2">
          <TaskSummaryMetric label="Open" value={summary.openCount} />
          <TaskSummaryMetric label="Urgent" value={summary.urgentCount} tone="critical" />
          <TaskSummaryMetric label="Today" value={summary.todayCount} />
          <TaskSummaryMetric label="Due soon" value={summary.dueSoonCount} tone="warning" />
        </div>
      </div>
      <div className="grid border-t border-surface-border xl:grid-cols-[minmax(0,0.92fr)_minmax(320px,0.58fr)]">
        <div className="grid gap-0 border-b border-surface-border md:grid-cols-3 xl:border-b-0 xl:border-r xl:border-surface-border xl:divide-x xl:divide-surface-border">
          {summary.bullets.map(item => (
            <div key={item} className="border-b border-surface-border p-4 last:border-b-0 md:border-b-0">
              <p className="text-sm leading-6 text-ink-secondary">{item}</p>
            </div>
          ))}
        </div>
        <div className="bg-surface-secondary p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Today&apos;s focus</p>
          <div className="mt-3 space-y-2">
            {summary.todayFocus.map(item => (
              <p key={item} className="rounded-md border border-surface-border bg-white px-3 py-2 text-sm leading-5 text-ink-secondary">{item}</p>
            ))}
          </div>
        </div>
      </div>
      <div className="border-t border-surface-border bg-surface-secondary px-5 py-3">
        <p className="text-xs font-medium text-ink-secondary">Generated from {summary.sourceCount} task and signal records. Review owners before using in client communication.</p>
      </div>
    </section>
  )
}

function TaskSummaryMetric({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'warning' | 'critical' }) {
  const valueClass = tone === 'critical' ? 'text-rag-red' : tone === 'warning' ? 'text-brand-orange' : 'text-ink'
  return (
    <div className="min-w-0 rounded-md bg-white p-3">
      <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-ink-secondary" title={label}>{label}</p>
      <p className={cn('mt-1 font-display text-2xl font-bold leading-none', valueClass)}>{value}</p>
    </div>
  )
}

function CriticalOverdueTasksChart({ rows }: { rows: CriticalOverdueRow[] }) {
  const max = Math.max(1, ...rows.map(row => row.critical + row.overdue))

  return (
    <section className="tk-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-brand-orange" />
            <h2 className="text-lg font-semibold text-ink">Critical overdue tasks</h2>
          </div>
          <p className="mt-1 text-sm text-ink-secondary">Grouped by task source and attention type.</p>
        </div>
        <Link to="/tasks" className="tk-button-secondary min-h-[44px] px-3 py-2 text-xs">
          Open tasks
        </Link>
      </div>

      {rows.length ? (
        <div className="mt-5 space-y-4">
          {rows.map(row => {
            const segmentTotal = Math.max(1, row.critical + row.overdue)
            const width = Math.max(10, (segmentTotal / max) * 100)
            return (
              <div key={row.label} className="grid gap-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold text-ink">{row.label}</span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">{row.count} items</span>
                </div>
                <div className="h-8 overflow-hidden rounded-md bg-surface-tertiary">
                  <div className="flex h-full rounded-md" style={{ width: `${width}%` }}>
                    {row.critical ? <span className="h-full bg-rag-red" style={{ width: `${(row.critical / segmentTotal) * 100}%` }} /> : null}
                    {row.overdue ? <span className="h-full bg-brand-orange" style={{ width: `${(row.overdue / segmentTotal) * 100}%` }} /> : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-ink-secondary">
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rag-red" />{row.critical} critical</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-brand-orange" />{row.overdue} overdue</span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="mt-5 rounded-lg border border-surface-border bg-surface-secondary p-6 text-center">
          <p className="text-sm font-semibold text-ink">No critical overdue work</p>
          <p className="mt-1 text-sm text-ink-secondary">The dashboard will show grouped bars when urgent task pressure appears.</p>
        </div>
      )}
    </section>
  )
}

function DashboardMetric({
  label,
  value,
  format,
  suffix,
  detail,
  icon: Icon,
  tone,
  delayClass,
  to,
  actionLabel,
}: {
  label: string
  value: number
  format?: (value: number) => string
  suffix?: string
  detail: string
  icon: typeof Building2
  tone: 'blue' | 'red' | 'orange' | 'lightBlue'
  delayClass: string
  to?: string
  actionLabel?: string
}) {
  const iconClass = {
    blue: 'text-brand-blue bg-blue-tint-20',
    red: 'text-rag-red bg-rag-red/10',
    orange: 'text-brand-orange bg-brand-orange/10',
    lightBlue: 'text-brand-blue bg-blue-tint-20',
  }[tone]

  const numberContent = (
    <>
      <AnimatedNumber value={value} format={format} className="block font-display text-4xl font-bold leading-none text-current" />
      {suffix ? <span className="font-display text-4xl font-bold leading-none text-current">{suffix}</span> : null}
    </>
  )

  return (
    <article className={cn('tk-card flex min-h-[164px] flex-col justify-between p-5 animate-fade-in', delayClass)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">{label}</p>
          {to ? (
            <Link
              to={to}
              className="mt-3 inline-flex min-h-[44px] min-w-[44px] items-center rounded-md text-ink transition-colors hover:text-brand-blue focus-visible:ring-2 focus-visible:ring-brand-blue/30"
              aria-label={actionLabel ?? `Open ${label}`}
            >
              <span className="flex items-baseline gap-1">{numberContent}</span>
            </Link>
          ) : (
            <div className="mt-3 flex items-baseline gap-1 text-ink">{numberContent}</div>
          )}
        </div>
        <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-lg', iconClass)}>
          <Icon className="h-6 w-6" />
        </span>
      </div>
      <p className="mt-4 line-clamp-2 text-sm leading-5 text-ink-secondary">{detail}</p>
    </article>
  )
}

function PipelinePanel({
  className,
  opportunities,
  totalValue,
  stageValues,
  maxStageValue,
}: {
  className?: string
  opportunities: Opportunity[]
  totalValue: number
  stageValues: { stage: Stage; value: number }[]
  maxStageValue: number
}) {
  return (
    <section className={cn('tk-card overflow-hidden p-5', className)}>
      <div className="flex flex-col gap-4 border-b border-surface-border pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <LineChart className="h-5 w-5 text-brand-blue" />
            <h2 className="text-lg font-semibold text-ink">My Pipeline</h2>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-2">
            <p className="font-display text-5xl font-bold leading-none text-ink">{formatCompactCurrency(totalValue)}</p>
            <p className="pb-1 text-sm text-ink-secondary">{opportunities.length} open opportunities</p>
          </div>
        </div>
        <Link to="/opportunities" className="tk-button-secondary w-fit">
          View all <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Pipeline by stage</p>
          <div className="mt-4 space-y-3">
            {stageValues.map(item => (
              <div key={item.stage} className="grid grid-cols-[120px_minmax(0,1fr)_76px] items-center gap-3 text-sm">
                <span className="truncate text-ink-secondary">{item.stage}</span>
                <span className="h-8 overflow-hidden rounded-md bg-surface-tertiary">
                  <span className="block h-full rounded-md bg-brand-blue-dark" style={{ width: `${Math.max(8, (item.value / maxStageValue) * 100)}%` }} />
                </span>
                <span className="text-right font-semibold text-ink">{formatCompactCurrency(item.value)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-surface-border bg-surface-secondary p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Next closes</p>
          <div className="mt-2 divide-y divide-surface-border">
            {opportunities.slice(0, 4).map(opportunity => (
              <div key={opportunity.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 py-3">
                <p className="truncate text-sm font-semibold text-ink">{opportunity.accountName} <span className="font-normal text-ink-secondary">| {opportunity.name}</span></p>
                <span className="text-sm font-semibold text-ink">{formatCompactCurrency(opportunity.estimatedValue)}</span>
                <span className="rounded-full border border-surface-border bg-white px-2 py-1 text-[11px] font-semibold text-brand-blue-dark">{Math.max(1, differenceInCalendarDays(new Date(opportunity.closeDate), new Date()))}d</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function AccountPortfolio({ rows }: { rows: ReturnType<typeof buildPortfolioRow>[] }) {
  return (
    <section className="tk-card overflow-hidden">
      <div className="border-b border-surface-border p-5">
        <h2 className="text-lg font-semibold text-ink">Account Portfolio</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-surface-border text-xs font-semibold uppercase tracking-wider text-ink-secondary">
            <tr>
              <th className="px-5 py-4">Account</th>
              <th className="px-5 py-4">Status</th>
              <th className="px-5 py-4">Revenue</th>
              <th className="px-5 py-4">Trend</th>
              <th className="px-5 py-4">Renewal</th>
              <th className="px-5 py-4">Next Gov.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {rows.map(row => (
              <tr key={row.account.id}>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <Link to={`/accounts/${row.account.id}`} className="inline-flex min-h-[44px] min-w-[44px] items-center font-semibold text-ink hover:text-brand-blue">{row.account.name}</Link>
                    <span className="rounded-full bg-surface-tertiary px-3 py-1 text-xs font-semibold text-brand-blue-dark">{row.motion}</span>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <StatusPill risk={row.account.riskStatus} />
                </td>
                <td className="px-5 py-4 font-semibold text-ink">{formatCompactCurrency(row.account.arr)}</td>
                <td className="px-5 py-4">{row.trend}</td>
                <td className={cn('px-5 py-4 font-semibold', row.renewalDays < 30 ? 'text-brand-orange' : row.renewalDays < 0 ? 'text-rag-red' : 'text-ink-secondary')}>
                  {row.renewalDays < 0 ? `${Math.abs(row.renewalDays)}d overdue` : `${row.renewalDays}d`}
                </td>
                <td className="px-5 py-4 text-ink-secondary">{row.nextGovernance ? format(new Date(row.nextGovernance), 'yyyy-MM-dd') : 'Not scheduled'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function GrowthRetentionPanel({ accounts, growthRows, retentionRows }: { accounts: Account[]; growthRows: Account[]; retentionRows: Account[] }) {
  const growthPct = accounts.length ? Math.round((growthRows.length / accounts.length) * 100) : 0
  const retentionPct = 100 - growthPct
  const growthRevenue = growthRows.reduce((sum, account) => sum + account.arr, 0)
  const retentionRevenue = retentionRows.reduce((sum, account) => sum + account.arr, 0)
  const circumference = 2 * Math.PI * 42
  const growthDash = (growthPct / 100) * circumference

  return (
    <section className="tk-card p-5">
      <h2 className="text-lg font-semibold text-ink">Growth vs Retention</h2>
      <div className="mt-5 grid gap-5 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center 2xl:grid-cols-1">
        <svg viewBox="0 0 120 120" className="mx-auto h-44 w-44 -rotate-90">
          <circle cx="60" cy="60" r="42" className="text-brand-blue" fill="none" stroke="currentColor" strokeWidth="18" strokeDasharray={`${circumference} ${circumference}`} />
          <circle cx="60" cy="60" r="42" className="text-brand-blue-dark" fill="none" stroke="currentColor" strokeWidth="18" strokeDasharray={`${growthDash} ${circumference - growthDash}`} strokeLinecap="butt" />
          <circle cx="60" cy="60" r="42" className="text-white" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray={`2 ${circumference - 2}`} />
        </svg>
        <div className="space-y-5">
          <LegendStat label="Growth" value={`${growthPct}%`} detail={`${growthRows.length} accounts | ${formatCompactCurrency(growthRevenue)} revenue`} tone="dark" />
          <LegendStat label="Retention" value={`${retentionPct}%`} detail={`${retentionRows.length} accounts | ${formatCompactCurrency(retentionRevenue)} revenue`} tone="blue" />
        </div>
      </div>
    </section>
  )
}

function GlobalMeetingsCalendar({
  accounts,
  items,
  accountFilter,
  onAccountFilterChange,
}: {
  accounts: Account[]
  items: CalendarItem[]
  accountFilter: string
  onAccountFilterChange: (value: string) => void
}) {
  const [monthAnchor, setMonthAnchor] = useState(startOfMonth(new Date()))
  const [selectedDay, setSelectedDay] = useState<Date | null>(new Date())
  const [selectedItem, setSelectedItem] = useState<CalendarItem | null>(null)
  const selectedCalendarDate = new Date()
  const days = eachDayOfInterval({ start: startOfMonth(monthAnchor), end: endOfMonth(monthAnchor) })
  const leadingDays = Array.from({ length: getDay(startOfMonth(monthAnchor)) })
  const upcoming = items
    .filter(item => differenceInCalendarDays(item.date, selectedCalendarDate) >= 0 && differenceInCalendarDays(item.date, selectedCalendarDate) <= 30)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 7)
  const selectedDayItems = selectedDay
    ? items.filter(item => isSameDay(item.date, selectedDay)).sort((a, b) => a.date.getTime() - b.date.getTime())
    : []

  return (
    <section className="tk-card mt-6 overflow-hidden p-5">
      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="min-w-0">
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <CalendarDays className="h-5 w-5 text-brand-blue" />
              <h2 className="text-lg font-semibold text-ink">Global Meetings Calendar</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="h-4 w-4 text-ink-secondary" />
              <select className="tk-input w-[220px]" value={accountFilter} onChange={event => onAccountFilterChange(event.target.value)}>
                <option value="">All Accounts</option>
                {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
              <AddGovernanceEventDialog triggerClassName="tk-button-secondary" />
              <button className="tk-icon-button" onClick={() => setMonthAnchor(value => subMonths(value, 1))} aria-label="Previous month">‹</button>
              <p className="min-w-[120px] text-center text-lg font-semibold text-ink">{format(monthAnchor, 'MMM yyyy')}</p>
              <button className="tk-icon-button" onClick={() => setMonthAnchor(value => addMonths(value, 1))} aria-label="Next month">›</button>
            </div>
          </div>

          <div className="grid grid-cols-7 border-b border-surface-border text-center text-xs font-semibold text-ink-secondary">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <div key={day} className="py-3">{day}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {leadingDays.map((_, index) => <div key={`empty-${index}`} className="min-h-[112px]" />)}
            {days.map(day => {
              const dayItems = items.filter(item => isSameDay(item.date, day)).slice(0, 4)
              const selected = isSameDay(day, selectedDay ?? selectedCalendarDate)
              return (
                <div key={day.toISOString()} className={cn('min-h-[112px] rounded-lg p-2 text-center', selected ? 'border border-surface-border-strong bg-surface-tertiary' : '')}>
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
                        <span className={cn('h-2 w-2 shrink-0 rounded-full', calendarDotClass(item.kind))} />
                        <span className="truncate">{item.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-surface-border pt-4 text-xs font-medium text-ink-secondary">
            {[
              ['QBR', 'bg-brand-blue-dark'],
              ['SteerCo', 'bg-brand-blue'],
              ['Meeting', 'bg-rag-green'],
              ['Task', 'bg-brand-orange'],
              ['Opp Close', 'bg-surface-border-strong'],
              ['Signal', 'bg-rag-red'],
            ].map(([label, dotClass]) => (
              <span key={label} className="inline-flex items-center gap-2">
                <span className={cn('h-3 w-3 rounded-full', dotClass)} />
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
                  <span className={cn('h-2.5 w-2.5 rounded-full', calendarDotClass(item.kind))} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{item.title}</span>
                    <span className="mt-1 block truncate text-xs text-ink-secondary">{item.accountName}</span>
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-blue">{calendarKindLabel(item.kind)}</span>
                </button>
              )) : <p className="rounded-md bg-white p-3 text-sm text-ink-secondary">No calendar items on this date.</p>}
            </div>
          </div>

          {selectedItem ? (
            <div className="mt-4 rounded-lg border border-surface-border bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">{calendarKindLabel(selectedItem.kind)}</p>
                  <h3 className="mt-1 text-base font-semibold text-ink">{selectedItem.title}</h3>
                  <p className="mt-1 text-xs font-medium text-ink-secondary">{selectedItem.accountName} | {format(selectedItem.date, 'MMM d, yyyy h:mm a')}</p>
                </div>
                <span className={cn('mt-1 h-3 w-3 shrink-0 rounded-full', calendarDotClass(selectedItem.kind))} />
              </div>
              <p className="mt-3 text-sm leading-6 text-ink-secondary">{selectedItem.detail}</p>
              {selectedItem.status ? <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-ink-tertiary">Status: {selectedItem.status}</p> : null}
              <Link to={selectedItem.route} className="tk-button-primary mt-4 w-full">
                {calendarActionLabel(selectedItem.kind)}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : null}

          <h3 className="mt-5 text-sm font-semibold uppercase tracking-wider text-ink-secondary">Upcoming (30 days)</h3>
          <div className="mt-5 space-y-3">
            {upcoming.map(item => (
              <button key={item.id} type="button" className="grid w-full grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg p-2 text-left hover:bg-surface-tertiary" onClick={() => setSelectedItem(item)}>
                <span className={cn('flex h-11 w-11 items-center justify-center rounded-full', calendarIconShell(item.kind))}>
                  {item.kind === 'task' || item.kind === 'signal' ? <Users className="h-5 w-5" /> : <CalendarCheck2 className="h-5 w-5" />}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{item.title}</p>
                  <p className="mt-1 truncate text-xs text-ink-secondary">{item.accountName}</p>
                </div>
                <span className="rounded-full border border-surface-border bg-white px-2 py-1 text-[11px] font-semibold text-brand-blue-dark">{format(item.date, 'MMM d')}</span>
              </button>
            ))}
            {!upcoming.length ? <p className="rounded-md bg-surface-tertiary p-3 text-sm text-ink-secondary">No upcoming calendar items in the next 30 days.</p> : null}
          </div>
        </aside>
      </div>
    </section>
  )
}

function LegendStat({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: 'dark' | 'blue' }) {
  return (
    <div className="grid grid-cols-[18px_minmax(0,1fr)] gap-3">
      <span className={cn('mt-1 h-4 w-4 rounded-md', tone === 'dark' ? 'bg-brand-blue-dark' : 'bg-brand-blue')} />
      <div>
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="mt-1 font-display text-3xl font-bold leading-none text-ink">{value}</p>
        <p className="mt-1 text-sm leading-5 text-ink-secondary">{detail}</p>
      </div>
    </div>
  )
}

function StatusPill({ risk }: { risk: RiskStatus }) {
  const label = risk === 'healthy' ? 'Green' : risk === 'warning' ? 'Amber' : 'Red'
  return (
    <span className={cn('inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold', statusPillClass(risk))}>
      <span className={cn('h-2.5 w-2.5 rounded-full', risk === 'healthy' ? 'bg-rag-green' : risk === 'warning' ? 'bg-brand-orange' : 'bg-rag-red')} />
      {label}
    </span>
  )
}

function buildTaskAISummary(tasks: ScoreActivityTask[], signals: SignalRecord[]): TaskAISummary {
  const today = new Date()
  const openTasks = tasks.filter(task => !['done', 'skipped'].includes(task.status))
  const openSignals = signals.filter(signal => !['resolved', 'dismissed'].includes(signal.status))
  const overdueTasks = openTasks.filter(task => differenceInCalendarDays(new Date(task.dueDate), today) < 0)
  const criticalSignals = openSignals.filter(signal => signal.severity === 'critical')
  const overdueSignals = openSignals.filter(signal => signal.dueAt && differenceInCalendarDays(new Date(signal.dueAt), today) < 0)
  const todayTasks = openTasks.filter(task => differenceInCalendarDays(new Date(task.dueDate), today) === 0)
  const todaySignals = openSignals.filter(signal => signal.dueAt && differenceInCalendarDays(new Date(signal.dueAt), today) === 0)
  const dueSoonTasks = openTasks.filter(task => {
    const days = differenceInCalendarDays(new Date(task.dueDate), today)
    return days >= 0 && days <= 7
  })
  const dueSoonSignals = openSignals.filter(signal => {
    if (!signal.dueAt) return false
    const days = differenceInCalendarDays(new Date(signal.dueAt), today)
    return days >= 0 && days <= 7
  })
  const urgentCount = new Set([
    ...overdueTasks.map(task => `task-${task.id}`),
    ...criticalSignals.map(signal => `signal-${signal.id}`),
    ...overdueSignals.map(signal => `signal-${signal.id}`),
  ]).size
  const openCount = openTasks.length + openSignals.length
  const dueSoonCount = dueSoonTasks.length + dueSoonSignals.length
  const accountLoad = new Map<string, number>()
  openTasks.forEach(task => accountLoad.set(task.accountName, (accountLoad.get(task.accountName) ?? 0) + 1))
  openSignals.forEach(signal => accountLoad.set(signal.accountName, (accountLoad.get(signal.accountName) ?? 0) + 1))
  const busiest = [...accountLoad.entries()].sort((a, b) => b[1] - a[1])[0]
  const headline = urgentCount
    ? `${urgentCount} task items need same-day triage`
    : dueSoonCount
      ? `${dueSoonCount} task items are due this week`
      : 'Task queue is stable'
  const narrative = busiest
    ? `KAM AI sees ${openCount} open items across ${accountLoad.size} accounts. ${busiest[0]} carries the heaviest load with ${busiest[1]} active items.`
    : 'KAM AI does not see open task pressure right now.'
  const bullets = [
    overdueTasks.length ? `${overdueTasks.length} overdue score-linked tasks should be cleared before new scoring work starts.` : 'No score-linked task is overdue right now.',
    criticalSignals.length ? `${criticalSignals.length} critical attention signals need owner confirmation and source review.` : 'No critical attention signal is waiting for review.',
    dueSoonCount ? `${dueSoonCount} due-soon items are ready for lane planning today.` : 'No due-soon task needs scheduling pressure this week.',
  ]
  const todayFocus = [
    ...todayTasks.map(task => `${task.accountName}: ${task.title}`),
    ...todaySignals.map(signal => `${signal.accountName}: ${signal.headline}`),
  ]
    .slice(0, 3)
  const stableTodayFocus = todayFocus.length ? todayFocus : ['No task is due today. Use the week view to plan upcoming work.']

  return {
    headline,
    narrative,
    bullets,
    todayFocus: stableTodayFocus,
    openCount,
    urgentCount,
    dueSoonCount,
    todayCount: todayTasks.length + todaySignals.length,
    sourceCount: tasks.length + signals.length,
  }
}

function buildCriticalOverdueRows(tasks: ScoreActivityTask[], signals: SignalRecord[]): CriticalOverdueRow[] {
  const today = new Date()
  const buckets = new Map<string, CriticalOverdueRow>()
  const ensure = (label: string) => {
    const existing = buckets.get(label)
    if (existing) return existing
    const row = { label, count: 0, critical: 0, overdue: 0 }
    buckets.set(label, row)
    return row
  }
  const add = (label: string, critical: boolean, overdue: boolean) => {
    if (!critical && !overdue) return
    const row = ensure(label)
    row.count += 1
    if (critical) row.critical += 1
    if (overdue) row.overdue += 1
  }

  tasks
    .filter(task => !['done', 'skipped'].includes(task.status))
    .forEach(task => {
      add(calculatorLabel(task.calculatorId), task.priority === 'high', differenceInCalendarDays(new Date(task.dueDate), today) < 0)
    })
  signals
    .filter(signal => !['resolved', 'dismissed'].includes(signal.status))
    .forEach(signal => {
      add(signalTypeLabel(signal.type), signal.severity === 'critical', Boolean(signal.dueAt && differenceInCalendarDays(new Date(signal.dueAt), today) < 0))
    })

  return [...buckets.values()]
    .sort((a, b) => (b.critical + b.overdue) - (a.critical + a.overdue) || b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 6)
}

function buildPortfolioRow(account: Account, governanceEvents: GovernanceEventRecord[], engagements: EngagementRecord[]) {
  const nextGovernance = governanceEvents.filter(event => event.accountId === account.id && new Date(event.date) >= new Date()).sort(sortByDate)[0]
  const engagement = engagements.find(item => item.accountId === account.id)
  const renewalDate = engagement?.renewalTerms.renewalDate ?? account.nextQbr
  const renewalDays = differenceInCalendarDays(new Date(renewalDate), new Date())
  const TrendIcon = account.health.overall >= 76 ? ArrowUp : account.health.overall < 65 ? ArrowDown : Minus
  const trendClass = account.health.overall >= 76 ? 'text-rag-green' : account.health.overall < 65 ? 'text-rag-red' : 'text-ink-secondary'

  return {
    account,
    motion: isGrowthAccount(account) ? 'Growth' : 'Retention',
    renewalDays,
    nextGovernance: nextGovernance?.date ?? account.nextQbr,
    trend: <TrendIcon className={cn('h-5 w-5', trendClass)} />,
  }
}

type CalendarItem = {
  id: string
  accountId: string
  accountName: string
  title: string
  detail: string
  date: Date
  kind: 'qbr' | 'steerco' | 'meeting' | 'task' | 'opp_close' | 'signal'
  status?: string
  route: string
}

function buildCalendarItems(
  governanceEvents: GovernanceEventRecord[],
  tasks: ScoreActivityTask[],
  opportunities: Opportunity[],
  signals: ReturnType<typeof useV3Store.getState>['signals'],
  accountFilter: string,
): CalendarItem[] {
  const governanceItems: CalendarItem[] = governanceEvents.map(event => ({
    id: event.id,
    accountId: event.accountId,
    accountName: event.accountName,
    title: event.type === 'Executive Review' ? 'Executive Review' : `${event.type} - ${event.agenda}`,
    detail: event.agenda,
    date: new Date(event.date),
    kind: event.type === 'QBR' ? 'qbr' : event.type === 'SteerCo' ? 'steerco' : 'meeting',
    status: event.status,
    route: `/accounts/${event.accountId}?tab=governance`,
  }))
  const taskItems: CalendarItem[] = tasks.slice(0, 12).map(task => ({
    id: task.id,
    accountId: task.accountId,
    accountName: task.accountName,
    title: task.title,
    detail: task.description,
    date: new Date(task.dueDate),
    kind: 'task',
    status: task.status,
    route: `/accounts/${task.accountId}?tab=health`,
  }))
  const opportunityItems: CalendarItem[] = opportunities.filter(opportunity => opportunity.stage !== 'Won' && opportunity.stage !== 'Lost').map(opportunity => ({
    id: opportunity.id,
    accountId: opportunity.accountId,
    accountName: opportunity.accountName,
    title: opportunity.name,
    detail: `${opportunity.stage} opportunity with an estimated value of ${formatCompactCurrency(opportunity.estimatedValue)}.`,
    date: new Date(opportunity.closeDate),
    kind: 'opp_close',
    status: opportunity.stage,
    route: '/opportunities',
  }))
  const signalItems: CalendarItem[] = signals.filter(signal => signal.dueAt).map(signal => ({
    id: signal.id,
    accountId: signal.accountId,
    accountName: signal.accountName,
    title: signal.headline,
    detail: signal.detail,
    date: new Date(signal.dueAt ?? addDays(new Date(), 1)),
    kind: 'signal',
    status: signal.status,
    route: `/accounts/${signal.accountId}?tab=${signal.type === 'sow_expiry' || signal.type === 'notice_window' ? 'engagements' : 'health'}`,
  }))

  return [...governanceItems, ...taskItems, ...opportunityItems, ...signalItems].filter(item => !accountFilter || item.accountId === accountFilter)
}

function isGrowthAccount(account: Account) {
  return ['Expansion', 'Expansion Focus', 'Adoption', 'Active'].includes(account.stage)
}

function sortByDate(a: { date: string }, b: { date: string }) {
  return new Date(a.date).getTime() - new Date(b.date).getTime()
}

function calculatorLabel(calculatorId: ScoreActivityTask['calculatorId']) {
  const labels: Record<ScoreActivityTask['calculatorId'], string> = {
    relationship: 'Relationship',
    contract: 'Contract',
    resource: 'Resource',
    csat: 'CSAT',
    risk: 'Risk',
  }
  return labels[calculatorId]
}

function signalTypeLabel(type: SignalRecord['type']) {
  const labels: Record<SignalRecord['type'], string> = {
    sow_expiry: 'Renewal',
    notice_window: 'Notice window',
    stale_kyc: 'KYC',
    weak_metric: 'Health metric',
    stakeholder_gap: 'Stakeholder gap',
    escalation_sla: 'Escalation SLA',
  }
  return labels[type]
}

function statusPillClass(risk: RiskStatus) {
  if (risk === 'healthy') return 'bg-rag-green/10 text-rag-green'
  if (risk === 'warning') return 'bg-brand-orange/10 text-brand-orange'
  return 'bg-rag-red/10 text-rag-red'
}

function calendarDotClass(kind: CalendarItem['kind']) {
  if (kind === 'qbr') return 'bg-brand-blue-dark'
  if (kind === 'steerco') return 'bg-brand-blue'
  if (kind === 'meeting') return 'bg-rag-green'
  if (kind === 'task') return 'bg-brand-orange'
  if (kind === 'signal') return 'bg-rag-red'
  return 'bg-surface-border-strong'
}

function calendarIconShell(kind: CalendarItem['kind']) {
  if (kind === 'qbr' || kind === 'steerco') return 'bg-blue-tint-20 text-brand-blue-dark'
  if (kind === 'signal') return 'bg-rag-red/10 text-rag-red'
  if (kind === 'task') return 'bg-brand-orange/10 text-brand-orange'
  return 'bg-rag-green/10 text-rag-green'
}

function calendarKindLabel(kind: CalendarItem['kind']) {
  if (kind === 'qbr') return 'QBR'
  if (kind === 'steerco') return 'SteerCo'
  if (kind === 'meeting') return 'Governance'
  if (kind === 'task') return 'Task'
  if (kind === 'opp_close') return 'Opportunity'
  return 'Signal'
}

function calendarActionLabel(kind: CalendarItem['kind']) {
  if (kind === 'qbr' || kind === 'steerco' || kind === 'meeting') return 'Open Governance tab'
  if (kind === 'task') return 'Open Health tab'
  if (kind === 'opp_close') return 'Open Opportunities'
  return 'Open source context'
}
