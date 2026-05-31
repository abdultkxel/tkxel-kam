import { AlertTriangle, CalendarClock, ChevronLeft, ChevronRight, Loader2, Search } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/contexts/AuthContext'
import {
  EngagementRenewal,
  RetentionCalendarItem,
  RetentionPlan,
  RetentionPortfolioReport,
  RetentionPortfolioTask,
  RetentionSignal,
  getRetentionPortfolioReport,
  listPortfolioRenewals,
  listRetentionCalendarItems,
  listRetentionPlans,
  listRetentionSignals,
  listRetentionTasks,
} from '@/services/retention'
import { cn } from '@/utils/cn'
import { formatCompactCurrency, formatDate } from '@/utils/formatters'

export function Retention() {
  const { token } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [renewals, setRenewals] = useState<EngagementRenewal[]>([])
  const [plans, setPlans] = useState<RetentionPlan[]>([])
  const [report, setReport] = useState<RetentionPortfolioReport | null>(null)
  const [tasks, setTasks] = useState<RetentionPortfolioTask[]>([])
  const [signals, setSignals] = useState<RetentionSignal[]>([])
  const [calendarItems, setCalendarItems] = useState<RetentionCalendarItem[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [plansLoading, setPlansLoading] = useState(false)
  const [error, setError] = useState('')
  const [draftSearch, setDraftSearch] = useState(searchParams.get('search') ?? '')

  const page = Number(searchParams.get('page') ?? '1')
  const selectedAccountId = searchParams.get('account_id')
  const selectedAccountName = useMemo(() => renewals.find(item => item.account_id === selectedAccountId)?.account_name, [renewals, selectedAccountId])

  useEffect(() => {
    if (!token) return
    let active = true
    setLoading(true)
    setError('')
    const params = new URLSearchParams(searchParams)
    params.delete('account_id')
    Promise.all([
      listPortfolioRenewals(token, params),
      getRetentionPortfolioReport(token),
      listRetentionTasks(token, new URLSearchParams({ page: '1', page_size: '5' })),
      listRetentionSignals(token, new URLSearchParams({ page: '1', page_size: '5' })),
      listRetentionCalendarItems(token, new URLSearchParams({ date_from: new Date().toISOString() })),
    ])
      .then(([result, reportResult, taskResult, signalResult, calendarResult]) => {
        if (!active) return
        setRenewals(result.items)
        setTotal(result.total)
        setPages(result.pages)
        setReport(reportResult)
        setTasks(taskResult.items)
        setSignals(signalResult.items)
        setCalendarItems(calendarResult.slice(0, 5))
      })
      .catch(err => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Unable to load retention renewals')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [searchParams, token])

  useEffect(() => {
    if (!token || !selectedAccountId) {
      setPlans([])
      return
    }
    let active = true
    setPlansLoading(true)
    listRetentionPlans(token, selectedAccountId, new URLSearchParams({ page: '1', page_size: '5', sort: 'due_date', direction: 'asc' }))
      .then(result => {
        if (active) setPlans(result.items)
      })
      .catch(() => {
        if (active) setPlans([])
      })
      .finally(() => {
        if (active) setPlansLoading(false)
      })
    return () => {
      active = false
    }
  }, [selectedAccountId, token])

  function applyFilters(event: FormEvent) {
    event.preventDefault()
    const next = new URLSearchParams(searchParams)
    setOrDelete(next, 'search', draftSearch.trim())
    next.set('page', '1')
    setSearchParams(next)
  }

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams)
    setOrDelete(next, key, value)
    next.set('page', '1')
    setSearchParams(next)
  }

  function setPage(nextPage: number) {
    const next = new URLSearchParams(searchParams)
    next.set('page', String(Math.max(1, nextPage)))
    setSearchParams(next)
  }

  function selectAccount(renewal: EngagementRenewal) {
    const next = new URLSearchParams(searchParams)
    next.set('account_id', renewal.account_id)
    setSearchParams(next)
  }

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Retention" title="Retention and account stability" description="Renewal deadlines, retention readiness, and stabilization plans across authorized accounts." />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <ReportMetric label="Renewals" value={report?.total_renewals ?? 0} />
        <ReportMetric label="Critical" value={report?.critical_renewals ?? 0} tone="red" />
        <ReportMetric label="Signals" value={report?.signal_count ?? 0} tone="orange" />
        <ReportMetric label="Open actions" value={report?.open_retention_actions ?? 0} tone="blue" />
        <ReportMetric label="Exposure" value={formatCompactCurrency(report?.total_commercial_exposure ?? 0)} />
      </section>

      <section className="tk-card p-4">
        <form className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_170px_170px_170px_130px]" onSubmit={applyFilters}>
          <label className="space-y-1">
            <span className="tk-label">Search</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
              <input className="tk-input pl-9" value={draftSearch} onChange={event => setDraftSearch(event.target.value)} placeholder="Account, engagement, SOW source" />
            </div>
          </label>
          <SelectFilter label="Renewal" value={searchParams.get('renewal_window') ?? ''} onChange={value => setFilter('renewal_window', value)} options={['next_30', 'next_60', 'next_90', 'expired', 'missing']} />
          <SelectFilter label="Risk" value={searchParams.get('renewal_risk') ?? ''} onChange={value => setFilter('renewal_risk', value)} options={['healthy', 'warning', 'critical']} />
          <SelectFilter label="Sort" value={searchParams.get('sort') ?? 'nearest_notice'} onChange={value => setFilter('sort', value)} options={['nearest_notice', 'nearest_renewal', 'risk', 'commercial_exposure', 'updated']} />
          <button className="tk-button-primary self-end justify-center" type="submit">
            Apply
          </button>
        </form>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="tk-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-surface-border bg-surface-secondary px-5 py-4">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Renewal worklist</p>
              <p className="mt-1 text-sm text-ink-secondary">{total} renewal records</p>
            </div>
            <select className="tk-input w-28" value={searchParams.get('direction') ?? 'asc'} onChange={event => setFilter('direction', event.target.value)}>
              <option value="asc">Asc</option>
              <option value="desc">Desc</option>
            </select>
          </div>

          {loading ? (
            <div className="space-y-3 p-5" role="status" aria-label="Loading retention renewals">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : error ? (
            <div className="p-6">
              <EmptyState icon={AlertTriangle} heading="Renewals could not be loaded" body={error} />
            </div>
          ) : renewals.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-surface-border text-sm">
                <thead className="bg-surface-secondary text-left text-[10px] uppercase tracking-wider text-ink-secondary">
                  <tr>
                    <th className="px-4 py-3">Account</th>
                    <th className="px-4 py-3">Engagement</th>
                    <th className="px-4 py-3">Notice</th>
                    <th className="px-4 py-3">Renewal</th>
                    <th className="px-4 py-3">Risk</th>
                    <th className="px-4 py-3">Exposure</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border bg-white">
                  {renewals.map(renewal => (
                    <tr key={renewal.engagement_id} className={cn('cursor-pointer transition-colors hover:bg-surface-tertiary', selectedAccountId === renewal.account_id ? 'bg-blue-tint-20' : '')} onClick={() => selectAccount(renewal)}>
                      <td className="px-4 py-3">
                        <Link className="font-semibold text-brand-blue hover:underline" to={`/accounts/${renewal.account_id}?tab=retention`} onClick={event => event.stopPropagation()}>
                          {renewal.account_name || renewal.account_id}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-ink">{renewal.engagement_name}</td>
                      <td className="px-4 py-3 text-ink-secondary">{dateLabel(renewal.notice_deadline)}</td>
                      <td className="px-4 py-3 text-ink-secondary">{dateLabel(renewal.renewal_date || renewal.sow_end_date)}</td>
                      <td className="px-4 py-3"><RiskPill value={renewal.renewal_risk} /></td>
                      <td className="px-4 py-3 font-semibold text-ink">{formatCompactCurrency(renewal.commercial_exposure)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6">
              <EmptyState icon={CalendarClock} heading="No renewals found" body="Adjust the search, filter, or renewal window." />
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-surface-border bg-surface-secondary px-5 py-4 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-ink-secondary">Page {page} of {pages || 1}</p>
            <div className="flex gap-2">
              <button className="tk-button-secondary" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <button className="tk-button-secondary" disabled={page >= pages || loading} onClick={() => setPage(page + 1)}>
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>

        <aside className="tk-card p-5">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Selected account plans</p>
          <h2 className="mt-1 text-xl font-semibold text-ink">{selectedAccountName || 'Select an account'}</h2>
          <div className="mt-4 space-y-3">
            {!selectedAccountId ? (
              <p className="rounded-lg border border-surface-border bg-surface-secondary p-4 text-sm text-ink-secondary">Choose a renewal row to inspect retention plans.</p>
            ) : plansLoading ? (
              <p className="flex items-center gap-2 text-sm text-ink-secondary"><Loader2 className="h-4 w-4 animate-spin" /> Loading plans</p>
            ) : plans.length ? (
              plans.map(plan => (
                <Link key={plan.id} to={`/accounts/${plan.account_id}?tab=retention`} className="block rounded-lg border border-surface-border bg-white p-4 transition-colors hover:border-brand-blue/50 hover:bg-surface-tertiary">
                  <p className="text-sm font-semibold text-ink">{plan.title}</p>
                  <p className="mt-1 text-xs text-ink-secondary">{plan.owner_name} | {formatDate(plan.due_at)}</p>
                  <RiskPill value={plan.risk_level} />
                </Link>
              ))
            ) : (
              <p className="rounded-lg border border-surface-border bg-surface-secondary p-4 text-sm text-ink-secondary">No plans for this account yet.</p>
            )}
          </div>

          <div className="mt-6 border-t border-surface-border pt-5">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Retention tasks</p>
            <div className="mt-3 space-y-2">
              {tasks.length ? tasks.map(task => (
                <Link key={task.id} to={`/accounts/${task.account_id}?tab=retention`} className="block rounded-lg border border-surface-border bg-white p-3 hover:bg-surface-tertiary">
                  <p className="text-sm font-semibold text-ink">{task.title}</p>
                  <p className="mt-1 text-xs text-ink-secondary">{task.account_name} | {task.owner_name} | {dateLabel(task.due_at)}</p>
                </Link>
              )) : <p className="rounded-lg bg-surface-secondary p-3 text-sm text-ink-secondary">No retention actions due.</p>}
            </div>
          </div>

          <div className="mt-6 border-t border-surface-border pt-5">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Signals and calendar</p>
            <div className="mt-3 space-y-2">
              {signals.slice(0, 3).map(signal => (
                <Link key={signal.id} to={signal.source_record_route} className="block rounded-lg border border-surface-border bg-white p-3 hover:bg-surface-tertiary">
                  <p className="text-sm font-semibold text-ink">{signal.headline}</p>
                  <p className="mt-1 text-xs text-ink-secondary">{signal.account_name} | {signal.severity}</p>
                </Link>
              ))}
              {calendarItems.slice(0, 3).map(item => (
                <Link key={item.id} to={item.source_record_route} className="block rounded-lg border border-surface-border bg-white p-3 hover:bg-surface-tertiary">
                  <p className="text-sm font-semibold text-ink">{item.title}</p>
                  <p className="mt-1 text-xs text-ink-secondary">{item.account_name} | {dateLabel(item.starts_at)}</p>
                </Link>
              ))}
              {!signals.length && !calendarItems.length ? <p className="rounded-lg bg-surface-secondary p-3 text-sm text-ink-secondary">No renewal signal or calendar item is due.</p> : null}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function ReportMetric({ label, value, tone = 'dark' }: { label: string; value: string | number; tone?: 'dark' | 'red' | 'orange' | 'blue' }) {
  const toneClass = tone === 'red' ? 'text-rag-red' : tone === 'orange' ? 'text-brand-orange' : tone === 'blue' ? 'text-brand-blue' : 'text-ink'
  return (
    <div className="tk-card p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">{label}</p>
      <p className={`mt-1 font-display text-3xl font-bold ${toneClass}`}>{value}</p>
    </div>
  )
}

function SelectFilter({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="space-y-1">
      <span className="tk-label">{label}</span>
      <select className="tk-input" value={value} onChange={event => onChange(event.target.value)}>
        <option value="">All</option>
        {options.map(option => <option key={option} value={option}>{option.replace(/_/g, ' ')}</option>)}
      </select>
    </label>
  )
}

function RiskPill({ value }: { value: string }) {
  const tone = value === 'critical' ? 'border-rag-red/20 bg-rag-red/10 text-rag-red' : value === 'warning' ? 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange' : 'border-rag-green/20 bg-rag-green/10 text-rag-green'
  return <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${tone}`}>{value}</span>
}

function dateLabel(value?: string | null) {
  return value ? formatDate(value) : 'Not set'
}

function setOrDelete(params: URLSearchParams, key: string, value: string) {
  if (value) params.set(key, value)
  else params.delete(key)
}
