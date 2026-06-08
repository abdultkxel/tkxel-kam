export type KycDraftStatus = 'ready_for_review' | 'approved' | 'rejected'
export type KycRunStatus = 'pending' | 'running' | 'complete' | 'failed' | 'partial' | 'cancelled'
export type KycWorkstreamStatus = 'pending' | 'running' | 'complete' | 'failed' | 'cancelled'
export type KycTriggerSource = 'account_overview' | 'onboarding_draft' | 'source_documents' | 'kyc_page' | 'manual'
export type KycConfidenceLevel = 'low' | 'medium' | 'high'

export interface KycCitation {
  source_document_id?: string | null
  source_chunk_id?: string | null
  source_record_id?: string | null
  label: string
  page_number?: number | null
  section_label?: string | null
  excerpt: string
  field_key?: string | null
  restricted: boolean
  confidence?: number | null
  source_route?: string | null
}

export interface KycField {
  key: string
  label: string
  workstream_key: string
  workstream_title: string
  value?: string | null
  confidence: number
  is_required: boolean
  is_sensitive: boolean
  reviewed: boolean
  missing: boolean
  conflict: boolean
  previous_value?: string | null
  citations: KycCitation[]
  missing_evidence_note?: string | null
  conflicts?: string[]
  reviewer_notes?: string[]
  suggested_follow_up_questions?: string[]
}

export interface KycDraft {
  id: string
  account_id: string
  status: KycDraftStatus
  trigger_source: KycTriggerSource
  agent_run_id?: string | null
  previous_snapshot_id?: string | null
  approved_snapshot_id?: string | null
  source_document_ids: string[]
  research_sources: string[]
  fields: KycField[]
  citations: KycCitation[]
  missing_fields: string[]
  conflicts: string[]
  difference_summary: string[]
  source_context: Record<string, unknown>
  detailed_description: string
  confidence: number
  completeness: number
  source_coverage: number
  freshness_status: 'fresh' | 'stale' | 'missing'
  low_confidence_acknowledged: boolean
  conflicts_acknowledged: boolean
  override_reason?: string | null
  review_notes?: string | null
  created_by_name: string
  reviewed_by_name?: string | null
  approved_by_name?: string | null
  rejected_by_name?: string | null
  rejection_reason?: string | null
  created_at: string
  updated_at: string
  decided_at?: string | null
  ai_disclaimer: string
}

export interface KycSnapshot {
  id: string
  account_id: string
  version: number
  source_draft_id?: string | null
  extraction_run_id?: string | null
  approved_by_name: string
  approved_at: string
  fields: KycField[]
  citations: KycCitation[]
  source_context: Record<string, unknown>
  detailed_description: string
  source_document_ids: string[]
  research_sources: string[]
  confidence: number
  completeness: number
  source_coverage: number
  freshness_status: 'fresh' | 'stale' | 'missing'
  missing_fields: string[]
  conflicts: string[]
  change_summary: string[]
  created_at: string
  ai_disclaimer: string
}

export interface KycFreshness {
  account_id: string
  has_approved_snapshot: boolean
  snapshot_id?: string | null
  snapshot_version?: number | null
  completeness: number
  confidence: number
  source_coverage: number
  freshness_status: 'fresh' | 'stale' | 'missing'
  stale: boolean
  freshness_threshold_days: number
  last_approved_at?: string | null
  stale_after?: string | null
  missing_fields: string[]
  required_fields_total: number
  required_fields_completed: number
}

export interface KycWorkstreamOutputValue {
  value?: string | null
  confidence?: number
  citations?: KycCitation[]
  missing_evidence_note?: string | null
  conflicts?: string[]
  reviewer_notes?: string[]
  suggested_follow_up_questions?: string[]
}

export interface KycWorkstream {
  id?: string | null
  workstream_key: string
  title: string
  status: KycWorkstreamStatus
  sort_order: number
  confidence: number
  output: Record<string, string | KycWorkstreamOutputValue>
  citations: KycCitation[]
  missing_fields: string[]
  reviewer_notes?: string[]
  suggested_follow_up_questions?: string[]
  retrieved_chunk_ids?: string[]
  provider_response_id?: string | null
  error_message?: string | null
  started_at?: string | null
  completed_at?: string | null
}

export interface KycAgentRun {
  id: string
  account_id: string
  status: KycRunStatus
  trigger_source: KycTriggerSource
  previous_run_id?: string | null
  source_document_ids: string[]
  research_sources: string[]
  triggered_by_name: string
  workstreams: KycWorkstream[]
  ai_disclaimer: string
  error_message?: string | null
  queued_at?: string | null
  retry_count?: number
  max_retries?: number
  next_retry_at?: string | null
  provider?: Record<string, unknown>
  usage?: Record<string, unknown>
  cost?: Record<string, unknown>
  retrieval_summary?: Record<string, unknown>
  provider_response_id?: string | null
  model_name?: string | null
  detailed_description?: string
  started_at?: string | null
  completed_at?: string | null
  created_at: string
  updated_at: string
}

export interface KycJobRunPendingResult {
  processed_count: number
  failed_count: number
  processed_runs: KycAgentRun[]
  failures: { run_id: string; message: string }[]
}

export interface KycConfigurationField {
  key: string
  label: string
  workstream_key: string
  required: boolean
  sensitive: boolean
}

export interface KycConfiguration {
  id: string
  name: string
  required_field_keys: string[]
  freshness_threshold_days: number
  low_confidence_threshold: number
  research_sources: string[]
  field_catalog: KycConfigurationField[]
  updated_by_id?: string | null
  created_at: string
  updated_at: string
}

export interface KycPage<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}
