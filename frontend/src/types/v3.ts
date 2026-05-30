import { Account, RiskStatus } from '@/types/account'

export type SourceDocumentType = 'project_charter' | 'sow' | 'commercial_note' | 'research'
export type DraftStatus = 'ready_for_review' | 'approved' | 'rejected'
export type EngagementStatus = 'draft' | 'active' | 'renewal_watch' | 'at_risk' | 'completed'
export type EngagementDeliveryStatus = 'on_track' | 'watch' | 'at_risk' | 'blocked' | 'complete'
export type HealthRagStatus = 'green' | 'amber' | 'red' | 'dirty'
export type SignalStatus = 'new' | 'reviewed' | 'accepted' | 'dismissed' | 'converted' | 'resolved'
export type SignalSeverity = 'info' | 'warning' | 'critical'

export interface SourceCitation {
  id: string
  documentId: string
  label: string
  page: number
  excerpt: string
}

export interface SourceDocument {
  id: string
  accountId?: string
  engagementId?: string
  name: string
  type: SourceDocumentType
  uploadedAt: string
  uploadedByName: string
  confidence: number
  pages: number
  status: 'parsed' | 'needs_review'
  citations: SourceCitation[]
}

export interface SourceDocumentLink {
  title: string
  url: string
  type?: SourceDocumentType | 'amendment' | 'evidence'
}

export interface RenewalTerms {
  startDate: string
  endDate: string
  renewalDate: string
  noticeDeadline: string
  noticePeriodDays: number
  autoRenewal: boolean
  commercialExposure: number
  daysToExpiry: number
  riskStatus: RiskStatus
  confidence: number
  sourceDocumentId: string
  sourceCitation: string
}

export interface EngagementAttachment {
  id: string
  name: string
  url: string
  uploadedByName: string
  uploadedAt: string
}

export interface EngagementActivity {
  id: string
  title: string
  detail: string
  occurredAt: string
  performedByName: string
}

export interface EngagementHealth {
  score: number
  ragStatus: HealthRagStatus
  drivers: string[]
  freshness: 'current' | 'dirty' | 'draft' | 'source_missing' | 'not_calculated'
  contributionToAccountHealth: number
  formulaVersion: string
  dirty: boolean
  calculatedAt?: string
}

export interface EngagementRecord {
  id: string
  accountId: string
  accountName: string
  name: string
  status: EngagementStatus
  ownerId: string
  ownerName: string
  opsLeadId: string
  opsLeadName: string
  serviceLines: string[]
  value: number
  currency?: 'USD'
  deliveryStatus?: EngagementDeliveryStatus
  deliveryHealth: number
  resourceDependency: string
  commercialContext: string
  risks: string[]
  sourceDocumentIds: string[]
  sourceDocumentLinks?: SourceDocumentLink[]
  attachments?: EngagementAttachment[]
  activities?: EngagementActivity[]
  health?: EngagementHealth
  createdAt?: string
  updatedAt?: string
  renewalTerms: RenewalTerms
}

export interface EngagementContribution {
  engagementId: string
  engagementName: string
  status: EngagementStatus
  value: number
  score?: number
  ragStatus: HealthRagStatus
  dirty: boolean
  contributionToAccountHealth: number
  freshness: EngagementHealth['freshness']
  drivers: string[]
}

export interface AccountHealthRollup {
  accountId: string
  rollupScore: number
  formulaVersion: string
  contributions: EngagementContribution[]
  dirtyCount: number
  snapshots: {
    id: string
    accountId: string
    rollupScore: number
    formulaVersion: string
    contributions: EngagementContribution[]
    dirtyCount: number
    createdAt: string
  }[]
}

export interface KYCDraft {
  id: string
  accountId: string
  status: DraftStatus
  confidence: number
  sourceDocumentIds: string[]
  researchSources: string[]
  sections: {
    company: string
    industry: string
    stakeholders: string
    market: string
    funding: string
    engagementContext: string
    risks: string
  }
  missingFields: string[]
  conflicts: string[]
  citations: SourceCitation[]
}

export interface AIExtractionDraft {
  id: string
  status: DraftStatus
  createdAt: string
  createdByName: string
  accountDraft: Account
  engagementDrafts: EngagementRecord[]
  kycDraft: KYCDraft
  sourceDocumentIds: string[]
  confidence: number
  missingFields: string[]
  conflicts: string[]
}

export interface SignalRecord {
  id: string
  accountId: string
  accountName: string
  engagementId?: string
  engagementName?: string
  type: 'sow_expiry' | 'notice_window' | 'stale_kyc' | 'weak_metric' | 'stakeholder_gap' | 'escalation_sla'
  severity: SignalSeverity
  status: SignalStatus
  ownerId: string
  ownerName: string
  headline: string
  detail: string
  reasonCodes: string[]
  evidence: string[]
  sourceRecordRoute: string
  createdAt: string
  dueAt?: string
  slaAgeDays: number
  recommendedPlaybook: string
}

export interface RetentionPlan {
  id: string
  accountId: string
  engagementId?: string
  title: string
  ownerName: string
  status: 'draft' | 'active' | 'complete'
  successCriteria: string[]
  actions: { id: string; title: string; ownerName: string; dueDate: string; status: 'todo' | 'in_progress' | 'done' }[]
}

export interface EducationContent {
  id: string
  title: string
  tags: string[]
  stage: string
  recommendedFor: string
  lastShared?: string
}

export interface EscalationRecord {
  id: string
  accountId: string
  engagementId?: string
  title: string
  severity: 'amber' | 'red'
  ownerName: string
  status: 'open' | 'watchlist' | 'closed'
  slaDue: string
  impact: string
  mitigation: string
  rootCauseRequired: boolean
}
