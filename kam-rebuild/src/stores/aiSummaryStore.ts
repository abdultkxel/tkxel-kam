import { create } from 'zustand'
import { AISummary } from '@/types/aiSummary'

interface AISummaryStore {
  summaries: AISummary[]
  upsertSummary: (summary: AISummary) => void
  setFeedback: (id: string, feedback: 'up' | 'down') => void
  markEdited: (id: string, noteId: string) => void
}

export const useAISummaryStore = create<AISummaryStore>(set => ({
  summaries: [],
  upsertSummary: summary =>
    set(state => ({
      summaries: [summary, ...state.summaries.filter(item => !(item.accountId === summary.accountId && item.type === summary.type))],
    })),
  setFeedback: (id, feedback) =>
    set(state => ({
      summaries: state.summaries.map(summary => (summary.id === id ? { ...summary, feedback } : summary)),
    })),
  markEdited: (id, noteId) =>
    set(state => ({
      summaries: state.summaries.map(summary => (summary.id === id ? { ...summary, editedNoteId: noteId } : summary)),
    })),
}))
