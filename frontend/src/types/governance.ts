export type GovernanceEventType = 'QBR' | 'SteerCo' | 'Monthly Review' | 'Executive Review'
export type GovernanceEventStatus = 'upcoming' | 'completed' | 'overdue' | 'cancelled'
export type GovernanceGeneratedOutputType = 'agenda_draft' | 'governance_brief'

export interface GovernanceNoteRecord {
  id: string
  eventId: string
  body: string
  authorId?: string | null
  authorName: string
  source: string
  createdAt: string
  updatedAt: string
}

export interface GovernanceDecisionRecord {
  id: string
  eventId: string
  decisionText: string
  ownerId?: string | null
  ownerName?: string | null
  source: string
  createdAt: string
}

export interface GovernanceActionItemRecord {
  id: string
  eventId: string
  title: string
  ownerId?: string | null
  ownerName?: string | null
  ownerEmail?: string | null
  dueDate: string
  status: 'open' | 'completed'
  source: string
  createdAt: string
  updatedAt: string
}

export interface GovernanceGeneratedOutputCitationRecord {
  id: string
  outputId: string
  sourceType: string
  sourceId: string
  sourceTitle: string
  sourceUrl?: string | null
  snippet: string
  sourceTimestamp?: string | null
  createdAt: string
}

export interface GovernanceGeneratedOutputRecord {
  id: string
  eventId: string
  outputType: GovernanceGeneratedOutputType
  generationMethod: 'deterministic' | 'ai_agent'
  status: string
  content: string
  disclaimer: string
  sourceFilterMetadata: Record<string, unknown>
  providerMetadata?: Record<string, unknown> | null
  errorCode?: string | null
  errorMessage?: string | null
  createdById?: string | null
  createdByName: string
  createdAt: string
  citations: GovernanceGeneratedOutputCitationRecord[]
}

export interface GovernanceEventRecord {
  id: string
  accountId: string
  accountName: string
  engagementId?: string | null
  engagementName?: string | null
  ownerId: string
  ownerName?: string
  ownerEmail?: string | null
  type: GovernanceEventType
  date: string
  agenda: string
  attendeeEmails: string[]
  attendees: string[]
  actionItemRecords: GovernanceActionItemRecord[]
  actionItems: string[]
  notes: GovernanceNoteRecord[]
  decisions: GovernanceDecisionRecord[]
  generatedOutputs: GovernanceGeneratedOutputRecord[]
  status: GovernanceEventStatus
  source?: string
  completedAt?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface GovernanceEventCreateInput {
  accountId: string
  engagementId?: string | null
  governanceType: GovernanceEventType
  scheduledAt: string
  agenda: string
  ownerId: string
  attendeeEmails: string[]
  source?: 'manual' | 'google_calendar' | 'fathom' | 'system'
}

export interface GovernanceEventUpdateInput {
  engagementId?: string | null
  governanceType?: GovernanceEventType
  scheduledAt?: string
  agenda?: string
  ownerId?: string
  attendeeEmails?: string[]
  status?: GovernanceEventStatus
}

export interface GovernanceEventCompleteInput {
  notes: string
  decisions?: Array<{
    decisionText: string
    ownerId?: string | null
    ownerName?: string | null
  }>
  actionItems?: Array<{
    title: string
    ownerId?: string | null
    ownerName?: string | null
    ownerEmail?: string | null
    dueDate: string
  }>
}

export interface GovernanceGeneratedOutputInput {
  sourceModules?: string[]
}

export interface GovernanceEventListParams {
  accountId?: string
  engagementId?: string
  governanceType?: GovernanceEventType
  status?: GovernanceEventStatus
  ownerId?: string
  attendee?: string
  dateFrom?: string
  dateTo?: string
  source?: string
  search?: string
  sort?: 'event_date' | 'status' | 'updated_at'
  direction?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export interface GovernanceCalendarItemRecord {
  id: string
  kind: string
  sourceRecordId: string
  sourceRecordType: string
  accountId: string
  accountName: string
  ownerId?: string | null
  date: string
  title: string
  detail: string
  status: GovernanceEventStatus | string
  route: string
}
