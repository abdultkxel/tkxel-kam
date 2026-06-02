ALTER TABLE timeline_entries
    ADD COLUMN IF NOT EXISTS event_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS sensitivity_level VARCHAR(40),
    ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS mentions JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS status VARCHAR(40) NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS event_type_config_id VARCHAR(36),
    ADD COLUMN IF NOT EXISTS retention_policy_id VARCHAR(36),
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS restricted_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS deleted_by_id VARCHAR(36),
    ADD COLUMN IF NOT EXISTS source_hash VARCHAR(128),
    ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(160),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;

UPDATE timeline_entries SET event_at = created_at WHERE event_at IS NULL;
UPDATE timeline_entries SET updated_at = created_at WHERE updated_at IS NULL;
ALTER TABLE timeline_entries ALTER COLUMN event_at SET NOT NULL;
ALTER TABLE timeline_entries ALTER COLUMN updated_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS ix_timeline_entries_event_at ON timeline_entries(event_at);
CREATE INDEX IF NOT EXISTS ix_timeline_entries_status ON timeline_entries(status);
CREATE INDEX IF NOT EXISTS ix_timeline_entries_sensitivity_level ON timeline_entries(sensitivity_level);
CREATE INDEX IF NOT EXISTS ix_timeline_entries_event_type_config_id ON timeline_entries(event_type_config_id);
CREATE INDEX IF NOT EXISTS ix_timeline_entries_retention_policy_id ON timeline_entries(retention_policy_id);
CREATE INDEX IF NOT EXISTS ix_timeline_entries_source_hash ON timeline_entries(source_hash);
CREATE INDEX IF NOT EXISTS ix_timeline_entries_idempotency_key ON timeline_entries(idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS uq_timeline_entries_account_source_hash_idx ON timeline_entries(account_id, source_hash) WHERE source_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_timeline_entries_account_idempotency_key_idx ON timeline_entries(account_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS timeline_retention_policies (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    entity_type VARCHAR(80) NOT NULL DEFAULT 'timeline_entry',
    action VARCHAR(40) NOT NULL DEFAULT 'archive',
    duration_days INTEGER NOT NULL DEFAULT 1095,
    reason_template TEXT NOT NULL DEFAULT 'Retention policy applied.',
    critical_behavior VARCHAR(40) NOT NULL DEFAULT 'tombstone',
    schedule_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    schedule_interval_hours INTEGER NOT NULL DEFAULT 24,
    last_run_at TIMESTAMP WITH TIME ZONE,
    next_run_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    updated_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_timeline_retention_policies_name ON timeline_retention_policies(name);
CREATE INDEX IF NOT EXISTS ix_timeline_retention_policies_entity_type ON timeline_retention_policies(entity_type);
CREATE INDEX IF NOT EXISTS ix_timeline_retention_policies_action ON timeline_retention_policies(action);
CREATE INDEX IF NOT EXISTS ix_timeline_retention_policies_schedule_enabled ON timeline_retention_policies(schedule_enabled);
CREATE INDEX IF NOT EXISTS ix_timeline_retention_policies_next_run_at ON timeline_retention_policies(next_run_at);
CREATE INDEX IF NOT EXISTS ix_timeline_retention_policies_is_active ON timeline_retention_policies(is_active);

CREATE TABLE IF NOT EXISTS timeline_event_types (
    id VARCHAR(36) PRIMARY KEY,
    slug VARCHAR(120) NOT NULL,
    name VARCHAR(160) NOT NULL,
    category VARCHAR(80) NOT NULL DEFAULT 'general',
    module VARCHAR(80) NOT NULL DEFAULT 'manual',
    color_token VARCHAR(80) NOT NULL DEFAULT 'brand-blue',
    display_order INTEGER NOT NULL DEFAULT 0,
    default_visibility VARCHAR(40) NOT NULL DEFAULT 'public',
    retention_policy_id VARCHAR(36) REFERENCES timeline_retention_policies(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_critical BOOLEAN NOT NULL DEFAULT FALSE,
    critical_rule_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    updated_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_timeline_event_types_slug UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS ix_timeline_event_types_slug ON timeline_event_types(slug);
CREATE INDEX IF NOT EXISTS ix_timeline_event_types_name ON timeline_event_types(name);
CREATE INDEX IF NOT EXISTS ix_timeline_event_types_category ON timeline_event_types(category);
CREATE INDEX IF NOT EXISTS ix_timeline_event_types_module ON timeline_event_types(module);
CREATE INDEX IF NOT EXISTS ix_timeline_event_types_is_active ON timeline_event_types(is_active);

CREATE TABLE IF NOT EXISTS timeline_comments (
    id VARCHAR(36) PRIMARY KEY,
    timeline_entry_id VARCHAR(36) NOT NULL REFERENCES timeline_entries(id) ON DELETE CASCADE,
    author_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    author_name VARCHAR(160) NOT NULL,
    body TEXT NOT NULL,
    mentions JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
    sensitivity_level VARCHAR(40),
    edited_at TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_timeline_comments_timeline_entry_id ON timeline_comments(timeline_entry_id);
CREATE INDEX IF NOT EXISTS ix_timeline_comments_author_id ON timeline_comments(author_id);

CREATE TABLE IF NOT EXISTS timeline_retention_actions (
    id VARCHAR(36) PRIMARY KEY,
    policy_id VARCHAR(36) REFERENCES timeline_retention_policies(id) ON DELETE SET NULL,
    entity_type VARCHAR(80) NOT NULL DEFAULT 'timeline_entry',
    action VARCHAR(40) NOT NULL,
    mode VARCHAR(40) NOT NULL DEFAULT 'manual',
    status VARCHAR(40) NOT NULL DEFAULT 'complete',
    matched_count INTEGER NOT NULL DEFAULT 0,
    affected_count INTEGER NOT NULL DEFAULT 0,
    reason TEXT,
    actor_id VARCHAR(36) NOT NULL,
    actor_name VARCHAR(160) NOT NULL,
    error_message TEXT,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_timeline_retention_actions_policy_id ON timeline_retention_actions(policy_id);
CREATE INDEX IF NOT EXISTS ix_timeline_retention_actions_action ON timeline_retention_actions(action);
CREATE INDEX IF NOT EXISTS ix_timeline_retention_actions_mode ON timeline_retention_actions(mode);
CREATE INDEX IF NOT EXISTS ix_timeline_retention_actions_status ON timeline_retention_actions(status);

CREATE TABLE IF NOT EXISTS timeline_tombstones (
    id VARCHAR(36) PRIMARY KEY,
    original_event_id VARCHAR(36) NOT NULL,
    account_id VARCHAR(36) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    retention_policy_id VARCHAR(36) REFERENCES timeline_retention_policies(id) ON DELETE SET NULL,
    deleted_by_id VARCHAR(36) NOT NULL,
    deleted_by_name VARCHAR(160) NOT NULL,
    redacted_metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_timeline_tombstones_original_event_id ON timeline_tombstones(original_event_id);
CREATE INDEX IF NOT EXISTS ix_timeline_tombstones_account_id ON timeline_tombstones(account_id);
CREATE INDEX IF NOT EXISTS ix_timeline_tombstones_retention_policy_id ON timeline_tombstones(retention_policy_id);

CREATE TABLE IF NOT EXISTS handover_summaries (
    id VARCHAR(36) PRIMARY KEY,
    account_id VARCHAR(36) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    generated_by_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    generated_by_name VARCHAR(160) NOT NULL,
    ownership_change_id VARCHAR(36),
    selected_sections JSONB NOT NULL DEFAULT '[]'::jsonb,
    source_set_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    redaction_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    citations_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    content_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(40) NOT NULL DEFAULT 'complete',
    export_metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    share_metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_handover_summaries_account_id ON handover_summaries(account_id);
CREATE INDEX IF NOT EXISTS ix_handover_summaries_generated_by_id ON handover_summaries(generated_by_id);
CREATE INDEX IF NOT EXISTS ix_handover_summaries_ownership_change_id ON handover_summaries(ownership_change_id);
CREATE INDEX IF NOT EXISTS ix_handover_summaries_status ON handover_summaries(status);

CREATE TABLE IF NOT EXISTS handover_shares (
    id VARCHAR(36) PRIMARY KEY,
    handover_summary_id VARCHAR(36) NOT NULL REFERENCES handover_summaries(id) ON DELETE CASCADE,
    account_id VARCHAR(36) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    share_token VARCHAR(120) NOT NULL,
    created_by_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_by_name VARCHAR(160) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_handover_shares_share_token UNIQUE (share_token)
);

CREATE INDEX IF NOT EXISTS ix_handover_shares_handover_summary_id ON handover_shares(handover_summary_id);
CREATE INDEX IF NOT EXISTS ix_handover_shares_account_id ON handover_shares(account_id);
CREATE INDEX IF NOT EXISTS ix_handover_shares_share_token ON handover_shares(share_token);

CREATE TABLE IF NOT EXISTS timeline_ai_search_audits (
    id VARCHAR(36) PRIMARY KEY,
    account_id VARCHAR(36) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    query TEXT NOT NULL,
    interpreted_intent VARCHAR(120) NOT NULL,
    scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
    source_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    redactions JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_timeline_ai_search_audits_account_id ON timeline_ai_search_audits(account_id);
CREATE INDEX IF NOT EXISTS ix_timeline_ai_search_audits_user_id ON timeline_ai_search_audits(user_id);
CREATE INDEX IF NOT EXISTS ix_timeline_ai_search_audits_interpreted_intent ON timeline_ai_search_audits(interpreted_intent);
