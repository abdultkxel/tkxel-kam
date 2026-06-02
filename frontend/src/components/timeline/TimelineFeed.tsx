import { CalendarDays, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { VariableSizeList, ListChildComponentProps } from 'react-window'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { AddNoteModal } from '@/components/timeline/AddNoteModal'
import { TimelineCard } from '@/components/timeline/TimelineCard'
import { TimelineFilters } from '@/components/timeline/TimelineFilters'
import { TimelineAISearch } from '@/components/ai/TimelineAISearch'
import { useAuth } from '@/contexts/AuthContext'
import { useTimelineFilters } from '@/hooks/useTimelineFilters'
import { getAccountTimeline } from '@/services/timeline'
import { TimelineEntry } from '@/types/timeline'

interface ItemData {
  entries: TimelineEntry[]
  searchQuery: string
  flashId: string
}

function Row({ index, style, data }: ListChildComponentProps<ItemData>) {
  const entry = data.entries[index]
  return (
    <div style={{ ...style, paddingBottom: 12 }}>
      <TimelineCard entry={entry} searchQuery={data.searchQuery} flash={data.flashId === entry.id} />
    </div>
  )
}

export function TimelineFeed({ accountId }: { accountId: string }) {
  const [isLoading, setIsLoading] = useState(true)
  const [isPageLoading, setIsPageLoading] = useState(false)
  const [error, setError] = useState('')
  const [entries, setEntries] = useState<TimelineEntry[]>([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [sortDirection, setSortDirection] = useState<'newest' | 'oldest'>('newest')
  const [noteOpen, setNoteOpen] = useState(false)
  const [flashId, setFlashId] = useState('')
  const listRef = useRef<VariableSizeList>(null)
  const { token } = useAuth()
  const { filters, setFilter, clearAll } = useTimelineFilters()
  const eventTypeFilter = filters.eventTypes[0] ?? ''
  const moduleFilter = filters.modules[0] ?? ''

  useEffect(() => {
    if (!token) return
    let active = true
    setIsLoading(true)
    setError('')
    getAccountTimeline(token, accountId, {
      search: filters.search,
      event_type: eventTypeFilter,
      module: moduleFilter,
      owner_id: filters.owner,
      date_from: filters.dateFrom ? `${filters.dateFrom}T00:00:00Z` : undefined,
      date_to: filters.dateTo ? `${filters.dateTo}T23:59:59Z` : undefined,
      show_sensitive: filters.showSensitive,
      direction: sortDirection === 'newest' ? 'desc' : 'asc',
      page: 1,
      page_size: 100,
    })
      .then(result => {
        if (!active) return
        setEntries(result.items)
        setPage(result.page)
        setPages(result.pages)
      })
      .catch(err => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Timeline could not be loaded')
        setEntries([])
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => {
      active = false
    }
  }, [accountId, eventTypeFilter, filters.dateFrom, filters.dateTo, filters.owner, filters.search, filters.showSensitive, moduleFilter, sortDirection, token])

  async function loadMore() {
    if (!token || isPageLoading || page >= pages) return
    setIsPageLoading(true)
    setError('')
    try {
      const result = await getAccountTimeline(token, accountId, {
        search: filters.search,
        event_type: eventTypeFilter,
        module: moduleFilter,
        owner_id: filters.owner,
        date_from: filters.dateFrom ? `${filters.dateFrom}T00:00:00Z` : undefined,
        date_to: filters.dateTo ? `${filters.dateTo}T23:59:59Z` : undefined,
        show_sensitive: filters.showSensitive,
        direction: sortDirection === 'newest' ? 'desc' : 'asc',
        page: page + 1,
        page_size: 100,
      })
      setEntries(items => [...items, ...result.items])
      setPage(result.page)
      setPages(result.pages)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'More timeline events could not be loaded')
    } finally {
      setIsPageLoading(false)
    }
  }

  function sizeFor(index: number) {
    const entry = entries[index]
    if (entry && !entry.isSystemGenerated) return 380
    return entry?.beforeValue || entry?.afterValue ? 260 : 190
  }

  function handleAdded(entry: TimelineEntry) {
    setSortDirection('newest')
    setEntries(items => [entry, ...items.filter(item => item.id !== entry.id)])
    setFlashId(entry.id)
    window.setTimeout(() => listRef.current?.scrollToItem(0, 'start'), 0)
    window.setTimeout(() => setFlashId(''), 1400)
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    )
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">FR-84 Account Timeline</p>
          <h2 className="font-display text-2xl font-bold text-ink">Account history</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="tk-button-secondary" onClick={() => setSortDirection(value => (value === 'newest' ? 'oldest' : 'newest'))}>
            {sortDirection === 'newest' ? 'Newest first' : 'Oldest first'}
          </button>
          <button className="tk-button-primary" onClick={() => setNoteOpen(true)}>
            <Plus className="h-4 w-4" />
            Add event
          </button>
        </div>
      </div>

      <TimelineAISearch accountId={accountId} />

      <TimelineFilters filters={filters} setFilter={setFilter} clearAll={clearAll} />

      {error ? (
        <div className="rounded-lg border border-rag-red/20 bg-rag-red/10 p-4 text-sm font-medium text-rag-red">
          {error}
        </div>
      ) : null}

      {entries.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          heading={filters.search ? 'No events match your search' : 'No timeline events yet'}
          body={filters.search ? 'Try different keywords or clear filters.' : 'Events are logged automatically as the account evolves.'}
          action={{ label: 'Add event', onClick: () => setNoteOpen(true) }}
        />
      ) : (
        <VariableSizeList
          ref={listRef}
          height={640}
          width="100%"
          itemCount={entries.length}
          itemSize={sizeFor}
          itemData={{ entries, searchQuery: filters.search, flashId }}
          overscanCount={8}
        >
          {Row}
        </VariableSizeList>
      )}

      {entries.length > 0 && page < pages ? (
        <div className="flex justify-center">
          <button type="button" className="tk-button-secondary" disabled={isPageLoading} onClick={loadMore}>
            {isPageLoading ? 'Loading...' : 'Load more'}
          </button>
        </div>
      ) : null}

      <AddNoteModal accountId={accountId} open={noteOpen} onOpenChange={setNoteOpen} onAdded={handleAdded} />
    </section>
  )
}
