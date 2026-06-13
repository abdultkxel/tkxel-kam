-- PostgreSQL reference DDL for Playbooks and Tasks.
-- Runtime table creation in local/dev environments is still driven by SQLAlchemy metadata.

CREATE TABLE IF NOT EXISTS playbook_templates (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(180) NOT NULL,
    objective TEXT NOT NULL,
    description TEXT NULL,
    signal_types JSONB NOT NULL DEFAULT '[]'::jsonb,
    weak_metrics JSONB NOT NULL DEFAULT '[]'::jsonb,
    default_owner_rule VARCHAR(80) NOT NULL DEFAULT 'account_primary_am',
    due_date_rule JSONB NOT NULL DEFAULT '{}'::jsonb,
    success_criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
    skip_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
    version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by_id VARCHAR(36) NULL REFERENCES users(id) ON DELETE SET NULL,
    updated_by_id VARCHAR(36) NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS playbook_template_activities (
    id VARCHAR(36) PRIMARY KEY,
    template_id VARCHAR(36) NOT NULL REFERENCES playbook_templates(id) ON DELETE CASCADE,
    title VARCHAR(220) NOT NULL,
    description TEXT NULL,
    owner_rule VARCHAR(80) NOT NULL DEFAULT 'account_primary_am',
    due_offset_days INTEGER NOT NULL DEFAULT 7,
    priority VARCHAR(40) NOT NULL DEFAULT 'medium',
    success_criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
    skip_allowed BOOLEAN NOT NULL DEFAULT TRUE,
    requires_evidence BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS playbook_executions (
    id VARCHAR(36) PRIMARY KEY,
    template_id VARCHAR(36) NULL REFERENCES playbook_templates(id) ON DELETE SET NULL,
    template_name_snapshot VARCHAR(180) NOT NULL,
    template_version_snapshot INTEGER NOT NULL,
    account_id VARCHAR(36) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    engagement_id VARCHAR(36) NULL REFERENCES engagements(id) ON DELETE SET NULL,
    source_signal_id VARCHAR(120) NULL,
    source_signal_type VARCHAR(120) NULL,
    source_metric VARCHAR(120) NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    skipped_activity_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    skip_reasons JSONB NOT NULL DEFAULT '{}'::jsonb,
    template_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by_id VARCHAR(36) NULL REFERENCES users(id) ON DELETE SET NULL,
    created_by_name VARCHAR(160) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
    id VARCHAR(36) PRIMARY KEY,
    account_id VARCHAR(36) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    engagement_id VARCHAR(36) NULL REFERENCES engagements(id) ON DELETE SET NULL,
    playbook_execution_id VARCHAR(36) NULL REFERENCES playbook_executions(id) ON DELETE SET NULL,
    template_activity_id VARCHAR(36) NULL,
    source_type VARCHAR(80) NOT NULL DEFAULT 'manual',
    source_record_id VARCHAR(120) NULL,
    source_metric VARCHAR(120) NULL,
    title VARCHAR(220) NOT NULL,
    description TEXT NULL,
    owner_id VARCHAR(36) NULL REFERENCES users(id) ON DELETE SET NULL,
    owner_name VARCHAR(160) NOT NULL,
    due_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'todo',
    priority VARCHAR(40) NOT NULL DEFAULT 'medium',
    notes TEXT NULL,
    outcome TEXT NULL,
    success_criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
    requires_evidence BOOLEAN NOT NULL DEFAULT FALSE,
    skipped_reason TEXT NULL,
    completed_at TIMESTAMPTZ NULL,
    completed_by_id VARCHAR(36) NULL REFERENCES users(id) ON DELETE SET NULL,
    created_by_id VARCHAR(36) NULL REFERENCES users(id) ON DELETE SET NULL,
    updated_by_id VARCHAR(36) NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS task_evidence (
    id VARCHAR(36) PRIMARY KEY,
    task_id VARCHAR(36) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    evidence_type VARCHAR(40) NOT NULL DEFAULT 'note',
    title VARCHAR(220) NULL,
    body TEXT NULL,
    url VARCHAR(1000) NULL,
    file_name VARCHAR(255) NULL,
    file_path VARCHAR(1000) NULL,
    file_storage_backend VARCHAR(40) NULL,
    file_mime_type VARCHAR(180) NULL,
    file_size_bytes INTEGER NULL,
    created_by_id VARCHAR(36) NULL REFERENCES users(id) ON DELETE SET NULL,
    created_by_name VARCHAR(160) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_playbook_templates_active_updated ON playbook_templates (is_active, updated_at);
CREATE INDEX IF NOT EXISTS ix_playbook_template_activities_template ON playbook_template_activities (template_id, sort_order);
CREATE INDEX IF NOT EXISTS ix_playbook_executions_account ON playbook_executions (account_id, created_at);
CREATE INDEX IF NOT EXISTS ix_playbook_executions_engagement ON playbook_executions (engagement_id);
CREATE INDEX IF NOT EXISTS ix_tasks_account_due ON tasks (account_id, due_at);
CREATE INDEX IF NOT EXISTS ix_tasks_engagement_due ON tasks (engagement_id, due_at);
CREATE INDEX IF NOT EXISTS ix_tasks_owner_status_due ON tasks (owner_id, status, due_at);
CREATE INDEX IF NOT EXISTS ix_tasks_source_type ON tasks (source_type);
CREATE INDEX IF NOT EXISTS ix_tasks_priority_updated ON tasks (priority, updated_at);
CREATE INDEX IF NOT EXISTS ix_task_evidence_task ON task_evidence (task_id, created_at);
