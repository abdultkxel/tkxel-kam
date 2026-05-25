import { create } from 'zustand'

export interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

interface AIStore {
  history: Record<string, Message[]>
  addMessage: (accountId: string, message: Message) => void
}

export const useAIStore = create<AIStore>(set => ({
  history: {},
  addMessage: (accountId, message) =>
    set(state => ({
      history: {
        ...state.history,
        [accountId]: [...(state.history[accountId] ?? []), message],
      },
    })),
}))
