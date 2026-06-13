import { apiRequest } from '@/services/api'
import type { Page } from '@/services/accountWorkspace'

export type IntegrationProvider = 'google_calendar' | 'csat' | 'ai_llm_gateway'

export interface IntegrationConnection {
  id: string
  provider: IntegrationProvider
  name?: string | null
  enabled: boolean
  status: string
  auth_type: string
  settings_json: Record<string, unknown>
  credential_status: {
    configured?: boolean
    fields?: string[]
    masked?: boolean
  }
  scopes: string[]
  token_expires_at?: string | null
  last_tested_at?: string | null
  last_test_status?: string | null
  failure_count: number
  next_retry_at?: string | null
  last_synced_at?: string | null
  last_error?: string | null
  created_at: string
  updated_at: string
}

export interface IntegrationConnectionUpdate {
  enabled?: boolean
  auth_type?: string
  credentials_json?: Record<string, unknown>
  settings_json?: Record<string, unknown>
  scopes?: string[]
  status?: string
}

export interface IntegrationSyncResponse {
  provider: IntegrationProvider
  status: string
  created: number
  updated: number
  skipped: number
  errors: number
  message: string
}

export interface IntegrationSyncLog {
  id: string
  provider: IntegrationProvider
  source_record_id?: string | null
  action: string
  status: string
  deduplication_key?: string | null
  message?: string | null
  payload?: Record<string, unknown> | null
  created_at: string
}

export interface IntegrationImportedItem {
  id: string
  provider: IntegrationProvider
  external_id: string
  title: string
  description?: string | null
  source_link?: string | null
  occurred_at?: string | null
  account_id?: string | null
  engagement_id?: string | null
  mapping_status: string
  review_status: string
  review_required: boolean
  result_record_type?: string | null
  result_record_id?: string | null
  reviewed_by_name?: string | null
  reviewed_at?: string | null
}

export interface SecurityAlertSettings {
  administration_email: string
  updated_by_id?: string | null
  updated_by_name?: string | null
  updated_at?: string | null
}

export function listIntegrations(token: string) {
  return apiRequest<IntegrationConnection[]>('/api/admin/integrations', { token })
}

export function updateIntegration(token: string, provider: IntegrationProvider, payload: IntegrationConnectionUpdate) {
  return apiRequest<IntegrationConnection>(`/api/admin/integrations/${provider}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(payload),
  })
}

export function testIntegration(token: string, provider: IntegrationProvider) {
  return apiRequest<IntegrationSyncResponse>(`/api/admin/integrations/${provider}/test`, { method: 'POST', token })
}

export function syncIntegration(token: string, provider: IntegrationProvider) {
  return apiRequest<IntegrationSyncResponse>(`/api/admin/integrations/${provider}/sync`, { method: 'POST', token })
}

export function retryIntegration(token: string, provider: IntegrationProvider) {
  return apiRequest<IntegrationSyncResponse>(`/api/admin/integrations/${provider}/retry`, { method: 'POST', token })
}

export function disconnectIntegration(token: string, provider: IntegrationProvider) {
  return apiRequest<IntegrationConnection>(`/api/admin/integrations/${provider}/disconnect`, { method: 'POST', token })
}

export function listIntegrationLogs(token: string, params: Record<string, string | number | undefined> = {}) {
  return apiRequest<Page<IntegrationSyncLog>>(`/api/admin/integrations/sync-logs${queryString(params)}`, { token })
}

export function listImportedItems(token: string, params: Record<string, string | number | undefined> = {}) {
  return apiRequest<Page<IntegrationImportedItem>>(`/api/admin/integrations/imported-items${queryString(params)}`, { token })
}

export function readSecurityAlertSettings(token: string) {
  return apiRequest<SecurityAlertSettings>('/api/admin/settings/security-alert-email', { token })
}

export function updateSecurityAlertSettings(token: string, administrationEmail: string) {
  return apiRequest<SecurityAlertSettings>('/api/admin/settings/security-alert-email', {
    method: 'PATCH',
    token,
    body: JSON.stringify({ administration_email: administrationEmail }),
  })
}

export function googleCalendarOAuthUrl(token: string) {
  return apiRequest<{ authorization_url: string }>('/api/admin/integrations/google-calendar/oauth-url', { token })
}

function queryString(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value))
  })
  const value = query.toString()
  return value ? `?${value}` : ''
}
