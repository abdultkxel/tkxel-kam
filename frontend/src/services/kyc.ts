import { apiRequest } from '@/services/api'
import {
  KycAgentRun,
  KycConfidenceLevel,
  KycConfiguration,
  KycDefaultPrompt,
  KycDraft,
  KycDraftStatus,
  KycFreshness,
  KycJobRunPendingResult,
  KycPage,
  KycRunStatus,
  KycSnapshot,
  KycTriggerSource,
} from '@/types/kyc'

type Direction = 'asc' | 'desc'

export interface KycDraftListParams {
  search?: string
  status?: KycDraftStatus | 'all'
  confidence_level?: KycConfidenceLevel | 'all'
  missing_fields?: boolean | null
  stale_status?: 'fresh' | 'stale' | 'all'
  reviewer?: string
  created_from?: string
  created_to?: string
  sort?: 'created_at' | 'confidence' | 'completeness' | 'updated_at'
  direction?: Direction
  page?: number
  page_size?: number
}

export interface KycSnapshotListParams {
  search?: string
  version?: number
  approver?: string
  source?: string
  confidence_level?: KycConfidenceLevel | 'all'
  date_from?: string
  date_to?: string
  sort?: 'approved_at' | 'version' | 'confidence' | 'completeness'
  direction?: Direction
  page?: number
  page_size?: number
}

export interface KycAgentRunListParams {
  search?: string
  status?: KycRunStatus | 'all'
  workstream?: string
  triggered_by?: string
  date_from?: string
  date_to?: string
  sort?: 'created_at' | 'updated_at'
  direction?: Direction
  page?: number
  page_size?: number
}

export interface KycDraftCreatePayload {
  trigger_source?: KycTriggerSource
  source_document_ids?: string[]
  research_sources?: string[]
  notes?: string | null
  prompt?: string | null
}

export interface KycDraftUpdatePayload {
  fields?: { key: string; value?: string | null; reviewed?: boolean | null }[]
  low_confidence_acknowledged?: boolean | null
  conflicts_acknowledged?: boolean | null
  override_reason?: string | null
  review_notes?: string | null
  detailed_description?: string | null
}

export interface KycDraftApprovePayload {
  low_confidence_acknowledged?: boolean
  conflicts_acknowledged?: boolean
  override_reason?: string | null
  change_summary?: string[]
}

export interface KycDraftRejectPayload {
  reason: string
}

export interface KycSnapshotRestorePayload {
  reason: string
}

export interface KycWebResearchPayload {
  draft_id?: string | null
  query?: string | null
}

export interface KycAgentRunCreatePayload {
  source_document_ids?: string[]
  research_sources?: string[]
  trigger_source?: KycTriggerSource
  prompt?: string | null
}

export interface KycConfigurationUpdatePayload {
  required_field_keys?: string[]
  freshness_threshold_days?: number
  low_confidence_threshold?: number
  research_sources?: string[]
}

export function getKycConfiguration(token: string) {
  return apiRequest<KycConfiguration>('/api/kyc/configuration', { token })
}

export function updateKycConfiguration(token: string, payload: KycConfigurationUpdatePayload) {
  return apiRequest<KycConfiguration>('/api/kyc/configuration', {
    method: 'PATCH',
    token,
    body: JSON.stringify(payload),
  })
}

export function listKycDrafts(token: string, accountId: string, params: KycDraftListParams = {}) {
  return apiRequest<KycPage<KycDraft>>(`/api/accounts/${accountId}/kyc/drafts${queryString(params)}`, { token })
}

