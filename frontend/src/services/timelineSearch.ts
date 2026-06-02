import { TimelineEntry, UserRole, canViewTimelineEntry } from '@/types/timeline'

export interface ServerTimelineSearchResult {
  entries: TimelineEntry[]
  hasMore: boolean
  highlightOffsets: Record<string, Array<{ start: number; end: number }>>
}

export function shouldUseServerSearch(entries: TimelineEntry[], accountId: string) {
  return entries.filter(entry => entry.accountId === accountId).length > 1000
}

export function serverSearchTimeline({
  entries,
  accountId,
  query,
  from,
  limit = 50,
  role,
  userId,
}: {
  entries: TimelineEntry[]
  accountId: string
  query: string
  from?: string
  limit?: number
  role: UserRole
  userId: string
}): ServerTimelineSearchResult {
  const normalized = query.toLowerCase()
  const matches = entries
    .filter(entry => entry.accountId === accountId)
    .filter(entry => canViewTimelineEntry(entry, role, userId))
    .filter(entry => !from || new Date(entry.timestamp) >= new Date(from))
    .filter(entry => [entry.title, entry.description, entry.performedByName, ...(entry.tags ?? [])].join(' ').toLowerCase().includes(normalized))

  const highlightOffsets = Object.fromEntries(
    matches.slice(0, limit).map(entry => {
      const text = `${entry.title} ${entry.description}`.toLowerCase()
      const start = text.indexOf(normalized)
      return [entry.id, start >= 0 ? [{ start, end: start + normalized.length }] : []]
    }),
  )

  return {
    entries: matches.slice(0, limit),
    hasMore: matches.length > limit,
    highlightOffsets,
  }
}
