import { Download, Loader2, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import {
  AdminAuditLog,
  AdminErrorLog,
  AdminJobLog,
  AdminSystemHealth,
  exportAdminAuditLogs,
  getAdminAuditLogs,
  getAdminErrorLogs,
  getAdminJobLogs,
  getAdminSystemHealth,
} from '@/services/adminAccess'
import { formatDate } from '@/utils/formatters'

function downloadText(filename: string, text: string) {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}

function HealthPill({ status }: { status: string }) {
  const tone = status === 'healthy' ? 'bg-rag-green/10 text-rag-green' : status === 'degraded' ? 'bg-brand-orange/10 text-brand-orange' : 'bg-rag-red/10 text-rag-red'
  return <span className={`rounded-full px-2 py-1 text-[11px] font-bold uppercase tracking-wider ${tone}`}>{status}</span>
}

export function AdminAuditPanel() {
  const { token } = useAuth()
  const [health, setHealth] = useState<AdminSystemHealth | null>(null)
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([])
  const [jobLogs, setJobLogs] = useState<AdminJobLog[]>([])
  const [errorLogs, setErrorLogs] = useState<AdminErrorLog[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    let active = true
    setLoading(true)
    setError('')
    Promise.all([
      getAdminSystemHealth(token),
      getAdminAuditLogs(token, { page: 1, page_size: 8 }),
      getAdminJobLogs(token, { page: 1, page_size: 5 }),
      getAdminErrorLogs(token, { page: 1, page_size: 5 }),
    ])
      .then(([healthResult, auditResult, jobResult, errorResult]) => {
        if (!active) return
        setHealth(healthResult)
        setAuditLogs(auditResult.items)
        setJobLogs(jobResult.items)
        setErrorLogs(errorResult.items)
      })
      .catch(err => {
        if (active) setError(err instanceof Error ? err.message : 'Audit data could not be loaded')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [token])

  async function exportCsv() {
    if (!token) return
    try {
      const csv = await exportAdminAuditLogs(token, { page: 1, page_size: 500 })
      downloadText('admin-audit-logs.csv', csv)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Audit export failed')
    }
  }

  return (
    <section id="audit" className="tk-card scroll-mt-24 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-ink">Audit, Jobs, and System Health</h3>
          <p className="mt-1 text-sm text-ink-secondary">Review persisted activity logs, worker outcomes, error events, and platform health.</p>
        </div>
        <button type="button" className="tk-button-secondary" onClick={() => void exportCsv()}>
          <Download className="h-4 w-4" />
          CSV
        </button>
      </div>

      {loading ? <div className="mt-4 flex items-center gap-2 text-sm text-ink-secondary"><Loader2 className="h-4 w-4 animate-spin" />Loading audit data</div> : null}
      {error ? <div className="mt-4 rounded-md border border-rag-red/20 bg-rag-red/10 px-3 py-2 text-sm font-medium text-rag-red">{error}</div> : null}

      {!loading && !error ? (
        <div className="mt-4 space-y-4">
          {health ? (
            <div className="rounded-lg border border-surface-border p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-brand-blue" />
                  <p className="text-sm font-semibold text-ink">System health</p>
                </div>
                <HealthPill status={health.status} />
              </div>
              <div className="mt-3 grid gap-2">
                {health.checks.map(check => (
                  <div key={check.key} className="flex items-start justify-between gap-3 rounded-md bg-surface-secondary px-3 py-2 text-xs">
                    <span className="font-semibold capitalize text-ink">{check.key.replace(/_/g, ' ')}</span>
                    <span className="text-right text-ink-secondary">{check.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-lg border border-surface-border">
            <div className="border-b border-surface-border px-3 py-2 text-sm font-semibold text-ink">Recent audit activity</div>
            {auditLogs.length ? (
              <div className="divide-y divide-surface-border">
                {auditLogs.map(log => (
                  <div key={log.id} className="p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-ink">{log.module} / {log.action}</span>
                      <span className="text-xs text-ink-secondary">{formatDate(log.created_at)}</span>
                    </div>
                    <p className="mt-1 text-xs text-ink-secondary">{log.actor_name ?? 'System'} changed {log.entity_type}{log.entity_id ? ` ${log.entity_id}` : ''}</p>
                  </div>
                ))}
              </div>
            ) : <p className="p-3 text-sm text-ink-secondary">No audit activity found.</p>}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-lg border border-surface-border">
              <div className="border-b border-surface-border px-3 py-2 text-sm font-semibold text-ink">Recent jobs</div>
              {jobLogs.length ? (
                <div className="divide-y divide-surface-border">
                  {jobLogs.map(job => (
                    <div key={job.id} className="p-3 text-xs text-ink-secondary">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-ink">{job.job_type}</span>
                        <HealthPill status={job.status === 'complete' ? 'healthy' : job.status} />
                      </div>
                      <p className="mt-1">{job.mode} | matched {job.matched_count} | affected {job.affected_count}</p>
                    </div>
                  ))}
                </div>
              ) : <p className="p-3 text-sm text-ink-secondary">No job runs found.</p>}
            </div>

            <div className="rounded-lg border border-surface-border">
              <div className="flex items-center gap-2 border-b border-surface-border px-3 py-2 text-sm font-semibold text-ink">
                <TriangleAlert className="h-4 w-4 text-brand-orange" />
                Error logs
              </div>
              {errorLogs.length ? (
                <div className="divide-y divide-surface-border">
                  {errorLogs.map(item => (
                    <div key={item.id} className="p-3 text-xs text-ink-secondary">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-ink">{item.source}</span>
                        <HealthPill status={item.severity} />
                      </div>
                      <p className="mt-1 line-clamp-2">{item.message}</p>
                    </div>
                  ))}
                </div>
              ) : <p className="p-3 text-sm text-ink-secondary">No error logs found.</p>}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
