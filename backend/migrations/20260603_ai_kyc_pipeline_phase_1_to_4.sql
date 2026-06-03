-- Production-grade AI KYC pipeline phases 1-4.
-- Adds source text extraction metadata, chunk storage, retrieval metadata, and provider run metadata.

ALTER TABLE source_documents
  ADD COLUMN IF NOT EXISTS storage_backend VARCHAR(40),
  ADD COLUMN IF NOT EXISTS storage_path VARCHAR(1000),
  ADD COLUMN IF NOT EXISTS mime_type VARCHAR(180),
  ADD COLUMN IF NOT EXISTS size_bytes INTEGER,
  ADD COLUMN IF NOT EXISTS checksum_sha256 VARCHAR(64),
  ADD COLUMN IF NOT EXISTS extracted_text_checksum VARCHAR(64),
  ADD COLUMN IF NOT EXISTS extraction_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS extraction_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS extraction_error TEXT,
  ADD COLUMN IF NOT EXISTS ocr_status VARCHAR(40),
  ADD COLUMN IF NOT EXISTS ocr_engine VARCHAR(80);

CREATE INDEX IF NOT EXISTS ix_source_documents_checksum_sha256 ON source_documents(checksum_sha256);
CREATE INDEX IF NOT EXISTS ix_source_documents_ocr_status ON source_documents(ocr_status);

CREATE TABLE IF NOT EXISTS source_document_extractions (
  id VARCHAR(36) PRIMARY KEY,
  source_document_id VARCHAR(36) NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  extractor_name VARCHAR(120) NOT NULL DEFAULT 'local',
  extractor_version VARCHAR(40) NOT NULL DEFAULT 'v1',
  mime_type VARCHAR(180),
  page_count INTEGER NOT NULL DEFAULT 0,
  raw_text TEXT,
  normalized_text TEXT,
  metadata_json JSON NOT NULL DEFAULT '{}',
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS source_document_chunks (
  id VARCHAR(36) PRIMARY KEY,
  source_document_id VARCHAR(36) NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
  extraction_id VARCHAR(36) REFERENCES source_document_extractions(id) ON DELETE CASCADE,
  account_id VARCHAR(36) REFERENCES accounts(id) ON DELETE CASCADE,
  engagement_id VARCHAR(36) REFERENCES engagements(id) ON DELETE SET NULL,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  chunk_text TEXT NOT NULL,
  chunk_hash VARCHAR(64) NOT NULL,
  page_number INTEGER,
  section_label VARCHAR(220),
  start_offset INTEGER,
  end_offset INTEGER,
  token_count INTEGER NOT NULL DEFAULT 0,
  sensitivity_level VARCHAR(40) NOT NULL DEFAULT 'standard',
  source_type VARCHAR(80) NOT NULL,
  trust_score INTEGER NOT NULL DEFAULT 50,
  embedding_provider VARCHAR(80),
  embedding_model VARCHAR(160),
  embedding_json JSON,
  embedding_hash VARCHAR(64),
  metadata_json JSON NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_source_document_chunks_document_hash UNIQUE (source_document_id, chunk_hash)
);

CREATE INDEX IF NOT EXISTS ix_source_document_extractions_source_document_id ON source_document_extractions(source_document_id);
CREATE INDEX IF NOT EXISTS ix_source_document_extractions_status ON source_document_extractions(status);
CREATE INDEX IF NOT EXISTS ix_source_document_chunks_source_document_id ON source_document_chunks(source_document_id);
CREATE INDEX IF NOT EXISTS ix_source_document_chunks_extraction_id ON source_document_chunks(extraction_id);
CREATE INDEX IF NOT EXISTS ix_source_document_chunks_account_id ON source_document_chunks(account_id);
CREATE INDEX IF NOT EXISTS ix_source_document_chunks_engagement_id ON source_document_chunks(engagement_id);
CREATE INDEX IF NOT EXISTS ix_source_document_chunks_chunk_hash ON source_document_chunks(chunk_hash);
CREATE INDEX IF NOT EXISTS ix_source_document_chunks_sensitivity_level ON source_document_chunks(sensitivity_level);
CREATE INDEX IF NOT EXISTS ix_source_document_chunks_source_type ON source_document_chunks(source_type);

ALTER TABLE kyc_agent_runs
  ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_retries INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_gateway_run_id VARCHAR(36),
  ADD COLUMN IF NOT EXISTS retrieval_summary_json JSON NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS provider_json JSON NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS usage_json JSON NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cost_json JSON NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS provider_response_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS model_name VARCHAR(160);

ALTER TABLE kyc_workstream_outputs
  ADD COLUMN IF NOT EXISTS reviewer_notes_json JSON NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS follow_up_questions_json JSON NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS retrieved_chunk_ids JSON NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS provider_response_id VARCHAR(255);
