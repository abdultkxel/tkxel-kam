import { apiRequest } from '@/services/api'
import type { Page } from '@/services/accountWorkspace'

export type MeetingCaptureProvider = 'fathom' | 'fireflies'

export interface UserMeetingConnection {
  id?: string | null
  provider: MeetingCaptureProvider
  enabled: boolean
  status: string
  authType: string
  credentialStatus: {
    configured?: boolean
    fields?: string[]
    masked?: boolean
  }
  settingsJson: Record<string, unknown>
  lastSyncedAt?: string | null
  lastError?: string | null
}

export type UserFathomConnection = UserMeetingConnection

export interface MeetingArtifact {
  id: string
  ownerId: string
  provider: MeetingCaptureProvider
  externalId?: string | null
  title: string
  summary?: string | null
  actionItems: string[]
  meetingUrl?: string | null
  sourceLink?: string | null
  occurredAt?: string | null
  scheduledAt?: string | null
  accountId?: string | null
  engagementId?: string | null
  linkedObjectType?: string | null
  linkedObjectId?: string | null
  status: string
  metadataJson: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface MeetingArtifactCreateInput {
  provider?: MeetingCaptureProvider
  title?: string
  meetingUrl?: string
  summary?: string
  actionItems?: string[]
  occurredAt?: string | null
  scheduledAt?: string | null
  accountId?: string | null
  engagementId?: string | null
  linkedObjectType?: string | null
  linkedObjectId?: string | null
}

export interface MeetingResolveInput {
  identifier: string
  accountId?: string | null
  engagementId?: string | null
  linkedObjectType?: string | null
  linkedObjectId?: string | null
}

export type FathomMeetingResolveInput = MeetingResolveInput

export interface MeetingArtifactListParams {
  provider?: MeetingCaptureProvider
  status?: string
  accountId?: string
  linkedObjectType?: string
  linkedObjectId?: string
  search?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
}

interface ApiUserMeetingConnection {
  id?: string | null
  provider: MeetingCaptureProvider
  enabled: boolean
  status: string
  auth_type: string
  credential_status: UserMeetingConnection['credentialStatus']
  settings_json: Record<string, unknown>
  last_synced_at?: string | null
  last_error?: string | null
}

interface ApiMeetingArtifact {
  id: string
  owner_id: string
  provider: MeetingCaptureProvider
  external_id?: string | null
  title: string
  summary?: string | null
  action_items: string[]
  meeting_url?: string | null
  source_link?: string | null
  occurred_at?: string | null
  scheduled_at?: string | null
  account_id?: string | null
  engagement_id?: string | null
  linked_object_type?: string | null
  linked_object_id?: string | null
  status: string
  metadata_json: Record<string, unknown>
  created_at: string
  updated_at: string
}

export function readPersonalFathomConnection(token: string) {
  return readPersonalMeetingConnection(token, 'fathom')
}

export function updatePersonalFathomConnection(token: string, payload: { enabled: boolean; apiKey?: string; clearApiKey?: boolean }) {
  return updatePersonalMeetingConnection(token, 'fathom', payload)
}

export function readPersonalFirefliesConnection(token: string) {
  return readPersonalMeetingConnection(token, 'fireflies')
}

export function updatePersonalFirefliesConnection(token: string, payload: { enabled: boolean; apiKey?: string; clearApiKey?: boolean }) {
  return updatePersonalMeetingConnection(token, 'fireflies', payload)
}

export function readPersonalMeetingConnection(token: string, provider: MeetingCaptureProvider) {
  return apiRequest<ApiUserMeetingConnection>(`/api/meeting-capture/${provider}/connection`, { token }).then(mapConnection)
}

export function updatePersonalMeetingConnection(token: string, provider: MeetingCaptureProvider, payload: { enabled: boolean; apiKey?: string; clearApiKey?: boolean }) {
  return apiRequest<ApiUserMeetingConnection>(`/api/meeting-capture/${provider}/connection`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ enabled: payload.enabled, api_key: payload.apiKey || undefined, clear_api_key: payload.clearApiKey || undefined }),
  }).then(mapConnection)
}

export function syncPersonalFathomMeetings(token: string) {
  return apiRequest<{ provider: string; status: string; created: number; updated: number; skipped: number; errors: number; message: string }>('/api/meeting-capture/fathom/sync', { method: 'POST', token })
}

export function resolveFathomMeeting(token: string, payload: FathomMeetingResolveInput) {
  return resolveMeetingProvider(token, 'fathom', payload)
}

