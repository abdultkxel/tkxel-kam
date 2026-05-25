import { create } from 'zustand'
import { governanceEvents } from '@/data/mock'
import { GovernanceEventRecord } from '@/types/governance'

interface GovernanceStore {
  events: GovernanceEventRecord[]
  addEvent: (event: GovernanceEventRecord) => void
}

export const useGovernanceStore = create<GovernanceStore>(set => ({
  events: governanceEvents,
  addEvent: event => set(state => ({ events: [event, ...state.events] })),
}))
