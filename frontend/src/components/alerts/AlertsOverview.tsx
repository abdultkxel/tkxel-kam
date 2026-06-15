import { AlertCircle, AlertTriangle, Eye, FilterX, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAuth } from '@/contexts/AuthContext'
import { AlertRecord, getAlerts } from '@/services/alerts'
import { useAccountStore } from '@/stores/accountStore'
import { cn } from '@/utils/cn'
import { formatDate, formatRelative } from '@/utils/formatters'

function severityStyle(severity: AlertRecord['severity']) {
  if (severity === 'critical' || severity === 'high') return 'border-rag-red/20 bg-rag-red/10 text-rag-red'
  if (severity === 'medium') return 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange'
  return 'border-brand-blue/20 bg-blue-tint-20 text-brand-blue'
}

export function AlertsOverview() {
  const { token } = useAuth()
  const [params, setParams] = useSearchParams()
  const accounts = useAccountStore(state => state.accounts)
  const [alerts, setAlerts] = useState<AlertRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const type = params.get('alertType') ?? ''
  const severity = params.get('alertSeverity') ?? ''
  const accountId = params.get('alertAccount') ?? ''
  const status = params.get('alertStatus') ?? 'active'
  const criticalCount = alerts.filter(alert => alert.severity === 'critical' || alert.severity === 'high').length

  useEffect(() => {
    if (!token) return
    let active = true
    setLoading(true)
    getAlerts(token, {
      alert_type: type,
      severity,
      account_id: accountId,
      status,
      page: 1,
      page_size: 50,
    })
      .then(result => {
        if (!active) return
        setAlerts(result.items)
        setTotal(result.total)
      })
      .catch(() => {
        if (!active) return
        setAlerts([])
        setTotal(0)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [accountId, severity, status, token, type])

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  function clearFilters() {
    const next = new URLSearchParams(params)
    ;['alertType', 'alertSeverity', 'alertAccount', 'alertStatus'].forEach(key => next.delete(key))
    next.set('alertStatus', 'active')
    setParams(next, { replace: true })
  }

  return (
    <section id="alerts" className="tk-card mt-6 overflow-hidden">
      <div className="border-b border-surface-border p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Alerts</p>
            <h2 className="text-base font-semibold text-ink">Risk signals needing attention</h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-surface-border bg-surface-tertiary px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">Matches</p>
              <p className="font-display text-2xl font-bold text-ink">{total}</p>
            </div>
            <div className="rounded-lg border border-rag-red/20 bg-rag-red/10 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-rag-red">High impact</p>
              <p className="font-display text-2xl font-bold text-rag-red">{criticalCount}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 border-b border-surface-border bg-surface-tertiary p-4 md:grid-cols-[1fr_1fr_1fr_1fr_auto]">
        <input className="tk-input" value={type} onChange={event => setFilter('alertType', event.target.value)} placeholder="Alert type" />
        <select className="tk-input" value={severity} onChange={event => setFilter('alertSeverity', event.target.value)}>
          <option value="">All severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select className="tk-input" value={accountId} onChange={event => setFilter('alertAccount', event.target.value)}>
          <option value="">All accounts</option>
          {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
        </select>
        <select className="tk-input" value={status} onChange={event => setFilter('alertStatus', event.target.value)}>
          <option value="active">Active</option>
          <option value="open">Open</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="snoozed">Snoozed</option>
          <option value="resolved">Resolved</option>
        </select>
        <button className="tk-button-secondary" onClick={clearFilters}>
          <FilterX className="h-4 w-4" />
          Clear
        </button>
      </div>

      {loading ? <div className="flex items-center gap-2 p-5 text-sm text-ink-secondary"><Loader2 className="h-4 w-4 animate-spin" />Loading alerts</div> : null}
      {!loading && alerts.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-surface-border bg-white text-xs font-semibold uppercase tracking-wider text-ink-secondary">
              <tr>
                <th className="px-4 py-3">Alert</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map(alert => {
                const Icon = alert.severity === 'critical' || alert.severity === 'high' ? AlertCircle : AlertTriangle
                return (
                  <tr key={alert.id} className="border-b border-surface-border last:border-b-0">
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border', severityStyle(alert.severity))}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="font-semibold text-ink">{alert.title}</p>
                          <p className="mt-1 line-clamp-2 text-xs text-ink-secondary">{alert.detail}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider', severityStyle(alert.severity))}>{alert.severity}</span>
                    </td>
                    <td className="px-4 py-3 text-ink-secondary">{alert.account_name ?? alert.account_id}</td>
                    <td className="px-4 py-3 text-ink-secondary">{formatRelative(alert.created_at)}</td>
                    <td className="px-4 py-3 text-ink-secondary">{alert.resolved_at ? `Resolved ${formatDate(alert.resolved_at)}` : alert.status}</td>
                    <td className="px-4 py-3">
                      {alert.account_id ? (
                        <Link to={`/accounts/${alert.account_id}?tab=overview&alert=${alert.id}`} className="tk-icon-button" aria-label="View alert account">
                          <Eye className="h-4 w-4" />
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {!loading && !alerts.length ? <EmptyState icon={AlertTriangle} heading="No alerts match these filters" body="Clear filters or change status to review more alerts." action={{ label: 'Clear filters', onClick: clearFilters }} /> : null}
    </section>
  )
}
