import { AlertTriangle, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAuth } from '@/contexts/AuthContext'
import { Escalation, listEscalations } from '@/services/contentGovernance'
import { formatDate } from '@/utils/formatters'

export function EscalationLog() {
  const { token } = useAuth()
  const [escalations, setEscalations] = useState<Escalation[]>([])
  const [loading, setLoading] = useState(Boolean(token))
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      setEscalations([])
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    setError('')
    const params = new URLSearchParams({ page: '1', page_size: '25', sort: 'updated_at', direction: 'desc' })
    listEscalations(token, params)
      .then(result => {
        if (active) setEscalations(result.items)
      })
      .catch(err => {
        if (!active) return
        setEscalations([])
        setError(err instanceof Error ? err.message : 'Escalations could not load')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [token])

  if (loading) {
    return (
      <div className="inline-flex items-center gap-2 rounded-md border border-surface-border bg-surface-secondary px-3 py-2 text-xs font-semibold text-ink-secondary">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading escalations
      </div>
    )
  }

  if (error) {
    return <EmptyState icon={AlertTriangle} heading="Escalations unavailable" body={error} />
  }

  if (!escalations.length) {
    return <EmptyState icon={AlertTriangle} heading="No escalations" body="Escalations filed from account workspaces will appear here." />
  }

  return (
    <div className="space-y-3">
      {escalations.map(entry => (
        <article key={entry.id} className="tk-card border-l-[3px] border-brand-orange p-4">
          <p className="text-sm font-semibold text-ink">{entry.summary}</p>
          <p className="mt-1 text-sm text-ink-secondary">{entry.impact}</p>
          <p className="mt-2 text-xs text-ink-secondary">{formatDate(entry.updated_at)} | {entry.owner_name}</p>
        </article>
      ))}
    </div>
  )
}
