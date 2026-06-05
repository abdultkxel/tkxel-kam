export type Stage = 'Identified' | 'Qualified' | 'Proposal Sent' | 'Negotiation' | 'Won' | 'Lost'

export interface OpportunityTypeRecord {
  id: string
  slug: string
  name: string
  description?: string | null
  isActive: boolean
  displayOrder: number
  inUseCount: number
  createdAt: string
  updatedAt: string
}

export interface OpportunityStageDefinition {
  id: string
  slug: string
  name: Stage
  isTerminal: boolean
  isActive: boolean
  displayOrder: number
}

export interface OpportunityStageHistory {
  id: string
  opportunityId: string
  accountId: string
  engagementId?: string | null
  beforeStage?: Stage | null
  afterStage: Stage
  actorId?: string | null
  actorName: string
  reason?: string | null
  timelineEntryId?: string | null
  createdAt: string
}

export interface OpportunityDecision {
  id: string
  opportunityId: string
  decisionText: string
  ownerId?: string | null
  ownerName?: string | null
  timelineEntryId?: string | null
  createdById?: string | null
  createdByName: string
  createdAt: string
}

export interface OpportunityActionItem {
  id: string
  opportunityId: string
  title: string
  ownerId?: string | null
  ownerName?: string | null
  ownerEmail?: string | null
  dueDate: string
  status: 'open' | 'in_progress' | 'completed' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  notes?: string | null
  futureTaskId?: string | null
  completedAt?: string | null
  completedById?: string | null
  createdById?: string | null
  createdByName: string
  createdAt: string
  updatedAt: string
}

export interface Opportunity {
  id: string
  accountId: string
  accountName: string
  engagementId?: string | null
  engagementName?: string | null
  typeId?: string
  typeName?: string
  typeSlug?: string
  serviceLine?: string
  name: string
  ownerId: string
  ownerName: string
  ownerEmail?: string | null
  estimatedValue: number
  value?: number
  currency?: string
  closeDate: string
  targetDate?: string
  stage: Stage
  nextStep?: string
  sourceContext?: string | null
  sourceRecordId?: string | null
  sourceRecordType?: string | null
  sourceRecordRoute?: string | null
  outcomeReason?: string | null
  archivedAt?: string | null
  archiveReason?: string | null
  createdAt?: string
  updatedAt?: string
  stageHistory?: OpportunityStageHistory[]
  decisions?: OpportunityDecision[]
  actionItems?: OpportunityActionItem[]
}

export interface OpportunityPipelineTotals {
  openCount: number
  openValue: number
  wonValue: number
  totalCount: number
  totalValue: number
  averageValue: number
  stageCounts: Record<string, number>
  stageValues: Record<string, number>
}

export interface OpportunityListParams {
  accountId?: string
  engagementId?: string
  search?: string
  typeId?: string
  typeSlug?: string
  stage?: string
  ownerId?: string
  serviceLine?: string
  sourceContext?: string
  targetFrom?: string
  targetTo?: string
  minValue?: number | string
  maxValue?: number | string
  includeArchived?: boolean
  openOnly?: boolean
  stalled?: boolean
  stalledAfterDays?: number
  sort?: 'name' | 'account_name' | 'stage' | 'value' | 'target_date' | 'updated_at' | 'created_at'
  direction?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export interface OpportunityCreateInput {
  accountId: string
  engagementId?: string | null
  typeId: string
  ownerId: string
  name: string
  serviceLine: string
  value: number
  currency: string
  stage: Stage
  nextStep: string
  targetDate: string
  sourceContext?: string | null
  sourceRecordId?: string | null
  sourceRecordType?: string | null
  sourceRecordRoute?: string | null
  outcomeReason?: string | null
  actionItems?: OpportunityActionItemInput[]
}

export interface OpportunityUpdateInput {
  engagementId?: string | null
  typeId?: string
  ownerId?: string
  name?: string
  serviceLine?: string
  value?: number
  currency?: string
  stage?: Stage
  nextStep?: string
  targetDate?: string
  sourceContext?: string | null
  sourceRecordId?: string | null
  sourceRecordType?: string | null
  sourceRecordRoute?: string | null
  outcomeReason?: string | null
}

export interface OpportunityActionItemInput {
  title: string
  ownerId?: string | null
  ownerName?: string | null
  ownerEmail?: string | null
  dueDate: string
  status?: OpportunityActionItem['status']
  priority?: OpportunityActionItem['priority']
  notes?: string | null
  createTask?: boolean
}

export interface OpportunityDecisionInput {
  decisionText: string
  ownerId?: string | null
  ownerName?: string | null
}
