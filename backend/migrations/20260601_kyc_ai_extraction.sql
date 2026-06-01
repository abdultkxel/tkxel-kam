-- KYC and AI extraction schema.
-- This project currently initializes local databases with SQLAlchemy create_all;
-- apply this PostgreSQL script for persistent environments that do not recreate metadata.

CREATE TABLE IF NOT EXISTS kyc_agent_runs (
  id VARCHAR(36) PRIMARY KEY,
  account_id VARCHAR(36) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  trigger_source VARCHAR(80) NOT NULL DEFAULT 'kyc_page',
  previous_run_id VARCHAR(36),
  source_document_ids JSON NOT NULL DEFAULT '[]',
  research_sources JSON NOT NULL DEFAULT '[]',
  triggered_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  triggered_by_name VARCHAR(160) NOT NULL,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kyc_drafts (
  id VARCHAR(36) PRIMARY KEY,
  account_id VARCHAR(36) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  status VARCHAR(40) NOT NULL DEFAULT 'ready_for_review',
  trigger_source VARCHAR(80) NOT NULL DEFAULT 'account_overview',
  agent_run_id VARCHAR(36) REFERENCES kyc_agent_runs(id) ON DELETE SET NULL,
  previous_snapshot_id VARCHAR(36),
  source_document_ids JSON NOT NULL DEFAULT '[]',
  research_sources JSON NOT NULL DEFAULT '[]',
  fields_json JSON NOT NULL DEFAULT '[]',
  citations_json JSON NOT NULL DEFAULT '[]',
  missing_fields JSON NOT NULL DEFAULT '[]',
  conflicts JSON NOT NULL DEFAULT '[]',
  difference_summary JSON NOT NULL DEFAULT '[]',
  source_context JSON NOT NULL DEFAULT '{}',
  confidence INTEGER NOT NULL DEFAULT 75,
  completeness INTEGER NOT NULL DEFAULT 0,
  source_coverage INTEGER NOT NULL DEFAULT 0,
  freshness_status VARCHAR(40) NOT NULL DEFAULT 'fresh',
  low_confidence_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  conflicts_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  override_reason TEXT,
  review_notes TEXT,
  created_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  created_by_name VARCHAR(160) NOT NULL,
  reviewed_by_id VARCHAR(36),
  reviewed_by_name VARCHAR(160),
  approved_by_id VARCHAR(36),
  approved_by_name VARCHAR(160),
  rejected_by_id VARCHAR(36),
  rejected_by_name VARCHAR(160),
  rejection_reason TEXT,
  approved_snapshot_id VARCHAR(36),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS kyc_snapshots (
  id VARCHAR(36) PRIMARY KEY,
  account_id VARCHAR(36) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  source_draft_id VARCHAR(36) REFERENCES kyc_drafts(id) ON DELETE SET NULL,
  extraction_run_id VARCHAR(36) REFERENCES kyc_agent_runs(id) ON DELETE SET NULL,
  approved_by_id VARCHAR(36),
  approved_by_name VARCHAR(160) NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fields_json JSON NOT NULL DEFAULT '[]',
  citations_json JSON NOT NULL DEFAULT '[]',
  source_context JSON NOT NULL DEFAULT '{}',
  source_document_ids JSON NOT NULL DEFAULT '[]',
  research_sources JSON NOT NULL DEFAULT '[]',
  confidence INTEGER NOT NULL DEFAULT 75,
  completeness INTEGER NOT NULL DEFAULT 0,
  source_coverage INTEGER NOT NULL DEFAULT 0,
  freshness_status VARCHAR(40) NOT NULL DEFAULT 'fresh',
  missing_fields JSON NOT NULL DEFAULT '[]',
  conflicts JSON NOT NULL DEFAULT '[]',
  change_summary JSON NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_kyc_snapshots_account_version UNIQUE (account_id, version)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_kyc_drafts_previous_snapshot_id'
  ) THEN
    ALTER TABLE kyc_drafts
      ADD CONSTRAINT fk_kyc_drafts_previous_snapshot_id
      FOREIGN KEY (previous_snapshot_id) REFERENCES kyc_snapshots(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS kyc_workstream_outputs (
  id VARCHAR(36) PRIMARY KEY,
  run_id VARCHAR(36) NOT NULL REFERENCES kyc_agent_runs(id) ON DELETE CASCADE,
  account_id VARCHAR(36) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  workstream_key VARCHAR(80) NOT NULL,
  title VARCHAR(160) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  sort_order INTEGER NOT NULL DEFAULT 0,
  output_json JSON NOT NULL DEFAULT '{}',
  citations_json JSON NOT NULL DEFAULT '[]',
  missing_fields JSON NOT NULL DEFAULT '[]',
  confidence INTEGER NOT NULL DEFAULT 75,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_kyc_workstream_outputs_run_key UNIQUE (run_id, workstream_key)
);

CREATE TABLE IF NOT EXISTS kyc_configurations (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE DEFAULT 'default',
  required_field_keys JSON NOT NULL DEFAULT '[]',
  freshness_threshold_days INTEGER NOT NULL DEFAULT 180,
  low_confidence_threshold INTEGER NOT NULL DEFAULT 70,
  research_sources JSON NOT NULL DEFAULT '[]',
  updated_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_kyc_agent_runs_account_id ON kyc_agent_runs(account_id);
CREATE INDEX IF NOT EXISTS ix_kyc_agent_runs_status ON kyc_agent_runs(status);
CREATE INDEX IF NOT EXISTS ix_kyc_agent_runs_trigger_source ON kyc_agent_runs(trigger_source);
CREATE INDEX IF NOT EXISTS ix_kyc_agent_runs_triggered_by_id ON kyc_agent_runs(triggered_by_id);
CREATE INDEX IF NOT EXISTS ix_kyc_drafts_account_id ON kyc_drafts(account_id);
CREATE INDEX IF NOT EXISTS ix_kyc_drafts_status ON kyc_drafts(status);
CREATE INDEX IF NOT EXISTS ix_kyc_drafts_trigger_source ON kyc_drafts(trigger_source);
CREATE INDEX IF NOT EXISTS ix_kyc_drafts_agent_run_id ON kyc_drafts(agent_run_id);
CREATE INDEX IF NOT EXISTS ix_kyc_drafts_previous_snapshot_id ON kyc_drafts(previous_snapshot_id);
CREATE INDEX IF NOT EXISTS ix_kyc_drafts_freshness_status ON kyc_drafts(freshness_status);
CREATE INDEX IF NOT EXISTS ix_kyc_snapshots_account_id ON kyc_snapshots(account_id);
CREATE INDEX IF NOT EXISTS ix_kyc_snapshots_source_draft_id ON kyc_snapshots(source_draft_id);
CREATE INDEX IF NOT EXISTS ix_kyc_snapshots_extraction_run_id ON kyc_snapshots(extraction_run_id);
CREATE INDEX IF NOT EXISTS ix_kyc_snapshots_approved_at ON kyc_snapshots(approved_at);
CREATE INDEX IF NOT EXISTS ix_kyc_workstream_outputs_run_id ON kyc_workstream_outputs(run_id);
CREATE INDEX IF NOT EXISTS ix_kyc_workstream_outputs_account_id ON kyc_workstream_outputs(account_id);
CREATE INDEX IF NOT EXISTS ix_kyc_workstream_outputs_workstream_key ON kyc_workstream_outputs(workstream_key);
CREATE INDEX IF NOT EXISTS ix_kyc_workstream_outputs_status ON kyc_workstream_outputs(status);
CREATE INDEX IF NOT EXISTS ix_kyc_configurations_name ON kyc_configurations(name);
