import { apiRequest } from '@/services/api'
import { Page } from '@/services/accountWorkspace'
import {
  Opportunity,
  OpportunityActionItem,
  OpportunityActionItemInput,
  OpportunityCreateInput,
  OpportunityDecision,
  OpportunityDecisionInput,
  OpportunityListParams,
  OpportunityPipelineTotals,
  OpportunityStageDefinition,
  OpportunityStageHistory,
  OpportunityTypeRecord,
  OpportunityUpdateInput,
  Stage,
} from '@/types/opportunity'

export interface ApiOpportunityType {
  id: string
  slug: string
  name: string
  description?: string | null
  is_active: boolean
  display_order: number
  in_use_count: number
  created_at: string
  updated_at: string
}

export interface ApiOpportunityStageDefinition {
  id: string
  slug: string
  name: Stage
  is_terminal: boolean
  is_active: boolean
  display_order: number
}

export interface ApiOpportunityStageHistory {
  id: string
  opportunity_id: string
  account_id: string
  engagement_id?: string | null
  before_stage?: Stage | null
  after_stage: Stage
  actor_id?: string | null
  actor_name: string
  reason?: string | null
  timeline_entry_id?: string | null
  created_at: string
}

export interface ApiOpportunityDecision {
  id: string
  opportunity_id: string
  decision_text: string
  owner_id?: string | null
  owner_name?: string | null
  timeline_entry_id?: string | null
  created_by_id?: string | null
  created_by_name: string
  created_at: string
}

export interface ApiOpportunityActionItem {
  id: string
  opportunity_id: string
  title: string
  owner_id?: string | null
  owner_name?: string | null
  owner_email?: string | null
  due_at: string
  due_date: string
  status: OpportunityActionItem['status']
  priority: OpportunityActionItem['priority']
  notes?: string | null
  future_task_id?: string | null
  completed_at?: string | null
  completed_by_id?: string | null
  created_by_id?: string | null
  created_by_name: string
  created_at: string
  updated_at: string
}

export interface ApiOpportunity {
  id: string
  account_id: string
  account_name: string
  engagement_id?: string | null
  engagement_name?: string | null
  type_id: string
  type_name: string
  type_slug: string
  service_line: string
  owner_id?: string | null
  owner_name: string
  owner_email?: string | null
  name: string
  value: number
  estimated_value: number
  currency: string
  stage: Stage
  next_step: string
  target_date: string
  close_date: string
  source_context?: string | null
  source_record_id?: string | null
  source_record_type?: string | null
  source_record_route?: string | null
  outcome_reason?: string | null
  archived_at?: string | null
  archive_reason?: string | null
  created_at: string
  updated_at: string
  stage_history: ApiOpportunityStageHistory[]
  decisions: ApiOpportunityDecision[]
  action_items: ApiOpportunityActionItem[]
}

export interface ApiOpportunityPipelineTotals {
  open_count: number
  open_value: number
  won_value: number
  total_count: number
  total_value: number
  average_value: number
  stage_counts: Record<string, number>
  stage_values: Record<string, number>
}

export interface ApiOpportunityPage extends Page<ApiOpportunity> {
  totals: ApiOpportunityPipelineTotals
}

export interface OpportunityPage extends Page<Opportunity> {
  totals: OpportunityPipelineTotals
}

export async function listOpportunities(token: string, params: OpportunityListParams = {}): Promise<OpportunityPage> {
  const query = queryString(params)
  const page = await apiRequest<ApiOpportunityPage>(`/api/opportunities${query ? `?${query}` : ''}`, { token })
  return { ...page, items: page.items.map(mapApiOpportunity), totals: mapApiTotals(page.totals) }
}

export async function getOpportunity(token: string, opportunityId: string) {
  return mapApiOpportunity(await apiRequest<ApiOpportunity>(`/api/opportunities/${opportunityId}`, { token }))
}

export async function createOpportunity(token: string, payload: OpportunityCreateInput) {
  return mapApiOpportunity(
    await apiRequest<ApiOpportunity>('/api/opportunities', {
      method: 'POST',
      token,
      body: JSON.stringify(buildCreatePayload(payload)),
    }),
  )
}

