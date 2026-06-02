export type ScoreCalculatorId = 'relationship' | 'contract' | 'resource' | 'csat' | 'risk'

export type ScoreActivityStatus = 'open' | 'in_progress' | 'blocked' | 'done' | 'cancelled'

export type ScoreActivityPriority = 'low' | 'medium' | 'high' | 'critical'

export type ScoreActivityLane = 'needs_review' | 'due_soon' | 'in_progress' | 'at_risk' | 'done'

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
  workflowLane?: ScoreActivityLane
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
