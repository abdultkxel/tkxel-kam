import { ChevronLeft, ChevronRight, GitCompare, LineChart, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { listScoreSnapshots } from '@/services/scoring'
import { useScoreStore } from '@/stores/scoreStore'
import { ScoreSnapshot } from '@/types/account'
import { cn } from '@/utils/cn'
import { formatDate, formatRelative } from '@/utils/formatters'

function rowDelta(a: number, b: number) {
  const delta = b - a
  return `${delta >= 0 ? '+' : ''}${delta}`
}

const dimensionLabels: Record<string, string> = {
  relationship: 'Relationship',
  resource: 'Resource',
  service_line: 'Service Line',
  contract: 'Contract',
  account_risk: 'Account Risk',
  csat: 'CSAT',
  usage: 'Usage',
  delivery: 'Delivery',
  commercial: 'Commercial',
}

export function ScoreHistoryPanel({ accountId }: { accountId: string }) {
  const { token } = useAuth()
  const snapshots = useScoreStore(state => state.snapshots)
  const [remoteSnapshots, setRemoteSnapshots] = useState<ScoreSnapshot[]>([])
  const [loading, setLoading] = useState(Boolean(token))
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [ragStatus, setRagStatus] = useState('')
  const [freshness, setFreshness] = useState('')
  const [dirty, setDirty] = useState('')
  const [metricSlug, setMetricSlug] = useState('')
  const [category, setCategory] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const accountSnapshots = useMemo(
    () => (remoteSnapshots.length ? remoteSnapshots : snapshots.filter(snapshot => snapshot.accountId === accountId)).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [accountId, remoteSnapshots, snapshots],
  )
  const [selected, setSelected] = useState<string[]>([])
  const compare = selected.map(id => accountSnapshots.find(snapshot => snapshot.id === id)).filter(Boolean) as ScoreSnapshot[]
  const oldestFirst = [...accountSnapshots].reverse()

  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    listScoreSnapshots(token, accountId, {
      page,
      page_size: 10,
      scope: 'account',
      rag_status: ragStatus || undefined,
      freshness_status: freshness || undefined,
      dirty: dirty === '' ? undefined : dirty === 'true',
      metric_slug: metricSlug || undefined,
      category: category || undefined,
      date_from: dateFrom ? new Date(dateFrom).toISOString() : undefined,
      date_to: dateTo ? new Date(dateTo).toISOString() : undefined,
    })
      .then(page => {
        setPages(Math.max(1, page.pages))
        setRemoteSnapshots(
          page.items.map(snapshot => {
            const dimensions = Object.fromEntries(snapshot.drivers.map(driver => [driver.key, driver.score]))
            return {
              id: snapshot.id,
              accountId: snapshot.account_id,
              timestamp: snapshot.calculated_at,
              overall: snapshot.overall,
              dimensions: Object.keys(dimensions).length
                ? Object.fromEntries(Object.entries(dimensions).map(([key, value]) => [key, Number(value)]))
                : { overall: snapshot.overall },
              calculatorVersion: snapshot.metric_version,
              changedBy: snapshot.calculated_by_name ?? 'system',
              changedByName: snapshot.calculated_by_name ?? 'System',
              triggerEntryId: snapshot.id,
            }
          }),
        )
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Unable to load score snapshots'))
      .finally(() => setLoading(false))
  }, [accountId, token, page, ragStatus, freshness, dirty, metricSlug, category, dateFrom, dateTo])

  function resetPage(valueSetter: (value: string) => void, value: string) {
    valueSetter(value)
    setPage(1)
  }

  function toggle(id: string) {
    setSelected(current => (current.includes(id) ? current.filter(item => item !== id) : [...current.slice(-1), id]))
  }

  return (
    <section className="tk-card p-5">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Health Score Version History</p>
          <h3 className="text-base font-semibold text-ink">Snapshots and calculator changes</h3>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-ink-secondary">
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-brand-blue" /> : <LineChart className="h-4 w-4 text-brand-blue" />}
          Dotted lines mark calculator version changes
        </div>
      </div>

      <div className="mb-4 grid gap-2 rounded-lg border border-surface-border bg-surface-secondary p-3 md:grid-cols-3 xl:grid-cols-6">
        <select value={ragStatus} onChange={event => resetPage(setRagStatus, event.target.value)} className="tk-input">
          <option value="">All RAG</option>
          <option value="green">Green</option>
          <option value="amber">Amber</option>
          <option value="red">Red</option>
        </select>
        <select value={freshness} onChange={event => resetPage(setFreshness, event.target.value)} className="tk-input">
          <option value="">All freshness</option>
          <option value="fresh">Fresh</option>
          <option value="stale">Stale</option>
        </select>
        <select value={dirty} onChange={event => resetPage(setDirty, event.target.value)} className="tk-input">
          <option value="">All completeness</option>
          <option value="false">Complete</option>
          <option value="true">Dirty</option>
        </select>
        <input value={metricSlug} onChange={event => resetPage(setMetricSlug, event.target.value)} className="tk-input" placeholder="Metric slug" />
        <input value={category} onChange={event => resetPage(setCategory, event.target.value)} className="tk-input" placeholder="Category" />
        <div className="grid gap-2 sm:grid-cols-2 md:col-span-3 xl:col-span-1">
          <input type="date" value={dateFrom} onChange={event => resetPage(setDateFrom, event.target.value)} className="tk-input" aria-label="Score date from" />
          <input type="date" value={dateTo} onChange={event => resetPage(setDateTo, event.target.value)} className="tk-input" aria-label="Score date to" />
        </div>
      </div>

      {loading ? <div className="rounded-lg border border-surface-border bg-surface-tertiary p-4 text-sm text-ink-secondary">Loading score snapshot history...</div> : null}
      {error ? <div className="rounded-lg border border-rag-red/20 bg-rag-red/10 p-4 text-sm text-rag-red">{error}</div> : null}
      {!loading && !error && !accountSnapshots.length ? <div className="rounded-lg border border-dashed border-surface-border bg-surface-tertiary p-4 text-sm text-ink-secondary">No score snapshots have been recorded yet.</div> : null}

      {accountSnapshots.length ? <div className="mb-5 rounded-lg border border-surface-border p-4">
        <div className="flex h-28 items-end gap-3">
          {oldestFirst.map((snapshot, index) => {
            const previous = oldestFirst[index - 1]
            const changedVersion = previous && previous.calculatorVersion !== snapshot.calculatorVersion
            return (
              <div key={snapshot.id} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                {changedVersion ? (
                  <div className="flex h-full flex-col items-center justify-end">
                    <span className="mb-1 whitespace-nowrap text-[10px] font-semibold text-brand-orange">{previous.calculatorVersion} {'->'} {snapshot.calculatorVersion}</span>
                    <span className="h-20 border-l border-dashed border-brand-orange" />
                  </div>
                ) : (
                  <div className="w-full rounded-t-md bg-blue-tint-40" style={{ height: `${Math.max(20, snapshot.overall)}%` }} />
                )}
                <span className="text-[10px] text-ink-secondary">{formatDate(snapshot.timestamp)}</span>
              </div>
            )
          })}
        </div>
      </div> : null}

      <div className="space-y-3">
        {accountSnapshots.map(snapshot => (
          <article key={snapshot.id} className="grid gap-3 rounded-lg border border-surface-border p-3 md:grid-cols-[120px_1fr_auto] md:items-center">
            <div className="flex h-12 items-end gap-1">
              {Object.values(snapshot.dimensions).slice(0, 6).map((value, index) => (
                <span key={index} className="w-5 rounded-t-sm bg-brand-blue" style={{ height: `${Math.max(12, value / 2)}px` }} />
              ))}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-2xl font-bold text-ink">{snapshot.overall}</span>
                <span className="rounded-full bg-blue-tint-20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-brand-blue">{snapshot.calculatorVersion}</span>
                <span className="text-xs text-ink-secondary">{formatRelative(snapshot.timestamp)}</span>
              </div>
              <p className="text-xs text-ink-secondary">Changed by {snapshot.changedByName}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={cn('tk-button-secondary', selected.includes(snapshot.id) ? 'border-brand-blue text-brand-blue' : '')} onClick={() => toggle(snapshot.id)}>
                <GitCompare className="h-4 w-4" />
                Compare
              </button>
              <Link to={`/accounts/${accountId}?tab=timeline`} className="tk-button-secondary">Timeline</Link>
            </div>
          </article>
        ))}
      </div>

      {accountSnapshots.length ? (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-surface-border bg-white p-3">
          <button className="tk-button-secondary px-3 py-2" disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-ink-secondary">Page {page} of {pages}</span>
          <button className="tk-button-secondary px-3 py-2" disabled={page >= pages} onClick={() => setPage(value => Math.min(pages, value + 1))}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {compare.length === 2 ? (
        <div className="mt-5 overflow-hidden rounded-lg border border-surface-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-tertiary text-xs font-semibold uppercase tracking-wider text-ink-secondary">
              <tr>
                <th className="px-4 py-3">Dimension</th>
                <th className="px-4 py-3">{formatDate(compare[0].timestamp)}</th>
                <th className="px-4 py-3">{formatDate(compare[1].timestamp)}</th>
                <th className="px-4 py-3">Delta</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(new Set(['overall', ...Object.keys(compare[0].dimensions), ...Object.keys(compare[1].dimensions)])).map(key => {
                const first = Number(key === 'overall' ? compare[0].overall : compare[0].dimensions[key] ?? 0)
                const second = Number(key === 'overall' ? compare[1].overall : compare[1].dimensions[key] ?? 0)
                const changed = first !== second
                return (
                  <tr key={key} className="border-t border-surface-border">
                    <td className="px-4 py-3 font-medium text-ink">{dimensionLabels[key] ?? key}</td>
                    <td className={cn('px-4 py-3', changed ? 'font-semibold text-brand-orange' : 'text-ink-secondary')}>{first}</td>
                    <td className={cn('px-4 py-3', changed ? 'font-semibold text-brand-orange' : 'text-ink-secondary')}>{second}</td>
                    <td className={cn('px-4 py-3', changed ? 'font-semibold text-brand-orange' : 'text-ink-secondary')}>{rowDelta(first, second)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}
