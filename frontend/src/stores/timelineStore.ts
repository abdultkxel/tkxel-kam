import { create } from 'zustand'
import { TimelineComment, TimelineEntry, TimelineEventTypeConfig } from '@/types/timeline'

interface TimelineStore {
  entries: TimelineEntry[]
  comments: TimelineComment[]
  eventTypes: TimelineEventTypeConfig[]
  addEntry: (entry: TimelineEntry) => void
  addComment: (comment: TimelineComment) => void
  addAnnotation: (entry: TimelineEntry) => void
  archiveEntries: (ids: string[]) => void
  deleteEntriesWithTombstone: (ids: string[], policyId: string) => void
  upsertEventType: (config: TimelineEventTypeConfig) => void
  toggleEventType: (id: string) => void
  updateRetention: (id: string, retentionPolicy: TimelineEventTypeConfig['retentionPolicy'], retentionMonths?: number) => void
  cleanupRetainedEntries: () => void
}

export const useTimelineStore = create<TimelineStore>((set, get) => ({
  entries: [],
  comments: [],
  eventTypes: [],
  addEntry: entry => set(state => ({ entries: [entry, ...state.entries] })),
  addComment: comment => set(state => ({ comments: [...state.comments, comment] })),
  addAnnotation: entry => set(state => ({ entries: [entry, ...state.entries] })),
  archiveEntries: ids =>
    set(state => ({
      entries: state.entries.map(entry =>
        ids.includes(entry.id)
          ? {
              ...entry,
              retentionPolicy: 'archive',
              metadata: { ...(entry.metadata ?? {}), archivedAt: new Date().toISOString() },
            }
          : entry,
      ),
    })),
  deleteEntriesWithTombstone: (ids, policyId) =>
    set(state => {
      const deleted = state.entries.filter(entry => ids.includes(entry.id))
      const tombstones: TimelineEntry[] = deleted.map(entry => ({
        id: `retention-${entry.id}`,
        accountId: entry.accountId,
        eventType: 'retention_event',
        module: 'manual',
        title: 'Timeline entry deleted by retention policy',
        description: `Entry ${entry.id} was deleted by configured retention policy.`,
        performedBy: 'system',
        performedByName: 'System',
        timestamp: new Date().toISOString(),
        sourceRecordId: entry.id,
        sourceRecordType: 'timeline_entry',
        metadata: { deletedEntryId: entry.id, policyId },
        isSensitive: false,
        isSystemGenerated: true,
        isImmutable: true,
      }))

      return {
        entries: [...tombstones, ...state.entries.filter(entry => !ids.includes(entry.id))],
      }
    }),
  upsertEventType: config =>
    set(state => ({
      eventTypes: state.eventTypes.some(item => item.id === config.id)
        ? state.eventTypes.map(item => (item.id === config.id ? config : item))
        : [config, ...state.eventTypes],
    })),
  toggleEventType: id =>
    set(state => ({
      eventTypes: state.eventTypes.map(item => (item.id === id ? { ...item, active: !item.active } : item)),
    })),
  updateRetention: (id, retentionPolicy, retentionMonths) =>
    set(state => ({
      eventTypes: state.eventTypes.map(item => (item.id === id ? { ...item, retentionPolicy, retentionMonths } : item)),
    })),
  cleanupRetainedEntries: () => {
    const configs = get().eventTypes
    const now = Date.now()
    set(state => ({
      entries: state.entries.filter(entry => {
        const config = configs.find(item => item.eventType === entry.eventType)
        if (!config || config.retentionPolicy !== 'delete' || !config.retentionMonths) return true
        const expiry = new Date(entry.timestamp).getTime() + config.retentionMonths * 30 * 24 * 60 * 60 * 1000
        return expiry > now
      }),
    }))
  },
}))
