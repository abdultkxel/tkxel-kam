import { create } from 'zustand'
import { ScoreSnapshot } from '@/types/account'

interface ScoreStore {
  snapshots: ScoreSnapshot[]
  addSnapshot: (snapshot: ScoreSnapshot) => void
}

export const useScoreStore = create<ScoreStore>(set => ({
  snapshots: [],
  addSnapshot: snapshot => set(state => ({ snapshots: [snapshot, ...state.snapshots] })),
}))
