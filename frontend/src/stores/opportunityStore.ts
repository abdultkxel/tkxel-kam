import { create } from 'zustand'
import { opportunities } from '@/data/mock'
import { Opportunity, Stage } from '@/types/opportunity'

interface OpportunityStore {
  opportunities: Opportunity[]
  moveOpportunity: (id: string, stage: Stage) => void
  upsertOpportunity: (opportunity: Opportunity) => void
}

export const useOpportunityStore = create<OpportunityStore>(set => ({
  opportunities,
  moveOpportunity: (id, stage) =>
    set(state => ({
      opportunities: state.opportunities.map(opportunity => (opportunity.id === id ? { ...opportunity, stage } : opportunity)),
    })),
  upsertOpportunity: opportunity =>
    set(state => ({
      opportunities: state.opportunities.some(item => item.id === opportunity.id)
        ? state.opportunities.map(item => (item.id === opportunity.id ? opportunity : item))
        : [opportunity, ...state.opportunities],
    })),
}))
