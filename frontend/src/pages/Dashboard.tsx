import { BarChart3, BriefcaseBusiness, ClipboardList, Loader2, RefreshCw, Search, ShieldAlert } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/ui/PageHeader'
import { useAuth } from '@/contexts/AuthContext'
import { DashboardRead, DashboardWidget, getAmHomeDashboard, getKamHeadPortfolio, getLeadershipDashboard, refreshAmTaskSummary } from '@/services/notificationsReporting'

type DashboardMode = 'am' | 'portfolio' | 'leadership'

const modeLabels: Record<DashboardMode, string> = {
  am: 'AM Home',
  portfolio: 'KAM Head Portfolio',
  leadership: 'Leadership',
}

export function Dashboard() {
  const { token, user } = useAuth()
  const [mode, setMode] = useState<DashboardMode>('am')
  const [dashboard, setDashboard] = useState<DashboardRead | null>(null)
  const [search, setSearch] = useState('')
  const [draftSearch, setDraftSearch] = useState('')
  const [risk, setRisk] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [refreshingSummary, setRefreshingSummary] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    let active = true
    setLoading(true)
    setError('')
    const params = { search, risk, page, page_size: 10 }
    const request = mode === 'portfolio' ? getKamHeadPortfolio(token, params) : mode === 'leadership' ? getLeadershipDashboard(token, params) : getAmHomeDashboard(token, params)
    request
      .then(result => {
        if (active) setDashboard(result)
      })
      .catch(err => {
        if (active) setError(err instanceof Error ? err.message : 'Dashboard could not be loaded')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [mode, page, risk, search, token])

  const widgets = dashboard?.widgets ?? []
  const summary = widgets.find(widget => widget.key === 'summary')
  const taskSummary = widgets.find(widget => widget.key === 'ai_task_summary')
  const rest = widgets.filter(widget => widget.key !== 'summary' && widget.key !== 'ai_task_summary')

  const metricItems = useMemo(() => {
    const value = isRecord(summary?.value) ? summary.value : {}
    return Object.entries(value).map(([key, item]) => ({ label: key.replace(/_/g, ' '), value: String(item) }))
  }, [summary])

  function submitSearch(event: FormEvent) {
    event.preventDefault()
    setPage(1)
    setSearch(draftSearch)
  }

  async function refreshSummary() {
    if (!token) return
    setRefreshingSummary(true)
    try {
      const result = await refreshAmTaskSummary(token)
      setDashboard(current => current ? { ...current, widgets: current.widgets.map(widget => (widget.key === 'ai_task_summary' ? result.widget : widget)) } : current)
      toast.success('Task summary refreshed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Task summary could not be refreshed')
    } finally {
      setRefreshingSummary(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="What needs attention today"
        title={modeLabels[mode]}
        description={`${user?.name ?? 'User'} · ${dashboard?.data_scope ?? 'authorized scope'}`}
        actions={mode === 'am' ? <button className="tk-button-secondary" type="button" onClick={() => void refreshSummary()} disabled={refreshingSummary}><RefreshCw className={refreshingSummary ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />Refresh AI Data</button> : null}
      />

      <section className="tk-card p-3">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(modeLabels) as DashboardMode[]).map(item => (
            <button key={item} className={mode === item ? 'tk-button-primary' : 'tk-button-secondary'} type="button" onClick={() => { setMode(item); setPage(1) }}>
              {item === 'am' ? <ClipboardList className="h-4 w-4" /> : item === 'portfolio' ? <BriefcaseBusiness className="h-4 w-4" /> : <BarChart3 className="h-4 w-4" />}
              {modeLabels[item]}
            </button>
          ))}
        </div>
        <form className="mt-3 grid gap-3 md:grid-cols-[1fr_180px_auto]" onSubmit={submitSearch}>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
            <input className="tk-input pl-9" value={draftSearch} onChange={event => setDraftSearch(event.target.value)} placeholder="Search accounts and decisions" />
          </label>
          <select className="tk-input" value={risk} onChange={event => { setRisk(event.target.value); setPage(1) }}>
            <option value="">All risk</option>
            <option value="healthy">Healthy</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
          <button className="tk-button-primary" type="submit"><Search className="h-4 w-4" />Search</button>
        </form>
      </section>

      {loading ? <DashboardLoading /> : null}
      {error ? <section className="rounded-lg border border-rag-red/20 bg-rag-red/10 p-4 text-sm font-medium text-rag-red">{error}</section> : null}
      {!loading && !error && widgets.length === 0 ? <EmptyDashboard /> : null}

      {!loading && !error && widgets.length ? (
        <>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {metricItems.map(item => (
              <div key={item.label} className="tk-card p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">{item.label}</p>
                <p className="mt-2 font-display text-3xl font-bold text-ink">{item.value}</p>
              </div>
            ))}
          </section>

          {taskSummary ? <TaskSummaryCard widget={taskSummary} refreshing={refreshingSummary} onRefresh={() => void refreshSummary()} /> : null}

          <section className="grid gap-4 xl:grid-cols-2">
            {rest.map(widget => <WidgetCard key={widget.key} widget={widget} />)}
          </section>

          <div className="flex items-center justify-between">
            <button className="tk-button-secondary" type="button" disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</button>
            <span className="text-sm text-ink-secondary">Page {page}</span>
            <button className="tk-button-secondary" type="button" onClick={() => setPage(value => value + 1)}>Next</button>
          </div>
        </>
      ) : null}
    </div>
  )
}

function TaskSummaryCard({ widget, refreshing, onRefresh }: { widget: DashboardWidget; refreshing: boolean; onRefresh: () => void }) {
  const value = isRecord(widget.value) ? widget.value : {}
  const blockers = Array.isArray(value.top_blockers) ? value.top_blockers : []
  const sourceCounts = isRecord(value.source_counts) ? value.source_counts : {}
  return (
    <section className="tk-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border p-5">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">AI Task Summary</p>
          <h2 className="mt-1 text-xl font-semibold text-ink">{String(value.headline ?? widget.title)}</h2>
        </div>
        <button className="tk-button-secondary" type="button" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw className={refreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          Refresh
        </button>
      </div>
      <div className="grid gap-4 p-5 lg:grid-cols-[1fr_280px]">
        <div>
          <p className="text-sm leading-6 text-ink-secondary">{String(value.narrative ?? '')}</p>
          <p className="mt-3 text-sm font-semibold text-ink">Focus: {String(value.recommended_focus ?? 'Review active account work.')}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {blockers.length ? blockers.map(item => <span key={String(item)} className="rounded-full bg-brand-orange/10 px-3 py-1 text-xs font-semibold text-brand-orange">{String(item)}</span>) : <span className="text-sm text-ink-secondary">No blockers in scope.</span>}
          </div>
        </div>
        <div className="rounded-lg border border-surface-border bg-surface-tertiary p-4">
          {Object.entries(sourceCounts).map(([key, count]) => (
            <div key={key} className="flex items-center justify-between py-1 text-sm">
              <span className="capitalize text-ink-secondary">{key}</span>
              <span className="font-semibold text-ink">{String(count)}</span>
            </div>
          ))}
          <p className="mt-3 text-xs text-ink-tertiary">Refreshed {String(value.refreshed_at ?? widget.generated_at)}</p>
        </div>
      </div>
    </section>
  )
}

function WidgetCard({ widget }: { widget: DashboardWidget }) {
  return (
    <section className="tk-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-surface-border p-4">
        <h2 className="text-base font-semibold text-ink">{widget.title}</h2>
        <span className="rounded-full bg-surface-tertiary px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-ink-secondary">{widget.status}</span>
      </div>
      {widget.error ? <div className="m-4 rounded-md border border-rag-red/20 bg-rag-red/10 p-3 text-sm text-rag-red">{widget.error}</div> : null}
      {isRecord(widget.value) && Object.keys(widget.value).length ? (
        <div className="grid gap-2 p-4 sm:grid-cols-2">
          {Object.entries(widget.value).map(([key, value]) => (
            <div key={key} className="rounded-lg border border-surface-border p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">{key.replace(/_/g, ' ')}</p>
              <p className="mt-1 text-lg font-bold text-ink">{String(value)}</p>
            </div>
          ))}
        </div>
      ) : null}
      {widget.items.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <tbody>
              {widget.items.map((item, index) => (
                <tr key={`${widget.key}-${index}`} className="border-b border-surface-border last:border-b-0">
                  {Object.entries(item).slice(0, 5).map(([key, value]) => (
                    <td key={key} className="px-4 py-3 align-top">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-ink-tertiary">{key.replace(/_/g, ' ')}</span>
                      <span className="mt-1 block max-w-[260px] truncate text-ink">{String(value ?? '-')}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : widget.status === 'empty' ? <div className="p-4 text-sm text-ink-secondary">No items in this view.</div> : null}
    </section>
  )
}

function DashboardLoading() {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="tk-card flex h-28 items-center gap-3 p-4 text-sm text-ink-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading widget
        </div>
      ))}
    </section>
  )
}

function EmptyDashboard() {
  return (
    <section className="tk-card grid justify-items-center gap-3 p-8 text-center">
      <ShieldAlert className="h-9 w-9 text-brand-blue" />
      <p className="text-sm font-medium text-ink-secondary">No dashboard data is visible for this scope.</p>
    </section>
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
