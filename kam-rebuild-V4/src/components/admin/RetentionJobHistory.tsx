import { History, Play } from 'lucide-react'
import { toast } from 'sonner'
import { runRetentionJob } from '@/services/timelineRetention'
import { useIntegrationStore } from '@/stores/integrationStore'
import { formatRelative } from '@/utils/formatters'

export function RetentionJobHistory() {
  const runs = useIntegrationStore(state => state.retentionRuns)

  async function runNow() {
    const report = await runRetentionJob()
    toast[report.status === 'success' ? 'success' : 'error'](report.message)
  }

  return (
    <section className="tk-card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Retention Enforcement</p>
          <h2 className="text-base font-semibold text-ink">Retention Job History</h2>
          <p className="mt-1 text-xs text-ink-secondary">Scheduled nightly at 02:00 UTC. Immutable entries are skipped.</p>
        </div>
        <button className="tk-button-secondary" onClick={runNow}>
          <Play className="h-4 w-4" />
          Run now
        </button>
      </div>
      <div className="space-y-2">
        {runs.length ? runs.map(run => (
          <div key={run.id} className="rounded-lg border border-surface-border p-3 text-sm">
            <p className="font-semibold text-ink">{run.status} | archived {run.archived} | deleted {run.deleted}</p>
            <p className="mt-1 text-xs text-ink-secondary">{formatRelative(run.timestamp)} | {run.message}</p>
          </div>
        )) : (
          <div className="flex items-center gap-2 rounded-lg border border-surface-border p-3 text-sm text-ink-secondary">
            <History className="h-4 w-4" />
            No retention jobs have run yet.
          </div>
        )}
      </div>
    </section>
  )
}
