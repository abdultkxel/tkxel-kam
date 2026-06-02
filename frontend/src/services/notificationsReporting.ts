import { apiRequest } from '@/services/api'

export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface NotificationTriggerConfig {
  id: string
  trigger: string
  label: string
  description?: string | null
  default_mode: 'in_app' | 'in_app_email' | 'off'
  default_digest_cadence: 'immediate' | 'daily' | 'weekly' | 'monthly'
  supported_channels: string[]
  mandatory: boolean
  is_active: boolean
}

export interface NotificationPreference {
  trigger: string
  label: string
  mode: 'in_app' | 'in_app_email' | 'off'
  digest_cadence: 'immediate' | 'daily' | 'weekly' | 'monthly'
  mandatory: boolean
  supported_channels: string[]
  policy_override: boolean
}

export interface NotificationRecord {
  id: string
  trigger: string
  title: string
  body: string
  account_id?: string | null
  account_name_snapshot?: string | null
  source_record_route?: string | null
  priority: string
  channel: string
  delivery_status: string
  email_queued: boolean
  read_at?: string | null
  created_at: string
}

export interface NotificationPage extends Page<NotificationRecord> {
  unread_count: number
}

export interface DashboardWidget {
  key: string
  title: string
  status: 'complete' | 'empty' | 'failed'
  generated_at: string
  data_scope: string
  value?: unknown
  items: Record<string, unknown>[]
  metadata: Record<string, unknown>
  error?: string | null
}

export interface DashboardRead {
  dashboard: string
  generated_at: string
  data_scope: string
  widgets: DashboardWidget[]
}

export interface SlaRule {
  id: string
  name: string
  item_type: string
  severity?: string | null
  priority?: string | null
  inactivity_minutes: number
  qualifying_activities: string[]
  recipient_policy: string
  is_active: boolean
}

export interface EscalatedItem {
  id: string
  source_type: string
  source_record_id: string
  account_id?: string | null
  title: string
  severity?: string | null
  owner_name?: string | null
  recipient_name?: string | null
  last_activity_at?: string | null
  escalated_at: string
  state: string
}

export interface DigestSchedule {
  id: string
  name: string
  cadence: string
  timezone: string
  recipients_json: string[]
  sections_json: string[]
  delivery_channels: string[]
  is_active: boolean
  next_run_at?: string | null
}

export interface DigestRun {
  id: string
  title: string
  status: string
  recipients_json: string[]
  sections_json: string[]
  content_json: Record<string, unknown>
  redactions_json: Record<string, unknown>
  generated_at: string
}

export interface ReportField {
  data_source: string
  field: string
  label: string
  field_type: string
  sortable: boolean
  filterable: boolean
  sensitive: boolean
  custom_field: boolean
}

export interface ReportDefinition {
  id: string
  name: string
  description?: string | null
  visibility: 'private' | 'shared'
  data_source: string
  fields_json: string[]
  filters_json: Record<string, unknown>
  grouping_json: string[]
  layout_json: Record<string, unknown>
  export_format: 'csv' | 'pdf'
  updated_at: string
}

export interface ReportPreview {
  rows: Record<string, unknown>[]
  columns: ReportField[]
  total: number
  page: number
  page_size: number
  pages: number
  generated_at: string
}

export interface ReportRun {
  id: string
  report_id?: string | null
  status: string
  export_format: string
  content_json: Record<string, unknown>
  storage_metadata_json: Record<string, unknown>
  generated_at: string
}

function query(params: Record<string, string | number | boolean | undefined | null>) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  })
  const value = search.toString()
  return value ? `?${value}` : ''
}

export function getNotifications(token: string, params: Record<string, string | number | undefined> = {}) {
  return apiRequest<NotificationPage>(`/api/notifications${query(params)}`, { token })
}

export function markNotificationRead(token: string, id: string) {
  return apiRequest<NotificationRecord>(`/api/notifications/${id}/read`, { method: 'PATCH', token })
}

export function markAllNotificationsRead(token: string) {
  return apiRequest<{ updated: number }>('/api/notifications/read-all', { method: 'PATCH', token })
}

export function getNotificationPreferences(token: string) {
  return apiRequest<NotificationPreference[]>('/api/users/me/notification-preferences', { token })
}

