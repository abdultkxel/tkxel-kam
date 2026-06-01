import { apiRequest } from '@/services/api'
import type {
  Stakeholder,
  StakeholderCoverageGap,
  StakeholderCreatePayload,
  StakeholderFilters,
  StakeholderInteraction,
  StakeholderInteractionCreatePayload,
  StakeholderInteractionPage,
  StakeholderOrgChart,
  StakeholderPage,
  StakeholderUpdatePayload,
} from '@/types/stakeholder'

interface ApiStakeholder {
  id: string
  account_id: string
  engagement_id?: string | null
  reports_to_stakeholder_id?: string | null
  name: string
  title?: string | null
  company?: string | null
  email?: string | null
  phone?: string | null
  role: string
  influence: string
  relationship_strength: string
  sentiment: string
  political_risk: string
  status: string
  notes?: string | null
  last_interaction_at?: string | null
  is_sensitive: boolean
  sensitive_fields_redacted: boolean
  created_by_id?: string | null
  updated_by_id?: string | null
  created_at: string
  updated_at: string
  archived_at?: string | null
}

interface ApiPage<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

interface ApiStakeholderInteraction {
  id: string
  stakeholder_id: string
  account_id: string
  engagement_id?: string | null
  interaction_type: string
  interaction_date: string
  summary?: string | null
  outcome?: string | null
  sentiment_after?: string | null
  relationship_strength_after?: string | null
  sensitive_fields_redacted: boolean
  created_by_id?: string | null
  created_by_name: string
  created_at: string
  updated_at: string
}

interface ApiStakeholderCoverageGap {
  id: string
  account_id: string
  rule_key: string
  severity: string
  title: string
  description: string
  evidence: Record<string, unknown>
  status: string
  created_at: string
  resolved_at?: string | null
}

interface ApiStakeholderOrgChartNode {
  id: string
  name: string
  title?: string | null
  role?: string | null
  influence_level?: string | null
  relationship_strength?: string | null
  sentiment?: string | null
  political_risk?: string | null
  parent_id?: string | null
  sensitive_fields_redacted: boolean
}

interface ApiStakeholderOrgChartEdge {
  source: string
  target: string
  relationship_type: string
}

interface ApiStakeholderOrgChart {
  nodes: ApiStakeholderOrgChartNode[]
  edges: ApiStakeholderOrgChartEdge[]
}

export function listStakeholders(token: string, accountId: string, filters: StakeholderFilters | URLSearchParams = {}) {
  return apiRequest<ApiPage<ApiStakeholder>>(`/api/accounts/${accountId}/stakeholders${queryString(filters)}`, { token })
    .then(page => ({ ...page, items: page.items.map(mapStakeholder) }) satisfies StakeholderPage)
}

export function createStakeholder(token: string, accountId: string, payload: StakeholderCreatePayload) {
  return apiRequest<ApiStakeholder>(`/api/accounts/${accountId}/stakeholders`, {
    method: 'POST',
    token,
    body: JSON.stringify(buildStakeholderPayload(payload)),
  }).then(mapStakeholder)
}

