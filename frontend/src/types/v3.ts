import { Account, RiskStatus } from '@/types/account'

export type SourceDocumentType = 'project_charter' | 'sow' | 'commercial_note' | 'research'
export type DraftStatus = 'ready_for_review' | 'approved' | 'rejected'
export type EngagementStatus = 'draft' | 'active' | 'on_hold' | 'renewal_watch' | 'at_risk' | 'completed' | 'archived'
export type EngagementDeliveryStatus = 'not_started' | 'planned' | 'active' | 'watch' | 'blocked' | 'at_risk' | 'completed'
export type EngagementCommercialStatus = 'healthy' | 'watch' | 'risk'
export type EngagementHealthStatus = 'green' | 'amber' | 'red' | 'unknown'
export type EngagementRenewalRisk = 'low' | 'medium' | 'high' | 'unknown'
export type EngagementRenewalStatus = 'expired' | 'renewal_due' | 'notice_due' | 'upcoming_notice_window' | 'not_due' | 'unknown'
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

export interface EngagementSourceLink {
  title?: string | null
  url: string
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
  renewalStatus?: EngagementRenewalStatus
  riskStatus: RiskStatus
  confidence: number
  sourceDocumentId: string
  sourceCitation: string
}

export interface EngagementRecord {
  id: string
  accountId: string
  accountName: string
  name: string
  description?: string | null
  status: EngagementStatus
  ownerId: string
  ownerName: string
  opsLeadId: string
  opsLeadName: string
  serviceLines: string[]
  value: number
  contractValue?: number
  currency?: string
  deliveryStatus?: EngagementDeliveryStatus
  commercialStatus?: EngagementCommercialStatus
  deliveryHealth: number
  healthScore?: number
  healthStatus?: EngagementHealthStatus
  renewalRisk?: EngagementRenewalRisk
  renewalStatus?: EngagementRenewalStatus
  resourceDependency: string
  resourceDependencyNotes?: string | null
  commercialContext: string
  risks: string[]
  sourceDocumentIds: string[]
  sourceLinks?: EngagementSourceLink[]
  sourceCitation?: string | null
  createdById?: string | null
  updatedById?: string | null
  createdBy?: string | null
  updatedBy?: string | null
  createdAt?: string
  updatedAt?: string
  renewalTerms: RenewalTerms
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
  status: 'draft' | 'active' | 'completed' | 'archived'
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