export function updateNotificationPreferences(token: string, items: Pick<NotificationPreference, 'trigger' | 'mode' | 'digest_cadence'>[]) {
  return apiRequest<NotificationPreference[]>('/api/users/me/notification-preferences', { method: 'PUT', token, body: JSON.stringify({ items }) })
}

export function getNotificationDefaults(token: string) {
  return apiRequest<{ items: NotificationTriggerConfig[] }>('/api/admin/notification-defaults', { token })
}

export function updateNotificationDefaults(token: string, items: Partial<NotificationTriggerConfig>[]) {
  return apiRequest<{ items: NotificationTriggerConfig[] }>('/api/admin/notification-defaults', { method: 'PUT', token, body: JSON.stringify({ items }) })
}

export function getSlaRules(token: string) {
  return apiRequest<Page<SlaRule>>('/api/admin/sla-rules?page=1&page_size=100', { token })
}

export function createSlaRule(token: string, payload: Record<string, unknown>) {
  return apiRequest<SlaRule>('/api/admin/sla-rules', { method: 'POST', token, body: JSON.stringify(payload) })
}

export function updateSlaRule(token: string, id: string, payload: Record<string, unknown>) {
  return apiRequest<SlaRule>(`/api/admin/sla-rules/${id}`, { method: 'PATCH', token, body: JSON.stringify(payload) })
}

export function evaluateSla(token: string) {
  return apiRequest<{ evaluated_rules: number; matched_items: number; escalated_items: number; notifications_created: number; duplicate_notifications: number }>('/api/sla/jobs/evaluate', { method: 'POST', token })
}

export function getEscalatedItems(token: string, params: Record<string, string | number | undefined> = {}) {
  return apiRequest<Page<EscalatedItem>>(`/api/escalated-items${query(params)}`, { token })
}

export function getDigestSchedules(token: string) {
  return apiRequest<Page<DigestSchedule>>('/api/digests/schedules?page=1&page_size=50', { token })
}

export function createDigestSchedule(token: string, payload: Record<string, unknown>) {
  return apiRequest<DigestSchedule>('/api/digests/schedules', { method: 'POST', token, body: JSON.stringify(payload) })
}

export function previewDigest(token: string, payload: Record<string, unknown>) {
  return apiRequest<DigestRun>('/api/digests/preview', { method: 'POST', token, body: JSON.stringify(payload) })
}

export function getDigests(token: string, params: Record<string, string | number | undefined> = {}) {
  return apiRequest<Page<DigestRun>>(`/api/digests${query(params)}`, { token })
}

export function sendDigest(token: string, id: string) {
  return apiRequest<DigestRun>(`/api/digests/${id}/send`, { method: 'POST', token })
}

export function getAmHomeDashboard(token: string, params: Record<string, string | number | undefined> = {}) {
  return apiRequest<DashboardRead>(`/api/dashboards/am-home${query(params)}`, { token })
}

export function refreshAmTaskSummary(token: string) {
  return apiRequest<{ widget: DashboardWidget }>('/api/dashboards/am-home/task-summary/refresh', { method: 'POST', token })
}

export function getKamHeadPortfolio(token: string, params: Record<string, string | number | undefined> = {}) {
  return apiRequest<DashboardRead>(`/api/dashboards/kam-head-portfolio${query(params)}`, { token })
}

export function getLeadershipDashboard(token: string, params: Record<string, string | number | undefined> = {}) {
  return apiRequest<DashboardRead>(`/api/dashboards/leadership${query(params)}`, { token })
}

export function getReportFields(token: string, dataSource?: string) {
  return apiRequest<{ data_sources: string[]; fields: ReportField[] }>(`/api/reports/fields${query({ data_source: dataSource })}`, { token })
}

export function previewReport(token: string, payload: Record<string, unknown>) {
  return apiRequest<ReportPreview>('/api/reports/preview', { method: 'POST', token, body: JSON.stringify(payload) })
}

export function getReports(token: string, params: Record<string, string | number | undefined> = {}) {
  return apiRequest<Page<ReportDefinition>>(`/api/reports${query(params)}`, { token })
}

export function createReport(token: string, payload: Record<string, unknown>) {
  return apiRequest<ReportDefinition>('/api/reports', { method: 'POST', token, body: JSON.stringify(payload) })
}

export function exportReport(token: string, id: string, exportFormat: 'csv' | 'pdf') {
  return apiRequest<ReportRun>(`/api/reports/${id}/export`, { method: 'POST', token, body: JSON.stringify({ export_format: exportFormat }) })
}
