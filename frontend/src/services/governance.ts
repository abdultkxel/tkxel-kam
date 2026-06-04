import { apiRequest } from '@/services/api'
import { Page } from '@/services/accountWorkspace'
import {
  GovernanceActionItemRecord,
  GovernanceCalendarItemRecord,
  GovernanceDecisionRecord,
  GovernanceEventCompleteInput,
  GovernanceEventCreateInput,
  GovernanceEventListParams,
  GovernanceEventRecord,
  GovernanceEventUpdateInput,
  GovernanceGeneratedOutputInput,
  GovernanceGeneratedOutputRecord,
  GovernanceNoteRecord,
} from '@/types/governance'

export interface ApiGovernanceNote {
  id: string
  event_id: string
  body: string
  author_id?: string | null
  author_name: string
  source: string
  created_at: string
  updated_at: string
}

export interface ApiGovernanceDecision {
  id: string
  event_id?: string
  governance_event_id?: string
  decision_text: string
  owner_id?: string | null
  owner_name?: string | null
  source: string
  created_at: string
}

export interface ApiGovernanceActionItem {
  id: string
  event_id?: string
  governance_event_id?: string
  title: string
  owner_id?: string | null
  owner_name?: string | null
  owner_email?: string | null
  due_date?: string
  due_at?: string
  status: 'open' | 'in_progress' | 'completed' | 'cancelled'
  source: string
  created_at: string
  updated_at: string
}

export interface ApiGovernanceGeneratedOutputCitation {
  id: string
  output_id: string
  source_type: string
  source_id: string
  source_title: string
  source_url?: string | null
  snippet: string
  source_timestamp?: string | null
  created_at: string
}

export interface ApiGovernanceGeneratedOutput {
  id: string
  event_id: string
  output_type: GovernanceGeneratedOutputRecord['outputType']
  generation_method: GovernanceGeneratedOutputRecord['generationMethod']
  status: string
  content: string
  disclaimer: string
  source_filter_metadata: Record<string, unknown>
  provider_metadata?: Record<string, unknown> | null
  error_code?: string | null
  error_message?: string | null
  created_by_id?: string | null
  created_by_name: string
  created_at: string
  citations: ApiGovernanceGeneratedOutputCitation[]
}

export interface ApiGovernanceEvent {
  id: string
  account_id: string
  account_name: string
  engagement_id?: string | null
  engagement_name?: string | null
  owner_id?: string | null
  owner_name: string
  owner_email?: string | null
  governance_type: GovernanceEventRecord['type']
  scheduled_at: string
  agenda: string
  status: GovernanceEventRecord['status']
  source: string
  attendee_emails?: string[]
  attendees?: string[]
  notes: ApiGovernanceNote[] | string | null
  decisions: ApiGovernanceDecision[]
  action_items: ApiGovernanceActionItem[]
  generated_outputs: ApiGovernanceGeneratedOutput[]
  completed_at?: string | null
  created_by_name?: string
  created_at: string
  updated_at: string
  custom_field_values?: Record<string, unknown>
}

export interface ApiGovernanceCalendarItem {
  id: string
  kind: string
  source_record_id: string
  source_record_type: string
  account_id: string
  account_name: string
  owner_id?: string | null
  date: string
  title: string
  detail: string
  status: string
  route: string
}

export async function listGovernanceEvents(token: string, params: GovernanceEventListParams = {}) {
  const query = queryString(params)
  const page = await apiRequest<Page<ApiGovernanceEvent>>(`/api/governance-events${query ? `?${query}` : ''}`, { token })
  return { ...page, items: page.items.map(mapApiGovernanceEvent) }
}

export async function listGovernanceCalendarItems(token: string, params: Pick<GovernanceEventListParams, 'accountId' | 'ownerId' | 'dateFrom' | 'dateTo' | 'page' | 'pageSize'> = {}) {
  const query = queryString(params)
  const page = await apiRequest<Page<ApiGovernanceCalendarItem>>(`/api/governance-events/calendar${query ? `?${query}` : ''}`, { token })
  return { ...page, items: page.items.map(mapApiGovernanceCalendarItem) }
}

export async function createGovernanceEvent(token: string, payload: GovernanceEventCreateInput) {
  return mapApiGovernanceEvent(
    await apiRequest<ApiGovernanceEvent>('/api/governance-events', {
      method: 'POST',
      token,
      body: JSON.stringify(buildCreatePayload(payload)),
    }),
  )
}