export function resolveFirefliesMeeting(token: string, payload: MeetingResolveInput) {
  return resolveMeetingProvider(token, 'fireflies', payload)
}

export function resolveMeetingProvider(token: string, provider: MeetingCaptureProvider, payload: MeetingResolveInput) {
  return apiRequest<ApiMeetingArtifact>(`/api/meeting-capture/${provider}/resolve`, {
    method: 'POST',
    token,
    body: JSON.stringify(buildMeetingResolvePayload(payload)),
  }).then(mapMeetingArtifact)
}

export async function listMeetingArtifacts(token: string, params: MeetingArtifactListParams = {}) {
  const page = await apiRequest<Page<ApiMeetingArtifact>>(`/api/meeting-capture/meetings${queryString(params)}`, { token })
  return { ...page, items: page.items.map(mapMeetingArtifact) }
}

export function createMeetingArtifact(token: string, payload: MeetingArtifactCreateInput) {
  return apiRequest<ApiMeetingArtifact>('/api/meeting-capture/meetings', {
    method: 'POST',
    token,
    body: JSON.stringify(buildMeetingPayload(payload)),
  }).then(mapMeetingArtifact)
}

export function buildMeetingPayload(payload: MeetingArtifactCreateInput) {
  return {
    provider: payload.provider ?? 'fathom',
    title: payload.title?.trim() || undefined,
    meeting_url: payload.meetingUrl?.trim() || undefined,
    summary: payload.summary?.trim() || undefined,
    action_items: payload.actionItems ?? [],
    occurred_at: payload.occurredAt ?? null,
    scheduled_at: payload.scheduledAt ?? null,
    account_id: payload.accountId || null,
    engagement_id: payload.engagementId || null,
    linked_object_type: payload.linkedObjectType || null,
    linked_object_id: payload.linkedObjectId || null,
  }
}

export function buildFathomResolvePayload(payload: FathomMeetingResolveInput) {
  return buildMeetingResolvePayload(payload)
}

export function buildMeetingResolvePayload(payload: MeetingResolveInput) {
  return {
    identifier: payload.identifier.trim(),
    account_id: payload.accountId || null,
    engagement_id: payload.engagementId || null,
    linked_object_type: payload.linkedObjectType || null,
    linked_object_id: payload.linkedObjectId || null,
  }
}

function mapConnection(connection: ApiUserMeetingConnection): UserMeetingConnection {
  return {
    id: connection.id ?? null,
    provider: connection.provider,
    enabled: connection.enabled,
    status: connection.status,
    authType: connection.auth_type,
    credentialStatus: connection.credential_status,
    settingsJson: connection.settings_json,
    lastSyncedAt: connection.last_synced_at ?? null,
    lastError: connection.last_error ?? null,
  }
}

function mapMeetingArtifact(meeting: ApiMeetingArtifact): MeetingArtifact {
  return {
    id: meeting.id,
    ownerId: meeting.owner_id,
    provider: meeting.provider,
    externalId: meeting.external_id ?? null,
    title: meeting.title,
    summary: meeting.summary ?? null,
    actionItems: meeting.action_items ?? [],
    meetingUrl: meeting.meeting_url ?? null,
    sourceLink: meeting.source_link ?? null,
    occurredAt: meeting.occurred_at ?? null,
    scheduledAt: meeting.scheduled_at ?? null,
    accountId: meeting.account_id ?? null,
    engagementId: meeting.engagement_id ?? null,
    linkedObjectType: meeting.linked_object_type ?? null,
    linkedObjectId: meeting.linked_object_id ?? null,
    status: meeting.status,
    metadataJson: meeting.metadata_json ?? {},
    createdAt: meeting.created_at,
    updatedAt: meeting.updated_at,
  }
}

function queryString(params: MeetingArtifactListParams) {
  const query = new URLSearchParams()
  setQuery(query, 'provider', params.provider)
  setQuery(query, 'status', params.status)
  setQuery(query, 'account_id', params.accountId)
  setQuery(query, 'linked_object_type', params.linkedObjectType)
  setQuery(query, 'linked_object_id', params.linkedObjectId)
  setQuery(query, 'search', params.search)
  setQuery(query, 'date_from', params.dateFrom)
  setQuery(query, 'date_to', params.dateTo)
  setQuery(query, 'page', params.page)
  setQuery(query, 'page_size', params.pageSize)
  const value = query.toString()
  return value ? `?${value}` : ''
}

function setQuery(query: URLSearchParams, key: string, value: string | number | undefined) {
  if (value !== undefined && value !== '') query.set(key, String(value))
}
