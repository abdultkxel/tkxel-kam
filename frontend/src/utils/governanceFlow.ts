import { GovernanceEventRecord, GovernanceEventStatus, GovernanceEventType } from '@/types/governance'

export type GovernanceSortKey = 'event_date' | 'account' | 'type' | 'status' | 'updated_at'
export type GovernanceSortDirection = 'asc' | 'desc'

export interface GovernanceEventFilters {
  search?: string
  accountId?: string
  engagementId?: string
  ownerId?: string
  attendee?: string
  source?: string
  dateFrom?: string
  dateTo?: string
  status?: GovernanceEventStatus | 'all'
  governanceType?: GovernanceEventType | 'all'
  mineOnly?: boolean
  currentUserId?: string
}

export function filterAndSortGovernanceEvents(
  events: GovernanceEventRecord[],
  filters: GovernanceEventFilters,
  sortKey: GovernanceSortKey,
  direction: GovernanceSortDirection,
) {
  return sortGovernanceEvents(filterGovernanceEvents(events, filters), sortKey, direction)
}

export function filterGovernanceEvents(events: GovernanceEventRecord[], filters: GovernanceEventFilters) {
  const search = filters.search?.trim().toLowerCase() ?? ''

  return events.filter(event => {
    if (filters.accountId && event.accountId !== filters.accountId) return false
    if (filters.engagementId && event.engagementId !== filters.engagementId) return false
    if (filters.ownerId && event.ownerId !== filters.ownerId) return false
    if (filters.attendee && !event.attendeeEmails.some(email => email.includes(filters.attendee!.trim().toLowerCase()))) return false
    if (filters.source && event.source !== filters.source) return false
    if (filters.dateFrom && new Date(event.date) < startOfLocalDay(filters.dateFrom)) return false
    if (filters.dateTo && new Date(event.date) > endOfLocalDay(filters.dateTo)) return false
    if (filters.mineOnly && filters.currentUserId && event.ownerId !== filters.currentUserId) return false
    if (filters.status && filters.status !== 'all' && event.status !== filters.status) return false
    if (filters.governanceType && filters.governanceType !== 'all' && event.type !== filters.governanceType) return false
    if (!search) return true
    return searchableGovernanceText(event).includes(search)
  })
}

export function sortGovernanceEvents(events: GovernanceEventRecord[], sortKey: GovernanceSortKey, direction: GovernanceSortDirection) {
  const multiplier = direction === 'asc' ? 1 : -1

  return [...events].sort((a, b) => {
    const comparison = compareSortValue(sortValue(a, sortKey), sortValue(b, sortKey))
    return comparison * multiplier
  })
}

function searchableGovernanceText(event: GovernanceEventRecord) {
  return [
    event.accountName,
    event.ownerName,
    event.type,
    event.status,
    event.agenda,
    ...event.attendeeEmails,
    ...event.actionItems,
    ...event.notes.map(note => note.body),
    ...event.decisions.map(decision => decision.decisionText),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function sortValue(event: GovernanceEventRecord, sortKey: GovernanceSortKey) {
  if (sortKey === 'event_date') return new Date(event.date).getTime()
  if (sortKey === 'updated_at') return new Date(event.updatedAt ?? event.createdAt ?? event.date).getTime()
  if (sortKey === 'account') return event.accountName.toLowerCase()
  if (sortKey === 'type') return event.type.toLowerCase()
  return event.status.toLowerCase()
}

function compareSortValue(a: string | number, b: string | number) {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

function startOfLocalDay(date: string) {
  return new Date(`${date}T00:00:00`)
}

function endOfLocalDay(date: string) {
  return new Date(`${date}T23:59:59.999`)
}
