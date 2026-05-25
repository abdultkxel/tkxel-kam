import { AlertCircle, AlertTriangle, CheckCircle2, Eye, FilterX, X } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState } from '@/components/ui/EmptyState'
import { useRole } from '@/hooks/useRole'
import { useAccountStore } from '@/stores/accountStore'
import { useAlertStore } from '@/stores/alertStore'
import { AlertType, ProactiveAlert } from '@/types/alert'
import { cn } from '@/utils/cn'
import { formatDate, formatRelative } from '@/utils/formatters'

const alertTypes: AlertType[] = [
  'score_drop_threshold',
  'dimension_red_flag',
  'no_activity_window',
  'renewal_approaching',
  'escalation_overdue',
  'opportunity_stalled',
  'governance_overdue',
  'stakeholder_gap',
  'sentiment_decline',
]

const severityRank: Record<ProactiveAlert['severity'], number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

function severityStyle(severity: ProactiveAlert['severity']) {
  if (severity === 'critical') return 'border-rag-red/20 bg-rag-red/10 text-rag-red'
  if (severity === 'warning') return 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange'
  return 'border-brand-blue/20 bg-blue-tint-20 text-brand-blue'
}

export function AlertsOverview() {
  const [params, setParams] = useSearchParams()
  const user = useRole()
  const alerts = useAlertStore(state => state.alerts)
  const dismissAlert = useAlertStore(state => state.dismissAlert)
  const accounts = useAccountStore(state => state.accounts)
  const type = params.get('alertType') ?? ''
  const severity = params.get('alertSeverity') ?? ''
  const accountId = params.get('alertAccount') ?? ''
  const status = params.get('alertStatus') ?? 'open'
  const openCount = alerts.filter(alert => !alert.dismissedAt).length
  const criticalCount = alerts.filter(alert => !alert.dismissedAt && alert.severity === 'critical').length
  const dismissedCount = alerts.filter(alert => alert.dismissedAt).length
  const filtered = alerts
    .filter(alert => {
      if (type && alert.type !== type) return false
      if (severity && alert.severity !== severity) return false
      if (accountId && alert.accountId !== accountId) return false
      if (status === 'open' && alert.dismissedAt) return false
      if (status === 'dismissed' && !alert.dismissedAt) return false
      return true
    })
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  function clearFilters() {
    const next = new URLSearchParams(params)
    const alertFilterKeys = ['alertType', 'alertSeverity', 'alertAccount', 'alertStatus']
    alertFilterKeys.forEach(key => next.delete(key))
    next.set('alertStatus', 'open')
    setParams(next, { replace: true })
  }

  return (
    <section id="alerts" className="tk-card mt-6 overflow-hidden">
      <div className="border-b border-surface-border p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Proactive alerts</p>
            <h2 className="text-base font-semibold text-ink">Risk signals needing attention</h2>
            <p className="mt-1 text-sm text-ink-secondary">Full alert workspace consolidated into the dashboard.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-surface-border bg-surface-tertiary px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">Open</p>
              <p className="font-display text-2xl font-bold text-ink">{openCount}</p>
            </div>
            <div className="rounded-lg border border-rag-red/20 bg-rag-red/10 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-rag-red">Critical</p>
              <p className="font-display text-2xl font-bold text-rag-red">{criticalCount}</p>
            </div>
            <div className="rounded-lg border border-surface-border bg-white px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">Dismissed</p>
              <p className="font-display text-2xl font-bold text-ink">{dismissedCount}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 border-b border-surface-border bg-surface-tertiary p-4 md:grid-cols-[1fr_1fr_1fr_1fr_auto]">
        <select className="tk-input" value={type} onChange={event => setFilter('alertType', event.target.value)}>
          <option value="">All types</option>
          {alertTypes.map(item => <option key={item} value={item}>{item.replace(/_/g, ' ')}</option>)}
        </select>
        <select className="tk-input" value={severity} onChange={event => setFilter('alertSeverity', event.target.value)}>
          <option value="">All severities</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
        <select className="tk-input" value={accountId} onChange={event => setFilter('alertAccount', event.target.value)}>
          <option value="">All accounts</option>
          {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
        </select>
        <select className="tk-input" value={status} onChange={event => setFilter('alertStatus', event.target.value)}>
          <option value="open">Open</option>
          <option value="dismissed">Dismissed</option>
          <option value="">All statuses</option>
        </select>
        <button className="tk-button-secondary" onClick={clearFilters}>
          <FilterX className="h-4 w-4" />
          Clear
        </button>
      </div>

      {filtered.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-surface-border bg-white text-xs font-semibold uppercase tracking-wider text-ink-secondary">
              <tr>
                <th className="px-4 py-3">Alert</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Suggested actions</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(alert => {
                const account = accounts.find(item => item.id === alert.accountId)
                const Icon = alert.severity === 'critical' ? AlertCircle : AlertTriangle
                return (
                  <tr key={alert.id} className="border-b border-surface-border last:border-b-0">
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border', severityStyle(alert.severity))}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="font-semibold text-ink">{alert.headline}</p>
                          <p className="mt-1 line-clamp-2 text-xs text-ink-secondary">{alert.detail}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider', severityStyle(alert.severity))}>{alert.severity}</span>
                    </td>
                    <td className="px-4 py-3 text-ink-secondary">{account?.name ?? alert.accountId}</td>
                    <td className="px-4 py-3">
                      <div className="flex max-w-[300px] flex-wrap gap-1.5">
                        {alert.suggestedActions.map(action => (
                          <span key={action} className="rounded-full border border-surface-border bg-surface-tertiary px-2 py-1 text-[11px] font-semibold text-ink-secondary">{action}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-secondary">{formatRelative(alert.createdAt)}</td>
                    <td className="px-4 py-3 text-ink-secondary">
                      {alert.dismissedAt ? `Dismissed ${formatDate(alert.dismissedAt)}` : 'Open'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Link to={`/accounts/${alert.accountId}?alert=${alert.id}`} className="tk-icon-button" aria-label="View alert account">
                          <Eye className="h-4 w-4" />
                        </Link>
                        {alert.dismissedAt ? (
                          <span className="tk-icon-button text-rag-green" aria-label="Dismissed alert">
                            <CheckCircle2 className="h-4 w-4" />
                          </span>
                        ) : (
                          <button className="tk-icon-button" onClick={() => dismissAlert(alert.id, user.id)} aria-label="Dismiss alert">
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={AlertTriangle} heading="No alerts match these filters" body="Clear filters or change status to review dismissed alerts." action={{ label: 'Clear filters', onClick: clearFilters }} />
      )}
    </section>
  )
}
