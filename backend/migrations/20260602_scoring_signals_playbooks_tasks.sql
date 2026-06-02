-- Scoring, signals, playbooks, tasks, and unified calendar support.

CREATE TABLE IF NOT EXISTS scoring_metric_definitions (
    id VARCHAR(36) PRIMARY KEY,
    slug VARCHAR(120) UNIQUE NOT NULL,
    name VARCHAR(180) NOT NULL,
    description TEXT,
    scope VARCHAR(40) NOT NULL DEFAULT 'account',
    weight INTEGER NOT NULL DEFAULT 20,
    thresholds JSONB NOT NULL DEFAULT '{}'::jsonb,
    formula JSONB NOT NULL DEFAULT '{}'::jsonb,
    freshness_rule JSONB NOT NULL DEFAULT '{}'::jsonb,
    owner_role VARCHAR(80),
    source VARCHAR(80) NOT NULL DEFAULT 'manual',
    effective_date TIMESTAMPTZ,
    status VARCHAR(40) NOT NULL DEFAULT 'draft',
    is_active BOOLEAN NOT NULL DEFAULT true,
    current_version INTEGER NOT NULL DEFAULT 0,
    created_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    updated_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scoring_metric_versions (
    id VARCHAR(36) PRIMARY KEY,
    metric_id VARCHAR(36) NOT NULL REFERENCES scoring_metric_definitions(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    published_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    published_by_name VARCHAR(160) NOT NULL,
    published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_scoring_metric_versions_metric_version UNIQUE (metric_id, version)
);

CREATE TABLE IF NOT EXISTS scoring_jobs (
    id VARCHAR(36) PRIMARY KEY,
    job_type VARCHAR(40) NOT NULL DEFAULT 'manual',
    scope VARCHAR(40) NOT NULL DEFAULT 'account',
    account_id VARCHAR(36) REFERENCES accounts(id) ON DELETE CASCADE,
    engagement_id VARCHAR(36) REFERENCES engagements(id) ON DELETE SET NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'queued',
    trigger_source VARCHAR(120) NOT NULL DEFAULT 'manual',
    error_message TEXT,
    result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_by_name VARCHAR(160),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS manual_score_submissions (
    id VARCHAR(36) PRIMARY KEY,
    account_id VARCHAR(36) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    engagement_id VARCHAR(36) REFERENCES engagements(id) ON DELETE SET NULL,
    scope VARCHAR(40) NOT NULL DEFAULT 'account',
    calculator_id VARCHAR(80) NOT NULL,
    values_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    evidence_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    validation_status VARCHAR(40) NOT NULL DEFAULT 'validated',
    submitted_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    submitted_by_name VARCHAR(160) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS score_snapshots (
    id VARCHAR(36) PRIMARY KEY,
    account_id VARCHAR(36) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    engagement_id VARCHAR(36) REFERENCES engagements(id) ON DELETE SET NULL,
    job_id VARCHAR(36) REFERENCES scoring_jobs(id) ON DELETE SET NULL,
    scope VARCHAR(40) NOT NULL DEFAULT 'account',
    overall INTEGER NOT NULL,
    rag_status VARCHAR(40) NOT NULL,
    drivers JSONB NOT NULL DEFAULT '[]'::jsonb,
    reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
    metric_version VARCHAR(80) NOT NULL DEFAULT 'scoring-v1',
    freshness_status VARCHAR(40) NOT NULL DEFAULT 'fresh',
    is_dirty BOOLEAN NOT NULL DEFAULT false,
    trend INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(40) NOT NULL DEFAULT 'complete',
    source_context JSONB NOT NULL DEFAULT '{}'::jsonb,
    calculated_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    calculated_by_name VARCHAR(160),
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS metric_snapshots (
    id VARCHAR(36) PRIMARY KEY,
    score_snapshot_id VARCHAR(36) NOT NULL REFERENCES score_snapshots(id) ON DELETE CASCADE,
    metric_id VARCHAR(36) REFERENCES scoring_metric_definitions(id) ON DELETE SET NULL,
    metric_slug VARCHAR(120) NOT NULL,
    metric_name VARCHAR(180) NOT NULL,
    category VARCHAR(80) NOT NULL,
    criterion_key VARCHAR(120),
    raw_score DOUBLE PRECISION,
    raw_scale DOUBLE PRECISION,
    normalized_score INTEGER,
    weight DOUBLE PRECISION NOT NULL DEFAULT 0,
    weighted_score DOUBLE PRECISION NOT NULL DEFAULT 0,
    status VARCHAR(40) NOT NULL DEFAULT 'complete',
    freshness_status VARCHAR(40) NOT NULL DEFAULT 'fresh',
    evidence_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    source_context JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS signal_rules (
    id VARCHAR(36) PRIMARY KEY,
    slug VARCHAR(120) UNIQUE NOT NULL,
    name VARCHAR(180) NOT NULL,
    signal_type VARCHAR(80) NOT NULL,
    description TEXT,
    severity VARCHAR(40) NOT NULL DEFAULT 'warning',
    condition_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    owner_rule_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    sla_rule_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    current_version INTEGER NOT NULL DEFAULT 1,
    created_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    updated_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS signals (
    id VARCHAR(36) PRIMARY KEY,
    account_id VARCHAR(36) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    engagement_id VARCHAR(36) REFERENCES engagements(id) ON DELETE SET NULL,
    rule_id VARCHAR(36) REFERENCES signal_rules(id) ON DELETE SET NULL,
    signal_type VARCHAR(80) NOT NULL,
    severity VARCHAR(40) NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'new',
    owner_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    owner_name VARCHAR(160),
    title VARCHAR(220) NOT NULL,
    detail TEXT NOT NULL,
    reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
    evidence_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    citations_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    source_record_type VARCHAR(80),
    source_record_id VARCHAR(36),
    source_record_route VARCHAR(500),
    confidence INTEGER,
    condition_key VARCHAR(160),
    due_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    dismissed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_signals_rule_source_condition UNIQUE (account_id, engagement_id, rule_id, source_record_id, condition_key)
);

CREATE TABLE IF NOT EXISTS signal_events (
    id VARCHAR(36) PRIMARY KEY,
    signal_id VARCHAR(36) NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
    event_type VARCHAR(80) NOT NULL,
    previous_status VARCHAR(40),
    new_status VARCHAR(40),
    actor_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    actor_name VARCHAR(160),
    reason TEXT,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS playbook_templates (
    id VARCHAR(36) PRIMARY KEY,
    slug VARCHAR(120) UNIQUE NOT NULL,
    name VARCHAR(180) NOT NULL,
    objective TEXT NOT NULL,
    signal_types JSONB NOT NULL DEFAULT '[]'::jsonb,
    weak_metrics JSONB NOT NULL DEFAULT '[]'::jsonb,
    activities_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    default_owner_rule JSONB NOT NULL DEFAULT '{}'::jsonb,
    due_date_rule JSONB NOT NULL DEFAULT '{}'::jsonb,
    success_criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
    skip_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(40) NOT NULL DEFAULT 'draft',
    is_active BOOLEAN NOT NULL DEFAULT true,
    current_version INTEGER NOT NULL DEFAULT 0,
    created_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    updated_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS playbook_template_versions (
    id VARCHAR(36) PRIMARY KEY,
    template_id VARCHAR(36) NOT NULL REFERENCES playbook_templates(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    published_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    published_by_name VARCHAR(160) NOT NULL,
    published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_playbook_template_versions_template_version UNIQUE (template_id, version)
);

CREATE TABLE IF NOT EXISTS playbook_executions (
    id VARCHAR(36) PRIMARY KEY,
    template_id VARCHAR(36) NOT NULL REFERENCES playbook_templates(id) ON DELETE RESTRICT,
    template_version INTEGER NOT NULL DEFAULT 1,
    account_id VARCHAR(36) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    engagement_id VARCHAR(36) REFERENCES engagements(id) ON DELETE SET NULL,
    signal_id VARCHAR(36) REFERENCES signals(id) ON DELETE SET NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    executed_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    executed_by_name VARCHAR(160) NOT NULL,
    customization_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
    id VARCHAR(36) PRIMARY KEY,
    account_id VARCHAR(36) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    engagement_id VARCHAR(36) REFERENCES engagements(id) ON DELETE SET NULL,
    playbook_execution_id VARCHAR(36) REFERENCES playbook_executions(id) ON DELETE SET NULL,
    source_type VARCHAR(80) NOT NULL DEFAULT 'manual',
    source_record_id VARCHAR(36),
    source_record_route VARCHAR(500),
    title VARCHAR(220) NOT NULL,
    description TEXT,
    owner_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    owner_name VARCHAR(160),
    due_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'todo',
    priority VARCHAR(40) NOT NULL DEFAULT 'medium',
    notes TEXT,
    evidence_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    outcome TEXT,
    skip_reason TEXT,
    completed_at TIMESTAMPTZ,
    completed_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_by_name VARCHAR(160) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS task_evidence (
    id VARCHAR(36) PRIMARY KEY,
    task_id VARCHAR(36) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    evidence_type VARCHAR(80) NOT NULL DEFAULT 'note',
    note TEXT,
    url VARCHAR(1000),
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_by_name VARCHAR(160) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS task_history (
    id VARCHAR(36) PRIMARY KEY,
    task_id VARCHAR(36) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    event_type VARCHAR(80) NOT NULL,
    previous_status VARCHAR(40),
    new_status VARCHAR(40),
    actor_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    actor_name VARCHAR(160),
    note TEXT,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_scoring_metric_definitions_slug ON scoring_metric_definitions(slug);
CREATE INDEX IF NOT EXISTS ix_scoring_metric_definitions_status ON scoring_metric_definitions(status);
CREATE INDEX IF NOT EXISTS ix_scoring_metric_definitions_source ON scoring_metric_definitions(source);
CREATE INDEX IF NOT EXISTS ix_scoring_metric_definitions_owner_role ON scoring_metric_definitions(owner_role);
CREATE INDEX IF NOT EXISTS ix_scoring_metric_definitions_effective_date ON scoring_metric_definitions(effective_date);
CREATE INDEX IF NOT EXISTS ix_score_snapshots_account_scope ON score_snapshots(account_id, scope, calculated_at DESC);
CREATE INDEX IF NOT EXISTS ix_score_snapshots_dirty_freshness ON score_snapshots(is_dirty, freshness_status);
CREATE INDEX IF NOT EXISTS ix_metric_snapshots_snapshot_category ON metric_snapshots(score_snapshot_id, category);
CREATE INDEX IF NOT EXISTS ix_metric_snapshots_metric_slug ON metric_snapshots(metric_slug);
CREATE INDEX IF NOT EXISTS ix_scoring_jobs_status ON scoring_jobs(status);
CREATE INDEX IF NOT EXISTS ix_signal_rules_slug ON signal_rules(slug);
CREATE INDEX IF NOT EXISTS ix_signals_account_status ON signals(account_id, status);
CREATE INDEX IF NOT EXISTS ix_signals_owner_due ON signals(owner_id, due_at);
CREATE INDEX IF NOT EXISTS ix_playbook_templates_slug ON playbook_templates(slug);
CREATE INDEX IF NOT EXISTS ix_playbook_templates_status ON playbook_templates(status);
CREATE INDEX IF NOT EXISTS ix_tasks_account_status ON tasks(account_id, status);
CREATE INDEX IF NOT EXISTS ix_tasks_owner_due ON tasks(owner_id, due_at);
CREATE INDEX IF NOT EXISTS ix_tasks_due_at ON tasks(due_at);
