import { CalendarDays, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { VariableSizeList, ListChildComponentProps } from 'react-window'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { AddNoteModal } from '@/components/timeline/AddNoteModal'
import { TimelineCard } from '@/components/timeline/TimelineCard'
import { TimelineFilters } from '@/components/timeline/TimelineFilters'
import { TimelineAISearch } from '@/components/ai/TimelineAISearch'
import { useRole } from '@/hooks/useRole'
import { useTimeline } from '@/hooks/useTimeline'
import { useTimelineFilters } from '@/hooks/useTimelineFilters'
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
  const [sortDirection, setSortDirection] = useState<'newest' | 'oldest'>('newest')
  const [noteOpen, setNoteOpen] = useState(false)
  const [flashId, setFlashId] = useState('')
  const listRef = useRef<VariableSizeList>(null)
  const role = useRole()
  const { filters, setFilter, clearAll } = useTimelineFilters()
  const entries = useTimeline(accountId, filters, role.role, role.id, sortDirection)

  useEffect(() => {
    const timer = window.setTimeout(() => setIsLoading(false), 500)
    return () => window.clearTimeout(timer)
  }, [accountId])

  function sizeFor(index: number) {
    const entry = entries[index]
    if (entry && !entry.isSystemGenerated) return 380
    return entry?.beforeValue || entry?.afterValue ? 260 : 190
  }

  function handleAdded(entry: TimelineEntry) {
    setSortDirection('newest')
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
            Add note
          </button>
        </div>
      </div>

      <TimelineAISearch accountId={accountId} />

      <TimelineFilters filters={filters} setFilter={setFilter} clearAll={clearAll} />

      {entries.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          heading={filters.search ? 'No events match your search' : 'No timeline events yet'}
          body={filters.search ? 'Try different keywords or clear filters.' : 'Events are logged automatically as the account evolves.'}
          action={{ label: 'Add a note', onClick: () => setNoteOpen(true) }}
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

      <AddNoteModal accountId={accountId} open={noteOpen} onOpenChange={setNoteOpen} onAdded={handleAdded} />
    </section>
  )
}
