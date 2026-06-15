import { create } from 'zustand'
import { subDays } from 'date-fns'
import { ScoreSnapshot } from '@/types/account'

const snapshots: ScoreSnapshot[] = [
  {
    id: 'score-amd-v13',
    accountId: 'amd-001',
    timestamp: subDays(new Date(), 1).toISOString(),
    overall: 86,
    dimensions: { relationship: 92, usage: 81, delivery: 88, commercial: 83 },
    calculatorVersion: 'v1.3',
    changedBy: 'usr-001',
    changedByName: 'Sarah Mitchell',
    triggerEntryId: 'tl-001',
  },
  {
    id: 'score-amd-v12',
    accountId: 'amd-001',
    timestamp: subDays(new Date(), 18).toISOString(),
    overall: 78,
    dimensions: { relationship: 86, usage: 72, delivery: 82, commercial: 75 },
    calculatorVersion: 'v1.3',
    changedBy: 'usr-002',
    changedByName: 'Ali Khan',
    triggerEntryId: 'tl-001',
  },
  {
    id: 'score-amd-v11',
    accountId: 'amd-001',
    timestamp: subDays(new Date(), 45).toISOString(),
    overall: 72,
    dimensions: { relationship: 79, usage: 68, delivery: 74, commercial: 67 },
    calculatorVersion: 'v1.2',
    changedBy: 'usr-002',
    changedByName: 'Ali Khan',
    triggerEntryId: 'tl-001',
  },
]

interface ScoreStore {
  snapshots: ScoreSnapshot[]
  addSnapshot: (snapshot: ScoreSnapshot) => void
}

export const useScoreStore = create<ScoreStore>(set => ({
  snapshots,
  addSnapshot: snapshot => set(state => ({ snapshots: [snapshot, ...state.snapshots] })),
}))
