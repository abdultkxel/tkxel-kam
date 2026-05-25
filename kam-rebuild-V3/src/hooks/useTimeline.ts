import { useMemo } from 'react'
import { useTimelineStore } from '@/stores/timelineStore'
import { canViewTimelineEntry } from '@/types/timeline'
import { TimelineFilterState } from '@/hooks/useTimelineFilters'
import { UserRole } from '@/types/user'
import { serverSearchTimeline, shouldUseServerSearch } from '@/services/timelineSearch'

export function useTimeline(accountId: string, filters: TimelineFilterState, role: UserRole, userId: string, sortDirection: 'newest' | 'oldest') {
  const entries = useTimelineStore(state => state.entries)

  return useMemo(() => {
    const query = filters.search.trim().toLowerCase()
    const baseEntries = shouldUseServerSearch(entries, accountId) && query
      ? serverSearchTimeline({ entries, accountId, query, from: filters.dateFrom, role, userId }).entries
      : entries

    return baseEntries
      .filter(entry => entry.accountId === accountId)
      .filter(entry => canViewTimelineEntry(entry, role, userId))
      .filter(entry => filters.showSensitive || !entry.isSensitive)
      .filter(entry => !filters.eventTypes.length || filters.eventTypes.includes(entry.eventType))
      .filter(entry => !filters.modules.length || filters.modules.includes(entry.module))
      .filter(entry => !filters.owner || entry.performedBy === filters.owner)
      .filter(entry => !filters.dateFrom || new Date(entry.timestamp) >= new Date(filters.dateFrom))
      .filter(entry => !filters.dateTo || new Date(entry.timestamp) <= new Date(`${filters.dateTo}T23:59:59`))
      .filter(entry => {
        if (!query) return true
        const haystack = [entry.title, entry.description, entry.performedByName, ...(entry.tags ?? [])].join(' ').toLowerCase()
        return haystack.includes(query)
      })
      .sort((a, b) => {
        const delta = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        return sortDirection === 'newest' ? delta : -delta
      })
  }, [accountId, entries, filters, role, sortDirection, userId])
}
