import { History, Loader2, Play, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { getRetentionActions, getRetentionPolicies, RetentionAction, RetentionPolicy, runRetentionPolicy, simulateRetentionPolicy } from '@/services/timeline'
import { formatRelative } from '@/utils/formatters'

export function RetentionJobHistory() {
  const { token } = useAuth()
  const [policies, setPolicies] = useState<RetentionPolicy[]>([])
  const [actions, setActions] = useState<RetentionAction[]>([])
  const [selectedPolicyId, setSelectedPolicyId] = useState('')
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionsLoading, setActionsLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    let active = true
    setLoading(true)
    setError('')
    Promise.all([getRetentionPolicies(token), getRetentionActions(token)])
      .then(([policyPage, actionPage]) => {
        if (!active) return
        setPolicies(policyPage.items)
        setActions(actionPage.items)
        setSelectedPolicyId(value => value || policyPage.items[0]?.id || '')
      })
      .catch(err => {
        if (active) setError(err instanceof Error ? err.message : 'Retention policies could not be loaded')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [token])

  useEffect(() => {
    if (!token || loading) return
    const timer = window.setTimeout(() => {
      setActionsLoading(true)
      getRetentionActions(token, { search, action: actionFilter || undefined })
        .then(actionPage => setActions(actionPage.items))
        .catch(err => setError(err instanceof Error ? err.message : 'Retention actions could not be loaded'))
        .finally(() => setActionsLoading(false))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [actionFilter, loading, search, token])

  async function simulate() {
    if (!token || !selectedPolicyId) return
    setRunning(true)
    try {
      const report = await simulateRetentionPolicy(token, selectedPolicyId)
      toast.success(`Simulation matched ${report.matched_count} timeline entr${report.matched_count === 1 ? 'y' : 'ies'}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Retention simulation failed')
    } finally {
      setRunning(false)
    }
  }

  async function runNow() {
    if (!token || !selectedPolicyId) return
    setRunning(true)
    try {
      const report = await runRetentionPolicy(token, selectedPolicyId)
      toast.success(`Retention run affected ${report.affected_count} timeline entr${report.affected_count === 1 ? 'y' : 'ies'}`)
      const actionPage = await getRetentionActions(token, { search, action: actionFilter || undefined })
      setActions(actionPage.items)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Retention run failed')
    } finally {
      setRunning(false)
    }
  }

  const selectedPolicy = policies.find(policy => policy.id === selectedPolicyId)

  return (
    <section className="tk-card p-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Retention Enforcement</p>
          <h2 className="text-base font-semibold text-ink">Retention Job History</h2>
          <p className="mt-1 text-xs text-ink-secondary">Server-backed retention simulation, manual execution, and local scheduled worker status.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="tk-button-secondary" disabled={running || !selectedPolicyId} onClick={simulate}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Simulate
          </button>
          <button className="tk-button-primary" disabled={running || !selectedPolicyId} onClick={runNow}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Run now
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-lg border border-surface-border p-3 text-sm text-ink-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading retention policies
        </div>
      ) : error ? (
        <div className="rounded-lg border border-rag-red/20 bg-rag-red/10 p-3 text-sm font-medium text-rag-red">{error}</div>
      ) : (
        <div className="space-y-4">
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Policy</span>
            <select className="tk-input" value={selectedPolicyId} onChange={event => setSelectedPolicyId(event.target.value)}>
              {policies.map(policy => (
                <option key={policy.id} value={policy.id}>{policy.name}</option>
              ))}
            </select>
          </label>

          {selectedPolicy ? (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-surface-border p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Scheduled</p>
                <p className="mt-1 text-sm font-semibold text-ink">{selectedPolicy.schedule_enabled ? 'Enabled' : 'Disabled'}</p>
              </div>
              <div className="rounded-lg border border-surface-border p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Last run</p>
                <p className="mt-1 text-sm font-semibold text-ink">{selectedPolicy.last_run_at ? formatRelative(selectedPolicy.last_run_at) : 'Not run yet'}</p>
              </div>
              <div className="rounded-lg border border-surface-border p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Next run</p>
                <p className="mt-1 text-sm font-semibold text-ink">{selectedPolicy.next_run_at ? formatRelative(selectedPolicy.next_run_at) : 'Not scheduled'}</p>
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-[1fr_180px]">
            <label className="block space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Search retention logs</span>
              <input className="tk-input" value={search} onChange={event => setSearch(event.target.value)} placeholder="Reason or actor" />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Action</span>
              <select className="tk-input" value={actionFilter} onChange={event => setActionFilter(event.target.value)}>
                <option value="">All actions</option>
                <option value="archive">Archive</option>
                <option value="restrict">Restrict</option>
                <option value="delete">Delete</option>
              </select>
            </label>
          </div>

          <div className="space-y-2">
            {actionsLoading ? (
              <div className="flex items-center gap-2 rounded-lg border border-surface-border p-3 text-sm text-ink-secondary">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading retention logs
              </div>
            ) : actions.length ? actions.map(action => (
              <div key={action.id} className="rounded-lg border border-surface-border p-3 text-sm">
                <p className="font-semibold text-ink">{action.status} | {action.mode} | {action.action} | affected {action.affected_count}</p>
                <p className="mt-1 text-xs text-ink-secondary">{formatRelative(action.created_at)} | {action.reason || 'No reason recorded'} | {action.actor_name}</p>
              </div>
            )) : (
              <div className="flex items-center gap-2 rounded-lg border border-surface-border p-3 text-sm text-ink-secondary">
                <History className="h-4 w-4" />
                No retention jobs have run yet.
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
