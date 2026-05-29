import { addDays, subDays } from 'date-fns'
import { create } from 'zustand'
import { accounts } from '@/data/mock'
import { scoreActivityTemplates } from '@/data/scoreActivityTemplates'
import { ScoreActivityTask } from '@/types/scoreActivity'

const statusPattern: ScoreActivityTask['status'][] = ['todo', 'in_progress', 'done', 'todo', 'skipped', 'todo']
const priorityPattern: ScoreActivityTask['priority'][] = ['high', 'medium', 'medium', 'low']

function seedTasks(): ScoreActivityTask[] {
  const now = new Date()
  const primaryAccount = accounts[0]
  const primaryTasks = scoreActivityTemplates.map((template, index): ScoreActivityTask => {
    const status = statusPattern[index % statusPattern.length]
    const completed = status === 'done'
    const skipped = status === 'skipped'

    return {
      id: `sat-${primaryAccount.id}-${template.id}`,
      templateId: template.id,
      accountId: primaryAccount.id,
      accountName: primaryAccount.name,
      ownerId: primaryAccount.ownerId,
      ownerName: primaryAccount.ownerName,
      calculatorId: template.calculatorId,
      criterionId: template.criterionId,
      title: template.title,
      description: template.description,
      dueDate: addDays(now, template.defaultDueOffsetDays - 8 + (index % 5)).toISOString(),
      status,
      priority: priorityPattern[index % priorityPattern.length],
      evidenceNote: completed ? `Evidence captured during the latest ${primaryAccount.name} score review.` : undefined,
      completedAt: completed ? subDays(now, index + 1).toISOString() : undefined,
      skippedReason: skipped ? 'Not applicable for the current account motion.' : undefined,
      sourceTimelineEntryId: completed ? `tl-score-activity-${index + 1}` : undefined,
      createdAt: subDays(now, 18 + index).toISOString(),
    }
  })

  const secondaryTasks = accounts.slice(1).flatMap((account, accountIndex) =>
    scoreActivityTemplates.slice(accountIndex * 3, accountIndex * 3 + 5).map((template, templateIndex): ScoreActivityTask => ({
      id: `sat-${account.id}-${template.id}`,
      templateId: template.id,
      accountId: account.id,
      accountName: account.name,
      ownerId: account.ownerId,
      ownerName: account.ownerName,
      calculatorId: template.calculatorId,
      criterionId: template.criterionId,
      title: template.title,
      description: template.description,
      dueDate: addDays(now, template.defaultDueOffsetDays + accountIndex * 4 - templateIndex).toISOString(),
      status: templateIndex === 1 ? 'in_progress' : templateIndex === 3 ? 'done' : 'todo',
      priority: template.defaultPriority,
      evidenceNote: templateIndex === 3 ? `Evidence attached from ${account.name} review.` : undefined,
      completedAt: templateIndex === 3 ? subDays(now, accountIndex + 2).toISOString() : undefined,
      createdAt: subDays(now, 9 + accountIndex + templateIndex).toISOString(),
    })),
  )

  return [...primaryTasks, ...secondaryTasks]
}

interface ScoreActivityStore {
  templates: typeof scoreActivityTemplates
  tasks: ScoreActivityTask[]
  addTask: (task: ScoreActivityTask) => void
  updateTask: (taskId: string, patch: Partial<ScoreActivityTask>) => void
}

export const useScoreActivityStore = create<ScoreActivityStore>(set => ({
  templates: scoreActivityTemplates,
  tasks: seedTasks(),
  addTask: task =>
    set(state => ({
      tasks: [task, ...state.tasks],
    })),
  updateTask: (taskId, patch) =>
    set(state => ({
      tasks: state.tasks.map(task => (task.id === taskId ? { ...task, ...patch } : task)),
    })),
}))