export function updateStakeholder(token: string, stakeholderId: string, payload: StakeholderUpdatePayload) {
  return apiRequest<ApiStakeholder>(`/api/stakeholders/${stakeholderId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(buildStakeholderPayload(payload)),
  }).then(mapStakeholder)
}

export function archiveStakeholder(token: string, stakeholderId: string) {
  return apiRequest<{ message: string }>(`/api/stakeholders/${stakeholderId}`, {
    method: 'DELETE',
    token,
  })
}

export function listStakeholderInteractions(token: string, stakeholderId: string, params: { page?: number; page_size?: number } | URLSearchParams = {}) {
  return apiRequest<ApiPage<ApiStakeholderInteraction>>(`/api/stakeholders/${stakeholderId}/interactions${queryString(params)}`, { token })
    .then(page => ({ ...page, items: page.items.map(mapStakeholderInteraction) }) satisfies StakeholderInteractionPage)
}

export function createStakeholderInteraction(token: string, stakeholderId: string, payload: StakeholderInteractionCreatePayload) {
  return apiRequest<ApiStakeholderInteraction>(`/api/stakeholders/${stakeholderId}/interactions`, {
    method: 'POST',
    token,
    body: JSON.stringify(buildInteractionPayload(payload)),
  }).then(mapStakeholderInteraction)
}

export function listStakeholderCoverageGaps(token: string, accountId: string) {
  return apiRequest<ApiStakeholderCoverageGap[]>(`/api/accounts/${accountId}/stakeholders/coverage-gaps`, { token }).then(gaps => gaps.map(mapCoverageGap))
}

export function recalculateStakeholderCoverageGaps(token: string, accountId: string) {
  return apiRequest<ApiStakeholderCoverageGap[]>(`/api/accounts/${accountId}/stakeholders/recalculate-coverage-gaps`, {
    method: 'POST',
    token,
  }).then(gaps => gaps.map(mapCoverageGap))
}

export function getStakeholderOrgChart(token: string, accountId: string) {
  return apiRequest<ApiStakeholderOrgChart>(`/api/accounts/${accountId}/stakeholders/org-chart`, { token }).then(mapOrgChart)
}

function buildStakeholderPayload(payload: StakeholderCreatePayload | StakeholderUpdatePayload) {
  const body: Record<string, unknown> = {}
  setIfDefined(body, 'engagement_id', payload.engagementId)
  setIfDefined(body, 'reports_to_stakeholder_id', payload.reportsToStakeholderId)
  setIfDefined(body, 'name', payload.name)
  setIfDefined(body, 'title', payload.title)
  setIfDefined(body, 'company', payload.company)
  setIfDefined(body, 'email', payload.email)
  setIfDefined(body, 'phone', payload.phone)
  setIfDefined(body, 'role', payload.role)
  setIfDefined(body, 'influence', payload.influence)
  setIfDefined(body, 'relationship_strength', payload.relationshipStrength)
  setIfDefined(body, 'sentiment', payload.sentiment)
  setIfDefined(body, 'political_risk', payload.politicalRisk)
  setIfDefined(body, 'status', payload.status)
  setIfDefined(body, 'notes', payload.notes)
  setIfDefined(body, 'last_interaction_at', payload.lastInteractionAt)
  setIfDefined(body, 'is_sensitive', payload.isSensitive)
  return body
}

function buildInteractionPayload(payload: StakeholderInteractionCreatePayload) {
  const body: Record<string, unknown> = {}
  setIfDefined(body, 'interaction_type', payload.interactionType)
  setIfDefined(body, 'interaction_date', payload.interactionDate)
  setIfDefined(body, 'summary', payload.summary)
  setIfDefined(body, 'outcome', payload.outcome)
  setIfDefined(body, 'sentiment_after', payload.sentimentAfter)
  setIfDefined(body, 'relationship_strength_after', payload.relationshipStrengthAfter)
  return body
}

function mapStakeholder(stakeholder: ApiStakeholder): Stakeholder {
  return {
    id: stakeholder.id,
    accountId: stakeholder.account_id,
    engagementId: stakeholder.engagement_id,
    reportsToStakeholderId: stakeholder.reports_to_stakeholder_id,
    name: stakeholder.name,
    title: stakeholder.title,
    company: stakeholder.company,
    email: stakeholder.email,
    phone: stakeholder.phone,
    role: stakeholder.role,
    influence: stakeholder.influence,
    relationshipStrength: stakeholder.relationship_strength,
    sentiment: stakeholder.sentiment,
    politicalRisk: stakeholder.political_risk,
    status: stakeholder.status,
    notes: stakeholder.notes,
    lastInteractionAt: stakeholder.last_interaction_at,
    isSensitive: stakeholder.is_sensitive,
    sensitiveFieldsRedacted: stakeholder.sensitive_fields_redacted,
    createdById: stakeholder.created_by_id,
    updatedById: stakeholder.updated_by_id,
    createdAt: stakeholder.created_at,
    updatedAt: stakeholder.updated_at,
    archivedAt: stakeholder.archived_at,
  }
}

function mapStakeholderInteraction(interaction: ApiStakeholderInteraction): StakeholderInteraction {
  return {
    id: interaction.id,
    stakeholderId: interaction.stakeholder_id,
    accountId: interaction.account_id,
    engagementId: interaction.engagement_id,
    interactionType: interaction.interaction_type,
    interactionDate: interaction.interaction_date,
    summary: interaction.summary,
    outcome: interaction.outcome,
    sentimentAfter: interaction.sentiment_after,
    relationshipStrengthAfter: interaction.relationship_strength_after,
    sensitiveFieldsRedacted: interaction.sensitive_fields_redacted,
    createdById: interaction.created_by_id,
    createdByName: interaction.created_by_name,
    createdAt: interaction.created_at,
    updatedAt: interaction.updated_at,
  }
}

function mapCoverageGap(gap: ApiStakeholderCoverageGap): StakeholderCoverageGap {
  return {
    id: gap.id,
    accountId: gap.account_id,
    ruleKey: gap.rule_key,
    severity: gap.severity,
    title: gap.title,
    description: gap.description,
    evidence: gap.evidence,
    status: gap.status,
    createdAt: gap.created_at,
    resolvedAt: gap.resolved_at,
  }
}

function mapOrgChart(chart: ApiStakeholderOrgChart): StakeholderOrgChart {
  return {
    nodes: chart.nodes.map(node => ({
      id: node.id,
      name: node.name,
      title: node.title,
      role: node.role,
      influenceLevel: node.influence_level,
      relationshipStrength: node.relationship_strength,
      sentiment: node.sentiment,
      politicalRisk: node.political_risk,
      parentId: node.parent_id,
      sensitiveFieldsRedacted: node.sensitive_fields_redacted,
    })),
    edges: chart.edges.map(edge => ({
      source: edge.source,
      target: edge.target,
      relationshipType: edge.relationship_type,
    })),
  }
}

function queryString(params: StakeholderFilters | { page?: number; page_size?: number } | URLSearchParams) {
  const query = params instanceof URLSearchParams ? params : objectToSearchParams(params)
  const value = query.toString()
  return value ? `?${value}` : ''
}

function objectToSearchParams(params: object) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    query.set(key, String(value))
  })
  return query
}

function setIfDefined(target: Record<string, unknown>, key: string, value: unknown) {
  if (value !== undefined) target[key] = value
}
