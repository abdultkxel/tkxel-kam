import { create } from 'zustand'
import { governanceEvents } from '@/data/mock'
import {
  completeGovernanceEvent,
  createGovernanceEvent,
  generateGovernanceAgendaDraft,
  generateGovernanceBrief,
  listGovernanceEvents,
  updateGovernanceAgenda,
  updateGovernanceEvent,
} from '@/services/governance'
import {
  GovernanceEventCompleteInput,
  GovernanceEventCreateInput,
  GovernanceEventListParams,
  GovernanceEventRecord,
  GovernanceEventUpdateInput,
  GovernanceGeneratedOutputInput,
  GovernanceGeneratedOutputRecord,
} from '@/types/governance'

interface GovernanceStore {
  events: GovernanceEventRecord[]
  loading: boolean
  error: string
  loaded: boolean
  loadEvents: (token: string, params?: GovernanceEventListParams) => Promise<void>
  addEvent: (event: GovernanceEventRecord) => void
  createEvent: (token: string, payload: GovernanceEventCreateInput) => Promise<GovernanceEventRecord>
  updateEvent: (token: string, eventId: string, payload: GovernanceEventUpdateInput) => Promise<GovernanceEventRecord>
  completeEvent: (token: string, eventId: string, payload: GovernanceEventCompleteInput) => Promise<GovernanceEventRecord>
  generateAgendaDraft: (token: string, eventId: string, payload?: GovernanceGeneratedOutputInput) => Promise<GovernanceGeneratedOutputRecord>
  updateAgenda: (token: string, eventId: string, agenda: string, sourceOutputId?: string | null) => Promise<GovernanceEventRecord>
  generateBrief: (token: string, eventId: string, payload?: GovernanceGeneratedOutputInput) => Promise<GovernanceGeneratedOutputRecord>
}

export const useGovernanceStore = create<GovernanceStore>(set => ({
  events: governanceEvents,
  loading: false,
  error: '',
  loaded: false,
  loadEvents: async (token, params = { pageSize: 100 }) => {
    set({ loading: true, error: '' })
    try {
      const result = await listGovernanceEvents(token, params)
      set({ events: result.items, loaded: true })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unable to load governance events' })
    } finally {
      set({ loading: false })
    }
  },
  addEvent: event => set(state => ({ events: [event, ...state.events] })),
  createEvent: async (token, payload) => {
    const event = await createGovernanceEvent(token, payload)
    set(state => ({ events: upsertEvent(state.events, event) }))
    return event
  },
  updateEvent: async (token, eventId, payload) => {
    const event = await updateGovernanceEvent(token, eventId, payload)
    set(state => ({ events: upsertEvent(state.events, event) }))
    return event
  },
  completeEvent: async (token, eventId, payload) => {
    const event = await completeGovernanceEvent(token, eventId, payload)
    set(state => ({ events: upsertEvent(state.events, event) }))
    return event
  },
  generateAgendaDraft: async (token, eventId, payload) => generateGovernanceAgendaDraft(token, eventId, payload),
  updateAgenda: async (token, eventId, agenda, sourceOutputId) => {
    const event = await updateGovernanceAgenda(token, eventId, agenda, sourceOutputId)
    set(state => ({ events: upsertEvent(state.events, event) }))
    return event
  },
  generateBrief: async (token, eventId, payload) => generateGovernanceBrief(token, eventId, payload),
}))

function upsertEvent(events: GovernanceEventRecord[], event: GovernanceEventRecord) {
  return [event, ...events.filter(item => item.id !== event.id)].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}