export async function updateOpportunity(token: string, opportunityId: string, payload: OpportunityUpdateInput) {
  return mapApiOpportunity(
    await apiRequest<ApiOpportunity>(`/api/opportunities/${opportunityId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(buildUpdatePayload(payload)),
    }),
  )
}

export async function archiveOpportunity(token: string, opportunityId: string, reason?: string) {
  const query = reason ? `?${new URLSearchParams({ reason }).toString()}` : ''
  return apiRequest<{ message: string }>(`/api/opportunities/${opportunityId}${query}`, { method: 'DELETE', token })
}

export async function restoreOpportunity(token: string, opportunityId: string, reason?: string) {
  const query = reason ? `?${new URLSearchParams({ reason }).toString()}` : ''
  return mapApiOpportunity(await apiRequest<ApiOpportunity>(`/api/opportunities/${opportunityId}/restore${query}`, { method: 'POST', token }))
}

export async function moveOpportunityStage(token: string, opportunityId: string, stage: Stage, reason?: string | null, outcomeReason?: string | null) {
  const response = await apiRequest<{ opportunity: ApiOpportunity; history: ApiOpportunityStageHistory }>(`/api/opportunities/${opportunityId}/stage`, {
    method: 'POST',
    token,
    body: JSON.stringify({ stage, reason: reason ?? null, outcome_reason: outcomeReason ?? null }),
  })
  return { opportunity: mapApiOpportunity(response.opportunity), history: mapApiStageHistory(response.history) }
}

export async function listOpportunityTypes(token: string) {
  const page = await apiRequest<Page<ApiOpportunityType>>('/api/opportunity-types?page=1&page_size=100', { token })
  return { ...page, items: page.items.map(mapApiType) }
}

export async function listAdminOpportunityTypes(token: string, params: { activeState?: 'all' | 'active' | 'inactive'; search?: string; page?: number; pageSize?: number } = {}) {
  const query = new URLSearchParams()
  setQuery(query, 'active_state', params.activeState ?? 'all')
  setQuery(query, 'search', params.search)
  setQuery(query, 'page', params.page ?? 1)
  setQuery(query, 'page_size', params.pageSize ?? 100)
  const page = await apiRequest<Page<ApiOpportunityType>>(`/api/admin/opportunity-types?${query.toString()}`, { token })
  return { ...page, items: page.items.map(mapApiType) }
}

export async function createOpportunityType(token: string, payload: { slug: string; name: string; description?: string | null; displayOrder?: number; isActive?: boolean }) {
  return mapApiType(
    await apiRequest<ApiOpportunityType>('/api/admin/opportunity-types', {
      method: 'POST',
      token,
      body: JSON.stringify({
        slug: payload.slug,
        name: payload.name,
        description: payload.description ?? null,
        display_order: payload.displayOrder ?? 0,
        is_active: payload.isActive ?? true,
      }),
    }),
  )
}

export async function updateOpportunityType(token: string, typeId: string, payload: { slug?: string; name?: string; description?: string | null; displayOrder?: number; isActive?: boolean }) {
  return mapApiType(
    await apiRequest<ApiOpportunityType>(`/api/admin/opportunity-types/${typeId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({
        slug: payload.slug,
        name: payload.name,
        description: payload.description,
        display_order: payload.displayOrder,
        is_active: payload.isActive,
      }),
    }),
  )
}

export async function deactivateOpportunityType(token: string, typeId: string) {
  return apiRequest<{ message: string }>(`/api/admin/opportunity-types/${typeId}`, { method: 'DELETE', token })
}

export async function listOpportunityStages(token: string) {
  const stages = await apiRequest<ApiOpportunityStageDefinition[]>('/api/opportunity-stages', { token })
  return stages.map(mapApiStageDefinition)
}

export async function addOpportunityDecision(token: string, opportunityId: string, payload: OpportunityDecisionInput) {
  return mapApiDecision(
    await apiRequest<ApiOpportunityDecision>(`/api/opportunities/${opportunityId}/decisions`, {
      method: 'POST',
      token,
      body: JSON.stringify({
        decision_text: payload.decisionText,
        owner_id: payload.ownerId ?? null,
        owner_name: payload.ownerName ?? null,
      }),
    }),
  )
}

export async function addOpportunityActionItem(token: string, opportunityId: string, payload: OpportunityActionItemInput) {
  return mapApiActionItem(
    await apiRequest<ApiOpportunityActionItem>(`/api/opportunities/${opportunityId}/action-items`, {
      method: 'POST',
      token,
      body: JSON.stringify(buildActionItemPayload(payload)),
    }),
  )
}

