import { create } from 'zustand'

export interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface AIQueryRun {
  id: string
  accountId: string
  query: string
  answer: string
  intent: string
  confidence: 'high' | 'medium' | 'low'
  sourceEntryIds: string[]
  documentSourceIds: string[]
  createdAt: string
}

interface AIStore {
  history: Record<string, Message[]>
  queryRuns: Record<string, AIQueryRun[]>
  addMessage: (accountId: string, message: Message) => void
  addQueryRun: (run: AIQueryRun) => void
}

export const useAIStore = create<AIStore>(set => ({
  history: {},
  queryRuns: {},
  addMessage: (accountId, message) =>
    set(state => ({
      history: {
        ...state.history,
        [accountId]: [...(state.history[accountId] ?? []), message],
      },
    })),
  addQueryRun: run =>
    set(state => ({
      queryRuns: {
        ...state.queryRuns,
        [run.accountId]: [run, ...(state.queryRuns[run.accountId] ?? [])].slice(0, 8),
      },
    })),
}))
