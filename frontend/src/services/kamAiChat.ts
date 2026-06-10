import { apiRequest } from '@/services/api'

export interface KamAiChatSource {
  id: string
  account_id?: string | null
  account_name?: string | null
  source_type: string
  source_record_id: string
  title: string
  excerpt: string
  source_route?: string | null
  relevance_score: number
  citation_index: number
  metadata_json: Record<string, unknown>
}

export interface KamAiChatMessage {
  id: string
  session_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  status: 'pending' | 'running' | 'complete' | 'failed'
  intent?: string | null
  confidence?: 'high' | 'medium' | 'low' | 'not_available' | null
  model_provider?: string | null
  model_name?: string | null
  token_usage_json: Record<string, unknown>
  metadata_json: Record<string, unknown>
  error_message?: string | null
  ai_gateway_run_id?: string | null
  sources: KamAiChatSource[]
  created_at: string
  completed_at?: string | null
}

export interface KamAiChatSession {
  id: string
  user_id: string
  title: string
  account_id?: string | null
  account_name?: string | null
  scope_json: string[]
  status: string
  message_count: number
  last_message_preview?: string | null
  last_message_at?: string | null
  created_at: string
  updated_at: string
  archived_at?: string | null
}

export interface KamAiChatSessionDetail extends KamAiChatSession {
  messages: KamAiChatMessage[]
}

export interface KamAiChatSessionPage {
  items: KamAiChatSession[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface CreateKamAiSessionPayload {
  title?: string
  account_id?: string
  scopes?: string[]
}

export interface SendKamAiMessagePayload {
  content: string
  account_id?: string
  scopes?: string[]
  document_search?: boolean
  limit?: number
}

export function listKamAiChatSessions(token: string, params: { includeArchived?: boolean; page?: number; pageSize?: number } = {}) {
  const query = new URLSearchParams()
  if (params.includeArchived) query.set('include_archived', 'true')
  if (params.page) query.set('page', String(params.page))
  if (params.pageSize) query.set('page_size', String(params.pageSize))
  const suffix = query.toString() ? `?${query}` : ''
  return apiRequest<KamAiChatSessionPage>(`/api/ai/chat-sessions${suffix}`, { token })
}

export function createKamAiChatSession(token: string, payload: CreateKamAiSessionPayload = {}) {
  return apiRequest<KamAiChatSessionDetail>('/api/ai/chat-sessions', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
}

export function getKamAiChatSession(token: string, sessionId: string) {
  return apiRequest<KamAiChatSessionDetail>(`/api/ai/chat-sessions/${sessionId}`, { token })
}

export function updateKamAiChatSession(token: string, sessionId: string, payload: { title?: string; archived?: boolean }) {
  return apiRequest<KamAiChatSessionDetail>(`/api/ai/chat-sessions/${sessionId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(payload),
  })
}

export function sendKamAiChatMessage(token: string, sessionId: string, payload: SendKamAiMessagePayload) {
  return apiRequest<KamAiChatSessionDetail>(`/api/ai/chat-sessions/${sessionId}/messages`, {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
}

