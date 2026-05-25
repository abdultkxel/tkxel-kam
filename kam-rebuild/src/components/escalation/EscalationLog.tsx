import { AlertTriangle } from 'lucide-react'
import { useMemo } from 'react'
import { EmptyState } from '@/components/ui/EmptyState'
import { useTimelineStore } from '@/stores/timelineStore'
import { formatDate } from '@/utils/formatters'

export function EscalationLog() {
  const entries = useTimelineStore(state => state.entries)
  const escalations = useMemo(() => entries.filter(entry => entry.module === 'escalation'), [entries])

  if (!escalations.length) {
    return <EmptyState icon={AlertTriangle} heading="No escalations" body="Escalations filed from account workspaces will appear here." />
  }

  return (
    <div className="space-y-3">
      {escalations.map(entry => (
        <article key={entry.id} className="tk-card border-l-[3px] border-brand-orange p-4">
          <p className="text-sm font-semibold text-ink">{entry.title}</p>
          <p className="mt-1 text-sm text-ink-secondary">{entry.description}</p>
          <p className="mt-2 text-xs text-ink-secondary">{formatDate(entry.timestamp)} | {entry.performedByName}</p>
        </article>
      ))}
    </div>
  )
}
