import { apiRequest } from '@/services/api'
import { TimelineComment, TimelineEntry, TimelineEventType, TimelineEventTypeConfig, TimelineModule, SensitivityLevel } from '@/types/timeline'

export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

interface ApiTimelineEvent {
  id: string
  account_id: string
  engagement_id?: string | null
  event_type: string
  module?: string | null
  title: string
  description: string
  previous_value?: Record<string, unknown> | null
  new_value?: Record<string, unknown> | null
  before_value?: Record<string, unknown> | null
  after_value?: Record<string, unknown> | null
  actor_id: string
  actor_name: string
  performed_by?: string | null
  performed_by_name?: string | null
  source_module: string
  source_record_id?: string | null
  source_record_type?: string | null
  source_record_route?: string | null
  metadata?: Record<string, unknown> | null
  event_at?: string | null
  timestamp?: string | null
  is_sensitive: boolean
  sensitivity_level?: string | null
  tags: string[]
  mentions: string[]
  attachments: { name?: string; url?: string }[]
  status: string
  is_system_generated: boolean
  is_immutable: boolean
  created_at: string
  updated_at?: string | null
}

interface ApiTimelineComment {
  id: string
  timeline_entry_id: string
  author_id: string
  author_name: string
  body: string
  mentions: string[]
  created_at: string
  updated_at: string
}

interface ApiEventType {
  id: string
  slug: string
  name: string
  category: string
  module: string
  color_token: string
  display_order: number
  default_visibility: 'public' | 'restricted'
  retention_policy_id?: string | null
  is_active: boolean
  is_critical: boolean
  created_at: string
  updated_at: string
}

export interface TimelineFiltersApi {
  search?: string
  event_type?: string
  module?: string
  owner_id?: string
  date_from?: string
  date_to?: string
  show_sensitive?: boolean
  sort?: string
  direction?: 'asc' | 'desc'
  page?: number
  page_size?: number
}

export interface TimelineNotePayload {
  event_type: string
  title?: string
  description: string
  event_at?: string
  owner_id?: string
  mentions: string[]
  attachments: { name?: string; url?: string }[]
  is_sensitive?: boolean
  sensitivity_level?: string
  tags?: string[]
}

export interface TimelineAiSearchPayload {
  query: string
  scopes?: string[]
  document_search?: boolean
  date_from?: string
  date_to?: string
  limit?: number
}

export interface TimelineAiSearchResponse {
  query: string
  interpreted_intent: string
  mode: string
  confidence: 'high' | 'medium' | 'low'
  answer: string
  disclaimer: string
  results: {
    id: string
    title: string
    excerpt: string
    event_type: string
    source_module: string
    source_route?: string | null
    event_at: string
    relevance: number
    mode: string
  }[]
  document_results: {
    id: string
    source_label: string
    excerpt: string
    source_route?: string | null
  }[]
  audit_id: string
  can_try_in_kam_ai: boolean
}

