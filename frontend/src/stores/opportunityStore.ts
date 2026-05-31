import { create } from 'zustand'
import {
  addOpportunityActionItem as addOpportunityActionItemApi,
  addOpportunityDecision as addOpportunityDecisionApi,
  archiveOpportunity as archiveOpportunityApi,
  createOpportunity as createOpportunityApi,
  listOpportunities,
  listOpportunityStages,
  listOpportunityTypes,
  moveOpportunityStage as moveOpportunityStageApi,
  restoreOpportunity as restoreOpportunityApi,
  updateOpportunity as updateOpportunityApi,
  updateOpportunityActionItem as updateOpportunityActionItemApi,
} from '@/services/opportunities'
import {
  Opportunity,
  OpportunityActionItemInput,
  OpportunityCreateInput,
  OpportunityDecisionInput,
  OpportunityListParams,
  OpportunityPipelineTotals,
  OpportunityStageDefinition,
  OpportunityTypeRecord,
  OpportunityUpdateInput,
  Stage,
} from '@/types/opportunity'

interface OpportunityStore {
  opportunities: Opportunity[]
  types: OpportunityTypeRecord[]
  stages: OpportunityStageDefinition[]
  totals: OpportunityPipelineTotals
  loading: boolean
  saving: boolean
  error: string
  loaded: boolean
  total: number
  page: number
  pageSize: number
  pages: number
  movingIds: string[]
  loadOpportunities: (token: string, params?: OpportunityListParams) => Promise<void>
  loadReferenceData: (token: string) => Promise<void>
  createOpportunity: (token: string, payload: OpportunityCreateInput) => Promise<Opportunity>
  updateOpportunity: (token: string, id: string, payload: OpportunityUpdateInput) => Promise<Opportunity>
  archiveOpportunity: (token: string, id: string, reason?: string) => Promise<void>
  restoreOpportunity: (token: string, id: string, reason?: string) => Promise<Opportunity>
  moveOpportunity: (id: string, stage: Stage) => void
  moveOpportunityStage: (token: string, id: string, stage: Stage, reason?: string | null, outcomeReason?: string | null) => Promise<Opportunity>
  addDecision: (token: string, id: string, payload: OpportunityDecisionInput) => Promise<Opportunity>
  addActionItem: (token: string, id: string, payload: OpportunityActionItemInput) => Promise<Opportunity>
  updateActionItem: (token: string, opportunityId: string, actionItemId: string, payload: Partial<OpportunityActionItemInput>) => Promise<Opportunity>
  upsertOpportunity: (opportunity: Opportunity) => void
}

const emptyTotals: OpportunityPipelineTotals = {
  openCount: 0,
  openValue: 0,
  wonValue: 0,
  totalCount: 0,
  totalValue: 0,
  averageValue: 0,
  stageCounts: {},
  stageValues: {},
}

