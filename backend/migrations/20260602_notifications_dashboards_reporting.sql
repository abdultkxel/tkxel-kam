CREATE TABLE IF NOT EXISTS notification_trigger_configs (
    id VARCHAR(36) PRIMARY KEY,
    trigger VARCHAR(120) NOT NULL,
    label VARCHAR(160) NOT NULL,
    description TEXT,
    default_mode VARCHAR(40) NOT NULL DEFAULT 'in_app',
    default_digest_cadence VARCHAR(40) NOT NULL DEFAULT 'daily',
    supported_channels JSONB NOT NULL DEFAULT '[]'::jsonb,
    mandatory BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_notification_trigger_configs_trigger UNIQUE (trigger)
);

CREATE INDEX IF NOT EXISTS ix_notification_trigger_configs_trigger ON notification_trigger_configs(trigger);
CREATE INDEX IF NOT EXISTS ix_notification_trigger_configs_is_active ON notification_trigger_configs(is_active);

CREATE TABLE IF NOT EXISTS notification_preferences (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trigger VARCHAR(120) NOT NULL,
    mode VARCHAR(40) NOT NULL DEFAULT 'in_app',
    digest_cadence VARCHAR(40) NOT NULL DEFAULT 'daily',
    policy_override BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_notification_preferences_user_trigger UNIQUE (user_id, trigger)
);

CREATE INDEX IF NOT EXISTS ix_notification_preferences_user_id ON notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS ix_notification_preferences_trigger ON notification_preferences(trigger);

CREATE TABLE IF NOT EXISTS notification_records (
    id VARCHAR(36) PRIMARY KEY,
    recipient_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    recipient_name VARCHAR(160) NOT NULL,
    recipient_email VARCHAR(255),
    trigger VARCHAR(120) NOT NULL,
    title VARCHAR(220) NOT NULL,
    body TEXT NOT NULL,
    account_id VARCHAR(36) REFERENCES accounts(id) ON DELETE SET NULL,
    account_name_snapshot VARCHAR(180),
    source_record_type VARCHAR(80),
    source_record_id VARCHAR(36),
    source_record_route VARCHAR(500),
    priority VARCHAR(40) NOT NULL DEFAULT 'medium',
    channel VARCHAR(40) NOT NULL DEFAULT 'in_app',
    delivery_status VARCHAR(40) NOT NULL DEFAULT 'queued',
    delivery_metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    deduplication_key VARCHAR(255) NOT NULL,
    email_queued BOOLEAN NOT NULL DEFAULT FALSE,
    retry_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    read_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_notification_records_deduplication_key UNIQUE (deduplication_key)
);

CREATE INDEX IF NOT EXISTS ix_notification_records_recipient_user_id ON notification_records(recipient_user_id);
CREATE INDEX IF NOT EXISTS ix_notification_records_trigger ON notification_records(trigger);
CREATE INDEX IF NOT EXISTS ix_notification_records_account_id ON notification_records(account_id);
CREATE INDEX IF NOT EXISTS ix_notification_records_source_record_type ON notification_records(source_record_type);
CREATE INDEX IF NOT EXISTS ix_notification_records_source_record_id ON notification_records(source_record_id);
CREATE INDEX IF NOT EXISTS ix_notification_records_priority ON notification_records(priority);
CREATE INDEX IF NOT EXISTS ix_notification_records_channel ON notification_records(channel);
CREATE INDEX IF NOT EXISTS ix_notification_records_delivery_status ON notification_records(delivery_status);
CREATE INDEX IF NOT EXISTS ix_notification_records_read_at ON notification_records(read_at);
CREATE INDEX IF NOT EXISTS ix_notification_records_created_at ON notification_records(created_at);

