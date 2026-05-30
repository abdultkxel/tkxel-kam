import { apiRequest } from '@/services/api'
import {
  AccountHealthRollup,
  EngagementActivity,
  EngagementAttachment,
  EngagementContribution,
  EngagementDeliveryStatus,
  EngagementHealth,
  EngagementRecord,
  EngagementStatus,
  HealthRagStatus,
  SourceDocumentLink,
} from '@/types/v3'
import { RiskStatus } from '@/types/account'

interface EngagementPageResponse {
  items: ApiEngagement[]
  total: number
  page: number
  page_size: number
  pages: number
}

interface ApiEngagement {
  id: string
  account_id: string
  account_name?: string | null
  name: string
  status: EngagementStatus
  source_document_links: SourceDocumentLink[]
  start_date: string
  end_date: string
  renewal_date?: string | null
  notice_deadline?: string | null
  notice_period_days: number
  owner_id: string
  owner_name: string
  ops_lead_id?: string | null
  ops_lead_name?: string | null
  service_lines: string[]
  value: number
  currency: 'USD'
  delivery_status: EngagementDeliveryStatus
  delivery_health: number
  resource_dependency?: string | null
  commercial_context?: string | null
  risks: string[]
  attachments: ApiEngagementAttachment[]
  activity_notes: ApiEngagementActivity[]
  escalation_notes: ApiEngagementEscalation[]
  health_score?: number | null
  health_rag_status?: HealthRagStatus | null
  health_drivers: string[]
  health_freshness: EngagementHealth['freshness']
  health_dirty: boolean
  health_contribution: number
  formula_version?: string | null
  created_at: string
  updated_at: string
}

interface ApiEngagementAttachment {
  name: string
  url: string
  uploaded_by_name?: string | null
  uploaded_at?: string | null
}

interface ApiEngagementActivity {
  title: string
  detail?: string | null
  occurred_at?: string | null
}

interface ApiEngagementEscalation {
  title: string
  status: 'open' | 'watchlist' | 'closed'
  severity: 'amber' | 'red'
  detail?: string | null
}

interface ApiEngagementPayload {
  account_name?: string
  name: string
  status: EngagementStatus
  source_document_links: SourceDocumentLink[]
  start_date: string
  end_date: string
  renewal_date?: string | null
  notice_deadline?: string | null
  notice_period_days: number
  owner_id: string
  owner_name: string
  ops_lead_id?: string | null
  ops_lead_name?: string | null
  service_lines: string[]
  value: number
  currency: 'USD'
  delivery_status: EngagementDeliveryStatus
  delivery_health: number
  resource_dependency?: string | null
  commercial_context?: string | null
  risks: string[]
  attachments: ApiEngagementAttachment[]
  activity_notes: ApiEngagementActivity[]
  escalation_notes: ApiEngagementEscalation[]
}

interface ApiEngagementHealth {
  engagement_id: string
  account_id: string
  score: number
  rag_status: HealthRagStatus
  drivers: string[]
  freshness: EngagementHealth['freshness']
  contribution_to_account_health: number
  formula_version: string
  dirty: boolean
  metric_inputs: Record<string, unknown>
  calculated_at?: string | null
}

interface ApiEngagementContribution {
  engagement_id: string
  engagement_name: string
  status: EngagementStatus
  value: number
  score?: number | null
  rag_status: HealthRagStatus
  dirty: boolean
  contribution_to_account_health: number
  freshness: EngagementHealth['freshness']
  drivers: string[]
}

interface ApiAccountHealthSnapshot {
  id: string
  account_id: string
  rollup_score: number
  formula_version: string
  contributions: ApiEngagementContribution[]
  dirty_count: number
  created_at: string
}

