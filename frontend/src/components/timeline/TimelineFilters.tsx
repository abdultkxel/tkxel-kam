import { Check, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useCapabilities } from '@/hooks/useCapabilities'
import { TimelineFilterState } from '@/hooks/useTimelineFilters'
import { FilterBar } from '@/components/ui/FilterBar'
import { getTimelineEventTypes } from '@/services/timeline'
import { TimelineEventTypeConfig, TimelineModule } from '@/types/timeline'

const modules: TimelineModule[] = ['kyc', 'scoring', 'stage', 'opportunity', 'education', 'escalation', 'governance', 'approval', 'manual']
const fixedManualEventTypes = new Set(['manual_note', 'governance_event', 'escalation_event', 'opportunity_event', 'client_education'])

export function TimelineFilters({
  filters,
  setFilter,
  clearAll,
}: {
  filters: TimelineFilterState
  setFilter: (key: string, value: string | string[] | boolean) => void
  clearAll: () => void
}) {
  const [search, setSearch] = useState(filters.search)
  const { token } = useAuth()
  const [serverEventTypes, setServerEventTypes] = useState<TimelineEventTypeConfig[]>([])
  const eventTypes = useMemo(() => serverEventTypes.filter(item => item.active && fixedManualEventTypes.has(item.eventType)), [serverEventTypes])
  const { capabilities } = useCapabilities()
  const canSeeSensitive = capabilities.can_view_sensitive_sources || capabilities.can_moderate_timeline
  const eventTypeValue = useMemo(() => filters.eventTypes[0] ?? '', [filters.eventTypes])
  const moduleValue = useMemo(() => filters.modules[0] ?? '', [filters.modules])

  useEffect(() => {
    const timer = window.setTimeout(() => setFilter('q', search), 300)
    return () => window.clearTimeout(timer)
  }, [search, setFilter])

  useEffect(() => {
    if (!token) return
    let active = true
    getTimelineEventTypes(token, 'active')
      .then(result => {
        if (active) setServerEventTypes(result.items)
      })
      .catch(() => {
        if (active) setServerEventTypes([])
      })
    return () => {
      active = false
    }
  }, [token])

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
        <input value={search} onChange={event => setSearch(event.target.value)} className="tk-input pl-10" placeholder="Search title, description, owner, or tags" />
      </div>
      <FilterBar onClear={clearAll}>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Event type</span>
          <select className="tk-input" value={eventTypeValue} onChange={event => setFilter('eventType', event.target.value ? [event.target.value] : [])}>
            <option value="">All event types</option>
            {eventTypes.map(item => (
              <option key={item.id} value={item.eventType}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Module</span>
          <select className="tk-input" value={moduleValue} onChange={event => setFilter('module', event.target.value ? [event.target.value] : [])}>
            <option value="">All modules</option>
            {modules.map(module => (
              <option key={module} value={module}>
                {module}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">From</span>
          <input type="date" className="tk-input" value={filters.dateFrom} onChange={event => setFilter('from', event.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Owner</span>
          <select className="tk-input" value={filters.owner} onChange={event => setFilter('owner', event.target.value)}>
            <option value="">Anyone</option>
          </select>
        </label>
        {canSeeSensitive ? (
          <label className="flex min-h-[44px] items-center gap-2 rounded-md border border-surface-border px-3 text-sm font-medium text-ink">
            <input type="checkbox" checked={filters.showSensitive} onChange={event => setFilter('sensitive', event.target.checked)} className="peer sr-only" />
            <span className="flex h-5 w-5 items-center justify-center rounded-sm border border-surface-border bg-white text-white peer-checked:border-brand-blue peer-checked:bg-brand-blue">
              <Check className="h-3 w-3" />
            </span>
            Show sensitive
          </label>
        ) : null}
      </FilterBar>
    </div>
  )
}
