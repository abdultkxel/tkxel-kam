import { apiRequest } from '@/services/api'
import { Page } from '@/services/accountWorkspace'

function queryString(params: URLSearchParams) {
  const query = params.toString()
  return query ? `?${query}` : ''
}

export interface PlaybookTemplateActivity {
  id: string
  template_id: string
  title: string
  description?: string | null
  owner_rule: string
  due_offset_days: number
  priority: TaskPriority
  success_criteria: string[]
  skip_allowed: boolean
  requires_evidence: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export type TaskStatus = 'open' | 'todo' | 'in_progress' | 'done' | 'blocked' | 'cancelled' | 'skipped'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent' | 'critical'

export interface PlaybookTemplate {
  id: string
  name: string
  objective: string
  description?: string | null
  signal_types: string[]
  weak_metrics: string[]
  default_owner_rule: string
  due_date_rule: Record<string, unknown>
  success_criteria: string[]
  skip_rules: string[]
  version: number
  is_active: boolean
  created_at: string
  updated_at: string
  activities: PlaybookTemplateActivity[]
  custom_field_values?: Record<string, unknown>
}

export interface TaskEvidence {
  id: string
  task_id: string
  evidence_type: 'note' | 'link' | 'file'
  title?: string | null
  body?: string | null
  url?: string | null
  file_name?: string | null
  file_mime_type?: string | null
  file_size_bytes?: number | null
  created_by_name: string
  created_at: string
}

export interface PlaybookTask {
  id: string
  account_id: string
  engagement_id?: string | null
  playbook_execution_id?: string | null
  template_activity_id?: string | null
  source_type: string
  source_record_id?: string | null
  source_metric?: string | null
  title: string
  description?: string | null
  owner_id?: string | null
  owner_name: string
  due_at: string
  status: TaskStatus
  priority: TaskPriority
  notes?: string | null
  outcome?: string | null
  success_criteria: string[]
  requires_evidence: boolean
  skipped_reason?: string | null
  completed_at?: string | null
  evidence: TaskEvidence[]
  custom_field_values?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface PlaybookExecution {
  id: string
  template_id?: string | null
  template_name_snapshot: string
  template_version_snapshot: number
  account_id: string
  engagement_id?: string | null
  source_signal_id?: string | null
  source_signal_type?: string | null
  source_metric?: string | null
  status: string
  tasks: PlaybookTask[]
  created_at: string
}

export interface RecommendedPlaybook {
  template: PlaybookTemplate
  rationale: string
  match_score: number
  matched_signal_types: string[]
  matched_metrics: string[]
}

export interface CalendarItem {
  id: string
  kind: 'governance' | 'governance_action' | 'task' | 'sow_expiry' | 'renewal_date' | 'notice_deadline' | string
  title: string
  detail: string
  account_id?: string | null
  account_name: string
  engagement_id?: string | null
  owner_id?: string | null
  owner_name?: string | null
  date: string
  status: string
  priority?: string | null
  source_route?: string | null
  source_record_id?: string | null
  source_record_type?: string | null
}

export interface PlaybookTemplatePayload {
  name: string
  objective: string
  description?: string
  signal_types?: string[]
  weak_metrics?: string[]
  default_owner_rule?: string
  due_date_rule?: Record<string, unknown>
  success_criteria: string[]
  skip_rules?: string[]
  activities: Array<{
    title: string
    description?: string
    owner_rule?: string
    due_offset_days?: number
    priority?: TaskPriority
    success_criteria?: string[]
    skip_allowed?: boolean
    requires_evidence?: boolean
    sort_order?: number
  }>
  is_active?: boolean
  custom_field_values?: Record<string, unknown>
}

export async function listPlaybookTemplates(token: string, params = new URLSearchParams()) {
  return apiRequest<Page<PlaybookTemplate>>(`/api/admin/playbook-templates${queryString(params)}`, { token })
}

export async function createPlaybookTemplate(token: string, payload: PlaybookTemplatePayload) {
  return apiRequest<PlaybookTemplate>('/api/admin/playbook-templates', { method: 'POST', token, body: JSON.stringify(payload) })
}

export async function updatePlaybookTemplate(token: string, templateId: string, payload: Partial<PlaybookTemplatePayload>) {
  return apiRequest<PlaybookTemplate>(`/api/admin/playbook-templates/${templateId}`, { method: 'PATCH', token, body: JSON.stringify(payload) })
}

export async function listRecommendedPlaybooks(token: string, signalId: string, params = new URLSearchParams()) {
  return apiRequest<RecommendedPlaybook[]>(`/api/signals/${signalId}/recommended-playbooks${queryString(params)}`, { token })
}

export async function executePlaybook(token: string, templateId: string, payload: { account_id: string; engagement_id?: string; source_signal_id?: string; source_signal_type?: string; source_metric?: string; confirmed: boolean }) {
  return apiRequest<PlaybookExecution>(`/api/playbooks/${templateId}/execute`, { method: 'POST', token, body: JSON.stringify(payload) })
}

export async function listTasks(token: string, params = new URLSearchParams()) {
  return apiRequest<Page<PlaybookTask>>(`/api/tasks${queryString(params)}`, { token })
}

export async function createTask(token: string, payload: Partial<PlaybookTask> & { account_id: string; owner_id: string; title: string; due_at: string; priority: TaskPriority; status: TaskStatus }) {
  return apiRequest<PlaybookTask>('/api/tasks', { method: 'POST', token, body: JSON.stringify(payload) })
}

export async function updateTask(token: string, taskId: string, payload: Partial<Pick<PlaybookTask, 'title' | 'description' | 'owner_id' | 'due_at' | 'status' | 'priority' | 'notes' | 'outcome' | 'skipped_reason' | 'success_criteria' | 'requires_evidence' | 'custom_field_values'>>) {
  return apiRequest<PlaybookTask>(`/api/tasks/${taskId}`, { method: 'PATCH', token, body: JSON.stringify(payload) })
}

export async function addTaskEvidence(token: string, taskId: string, payload: { evidence_type: 'note' | 'link' | 'file'; title?: string; body?: string; url?: string; file?: File | null }) {
  const form = new FormData()
  form.append('evidence_type', payload.evidence_type)
  if (payload.title) form.append('title', payload.title)
  if (payload.body) form.append('body', payload.body)
  if (payload.url) form.append('url', payload.url)
  if (payload.file) form.append('file', payload.file)
  return apiRequest<TaskEvidence>(`/api/tasks/${taskId}/evidence`, { method: 'POST', token, body: form })
}

export async function listCalendarItems(token: string, params = new URLSearchParams()) {
  return apiRequest<Page<CalendarItem>>(`/api/calendar/items${queryString(params)}`, { token })
}
