import { apiRequest } from '@/services/api'
import { Page } from '@/services/accountWorkspace'
import { GovernanceEventRecord } from '@/types/governance'

function queryString(params: URLSearchParams) {
  const query = params.toString()
  return query ? `?${query}` : ''
}

export interface ContentItem {
  id: string
  title: string
  description?: string | null
  content_type: string
  category: string
  tags: string[]
  service_lines: string[]
  account_stages: string[]
  source_kind: 'manual' | 'url' | 'file'
  url?: string | null
  body_content?: string | null
  is_active: boolean
  popularity_count: number
  custom_field_values?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface RuntimeCustomField {
  id: string
  module: string
  field_key: string
  label: string
  description?: string | null
  field_type: 'text' | 'textarea' | 'number' | 'currency' | 'date' | 'datetime' | 'boolean' | 'single_select' | 'multi_select' | 'email' | 'url' | 'phone'
  placeholder?: string | null
  help_text?: string | null
  options: string[]
  validation_rules: Record<string, unknown>
  default_value?: unknown
  is_required: boolean
  is_sensitive: boolean
  is_active: boolean
  show_in_list: boolean
  show_in_detail: boolean
  sort_order: number
}

export interface ContentRecommendation {
  content: ContentItem
  rationale: string
  source_context: string
  relevance_score: number
  stale: boolean
}

export interface SentContent {
  id: string
  account_id: string
  engagement_id?: string | null
  content_item_id?: string | null
  content_title_snapshot: string
  content_type_snapshot: string
  sender_name: string
  recipient_name: string
  recipient_email?: string | null
  shared_at: string
  follow_up_status: string
  follow_up_due_at?: string | null
  notes?: string | null
  timeline_entry_id?: string | null
}

export interface Escalation {
  id: string
  account_id: string
  engagement_id?: string | null
  summary: string
  impact: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: string
  owner_id?: string | null
  owner_name: string
  sla_due_at: string
  watchlist: boolean
  mitigation?: string | null
  recovery_actions?: string | null
  communication_cadence?: string | null
  resolution_summary?: string | null
  rca?: string | null
  custom_field_values?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface GovernanceEventApi {
  id: string
  account_id?: string | null
  owner_id?: string | null
  owner_name: string
  governance_type: 'QBR' | 'SteerCo' | 'Monthly Review' | 'Executive Review'
  source: string
  scheduled_at: string
  status: 'draft' | 'scheduled' | 'upcoming' | 'completed' | 'overdue' | 'cancelled' | 'review_required'
  agenda?: string | null
  notes?: string | null
  attendees: string[]
  custom_field_values?: Record<string, unknown>
}

export interface GovernanceRecurrenceRule {
  id: string
  name: string
  governance_type: string
  cadence: string
  interval: number
  start_at: string
  end_policy: string
  occurrences?: number | null
  account_id?: string | null
  segment?: string | null
  owner_id?: string | null
  owner_name: string
  is_active: boolean
}

export interface IntegrationConnection {
  id: string
  provider: 'google-calendar' | 'fathom'
  enabled: boolean
  status: string
  auth_type: string
  settings_json: Record<string, unknown>
  scopes: string[]
  last_synced_at?: string | null
  last_error?: string | null
}

export interface IntegrationSyncResponse {
  provider: string
  status: string
  created: number
  updated: number
  skipped: number
  errors: number
  message: string
}

export async function listContent(token: string, params = new URLSearchParams()) {
  return apiRequest<Page<ContentItem>>(`/api/content${queryString(params)}`, { token })
}

export async function listRuntimeCustomFields(token: string, module: string) {
  return apiRequest<RuntimeCustomField[]>(`/api/custom-fields?module=${encodeURIComponent(module)}`, { token })
}

export async function createContent(token: string, payload: Partial<ContentItem>) {
  return apiRequest<ContentItem>('/api/content', { method: 'POST', token, body: JSON.stringify(payload) })
}

export async function uploadContentFile(token: string, payload: { title: string; content_type: string; category: string; description?: string; tags?: string[]; service_lines?: string[]; account_stages?: string[]; custom_field_values?: Record<string, unknown>; file: File }) {
  const form = new FormData()
  form.append('title', payload.title)
  form.append('content_type', payload.content_type)
  form.append('category', payload.category)
  form.append('file', payload.file)
  if (payload.description) form.append('description', payload.description)
  if (payload.tags?.length) form.append('tags', payload.tags.join(','))
  if (payload.service_lines?.length) form.append('service_lines', payload.service_lines.join(','))
  if (payload.account_stages?.length) form.append('account_stages', payload.account_stages.join(','))
  if (payload.custom_field_values) form.append('custom_field_values', JSON.stringify(payload.custom_field_values))
  return apiRequest<ContentItem>('/api/content/upload', { method: 'POST', token, body: form })
}

export async function updateContent(token: string, id: string, payload: Partial<ContentItem>) {
  return apiRequest<ContentItem>(`/api/content/${id}`, { method: 'PATCH', token, body: JSON.stringify(payload) })
}

export async function deleteContent(token: string, id: string) {
  return apiRequest<{ message: string }>(`/api/content/${id}`, { method: 'DELETE', token })
}

export async function listContentRecommendations(token: string, accountId: string) {
  return apiRequest<ContentRecommendation[]>(`/api/accounts/${accountId}/content-recommendations`, { token })
}

export async function listSentContent(token: string, accountId: string, params = new URLSearchParams()) {
  return apiRequest<Page<SentContent>>(`/api/accounts/${accountId}/sent-content${queryString(params)}`, { token })
}

export async function createSentContent(token: string, accountId: string, payload: { content_item_id: string; recipient_name: string; recipient_email?: string; notes?: string }) {
  return apiRequest<SentContent>(`/api/accounts/${accountId}/sent-content`, { method: 'POST', token, body: JSON.stringify(payload) })
}

export async function listEscalations(token: string, params = new URLSearchParams()) {
  return apiRequest<Page<Escalation>>(`/api/escalations${queryString(params)}`, { token })
}

export async function createEscalation(token: string, payload: Partial<Escalation> & { account_id: string; owner_id: string }) {
  return apiRequest<Escalation>('/api/escalations', { method: 'POST', token, body: JSON.stringify(payload) })
}

export async function closeEscalation(token: string, id: string, payload: { resolution_summary: string; closure_evidence?: string; rca?: string; override_reason?: string }) {
  return apiRequest<Escalation>(`/api/escalations/${id}/close`, { method: 'POST', token, body: JSON.stringify(payload) })
}

export async function reopenEscalation(token: string, id: string) {
  return apiRequest<Escalation>(`/api/escalations/${id}/reopen`, { method: 'POST', token })
}

export async function listGovernanceEvents(token: string, params = new URLSearchParams()) {
  const page = await apiRequest<Page<GovernanceEventApi>>(`/api/governance-events${queryString(params)}`, { token })
  return { ...page, items: page.items.map(mapGovernanceEvent) }
}

export async function createGovernanceEvent(token: string, payload: { account_id: string; owner_id: string; governance_type: string; scheduled_at: string; agenda?: string; attendees?: string[]; custom_field_values?: Record<string, unknown> }) {
  return mapGovernanceEvent(await apiRequest<GovernanceEventApi>('/api/governance-events', { method: 'POST', token, body: JSON.stringify(payload) }))
}

export async function generateGovernanceBrief(token: string, eventId: string) {
  return apiRequest<{ summary: string; talking_points: string[]; citations: { id: string; label: string; excerpt: string; source_route?: string | null }[]; disclaimer: string }>(`/api/governance-events/${eventId}/ai-brief`, { method: 'POST', token })
}

export async function listRecurrenceRules(token: string, params = new URLSearchParams()) {
  return apiRequest<Page<GovernanceRecurrenceRule>>(`/api/admin/governance-recurrence-rules${queryString(params)}`, { token })
}

export async function createRecurrenceRule(token: string, payload: Record<string, unknown>) {
  return apiRequest<GovernanceRecurrenceRule>('/api/admin/governance-recurrence-rules', { method: 'POST', token, body: JSON.stringify(payload) })
}

export async function listIntegrations(token: string) {
  return apiRequest<IntegrationConnection[]>('/api/admin/integrations', { token })
}

export async function updateIntegration(token: string, provider: IntegrationConnection['provider'], payload: Record<string, unknown>) {
  return apiRequest<IntegrationConnection>(`/api/admin/integrations/${provider}`, { method: 'PATCH', token, body: JSON.stringify(payload) })
}

export async function syncIntegration(token: string, provider: IntegrationConnection['provider']) {
  return apiRequest<IntegrationSyncResponse>(`/api/admin/integrations/${provider}/sync`, { method: 'POST', token })
}

function mapGovernanceEvent(event: GovernanceEventApi): GovernanceEventRecord {
  return {
    id: event.id,
    accountId: event.account_id ?? '',
    accountName: '',
    engagementId: null,
    engagementName: null,
    ownerId: event.owner_id ?? '',
    ownerName: event.owner_name,
    ownerEmail: null,
    type: event.governance_type,
    date: event.scheduled_at,
    agenda: event.agenda ?? '',
    attendeeEmails: event.attendees.filter(item => item.includes('@')),
    attendees: event.attendees,
    actionItemRecords: [],
    actionItems: [],
    notes: [],
    decisions: [],
    generatedOutputs: [],
    status: event.status === 'completed' ? 'completed' : event.status === 'overdue' ? 'overdue' : 'upcoming',
    source: event.source,
  }
}