interface ApiAccountHealthRollup {
  account_id: string
  rollup_score: number
  formula_version: string
  contributions: ApiEngagementContribution[]
  dirty_count: number
  snapshots: ApiAccountHealthSnapshot[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface AccountEngagementListParams {
  status?: string
  owner?: string
  service_line?: string
  renewal_window?: string
  risk_status?: string
  search?: string
  sort_by?: string
  sort_dir?: 'asc' | 'desc'
  page?: number
  page_size?: number
}

export interface AccountHealthRollupParams {
  sort_by?: 'score' | 'risk' | 'freshness' | 'value'
  rag_status?: HealthRagStatus
  dirty?: boolean
  page?: number
  page_size?: number
}

export async function listAccountEngagements(token: string, accountId: string, params: AccountEngagementListParams = {}) {
  const response = await apiRequest<EngagementPageResponse>(`/api/accounts/${accountId}/engagements${queryString(params)}`, { token })
  return {
    ...response,
    items: response.items.map(mapApiEngagement),
  }
}

export async function createAccountEngagement(token: string, accountId: string, engagement: EngagementRecord) {
  const response = await apiRequest<ApiEngagement>(`/api/accounts/${accountId}/engagements`, {
    method: 'POST',
    token,
    body: JSON.stringify(toEngagementPayload(engagement)),
  })
  return mapApiEngagement(response)
}

export async function getEngagement(token: string, engagementId: string) {
  const response = await apiRequest<ApiEngagement>(`/api/engagements/${engagementId}`, { token })
  return mapApiEngagement(response)
}

export async function updateEngagementApi(token: string, engagementId: string, engagement: EngagementRecord) {
  const response = await apiRequest<ApiEngagement>(`/api/engagements/${engagementId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(toEngagementPayload(engagement)),
  })
  return mapApiEngagement(response)
}

export function archiveEngagementApi(token: string, engagementId: string) {
  return apiRequest<{ message: string }>(`/api/engagements/${engagementId}`, {
    method: 'DELETE',
    token,
  })
}

export async function getEngagementHealth(token: string, engagementId: string) {
  const response = await apiRequest<ApiEngagementHealth>(`/api/engagements/${engagementId}/health`, { token })
  return mapApiEngagementHealth(response)
}

export async function recalculateEngagementHealthApi(token: string, engagementId: string) {
  const response = await apiRequest<ApiEngagementHealth>(`/api/engagements/${engagementId}/health/recalculate`, {
    method: 'POST',
    token,
  })
  return mapApiEngagementHealth(response)
}

export async function getAccountHealthRollupApi(token: string, accountId: string, params: AccountHealthRollupParams = {}) {
  const response = await apiRequest<ApiAccountHealthRollup>(`/api/accounts/${accountId}/health/rollup${queryString(params)}`, { token })
  return mapApiAccountHealthRollup(response)
}

function toEngagementPayload(engagement: EngagementRecord): ApiEngagementPayload {
  return {
    account_name: engagement.accountName,
    name: engagement.name,
    status: engagement.status,
    source_document_links: engagement.sourceDocumentLinks ?? [],
    start_date: toApiDate(engagement.renewalTerms.startDate),
    end_date: toApiDate(engagement.renewalTerms.endDate),
    renewal_date: engagement.renewalTerms.renewalDate ? toApiDate(engagement.renewalTerms.renewalDate) : null,
    notice_deadline: engagement.renewalTerms.noticeDeadline ? toApiDate(engagement.renewalTerms.noticeDeadline) : null,
    notice_period_days: engagement.renewalTerms.noticePeriodDays,
    owner_id: engagement.ownerId,
    owner_name: engagement.ownerName,
    ops_lead_id: engagement.opsLeadId || null,
    ops_lead_name: engagement.opsLeadName || null,
    service_lines: engagement.serviceLines,
    value: engagement.value,
    currency: engagement.currency ?? 'USD',
    delivery_status: engagement.deliveryStatus ?? 'on_track',
    delivery_health: engagement.deliveryHealth,
    resource_dependency: engagement.resourceDependency || null,
    commercial_context: engagement.commercialContext || null,
    risks: engagement.risks,
    attachments: (engagement.attachments ?? []).map(attachment => ({
      name: attachment.name,
      url: attachment.url,
      uploaded_by_name: attachment.uploadedByName,
      uploaded_at: attachment.uploadedAt,
    })),
    activity_notes: (engagement.activities ?? []).map(activity => ({
      title: activity.title,
      detail: activity.detail,
      occurred_at: activity.occurredAt,
    })),
    escalation_notes: [],
  }
}

function mapApiEngagement(engagement: ApiEngagement): EngagementRecord {
  const startDate = toIsoDate(engagement.start_date)
  const endDate = toIsoDate(engagement.end_date)
  const renewalDate = toIsoDate(engagement.renewal_date ?? engagement.end_date)
  const noticeDeadline = toIsoDate(engagement.notice_deadline ?? engagement.renewal_date ?? engagement.end_date)
  return {
    id: engagement.id,
    accountId: engagement.account_id,
    accountName: engagement.account_name ?? '',
    name: engagement.name,
    status: engagement.status,
    ownerId: engagement.owner_id,
    ownerName: engagement.owner_name,
    opsLeadId: engagement.ops_lead_id ?? '',
    opsLeadName: engagement.ops_lead_name ?? '',
    serviceLines: engagement.service_lines,
    value: engagement.value,
    currency: engagement.currency,
    deliveryStatus: engagement.delivery_status,
    deliveryHealth: engagement.delivery_health,
    resourceDependency: engagement.resource_dependency ?? '',
    commercialContext: engagement.commercial_context ?? '',
    risks: engagement.risks,
    sourceDocumentIds: [],
    sourceDocumentLinks: engagement.source_document_links,
    attachments: mapApiAttachments(engagement.attachments),
    activities: mapApiActivities(engagement.activity_notes),
    health: {
      score: engagement.health_score ?? 0,
      ragStatus: engagement.health_rag_status ?? 'dirty',
      drivers: engagement.health_drivers.length ? engagement.health_drivers : ['Health has not been calculated.'],
      freshness: engagement.health_freshness,
      contributionToAccountHealth: engagement.health_contribution,
      formulaVersion: engagement.formula_version ?? 'engagement-health-v1',
      dirty: engagement.health_dirty,
      calculatedAt: undefined,
    },
    createdAt: engagement.created_at,
    updatedAt: engagement.updated_at,
    renewalTerms: {
      startDate,
      endDate,
      renewalDate,
      noticeDeadline,
      noticePeriodDays: engagement.notice_period_days,
      autoRenewal: false,
      commercialExposure: engagement.value,
      daysToExpiry: daysBetween(endDate, new Date()),
      riskStatus: riskStatusFromEngagement(engagement),
      confidence: 100,
      sourceDocumentId: engagement.source_document_links[0]?.url ?? '',
      sourceCitation: engagement.source_document_links[0]?.title ? `Source evidence: ${engagement.source_document_links[0].title}` : 'Manual engagement entry.',
    },
  }
}

function mapApiEngagementHealth(health: ApiEngagementHealth): EngagementHealth {
  return {
    score: health.score,
    ragStatus: health.rag_status,
    drivers: health.drivers,
    freshness: health.freshness,
    contributionToAccountHealth: health.contribution_to_account_health,
    formulaVersion: health.formula_version,
    dirty: health.dirty,
    calculatedAt: health.calculated_at ?? undefined,
  }
}

function mapApiAccountHealthRollup(rollup: ApiAccountHealthRollup): AccountHealthRollup {
  return {
    accountId: rollup.account_id,
    rollupScore: rollup.rollup_score,
    formulaVersion: rollup.formula_version,
    contributions: rollup.contributions.map(mapApiContribution),
    dirtyCount: rollup.dirty_count,
    snapshots: rollup.snapshots.map(snapshot => ({
      id: snapshot.id,
      accountId: snapshot.account_id,
      rollupScore: snapshot.rollup_score,
      formulaVersion: snapshot.formula_version,
      contributions: snapshot.contributions.map(mapSnapshotContribution),
      dirtyCount: snapshot.dirty_count,
      createdAt: snapshot.created_at,
    })),
  }
}

function mapApiContribution(contribution: ApiEngagementContribution): EngagementContribution {
  return {
    engagementId: contribution.engagement_id,
    engagementName: contribution.engagement_name,
    status: contribution.status,
    value: contribution.value,
    score: contribution.score ?? undefined,
    ragStatus: contribution.rag_status,
    dirty: contribution.dirty,
    contributionToAccountHealth: contribution.contribution_to_account_health,
    freshness: contribution.freshness,
    drivers: contribution.drivers,
  }
}

function mapSnapshotContribution(contribution: ApiEngagementContribution | Record<string, unknown>): EngagementContribution {
  if ('engagement_id' in contribution) return mapApiContribution(contribution as ApiEngagementContribution)
  return {
    engagementId: String(contribution.engagementId ?? ''),
    engagementName: String(contribution.engagementName ?? ''),
    status: String(contribution.status ?? 'active') as EngagementStatus,
    value: Number(contribution.value ?? 0),
    score: typeof contribution.score === 'number' ? contribution.score : undefined,
    ragStatus: String(contribution.ragStatus ?? 'dirty') as HealthRagStatus,
    dirty: Boolean(contribution.dirty ?? true),
    contributionToAccountHealth: Number(contribution.contributionToAccountHealth ?? 0),
    freshness: String(contribution.freshness ?? 'not_calculated') as EngagementHealth['freshness'],
    drivers: Array.isArray(contribution.drivers) ? contribution.drivers.map(String) : [],
  }
}

function mapApiAttachments(attachments: ApiEngagementAttachment[]): EngagementAttachment[] {
  return attachments.map((attachment, index) => ({
    id: `${attachment.url}-${index}`,
    name: attachment.name,
    url: attachment.url,
    uploadedByName: attachment.uploaded_by_name ?? '',
    uploadedAt: attachment.uploaded_at ?? new Date().toISOString(),
  }))
}

function mapApiActivities(activities: ApiEngagementActivity[]): EngagementActivity[] {
  return activities.map((activity, index) => ({
    id: `${activity.title}-${index}`,
    title: activity.title,
    detail: activity.detail ?? '',
    occurredAt: activity.occurred_at ?? new Date().toISOString(),
    performedByName: '',
  }))
}

function riskStatusFromEngagement(engagement: ApiEngagement): RiskStatus {
  if (engagement.delivery_status === 'blocked' || engagement.delivery_status === 'at_risk' || engagement.health_rag_status === 'red') return 'critical'
  if (engagement.delivery_status === 'watch' || engagement.health_rag_status === 'amber' || engagement.risks.length >= 2) return 'warning'
  return 'healthy'
}

function daysBetween(isoDate: string, target: Date) {
  const start = new Date(isoDate)
  return Math.ceil((start.getTime() - target.getTime()) / 86400000)
}

function toIsoDate(value: string) {
  return new Date(`${value}T00:00:00`).toISOString()
}

function toApiDate(value: string) {
  return value.slice(0, 10)
}

function queryString(params: object) {
  const searchParams = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      if (value !== '') searchParams.set(key, String(value))
    }
  })
  const query = searchParams.toString()
  return query ? `?${query}` : ''
}