export function createKycDraft(token: string, accountId: string, payload: KycDraftCreatePayload = {}) {
  return apiRequest<KycDraft>(`/api/accounts/${accountId}/kyc/drafts`, {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
}

export function getKycDefaultPrompt(token: string, accountId: string) {
  return apiRequest<KycDefaultPrompt>(`/api/accounts/${accountId}/kyc/default-prompt`, { token })
}

export function getKycDraft(token: string, accountId: string, draftId: string) {
  return apiRequest<KycDraft>(`/api/accounts/${accountId}/kyc/drafts/${draftId}`, { token })
}

export function updateKycDraft(token: string, accountId: string, draftId: string, payload: KycDraftUpdatePayload) {
  return apiRequest<KycDraft>(`/api/accounts/${accountId}/kyc/drafts/${draftId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(payload),
  })
}

export function approveKycDraft(token: string, accountId: string, draftId: string, payload: KycDraftApprovePayload) {
  return apiRequest<KycDraft>(`/api/accounts/${accountId}/kyc/drafts/${draftId}/approve`, {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
}

export function rejectKycDraft(token: string, accountId: string, draftId: string, payload: KycDraftRejectPayload) {
  return apiRequest<KycDraft>(`/api/accounts/${accountId}/kyc/drafts/${draftId}/reject`, {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
}

export function queueKycWebResearch(token: string, accountId: string, payload: KycWebResearchPayload = {}) {
  return apiRequest<KycAgentRun>(`/api/accounts/${accountId}/kyc/web-research`, {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
}

export function listKycSnapshots(token: string, accountId: string, params: KycSnapshotListParams = {}) {
  return apiRequest<KycPage<KycSnapshot>>(`/api/accounts/${accountId}/kyc/snapshots${queryString(params)}`, { token })
}

export function getKycSnapshot(token: string, accountId: string, snapshotId: string) {
  return apiRequest<KycSnapshot>(`/api/accounts/${accountId}/kyc/snapshots/${snapshotId}`, { token })
}

export function restoreKycSnapshot(token: string, accountId: string, snapshotId: string, payload: KycSnapshotRestorePayload) {
  return apiRequest<KycSnapshot>(`/api/accounts/${accountId}/kyc/snapshots/${snapshotId}/restore`, {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
}

export function getKycFreshness(token: string, accountId: string) {
  return apiRequest<KycFreshness>(`/api/accounts/${accountId}/kyc/freshness`, { token })
}

export function listKycAgentRuns(token: string, accountId: string, params: KycAgentRunListParams = {}) {
  return apiRequest<KycPage<KycAgentRun>>(`/api/accounts/${accountId}/kyc/agent-runs${queryString(params)}`, { token })
}

export function createKycAgentRun(token: string, accountId: string, payload: KycAgentRunCreatePayload = {}) {
  return apiRequest<KycAgentRun>(`/api/accounts/${accountId}/kyc/agent-runs`, {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
}

export function getKycAgentRun(token: string, accountId: string, runId: string) {
  return apiRequest<KycAgentRun>(`/api/accounts/${accountId}/kyc/agent-runs/${runId}`, { token })
}

export function refreshKycAgentRun(token: string, accountId: string, runId: string) {
  return apiRequest<KycAgentRun>(`/api/accounts/${accountId}/kyc/agent-runs/${runId}/refresh`, {
    method: 'POST',
    token,
  })
}

export function retryKycAgentRun(token: string, accountId: string, runId: string) {
  return apiRequest<KycAgentRun>(`/api/accounts/${accountId}/kyc/agent-runs/${runId}/retry`, {
    method: 'POST',
    token,
  })
}

export function cancelKycAgentRun(token: string, accountId: string, runId: string) {
  return apiRequest<KycAgentRun>(`/api/accounts/${accountId}/kyc/agent-runs/${runId}/cancel`, {
    method: 'POST',
    token,
  })
}

export function runPendingKycJobs(token: string, limit = 1) {
  return apiRequest<KycJobRunPendingResult>(`/api/admin/kyc/jobs/run-pending?limit=${limit}`, {
    method: 'POST',
    token,
  })
}

function queryString(params: object) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '' || value === 'all') return
    query.set(key, String(value))
  })
  const serialized = query.toString()
  return serialized ? `?${serialized}` : ''
}
