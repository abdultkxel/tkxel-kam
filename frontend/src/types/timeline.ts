export type UserRole =
  | 'account_manager'
  | 'admin'
  | 'kam_head'
  | 'delivery_stakeholder'
  | (string & {})

export type TimelineEventType =
  | 'account_setup'
  | 'kyc_update'
  | 'score_change'
  | 'calculator_change'
  | 'stage_change'
  | 'opportunity_event'
  | 'retention_event'
  | 'client_education'
  | 'escalation_event'
  | 'governance_event'
  | 'approval_event'
  | 'executive_event'
  | 'ai_event'
  | 'manual_note'
  | 'engagement_created'
  | 'engagement_updated'
  | 'sow_terms_updated'
  | 'renewal_dates_updated'
  | 'engagement_health_changed'
  | 'engagement_delivery_status_changed'
  | 'engagement_archived'
  | (string & {})

export type TimelineModule =
  | 'kyc'
  | 'scoring'
  | 'stage'
  | 'opportunity'
  | 'activity'
  | 'education'
  | 'escalation'
  | 'governance'
  | 'approval'
  | 'executive'
  | 'ai'
  | 'manual'
  | 'engagements'

export type SensitivityLevel = 'commercial' | 'executive' | 'legal' | 'escalation'

export interface TimelineEntry {
  id: string
  accountId: string
  eventType: TimelineEventType
  module: TimelineModule
  title: string
  description: string
  performedBy: string
  performedByName: string
  timestamp: string
  sourceRecordId?: string
  sourceRecordType?: string
  sourceRecordRoute?: string
  beforeValue?: Record<string, unknown>
  afterValue?: Record<string, unknown>
  isSensitive: boolean
  sensitivityLevel?: SensitivityLevel
  tags?: string[]
  mentions?: string[]
  attachments?: { name: string; url: string }[]
  metadata?: Record<string, unknown>
  isSystemGenerated: boolean
  isImmutable: boolean
  scoringVersion?: string
  stageRuleVersion?: string
  retentionPolicy?: 'keep' | 'archive' | 'delete'
  retentionMonths?: number
}

export interface TimelineComment {
  id: string
  entryId: string
  authorId: string
  authorName: string
  content: string
  timestamp: string
  mentions: string[]
}

export interface TimelineEventTypeConfig {
  id: string
  name: string
  eventType: TimelineEventType
  module: TimelineModule
  colorToken: string
  active: boolean
  defaultVisibility: 'public' | 'restricted'
  createdDate: string
  retentionPolicy: 'keep' | 'archive' | 'delete'
  retentionMonths?: number
}

export function canViewTimelineEntry(entry: TimelineEntry, role: UserRole, userId?: string, canViewSensitive = false, canModerate = false): boolean {
  if (!entry.isSensitive) return true
  if (canModerate) return true
  if (role === 'account_manager' && entry.eventType === 'manual_note' && entry.performedBy === userId) return true
  const legacySensitive = role === 'kam_head' || role === 'admin'
  const legacyModerate = role === 'admin'

  switch (entry.sensitivityLevel) {
    case 'escalation':
    case 'commercial':
      return canViewSensitive || legacySensitive
    case 'executive':
    case 'legal':
      return canModerate || legacyModerate
    default:
      return false
  }
}

export const MODULE_COLOURS: Record<TimelineModule, string> = {
  kyc: 'bg-blue-tint-20 border-brand-blue',
  scoring: 'bg-orange-tint-20 border-brand-orange',
  stage: 'bg-blue-tint-20 border-brand-blue-dark',
  opportunity: 'bg-blue-tint-20 border-brand-blue',
  activity: 'bg-surface-tertiary border-surface-border',
  education: 'bg-surface-tertiary border-rag-green',
  escalation: 'bg-orange-tint-20 border-rag-amber',
  governance: 'bg-blue-tint-20 border-brand-blue-dark',
  approval: 'bg-surface-tertiary border-rag-green',
  executive: 'bg-blue-tint-20 border-brand-blue-dark',
  ai: 'bg-surface-tertiary border-surface-border',
  manual: 'bg-surface-tertiary border-surface-border',
  engagements: 'bg-blue-tint-20 border-brand-blue',
}
