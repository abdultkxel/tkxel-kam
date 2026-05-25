export type ScoreCalculatorId = 'relationship' | 'contract' | 'resource' | 'csat' | 'risk'

export type ScoreActivityStatus = 'todo' | 'in_progress' | 'done' | 'skipped'

export type ScoreActivityPriority = 'low' | 'medium' | 'high'

export interface ScoreActivityTemplate {
  id: string
  calculatorId: ScoreCalculatorId
  criterionId: string
  title: string
  description: string
  defaultPriority: ScoreActivityPriority
  defaultDueOffsetDays: number
}

export interface ScoreActivityTask {
  id: string
  templateId: string
  accountId: string
  accountName: string
  ownerId: string
  ownerName: string
  calculatorId: ScoreCalculatorId
  criterionId: string
  title: string
  description: string
  dueDate: string
  status: ScoreActivityStatus
  priority: ScoreActivityPriority
  evidenceNote?: string
  completedAt?: string
  skippedReason?: string
  sourceTimelineEntryId?: string
  createdAt: string
}

export interface ScoreActivityEvidence {
  taskId: string
  templateId: string
  calculatorId: ScoreCalculatorId
  criterionId: string
  title: string
  evidenceNote: string
  completedAt: string
  sourceTimelineEntryId?: string
}