export interface HandoverSummary {
  id: string
  account_id: string
  generated_by_id: string
  generated_by_name: string
  selected_sections: string[]
  source_set: { type: string; id: string }[]
  redaction_summary: Record<string, unknown>
  citations: { id: string; label: string; excerpt: string; source_route?: string | null }[]
  content: Record<string, unknown>
  status: string
  export_metadata: Record<string, unknown>
  share_metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface HandoverShare {
  summary_id: string
  share_id: string
  internal_share_url: string
  created_at: string
  expires_at?: string | null
}

export interface RetentionPolicy {
  id: string
  name: string
  action: 'archive' | 'restrict' | 'delete'
  duration_days: number
  reason_template: string
  schedule_enabled: boolean
  schedule_interval_hours: number
  last_run_at?: string | null
  next_run_at?: string | null
  is_active: boolean
}

export interface RetentionAction {
  id: string
  policy_id?: string | null
  action: string
  mode: string
  status: string
  matched_count: number
  affected_count: number
  reason?: string | null
  actor_name: string
  created_at: string
}

export interface RetentionRunResult {
  policy_id: string
  action: string
  mode: string
  matched_count: number
  affected_count: number
  sample_event_ids: string[]
}

export async function getAccountTimeline(token: string, accountId: string, params: TimelineFiltersApi) {
  const query = queryString(params)
  const page = await apiRequest<Page<ApiTimelineEvent>>(`/api/accounts/${accountId}/timeline${query ? `?${query}` : ''}`, { token })
  return { ...page, items: page.items.map(mapTimelineEvent) }
}

export async function createTimelineNote(token: string, accountId: string, payload: TimelineNotePayload) {
  return mapTimelineEvent(await apiRequest<ApiTimelineEvent>(`/api/accounts/${accountId}/timeline-notes`, { method: 'POST', token, body: JSON.stringify(payload) }))
}

export async function updateTimelineEvent(token: string, eventId: string, payload: Partial<TimelineNotePayload>) {
  return mapTimelineEvent(await apiRequest<ApiTimelineEvent>(`/api/timeline-events/${eventId}`, { method: 'PATCH', token, body: JSON.stringify(payload) }))
}

export async function deleteTimelineEvent(token: string, eventId: string) {
  return apiRequest<{ message: string }>(`/api/timeline-events/${eventId}`, { method: 'DELETE', token })
}

export async function getTimelineComments(token: string, eventId: string, page = 1) {
  const result = await apiRequest<Page<ApiTimelineComment>>(`/api/timeline-events/${eventId}/comments?page=${page}&page_size=25`, { token })
  return { ...result, items: result.items.map(mapTimelineComment) }
}

export async function createTimelineComment(token: string, eventId: string, body: string, mentions: string[]) {
  return mapTimelineComment(await apiRequest<ApiTimelineComment>(`/api/timeline-events/${eventId}/comments`, { method: 'POST', token, body: JSON.stringify({ body, mentions }) }))
}

export async function updateTimelineComment(token: string, eventId: string, commentId: string, body: string, mentions: string[]) {
  return mapTimelineComment(await apiRequest<ApiTimelineComment>(`/api/timeline-events/${eventId}/comments/${commentId}`, { method: 'PATCH', token, body: JSON.stringify({ body, mentions }) }))
}

export async function deleteTimelineComment(token: string, eventId: string, commentId: string) {
  return apiRequest<{ message: string }>(`/api/timeline-events/${eventId}/comments/${commentId}`, { method: 'DELETE', token })
}

export async function getTimelineEventTypes(token: string, activeState = 'all') {
  const page = await apiRequest<Page<ApiEventType>>(`/api/timeline-event-types?active_state=${activeState}&page=1&page_size=100`, { token })
  return { ...page, items: page.items.map(mapEventType) }
}

export async function getRetentionPolicies(token: string) {
  return apiRequest<Page<RetentionPolicy>>('/api/admin/retention-policies?page=1&page_size=100', { token })
}

export async function createRetentionPolicy(token: string, payload: Partial<RetentionPolicy> & { name: string; action: string; duration_days: number }) {
  return apiRequest<RetentionPolicy>('/api/admin/retention-policies', { method: 'POST', token, body: JSON.stringify(payload) })
}

export async function updateRetentionPolicy(token: string, policyId: string, payload: Partial<RetentionPolicy>) {
  return apiRequest<RetentionPolicy>(`/api/admin/retention-policies/${policyId}`, { method: 'PATCH', token, body: JSON.stringify(payload) })
}

export async function simulateRetentionPolicy(token: string, policyId: string) {
  return apiRequest<RetentionRunResult>(`/api/admin/retention-policies/${policyId}/simulate`, { method: 'POST', token, body: JSON.stringify({ limit: 500 }) })
}

export async function runRetentionPolicy(token: string, policyId: string) {
  return apiRequest<RetentionRunResult>(`/api/admin/retention-policies/${policyId}/run`, { method: 'POST', token, body: JSON.stringify({ limit: 500 }) })
}

export async function getRetentionActions(token: string, params: { search?: string; action?: string; mode?: string; entity_type?: string; status?: string; page?: number; page_size?: number } = {}) {
  const query = queryString({ page: 1, page_size: 25, ...params })
  return apiRequest<Page<RetentionAction>>(`/api/admin/retention-actions?${query}`, { token })
}

export async function generateHandoverSummary(token: string, accountId: string, selectedSections: string[] = []) {
  return apiRequest<HandoverSummary>(`/api/accounts/${accountId}/handover-summary`, { method: 'POST', token, body: JSON.stringify({ selected_sections: selectedSections }) })
}

export async function getHandoverSummaries(token: string, accountId: string, params: { search?: string; generated_by_id?: string; ownership_change_id?: string; page?: number; page_size?: number } = {}) {
  const query = queryString({ page: 1, page_size: 25, ...params })
  return apiRequest<Page<HandoverSummary>>(`/api/accounts/${accountId}/handover-summaries?${query}`, { token })
}

export async function shareHandoverSummary(token: string, summaryId: string) {
  return apiRequest<HandoverShare>(`/api/handover-summaries/${summaryId}/share`, { method: 'POST', token })
}

export async function exportHandoverPdf(token: string, summaryId: string) {
  const base = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8001'
  const response = await fetch(`${base}/api/handover-summaries/${summaryId}/export`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error('Handover PDF could not be exported')
  return response.blob()
}

export async function runTimelineAiSearch(token: string, accountId: string, payload: TimelineAiSearchPayload) {
  return apiRequest<TimelineAiSearchResponse>(`/api/accounts/${accountId}/timeline/ai-search`, { method: 'POST', token, body: JSON.stringify(payload) })
}

export function handoverPdfUrl(summaryId: string) {
  const base = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8001'
  return `${base}/api/handover-summaries/${summaryId}/export`
}

export function mapTimelineEvent(event: ApiTimelineEvent): TimelineEntry {
  return {
    id: event.id,
    accountId: event.account_id,
    eventType: toTimelineEventType(event.event_type),
    module: toTimelineModule(event.module ?? event.source_module),
    title: event.title,
    description: event.description,
    performedBy: event.performed_by ?? event.actor_id,
    performedByName: event.performed_by_name ?? event.actor_name,
    timestamp: event.event_at ?? event.timestamp ?? event.created_at,
    sourceRecordId: event.source_record_id ?? event.engagement_id ?? undefined,
    sourceRecordType: event.source_record_type ?? (event.engagement_id ? 'engagement' : undefined),
    sourceRecordRoute: event.source_record_route ?? undefined,
    beforeValue: event.before_value ?? event.previous_value ?? undefined,
    afterValue: event.after_value ?? event.new_value ?? undefined,
    isSensitive: event.is_sensitive,
    sensitivityLevel: toSensitivity(event.sensitivity_level),
    tags: event.tags ?? [],
    mentions: event.mentions ?? [],
    attachments: event.attachments?.map(item => ({ name: item.name ?? 'Attachment', url: item.url ?? '' })).filter(item => item.url),
    metadata: event.metadata ?? undefined,
    isSystemGenerated: event.is_system_generated,
    isImmutable: event.is_immutable,
    retentionPolicy: event.status === 'archived' ? 'archive' : undefined,
  }
}

function mapTimelineComment(comment: ApiTimelineComment): TimelineComment {
  return {
    id: comment.id,
    entryId: comment.timeline_entry_id,
    authorId: comment.author_id,
    authorName: comment.author_name,
    content: comment.body,
    timestamp: comment.created_at,
    mentions: comment.mentions ?? [],
  }
}

function mapEventType(item: ApiEventType): TimelineEventTypeConfig {
  return {
    id: item.id,
    name: item.name,
    eventType: toTimelineEventType(item.slug),
    module: toTimelineModule(item.module),
    colorToken: item.color_token,
    active: item.is_active,
    defaultVisibility: item.default_visibility,
    createdDate: item.created_at,
    retentionPolicy: 'keep',
  }
}

function toTimelineEventType(value: string): TimelineEventType {
  return value as TimelineEventType
}

function toTimelineModule(value?: string | null): TimelineModule {
  const module = value || 'manual'
  return module as TimelineModule
}

function toSensitivity(value?: string | null): SensitivityLevel | undefined {
  if (value === 'commercial' || value === 'executive' || value === 'legal' || value === 'escalation') return value
  return undefined
}

function queryString(params: object) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    query.set(key, String(value))
  })
  return query.toString()
}