export async function updateGovernanceEvent(token: string, eventId: string, payload: GovernanceEventUpdateInput) {
  return mapApiGovernanceEvent(
    await apiRequest<ApiGovernanceEvent>(`/api/governance-events/${eventId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(buildUpdatePayload(payload)),
    }),
  )
}

export async function completeGovernanceEvent(token: string, eventId: string, payload: GovernanceEventCompleteInput) {
  return mapApiGovernanceEvent(
    await apiRequest<ApiGovernanceEvent>(`/api/governance-events/${eventId}/complete`, {
      method: 'POST',
      token,
      body: JSON.stringify(buildCompletePayload(payload)),
    }),
  )
}

export async function generateGovernanceAgendaDraft(token: string, eventId: string, payload: GovernanceGeneratedOutputInput = {}) {
  return mapApiGeneratedOutput(
    await apiRequest<ApiGovernanceGeneratedOutput>(`/api/governance-events/${eventId}/agenda-draft`, {
      method: 'POST',
      token,
      body: JSON.stringify(buildGeneratedOutputPayload(payload)),
    }),
  )
}

export async function updateGovernanceAgenda(token: string, eventId: string, agenda: string, sourceOutputId?: string | null) {
  return mapApiGovernanceEvent(
    await apiRequest<ApiGovernanceEvent>(`/api/governance-events/${eventId}/agenda`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ agenda, source_output_id: sourceOutputId ?? null }),
    }),
  )
}

export async function generateGovernanceBrief(token: string, eventId: string, payload: GovernanceGeneratedOutputInput = {}) {
  return mapApiGeneratedOutput(
    await apiRequest<ApiGovernanceGeneratedOutput>(`/api/governance-events/${eventId}/ai-brief`, {
      method: 'POST',
      token,
      body: JSON.stringify(buildGeneratedOutputPayload(payload)),
    }),
  )
}

export function mapApiGovernanceEvent(event: ApiGovernanceEvent): GovernanceEventRecord {
  const attendeeEmails = normalizeEmails(event.attendee_emails ?? (event.attendees ?? []).filter(item => item.includes('@')))
  const actionItemRecords = event.action_items.map(mapApiActionItem)

  return {
    id: event.id,
    accountId: event.account_id,
    accountName: event.account_name,
    engagementId: event.engagement_id ?? null,
    engagementName: event.engagement_name ?? null,
    ownerId: event.owner_id ?? '',
    ownerName: event.owner_name,
    ownerEmail: event.owner_email ?? null,
    type: event.governance_type,
    date: event.scheduled_at,
    agenda: event.agenda,
    attendeeEmails,
    attendees: attendeeEmails,
    actionItemRecords,
    actionItems: actionItemRecords.map(item => item.title),
    notes: normalizeNotes(event),
    decisions: event.decisions.map(mapApiDecision),
    generatedOutputs: event.generated_outputs.map(mapApiGeneratedOutput),
    status: event.status,
    source: event.source,
    completedAt: event.completed_at ?? null,
    createdAt: event.created_at,
    updatedAt: event.updated_at,
  }
}

export function buildCreatePayload(payload: GovernanceEventCreateInput) {
  return {
    account_id: payload.accountId,
    engagement_id: payload.engagementId || null,
    governance_type: payload.governanceType,
    scheduled_at: payload.scheduledAt,
    agenda: payload.agenda,
    owner_id: payload.ownerId,
    attendee_emails: normalizeEmails(payload.attendeeEmails),
    attendees: normalizeEmails(payload.attendeeEmails),
    source: payload.source ?? 'manual',
    custom_field_values: payload.customFieldValues ?? {},
  }
}

function buildUpdatePayload(payload: GovernanceEventUpdateInput) {
  return {
    engagement_id: payload.engagementId,
    governance_type: payload.governanceType,
    scheduled_at: payload.scheduledAt,
    agenda: payload.agenda,
    owner_id: payload.ownerId,
    attendee_emails: payload.attendeeEmails ? normalizeEmails(payload.attendeeEmails) : undefined,
    attendees: payload.attendeeEmails ? normalizeEmails(payload.attendeeEmails) : undefined,
    status: payload.status,
  }
}

export function buildCompletePayload(payload: GovernanceEventCompleteInput) {
  return {
    notes: payload.notes,
    meeting_artifact_id: payload.meetingArtifactId ?? null,
    decisions: (payload.decisions ?? []).map(item => ({
      decision_text: item.decisionText,
      owner_id: item.ownerId ?? null,
      owner_name: item.ownerName ?? null,
    })),
    action_items: (payload.actionItems ?? []).map(item => ({
      title: item.title,
      owner_id: item.ownerId ?? null,
      owner_name: item.ownerName ?? null,
      owner_email: item.ownerEmail ?? null,
      due_date: item.dueDate,
      create_task: item.createTask ?? true,
    })),
  }
}

function buildGeneratedOutputPayload(payload: GovernanceGeneratedOutputInput) {
  return { source_modules: payload.sourceModules ?? [] }
}

function queryString(params: GovernanceEventListParams) {
  const query = new URLSearchParams()
  setQuery(query, 'account_id', params.accountId)
  setQuery(query, 'engagement_id', params.engagementId)
  setQuery(query, 'governance_type', params.governanceType)
  setQuery(query, 'status', params.status)
  setQuery(query, 'owner_id', params.ownerId)
  setQuery(query, 'attendee', params.attendee)
  setQuery(query, 'date_from', params.dateFrom)
  setQuery(query, 'date_to', params.dateTo)
  setQuery(query, 'source', params.source)
  setQuery(query, 'search', params.search)
  setQuery(query, 'sort', params.sort)
  setQuery(query, 'direction', params.direction)
  setQuery(query, 'page', params.page)
  setQuery(query, 'page_size', params.pageSize)
  return query.toString()
}

function setQuery(query: URLSearchParams, key: string, value: string | number | undefined) {
  if (value !== undefined && value !== '') query.set(key, String(value))
}

function mapApiNote(note: ApiGovernanceNote): GovernanceNoteRecord {
  return {
    id: note.id,
    eventId: note.event_id,
    body: note.body,
    authorId: note.author_id ?? null,
    authorName: note.author_name,
    source: note.source,
    createdAt: note.created_at,
    updatedAt: note.updated_at,
  }
}

function normalizeNotes(event: ApiGovernanceEvent): GovernanceNoteRecord[] {
  if (Array.isArray(event.notes)) return event.notes.map(mapApiNote)
  if (!event.notes) return []
  return [{
    id: `${event.id}:note`,
    eventId: event.id,
    body: event.notes,
    authorId: null,
    authorName: event.created_by_name ?? event.owner_name,
    source: 'manual',
    createdAt: event.completed_at ?? event.updated_at,
    updatedAt: event.updated_at,
  }]
}

function mapApiDecision(decision: ApiGovernanceDecision): GovernanceDecisionRecord {
  const eventId = decision.event_id ?? decision.governance_event_id ?? ''
  return {
    id: decision.id,
    eventId,
    decisionText: decision.decision_text,
    ownerId: decision.owner_id ?? null,
    ownerName: decision.owner_name ?? null,
    source: decision.source,
    createdAt: decision.created_at,
  }
}

function mapApiActionItem(item: ApiGovernanceActionItem): GovernanceActionItemRecord {
  const eventId = item.event_id ?? item.governance_event_id ?? ''
  const dueDate = item.due_date ?? item.due_at ?? new Date().toISOString()
  return {
    id: item.id,
    eventId,
    title: item.title,
    ownerId: item.owner_id ?? null,
    ownerName: item.owner_name ?? null,
    ownerEmail: item.owner_email ?? null,
    dueDate,
    status: item.status === 'completed' ? 'completed' : 'open',
    source: item.source,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  }
}

function mapApiGeneratedOutput(output: ApiGovernanceGeneratedOutput): GovernanceGeneratedOutputRecord {
  return {
    id: output.id,
    eventId: output.event_id,
    outputType: output.output_type,
    generationMethod: output.generation_method,
    status: output.status,
    content: output.content,
    disclaimer: output.disclaimer,
    sourceFilterMetadata: output.source_filter_metadata,
    providerMetadata: output.provider_metadata ?? null,
    errorCode: output.error_code ?? null,
    errorMessage: output.error_message ?? null,
    createdById: output.created_by_id ?? null,
    createdByName: output.created_by_name,
    createdAt: output.created_at,
    citations: output.citations.map(citation => ({
      id: citation.id,
      outputId: citation.output_id,
      sourceType: citation.source_type,
      sourceId: citation.source_id,
      sourceTitle: citation.source_title,
      sourceUrl: citation.source_url ?? null,
      snippet: citation.snippet,
      sourceTimestamp: citation.source_timestamp ?? null,
      createdAt: citation.created_at,
    })),
  }
}

function mapApiGovernanceCalendarItem(item: ApiGovernanceCalendarItem): GovernanceCalendarItemRecord {
  return {
    id: item.id,
    kind: item.kind,
    sourceRecordId: item.source_record_id,
    sourceRecordType: item.source_record_type,
    accountId: item.account_id,
    accountName: item.account_name,
    ownerId: item.owner_id ?? null,
    date: item.date,
    title: item.title,
    detail: item.detail,
    status: item.status,
    route: item.route,
  }
}

function normalizeEmails(emails: string[]) {
  return Array.from(new Set(emails.map(email => email.trim().toLowerCase()).filter(Boolean)))
}