CREATE TABLE IF NOT EXISTS sla_rules (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    item_type VARCHAR(40) NOT NULL,
    severity VARCHAR(40),
    priority VARCHAR(40),
    inactivity_minutes INTEGER NOT NULL DEFAULT 1440,
    qualifying_activities JSONB NOT NULL DEFAULT '[]'::jsonb,
    recipient_policy VARCHAR(80) NOT NULL DEFAULT 'kam_head',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    updated_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_sla_rules_name ON sla_rules(name);
CREATE INDEX IF NOT EXISTS ix_sla_rules_item_type ON sla_rules(item_type);
CREATE INDEX IF NOT EXISTS ix_sla_rules_severity ON sla_rules(severity);
CREATE INDEX IF NOT EXISTS ix_sla_rules_priority ON sla_rules(priority);
CREATE INDEX IF NOT EXISTS ix_sla_rules_is_active ON sla_rules(is_active);

CREATE TABLE IF NOT EXISTS sla_escalated_items (
    id VARCHAR(36) PRIMARY KEY,
    rule_id VARCHAR(36) REFERENCES sla_rules(id) ON DELETE SET NULL,
    source_type VARCHAR(40) NOT NULL,
    source_record_id VARCHAR(36) NOT NULL,
    account_id VARCHAR(36) REFERENCES accounts(id) ON DELETE SET NULL,
    title VARCHAR(220) NOT NULL,
    severity VARCHAR(40),
    owner_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    owner_name VARCHAR(160),
    recipient_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    recipient_name VARCHAR(160),
    last_activity_at TIMESTAMP WITH TIME ZONE,
    escalated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    sla_window_key VARCHAR(120) NOT NULL,
    state VARCHAR(40) NOT NULL DEFAULT 'escalated',
    deduplication_key VARCHAR(255) NOT NULL,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sla_escalated_items_deduplication_key UNIQUE (deduplication_key)
);

CREATE INDEX IF NOT EXISTS ix_sla_escalated_items_rule_id ON sla_escalated_items(rule_id);
CREATE INDEX IF NOT EXISTS ix_sla_escalated_items_source_type ON sla_escalated_items(source_type);
CREATE INDEX IF NOT EXISTS ix_sla_escalated_items_source_record_id ON sla_escalated_items(source_record_id);
CREATE INDEX IF NOT EXISTS ix_sla_escalated_items_account_id ON sla_escalated_items(account_id);
CREATE INDEX IF NOT EXISTS ix_sla_escalated_items_severity ON sla_escalated_items(severity);
CREATE INDEX IF NOT EXISTS ix_sla_escalated_items_owner_id ON sla_escalated_items(owner_id);
CREATE INDEX IF NOT EXISTS ix_sla_escalated_items_recipient_user_id ON sla_escalated_items(recipient_user_id);
CREATE INDEX IF NOT EXISTS ix_sla_escalated_items_last_activity_at ON sla_escalated_items(last_activity_at);
CREATE INDEX IF NOT EXISTS ix_sla_escalated_items_escalated_at ON sla_escalated_items(escalated_at);
CREATE INDEX IF NOT EXISTS ix_sla_escalated_items_sla_window_key ON sla_escalated_items(sla_window_key);
CREATE INDEX IF NOT EXISTS ix_sla_escalated_items_state ON sla_escalated_items(state);

CREATE TABLE IF NOT EXISTS digest_schedules (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    owner_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    owner_name VARCHAR(160) NOT NULL,
    cadence VARCHAR(40) NOT NULL DEFAULT 'weekly',
    timezone VARCHAR(120) NOT NULL DEFAULT 'UTC',
    recipients_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    sections_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    filters_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    delivery_channels JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_at TIMESTAMP WITH TIME ZONE,
    next_run_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_digest_schedules_name ON digest_schedules(name);
CREATE INDEX IF NOT EXISTS ix_digest_schedules_owner_id ON digest_schedules(owner_id);
CREATE INDEX IF NOT EXISTS ix_digest_schedules_cadence ON digest_schedules(cadence);
CREATE INDEX IF NOT EXISTS ix_digest_schedules_is_active ON digest_schedules(is_active);
CREATE INDEX IF NOT EXISTS ix_digest_schedules_next_run_at ON digest_schedules(next_run_at);

CREATE TABLE IF NOT EXISTS digest_runs (
    id VARCHAR(36) PRIMARY KEY,
    schedule_id VARCHAR(36) REFERENCES digest_schedules(id) ON DELETE SET NULL,
    title VARCHAR(220) NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'generated',
    recipients_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    sections_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    content_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    redactions_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    delivery_attempts_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    error_message TEXT,
    generated_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    generated_by_name VARCHAR(160) NOT NULL,
    generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_digest_runs_schedule_id ON digest_runs(schedule_id);
CREATE INDEX IF NOT EXISTS ix_digest_runs_status ON digest_runs(status);
CREATE INDEX IF NOT EXISTS ix_digest_runs_generated_at ON digest_runs(generated_at);

CREATE TABLE IF NOT EXISTS report_definitions (
    id VARCHAR(36) PRIMARY KEY,
    owner_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    owner_name VARCHAR(160) NOT NULL,
    name VARCHAR(160) NOT NULL,
    description TEXT,
    visibility VARCHAR(40) NOT NULL DEFAULT 'private',
    data_source VARCHAR(80) NOT NULL,
    fields_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    filters_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    grouping_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    layout_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    export_format VARCHAR(40) NOT NULL DEFAULT 'csv',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_report_definitions_owner_id ON report_definitions(owner_id);
CREATE INDEX IF NOT EXISTS ix_report_definitions_name ON report_definitions(name);
CREATE INDEX IF NOT EXISTS ix_report_definitions_visibility ON report_definitions(visibility);
CREATE INDEX IF NOT EXISTS ix_report_definitions_data_source ON report_definitions(data_source);
CREATE INDEX IF NOT EXISTS ix_report_definitions_updated_at ON report_definitions(updated_at);

CREATE TABLE IF NOT EXISTS report_schedules (
    id VARCHAR(36) PRIMARY KEY,
    report_id VARCHAR(36) NOT NULL REFERENCES report_definitions(id) ON DELETE CASCADE,
    owner_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    owner_name VARCHAR(160) NOT NULL,
    cadence VARCHAR(40) NOT NULL DEFAULT 'weekly',
    timezone VARCHAR(120) NOT NULL DEFAULT 'UTC',
    recipients_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    delivery_channels JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_at TIMESTAMP WITH TIME ZONE,
    next_run_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_report_schedules_report_id ON report_schedules(report_id);
CREATE INDEX IF NOT EXISTS ix_report_schedules_owner_id ON report_schedules(owner_id);
CREATE INDEX IF NOT EXISTS ix_report_schedules_cadence ON report_schedules(cadence);
CREATE INDEX IF NOT EXISTS ix_report_schedules_is_active ON report_schedules(is_active);
CREATE INDEX IF NOT EXISTS ix_report_schedules_next_run_at ON report_schedules(next_run_at);

CREATE TABLE IF NOT EXISTS report_runs (
    id VARCHAR(36) PRIMARY KEY,
    report_id VARCHAR(36) REFERENCES report_definitions(id) ON DELETE SET NULL,
    schedule_id VARCHAR(36) REFERENCES report_schedules(id) ON DELETE SET NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'generated',
    export_format VARCHAR(40) NOT NULL DEFAULT 'csv',
    content_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    storage_metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    permission_scope_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    recipients_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    error_message TEXT,
    generated_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    generated_by_name VARCHAR(160) NOT NULL,
    generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_report_runs_report_id ON report_runs(report_id);
CREATE INDEX IF NOT EXISTS ix_report_runs_schedule_id ON report_runs(schedule_id);
CREATE INDEX IF NOT EXISTS ix_report_runs_status ON report_runs(status);
CREATE INDEX IF NOT EXISTS ix_report_runs_export_format ON report_runs(export_format);
CREATE INDEX IF NOT EXISTS ix_report_runs_generated_at ON report_runs(generated_at);

CREATE TABLE IF NOT EXISTS scheduled_worker_runs (
    id VARCHAR(36) PRIMARY KEY,
    job_type VARCHAR(80) NOT NULL,
    mode VARCHAR(40) NOT NULL DEFAULT 'scheduled',
    status VARCHAR(40) NOT NULL DEFAULT 'complete',
    matched_count INTEGER NOT NULL DEFAULT 0,
    affected_count INTEGER NOT NULL DEFAULT 0,
    actor_id VARCHAR(36),
    actor_name VARCHAR(160) NOT NULL DEFAULT 'System',
    error_message TEXT,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_scheduled_worker_runs_job_type ON scheduled_worker_runs(job_type);
CREATE INDEX IF NOT EXISTS ix_scheduled_worker_runs_mode ON scheduled_worker_runs(mode);
CREATE INDEX IF NOT EXISTS ix_scheduled_worker_runs_status ON scheduled_worker_runs(status);
CREATE INDEX IF NOT EXISTS ix_scheduled_worker_runs_created_at ON scheduled_worker_runs(created_at);