export async function updateOpportunityActionItem(token: string, actionItemId: string, payload: Partial<OpportunityActionItemInput>) {
  return mapApiActionItem(
    await apiRequest<ApiOpportunityActionItem>(`/api/opportunity-action-items/${actionItemId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(buildActionItemPayload(payload)),
    }),
  )
}

export function buildCreatePayload(payload: OpportunityCreateInput) {
  return {
    account_id: payload.accountId,
    engagement_id: payload.engagementId ?? null,
    type_id: payload.typeId,
    owner_id: payload.ownerId,
    name: payload.name,
    service_line: payload.serviceLine,
    value: payload.value,
    currency: payload.currency,
    stage: payload.stage,
    next_step: payload.nextStep,
    target_date: payload.targetDate,
    source_context: payload.sourceContext ?? 'manual',
    source_record_id: payload.sourceRecordId ?? null,
    source_record_type: payload.sourceRecordType ?? null,
    source_record_route: payload.sourceRecordRoute ?? null,
    outcome_reason: payload.outcomeReason ?? null,
    action_items: (payload.actionItems ?? []).map(buildActionItemPayload),
  }
}

export function buildUpdatePayload(payload: OpportunityUpdateInput) {
  return {
    engagement_id: payload.engagementId,
    type_id: payload.typeId,
    owner_id: payload.ownerId,
    name: payload.name,
    service_line: payload.serviceLine,
    value: payload.value,
    currency: payload.currency,
    stage: payload.stage,
    next_step: payload.nextStep,
    target_date: payload.targetDate,
    source_context: payload.sourceContext,
    source_record_id: payload.sourceRecordId,
    source_record_type: payload.sourceRecordType,
    source_record_route: payload.sourceRecordRoute,
    outcome_reason: payload.outcomeReason,
  }
}

function buildActionItemPayload(payload: Partial<OpportunityActionItemInput>) {
  const body: Record<string, unknown> = {}
  if (payload.title !== undefined) body.title = payload.title
  if (payload.ownerId !== undefined) body.owner_id = payload.ownerId || null
  if (payload.ownerName !== undefined) body.owner_name = payload.ownerName || null
  if (payload.ownerEmail !== undefined) body.owner_email = payload.ownerEmail || null
  if (payload.dueDate !== undefined) body.due_date = payload.dueDate
  if (payload.status !== undefined) body.status = payload.status
  if (payload.priority !== undefined) body.priority = payload.priority
  if (payload.notes !== undefined) body.notes = payload.notes
  if (payload.createTask !== undefined) body.create_task = payload.createTask
  return body
}

function queryString(params: OpportunityListParams) {
  const query = new URLSearchParams()
  setQuery(query, 'account_id', params.accountId)
  setQuery(query, 'engagement_id', params.engagementId)
  setQuery(query, 'search', params.search)
  setQuery(query, 'type_id', params.typeId)
  setQuery(query, 'type_slug', params.typeSlug)
  setQuery(query, 'stage', params.stage)
  setQuery(query, 'owner_id', params.ownerId)
  setQuery(query, 'service_line', params.serviceLine)
  setQuery(query, 'source_context', params.sourceContext)
  setQuery(query, 'target_from', params.targetFrom)
  setQuery(query, 'target_to', params.targetTo)
  setQuery(query, 'min_value', params.minValue)
  setQuery(query, 'max_value', params.maxValue)
  setQuery(query, 'include_archived', params.includeArchived ? 'true' : undefined)
  setQuery(query, 'open_only', params.openOnly ? 'true' : undefined)
  setQuery(query, 'stalled', params.stalled ? 'true' : undefined)
  setQuery(query, 'stalled_after_days', params.stalledAfterDays)
  setQuery(query, 'sort', params.sort)
  setQuery(query, 'direction', params.direction)
  setQuery(query, 'page', params.page)
  setQuery(query, 'page_size', params.pageSize)
  return query.toString()
}

function setQuery(query: URLSearchParams, key: string, value: string | number | undefined) {
  if (value !== undefined && value !== '') query.set(key, String(value))
}

export function mapApiOpportunity(opportunity: ApiOpportunity): Opportunity {
  return {
    id: opportunity.id,
    accountId: opportunity.account_id,
    accountName: opportunity.account_name,
    engagementId: opportunity.engagement_id ?? null,
    engagementName: opportunity.engagement_name ?? null,
    typeId: opportunity.type_id,
    typeName: opportunity.type_name,
    typeSlug: opportunity.type_slug,
    serviceLine: opportunity.service_line,
    name: opportunity.name,
    ownerId: opportunity.owner_id ?? '',
    ownerName: opportunity.owner_name,
    ownerEmail: opportunity.owner_email ?? null,
    estimatedValue: Number(opportunity.estimated_value ?? opportunity.value ?? 0),
    value: Number(opportunity.value ?? opportunity.estimated_value ?? 0),
    currency: opportunity.currency,
    closeDate: opportunity.close_date ?? opportunity.target_date,
    targetDate: opportunity.target_date,
    stage: opportunity.stage,
    nextStep: opportunity.next_step,
    sourceContext: opportunity.source_context ?? null,
    sourceRecordId: opportunity.source_record_id ?? null,
    sourceRecordType: opportunity.source_record_type ?? null,
    sourceRecordRoute: opportunity.source_record_route ?? null,
    outcomeReason: opportunity.outcome_reason ?? null,
    archivedAt: opportunity.archived_at ?? null,
    archiveReason: opportunity.archive_reason ?? null,
    createdAt: opportunity.created_at,
    updatedAt: opportunity.updated_at,
    stageHistory: (opportunity.stage_history ?? []).map(mapApiStageHistory),
    decisions: (opportunity.decisions ?? []).map(mapApiDecision),
    actionItems: (opportunity.action_items ?? []).map(mapApiActionItem),
  }
}

function mapApiType(item: ApiOpportunityType): OpportunityTypeRecord {
  return {
    id: item.id,
    slug: item.slug,
    name: item.name,
    description: item.description ?? null,
    isActive: item.is_active,
    displayOrder: item.display_order,
    inUseCount: item.in_use_count,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  }
}

function mapApiStageDefinition(item: ApiOpportunityStageDefinition): OpportunityStageDefinition {
  return {
    id: item.id,
    slug: item.slug,
    name: item.name,
    isTerminal: item.is_terminal,
    isActive: item.is_active,
    displayOrder: item.display_order,
  }
}

function mapApiStageHistory(item: ApiOpportunityStageHistory): OpportunityStageHistory {
  return {
    id: item.id,
    opportunityId: item.opportunity_id,
    accountId: item.account_id,
    engagementId: item.engagement_id ?? null,
    beforeStage: item.before_stage ?? null,
    afterStage: item.after_stage,
    actorId: item.actor_id ?? null,
    actorName: item.actor_name,
    reason: item.reason ?? null,
    timelineEntryId: item.timeline_entry_id ?? null,
    createdAt: item.created_at,
  }
}

function mapApiDecision(item: ApiOpportunityDecision): OpportunityDecision {
  return {
    id: item.id,
    opportunityId: item.opportunity_id,
    decisionText: item.decision_text,
    ownerId: item.owner_id ?? null,
    ownerName: item.owner_name ?? null,
    timelineEntryId: item.timeline_entry_id ?? null,
    createdById: item.created_by_id ?? null,
    createdByName: item.created_by_name,
    createdAt: item.created_at,
  }
}

function mapApiActionItem(item: ApiOpportunityActionItem): OpportunityActionItem {
  return {
    id: item.id,
    opportunityId: item.opportunity_id,
    title: item.title,
    ownerId: item.owner_id ?? null,
    ownerName: item.owner_name ?? null,
    ownerEmail: item.owner_email ?? null,
    dueDate: item.due_date ?? item.due_at,
    status: item.status,
    priority: item.priority,
    notes: item.notes ?? null,
    futureTaskId: item.future_task_id ?? null,
    completedAt: item.completed_at ?? null,
    completedById: item.completed_by_id ?? null,
    createdById: item.created_by_id ?? null,
    createdByName: item.created_by_name,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  }
}

function mapApiTotals(totals: ApiOpportunityPipelineTotals): OpportunityPipelineTotals {
  return {
    openCount: totals.open_count,
    openValue: Number(totals.open_value ?? 0),
    wonValue: Number(totals.won_value ?? 0),
    totalCount: totals.total_count,
    totalValue: Number(totals.total_value ?? 0),
    averageValue: Number(totals.average_value ?? 0),
    stageCounts: totals.stage_counts ?? {},
    stageValues: totals.stage_values ?? {},
  }
}