export const useOpportunityStore = create<OpportunityStore>((set, get) => ({
  opportunities: [],
  types: [],
  stages: [],
  totals: emptyTotals,
  loading: false,
  saving: false,
  error: '',
  loaded: false,
  total: 0,
  page: 1,
  pageSize: 25,
  pages: 0,
  movingIds: [],
  loadOpportunities: async (token, params = { pageSize: 500, sort: 'target_date', direction: 'asc' }) => {
    set({ loading: true, error: '' })
    try {
      const result = await listOpportunities(token, params)
      set({ opportunities: result.items, totals: result.totals, total: result.total, page: result.page, pageSize: result.page_size, pages: result.pages, loaded: true })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unable to load opportunities', loaded: true })
    } finally {
      set({ loading: false })
    }
  },
  loadReferenceData: async token => {
    try {
      const [typePage, stages] = await Promise.all([listOpportunityTypes(token), listOpportunityStages(token)])
      set({ types: typePage.items, stages })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Unable to load opportunity reference data' })
    }
  },
  createOpportunity: async (token, payload) => {
    set({ saving: true, error: '' })
    try {
      const opportunity = await createOpportunityApi(token, payload)
      set(state => {
        const next = upsertOpportunityList(state.opportunities, opportunity)
        return { opportunities: next, totals: recalculateTotals(next), total: state.total + (state.opportunities.some(item => item.id === opportunity.id) ? 0 : 1) }
      })
      return opportunity
    } finally {
      set({ saving: false })
    }
  },
  updateOpportunity: async (token, id, payload) => {
    set({ saving: true, error: '' })
    try {
      const opportunity = await updateOpportunityApi(token, id, payload)
      set(state => {
        const next = upsertOpportunityList(state.opportunities, opportunity)
        return { opportunities: next, totals: recalculateTotals(next) }
      })
      return opportunity
    } finally {
      set({ saving: false })
    }
  },
  archiveOpportunity: async (token, id, reason) => {
    set({ saving: true, error: '' })
    try {
      await archiveOpportunityApi(token, id, reason)
      set(state => {
        const next = state.opportunities.filter(item => item.id !== id)
        return { opportunities: next, totals: recalculateTotals(next), total: Math.max(0, state.total - 1) }
      })
    } finally {
      set({ saving: false })
    }
  },
  restoreOpportunity: async (token, id, reason) => {
    set({ saving: true, error: '' })
    try {
      const opportunity = await restoreOpportunityApi(token, id, reason)
      set(state => {
        const next = upsertOpportunityList(state.opportunities, opportunity)
        return { opportunities: next, totals: recalculateTotals(next) }
      })
      return opportunity
    } finally {
      set({ saving: false })
    }
  },
  moveOpportunity: (id, stage) =>
    set(state => ({
      opportunities: state.opportunities.map(opportunity => (opportunity.id === id ? { ...opportunity, stage } : opportunity)),
    })),
  moveOpportunityStage: async (token, id, stage, reason, outcomeReason) => {
    set(state => ({ movingIds: state.movingIds.includes(id) ? state.movingIds : [...state.movingIds, id], error: '' }))
    try {
      const result = await moveOpportunityStageApi(token, id, stage, reason, outcomeReason)
      set(state => {
        const next = upsertOpportunityList(state.opportunities, result.opportunity)
        return { opportunities: next, totals: recalculateTotals(next) }
      })
      return result.opportunity
    } finally {
      set(state => ({ movingIds: state.movingIds.filter(item => item !== id) }))
    }
  },
  addDecision: async (token, id, payload) => {
    const decision = await addOpportunityDecisionApi(token, id, payload)
    let nextOpportunity: Opportunity | null = null
    set(state => {
      const next = state.opportunities.map(item => {
        if (item.id !== id) return item
        nextOpportunity = { ...item, decisions: [decision, ...(item.decisions ?? [])] }
        return nextOpportunity
      })
      return { opportunities: next }
    })
    return nextOpportunity ?? get().opportunities.find(item => item.id === id)!
  },
  addActionItem: async (token, id, payload) => {
    const actionItem = await addOpportunityActionItemApi(token, id, payload)
    let nextOpportunity: Opportunity | null = null
    set(state => {
      const next = state.opportunities.map(item => {
        if (item.id !== id) return item
        nextOpportunity = { ...item, actionItems: [actionItem, ...(item.actionItems ?? [])] }
        return nextOpportunity
      })
      return { opportunities: next }
    })
    return nextOpportunity ?? get().opportunities.find(item => item.id === id)!
  },
  updateActionItem: async (token, opportunityId, actionItemId, payload) => {
    const actionItem = await updateOpportunityActionItemApi(token, actionItemId, payload)
    let nextOpportunity: Opportunity | null = null
    set(state => {
      const next = state.opportunities.map(item => {
        if (item.id !== opportunityId) return item
        nextOpportunity = { ...item, actionItems: (item.actionItems ?? []).map(current => (current.id === actionItem.id ? actionItem : current)) }
        return nextOpportunity
      })
      return { opportunities: next }
    })
    return nextOpportunity ?? get().opportunities.find(item => item.id === opportunityId)!
  },
  upsertOpportunity: opportunity =>
    set(state => {
      const next = upsertOpportunityList(state.opportunities, opportunity)
      return { opportunities: next, totals: recalculateTotals(next) }
    }),
}))

function upsertOpportunityList(items: Opportunity[], opportunity: Opportunity) {
  return items.some(item => item.id === opportunity.id)
    ? items.map(item => (item.id === opportunity.id ? opportunity : item))
    : [opportunity, ...items]
}

function recalculateTotals(items: Opportunity[]): OpportunityPipelineTotals {
  const active = items.filter(item => !item.archivedAt)
  const open = active.filter(item => item.stage !== 'Won' && item.stage !== 'Lost')
  const won = active.filter(item => item.stage === 'Won')
  return {
    openCount: open.length,
    openValue: open.reduce((sum, item) => sum + item.estimatedValue, 0),
    wonValue: won.reduce((sum, item) => sum + item.estimatedValue, 0),
    totalCount: active.length,
    totalValue: active.reduce((sum, item) => sum + item.estimatedValue, 0),
    averageValue: active.length ? active.reduce((sum, item) => sum + item.estimatedValue, 0) / active.length : 0,
    stageCounts: active.reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.stage]: (counts[item.stage] ?? 0) + 1 }), {}),
    stageValues: active.reduce<Record<string, number>>((values, item) => ({ ...values, [item.stage]: (values[item.stage] ?? 0) + item.estimatedValue }), {}),
  }
}
