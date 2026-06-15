import { create } from 'zustand'
import { scoreActivityTemplates } from '@/data/scoreActivityTemplates'
import { ScoreActivityTask } from '@/types/scoreActivity'

interface ScoreActivityStore {
  templates: typeof scoreActivityTemplates
  tasks: ScoreActivityTask[]
  addTask: (task: ScoreActivityTask) => void
  updateTask: (taskId: string, patch: Partial<ScoreActivityTask>) => void
}

export const useScoreActivityStore = create<ScoreActivityStore>(set => ({
  templates: scoreActivityTemplates,
  tasks: [],
  addTask: task =>
    set(state => ({
      tasks: [task, ...state.tasks],
    })),
  updateTask: (taskId, patch) =>
    set(state => ({
      tasks: state.tasks.map(task => (task.id === taskId ? { ...task, ...patch } : task)),
    })),
}))
