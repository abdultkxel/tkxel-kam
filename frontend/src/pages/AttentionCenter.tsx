import * as Dialog from '@radix-ui/react-dialog'
import { Bot, Check, CheckCircle2, ExternalLink, Filter, Loader2, Play, RefreshCcw, Search, ShieldAlert, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { useAuth } from '@/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'
import {
  convertSignal,
  evaluateSignals,
  explainSignal,
  getSignalEvidence,
  listAttentionSignals,
  listRecommendedPlaybooksForSignal,
  RecommendedPlaybook,
  SignalAIExplanation,
  SignalEvidence,
  SignalRead,
  updateSignalStatus,
} from '@/services/signals'
import { useAccountStore } from '@/stores/accountStore'
import { cn } from '@/utils/cn'
import { formatDate, formatRelative } from '@/utils/formatters'

export function AttentionCenter() {
  const { token } = useAuth()
  const user = useRole()
  const accounts = useAccountStore(state => state.accounts)
  const accountById = useMemo(() => new Map(accounts.map(account => [account.id, account.name])), [accounts])
  const [signals, setSignals] = useState<SignalRead[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [accountId, setAccountId] = useState('')
  const [severity, setSeverity] = useState('')
  const [status, setStatus] = useState('')
  const [signalType, setSignalType] = useState('')
  const [sort, setSort] = useState<'due_at' | 'created_at' | 'severity' | 'status' | 'updated_at'>('due_at')
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<SignalRead | null>(null)
  const pageSize = 12
  const readOnly = user.role === 'leadership' || user.role === 'leadership_viewer'

  useEffect(() => {
    if (!token) return
    let cancelled = false
    setLoading(true)
    setError('')
    listAttentionSignals(token, {
      page,
      page_size: pageSize,
      search,
      account_id: accountId,
      severity,
      status,
      signal_type: signalType,
      sort,
      direction,
    })
      .then(response => {
        if (cancelled) return
        setSignals(response.items)
        setTotal(response.total)
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Attention Center could not load')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [accountId, direction, page, search, severity, signalType, sort, status, token])

  const metrics = useMemo(() => {
    const critical = signals.filter(signal => signal.severity === 'critical').length
    const overdue = signals.filter(signal => signal.due_at && new Date(signal.due_at) < new Date()).length
    const accepted = signals.filter(signal => signal.status === 'accepted').length
    return { critical, overdue, accepted }
  }, [signals])

  function clearFilters() {
    setSearch('')
    setAccountId('')
    setSeverity('')
    setStatus('')
    setSignalType('')
    setSort('due_at')
    setDirection('asc')
    setPage(1)
  }

  async function refreshSignals() {
    if (!token || readOnly) return
    setRefreshing(true)
    try {
      await evaluateSignals(token, { trigger_source: 'attention_center' })
      toast.success('Signals evaluated')
      setPage(1)
      const response = await listAttentionSignals(token, { page: 1, page_size: pageSize, sort, direction })
      setSignals(response.items)
      setTotal(response.total)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Signals could not be evaluated')
    } finally {
      setRefreshing(false)
    }
  }

  function upsert(signal: SignalRead) {
    setSignals(items => items.map(item => (item.id === signal.id ? signal : item)))
    setSelected(current => (current?.id === signal.id ? signal : current))
  }

  async function changeStatus(signal: SignalRead, nextStatus: SignalRead['status'], reason?: string) {
    if (!token || readOnly) return
    try {
      const updated = await updateSignalStatus(token, signal.id, nextStatus, reason)
      upsert(updated)
      toast.success(`Signal marked ${nextStatus.replace('_', ' ')}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Signal could not be updated')
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Signals and SLA attention"
        title="Attention Center"
        description="Active deterministic signals, evidence, owners, SLA timing, and lifecycle actions."
        actions={
          <>
            <button className="tk-button-secondary" onClick={clearFilters}>
              <Filter className="h-4 w-4" />
              Clear filters
            </button>
            <button className="tk-button-primary" disabled={refreshing || readOnly || !token} onClick={refreshSignals}>
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              Evaluate
            </button>
          </>
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        <SignalMetric label="Critical" value={metrics.critical} tone="critical" />
        <SignalMetric label="Overdue" value={metrics.overdue} tone="warning" />
        <SignalMetric label="Accepted" value={metrics.accepted} tone="muted" />
      </div>

      <section className="tk-card mt-5 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          <label className="space-y-1 xl:col-span-2">
            <span className="tk-label text-xs">Search</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
              <input className="tk-input pl-9" value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} placeholder="Search signal, reason, owner" />
            </div>
          </label>
          <label className="space-y-1">
            <span className="tk-label text-xs">Account</span>
            <select className="tk-input" value={accountId} onChange={event => { setAccountId(event.target.value); setPage(1) }}>
              <option value="">All accounts</option>
              {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="tk-label text-xs">Severity</span>
            <select className="tk-input" value={severity} onChange={event => { setSeverity(event.target.value); setPage(1) }}>
              <option value="">Any severity</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="tk-label text-xs">Status</span>
            <select className="tk-input" value={status} onChange={event => { setStatus(event.target.value); setPage(1) }}>
              <option value="">Active statuses</option>
              <option value="new">New</option>
              <option value="reviewed">Reviewed</option>
              <option value="accepted">Accepted</option>
              <option value="converted">Converted</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="tk-label text-xs">Signal type</span>
            <input className="tk-input" value={signalType} onChange={event => { setSignalType(event.target.value); setPage(1) }} placeholder="weak_metric" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="tk-label text-xs">Sort</span>
              <select className="tk-input" value={sort} onChange={event => setSort(event.target.value as typeof sort)}>
                <option value="due_at">Due</option>
                <option value="created_at">Created</option>
                <option value="updated_at">Updated</option>
                <option value="severity">Severity</option>
                <option value="status">Status</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="tk-label text-xs">Order</span>
              <select className="tk-input" value={direction} onChange={event => setDirection(event.target.value as typeof direction)}>
                <option value="asc">Asc</option>
                <option value="desc">Desc</option>
              </select>
            </label>
          </div>
        </div>
      </section>

      <section className="mt-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Attention queue</p>
            <h2 className="text-base font-semibold text-ink">{total} active signals</h2>
          </div>
          <div className="flex gap-2">
            <button className="tk-button-secondary" disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</button>
            <button className="tk-button-secondary" disabled={page * pageSize >= total} onClick={() => setPage(value => value + 1)}>Next</button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-lg border border-surface-border bg-surface-tertiary p-4 text-sm font-semibold text-ink-secondary">Loading attention queue...</div>
        ) : error ? (
          <div className="rounded-lg border border-rag-red/20 bg-rag-red/10 p-4 text-sm font-semibold text-rag-red">{error}</div>
        ) : signals.length === 0 ? (
          <div className="tk-card">
            <EmptyState icon={ShieldAlert} heading="No active signals match these filters" body="Evaluate signals or clear filters to review the current attention queue." action={{ label: 'Clear filters', onClick: clearFilters }} />
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-surface-border bg-white">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="bg-surface-tertiary text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                <tr>
                  <th className="px-4 py-3">Signal</th>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Due</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {signals.map(signal => (
                  <tr key={signal.id} className="border-t border-surface-border align-top">
                    <td className="px-4 py-3">
                      <button className="text-left font-semibold text-ink hover:text-brand-blue" onClick={() => setSelected(signal)}>{signal.title}</button>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink-secondary">{signal.detail}</p>
                      <p className="mt-2 text-[11px] text-ink-tertiary">{formatRelative(signal.created_at)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Link className="font-semibold text-brand-blue hover:underline" to={`/accounts/${signal.account_id}?tab=health`}>
                        {accountById.get(signal.account_id) ?? signal.account_id}
                      </Link>
                    </td>
                    <td className="px-4 py-3"><SeverityBadge severity={signal.severity} /></td>
                    <td className="px-4 py-3"><StatusBadge status={signal.status} /></td>
                    <td className="px-4 py-3 text-ink-secondary">{signal.owner_name ?? 'Unassigned'}</td>
                    <td className="px-4 py-3 text-ink-secondary">{signal.due_at ? formatDate(signal.due_at) : 'Not set'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button className="tk-button-secondary" onClick={() => setSelected(signal)}>Open</button>
                        <button className="tk-button-secondary" disabled={readOnly || signal.status !== 'new'} onClick={() => changeStatus(signal, 'reviewed')}>Review</button>
                        <button className="tk-button-secondary" disabled={readOnly || ['resolved', 'dismissed'].includes(signal.status)} onClick={() => changeStatus(signal, 'resolved')}>Resolve</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <SignalDrawer
        signal={selected}
        token={token}
        readOnly={readOnly}
        onOpenChange={open => !open && setSelected(null)}
        onStatus={changeStatus}
        onConverted={signal => {
          upsert({ ...signal, status: 'converted' })
          toast.success('Signal converted')
        }}
      />
    </div>
  )
}

function SignalDrawer({ signal, token, readOnly, onOpenChange, onStatus, onConverted }: { signal: SignalRead | null; token: string | null; readOnly: boolean; onOpenChange: (open: boolean) => void; onStatus: (signal: SignalRead, status: SignalRead['status'], reason?: string) => Promise<void>; onConverted: (signal: SignalRead) => void }) {
  const [evidence, setEvidence] = useState<SignalEvidence | null>(null)
  const [recommendations, setRecommendations] = useState<RecommendedPlaybook[]>([])
  const [explanation, setExplanation] = useState<SignalAIExplanation | null>(null)
  const [loading, setLoading] = useState(false)
  const [explaining, setExplaining] = useState(false)

  useEffect(() => {
    if (!token || !signal) return
    let cancelled = false
    setLoading(true)
    setEvidence(null)
    setRecommendations([])
    setExplanation(null)
    Promise.all([
      getSignalEvidence(token, signal.id).catch(() => null),
      listRecommendedPlaybooksForSignal(token, signal.id).catch(() => []),
    ])
      .then(([nextEvidence, nextRecommendations]) => {
        if (cancelled) return
        setEvidence(nextEvidence)
        setRecommendations(nextRecommendations)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [signal?.id, token])

  async function explain() {
    if (!token || !signal) return
    setExplaining(true)
    try {
      setExplanation(await explainSignal(token, signal.id))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Explanation could not be generated')
    } finally {
      setExplaining(false)
    }
  }

  async function convertToTask() {
    if (!token || !signal || readOnly) return
    try {
      await convertSignal(token, signal.id, { target_type: 'task', note: 'Converted from Attention Center.' })
      onConverted(signal)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Signal could not be converted')
    }
  }

  return (
    <Dialog.Root open={Boolean(signal)} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/30" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex h-[100dvh] w-full max-w-[720px] flex-col overflow-hidden border-l border-surface-border bg-white shadow-panel">
          {signal ? (
            <>
              <div className="border-b border-surface-border p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Dialog.Title className="text-xl font-semibold text-ink">{signal.title}</Dialog.Title>
                    <Dialog.Description className="mt-2 text-sm leading-6 text-ink-secondary">{signal.detail}</Dialog.Description>
                  </div>
                  <Dialog.Close className="tk-icon-button" aria-label="Close signal drawer">
                    <X className="h-4 w-4" />
                  </Dialog.Close>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <SeverityBadge severity={signal.severity} />
                  <StatusBadge status={signal.status} />
                  <span className="rounded-full border border-surface-border bg-surface-secondary px-3 py-1 text-[11px] font-semibold text-ink-secondary">
                    {signal.signal_type}
                  </span>
                </div>
              </div>

              <div className="flex-1 space-y-5 overflow-y-auto p-5">
                {loading ? <div className="rounded-lg border border-surface-border bg-surface-tertiary p-4 text-sm text-ink-secondary">Loading signal context...</div> : null}

                <section>
                  <h3 className="text-sm font-semibold text-ink">Reason codes</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {signal.reason_codes.length ? signal.reason_codes.map(reason => (
                      <span key={reason.code} className="rounded-full border border-surface-border bg-white px-3 py-1 text-xs font-semibold text-ink-secondary">{reason.label}</span>
                    )) : <span className="text-sm text-ink-secondary">No reason codes captured.</span>}
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-ink">Evidence</h3>
                  <div className="mt-3 space-y-2">
                    {(evidence?.evidence.length ? evidence.evidence : signal.evidence_json).map((item, index) => (
                      <div key={index} className="rounded-lg border border-surface-border bg-surface-secondary p-3 text-sm">
                        <p className="font-semibold text-ink">{String(item.label ?? item.type ?? `Evidence ${index + 1}`)}</p>
                        <p className="mt-1 break-words text-xs leading-5 text-ink-secondary">{String(item.value ?? JSON.stringify(item))}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-ink">AI explanation</h3>
                    <button className="tk-button-secondary" onClick={explain} disabled={explaining}>
                      {explaining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                      Explain
                    </button>
                  </div>
                  {explanation ? (
                    <div className="mt-3 rounded-lg border border-blue-tint-20 bg-blue-tint-20 p-4 text-sm leading-6 text-ink-secondary">
                      {explanation.explanation}
                    </div>
                  ) : null}
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-ink">Recommended playbooks</h3>
                  <div className="mt-3 space-y-3">
                    {recommendations.length ? recommendations.map(recommendation => (
                      <div key={recommendation.template.id} className="rounded-lg border border-surface-border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-ink">{recommendation.template.name}</p>
                            <p className="mt-1 text-xs leading-5 text-ink-secondary">{recommendation.rationale}</p>
                          </div>
                          <span className="rounded-full bg-blue-tint-20 px-2 py-1 text-[11px] font-semibold text-brand-blue">{recommendation.match_score}</span>
                        </div>
                      </div>
                    )) : <p className="text-sm text-ink-secondary">No mapped playbooks yet.</p>}
                  </div>
                </section>
              </div>

              <div className="border-t border-surface-border p-4">
                <div className="flex flex-wrap gap-2">
                  <Link className="tk-button-secondary" to={`/accounts/${signal.account_id}?tab=health`}>
                    <ExternalLink className="h-4 w-4" />
                    Account Health
                  </Link>
                  <button className="tk-button-secondary" disabled={readOnly || signal.status !== 'new'} onClick={() => onStatus(signal, 'reviewed')}>
                    <Check className="h-4 w-4" />
                    Review
                  </button>
                  <button className="tk-button-secondary" disabled={readOnly || ['resolved', 'dismissed'].includes(signal.status)} onClick={() => onStatus(signal, 'accepted')}>
                    <CheckCircle2 className="h-4 w-4" />
                    Accept
                  </button>
                  <button className="tk-button-secondary" disabled={readOnly || ['resolved', 'dismissed'].includes(signal.status)} onClick={convertToTask}>
                    <Play className="h-4 w-4" />
                    Convert
                  </button>
                  <button className="tk-button-secondary" disabled={readOnly || ['resolved', 'dismissed'].includes(signal.status)} onClick={() => onStatus(signal, 'dismissed', 'Dismissed from Attention Center.')}>
                    <X className="h-4 w-4" />
                    Dismiss
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function SignalMetric({ label, value, tone }: { label: string; value: number; tone: 'critical' | 'warning' | 'muted' }) {
  const classes = {
    critical: 'border-rag-red/20 bg-rag-red/10 text-rag-red',
    warning: 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange',
    muted: 'border-surface-border bg-white text-brand-blue',
  }[tone]
  return (
    <div className={`rounded-lg border p-4 ${classes}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider">{label}</p>
      <p className="mt-2 font-display text-3xl font-bold">{value}</p>
    </div>
  )
}

function SeverityBadge({ severity }: { severity: SignalRead['severity'] }) {
  const className = severity === 'critical' ? 'border-rag-red/20 bg-rag-red/10 text-rag-red' : severity === 'warning' ? 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange' : 'border-blue-tint-20 bg-blue-tint-20 text-brand-blue'
  return <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${className}`}>{severity}</span>
}

function StatusBadge({ status }: { status: SignalRead['status'] }) {
  return <span className={cn('rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider', status === 'new' ? 'border-blue-tint-20 bg-blue-tint-20 text-brand-blue' : 'border-surface-border bg-surface-secondary text-ink-secondary')}>{status}</span>
}
