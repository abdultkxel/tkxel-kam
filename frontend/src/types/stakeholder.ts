import type { Page } from '@/services/accountWorkspace'

export type StakeholderRole = string

export type StakeholderInfluence = 'low' | 'medium' | 'high' | 'critical'
export type StakeholderRelationshipStrength = 'unknown' | 'weak' | 'developing' | 'strong' | 'champion'
export type StakeholderSentiment = 'negative' | 'neutral' | 'positive' | 'champion'
export type StakeholderPoliticalRisk = 'unknown' | 'low' | 'medium' | 'high'
export type StakeholderStatus = 'active' | 'inactive' | 'left_company' | 'do_not_contact'
type CustomStakeholderValue = string & {}
export type StakeholderGapSeverity = 'low' | 'medium' | 'high' | 'critical' | CustomStakeholderValue
export type StakeholderGapStatus = 'open' | 'resolved' | CustomStakeholderValue

export interface StakeholderRoleOption {
  value: string
  label: string
}

export interface Stakeholder {
  id: string
  accountId: string
  engagementId?: string | null
  reportsToStakeholderId?: string | null
  name: string
  title?: string | null
  company?: string | null
  email?: string | null
  phone?: string | null
  linkedinUrl?: string | null
  role: StakeholderRole | CustomStakeholderValue
  influence: StakeholderInfluence | CustomStakeholderValue
  relationshipStrength: StakeholderRelationshipStrength | CustomStakeholderValue
  sentiment: StakeholderSentiment | CustomStakeholderValue
  politicalRisk: StakeholderPoliticalRisk | CustomStakeholderValue
  status: StakeholderStatus | CustomStakeholderValue
  notes?: string | null
  lastInteractionAt?: string | null
  isSensitive: boolean
  sensitiveFieldsRedacted: boolean
  createdById?: string | null
  updatedById?: string | null
  createdAt: string
  updatedAt: string
  archivedAt?: string | null
}

export type StakeholderPage = Page<Stakeholder>

export interface StakeholderFilters {
  engagement_id?: string
  role?: StakeholderRole | CustomStakeholderValue
  sentiment?: StakeholderSentiment | CustomStakeholderValue
  political_risk?: StakeholderPoliticalRisk | CustomStakeholderValue
  status?: StakeholderStatus | CustomStakeholderValue
  search?: string
  page?: number
  page_size?: number
}

export interface StakeholderCreatePayload {
  engagementId?: string | null
  reportsToStakeholderId?: string | null
  name: string
  title?: string | null
  company?: string | null
  email?: string | null
  phone?: string | null
  linkedinUrl?: string | null
  role: StakeholderRole | CustomStakeholderValue
  influence?: StakeholderInfluence | CustomStakeholderValue
  relationshipStrength?: StakeholderRelationshipStrength | CustomStakeholderValue
  sentiment?: StakeholderSentiment | CustomStakeholderValue
  politicalRisk?: StakeholderPoliticalRisk | CustomStakeholderValue
  status?: StakeholderStatus | CustomStakeholderValue
  notes?: string | null
  lastInteractionAt?: string | null
  isSensitive?: boolean
}

export type StakeholderUpdatePayload = Partial<StakeholderCreatePayload>

export interface StakeholderInteraction {
  id: string
  stakeholderId: string
  accountId: string
  engagementId?: string | null
  interactionType: string
  interactionDate: string
  summary?: string | null
  outcome?: string | null
  sentimentAfter?: StakeholderSentiment | CustomStakeholderValue | null
  relationshipStrengthAfter?: StakeholderRelationshipStrength | CustomStakeholderValue | null
  sensitiveFieldsRedacted: boolean
  createdById?: string | null
  createdByName: string
  createdAt: string
  updatedAt: string
}

export type StakeholderInteractionPage = Page<StakeholderInteraction>

export interface StakeholderInteractionCreatePayload {
  interactionType?: string
  interactionDate?: string
  summary: string
  outcome?: string | null
  sentimentAfter?: StakeholderSentiment | CustomStakeholderValue | null
  relationshipStrengthAfter?: StakeholderRelationshipStrength | CustomStakeholderValue | null
}

export interface StakeholderCoverageGap {
  id: string
  accountId: string
  ruleKey: string
  severity: StakeholderGapSeverity
  title: string
  description: string
  evidence: Record<string, unknown>
  status: StakeholderGapStatus
  createdAt: string
  resolvedAt?: string | null
}

export interface StakeholderOrgChartNode {
  id: string
  name: string
  title?: string | null
  linkedinUrl?: string | null
  role?: string | null
  influenceLevel?: string | null
  relationshipStrength?: string | null
  sentiment?: string | null
  politicalRisk?: string | null
  parentId?: string | null
  sensitiveFieldsRedacted: boolean
}

export interface StakeholderOrgChartEdge {
  source: string
  target: string
  relationshipType: string
}

export interface StakeholderOrgChart {
  nodes: StakeholderOrgChartNode[]
  edges: StakeholderOrgChartEdge[]
}
