ALTER TABLE opportunity_stage_definitions
    ADD COLUMN IF NOT EXISTS requires_outcome_reason BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS stakeholder_roles (
    id VARCHAR(36) PRIMARY KEY,
    slug VARCHAR(120) NOT NULL,
    name VARCHAR(160) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    updated_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_stakeholder_roles_slug UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS ix_stakeholder_roles_slug ON stakeholder_roles(slug);
CREATE INDEX IF NOT EXISTS ix_stakeholder_roles_name ON stakeholder_roles(name);
CREATE INDEX IF NOT EXISTS ix_stakeholder_roles_is_active ON stakeholder_roles(is_active);

CREATE TABLE IF NOT EXISTS stakeholder_gap_rules (
    id VARCHAR(36) PRIMARY KEY,
    rule_key VARCHAR(120) NOT NULL,
    title VARCHAR(220) NOT NULL,
    description TEXT NOT NULL,
    severity VARCHAR(40) NOT NULL DEFAULT 'medium',
    condition_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    updated_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_stakeholder_gap_rules_key UNIQUE (rule_key)
);

CREATE INDEX IF NOT EXISTS ix_stakeholder_gap_rules_rule_key ON stakeholder_gap_rules(rule_key);
CREATE INDEX IF NOT EXISTS ix_stakeholder_gap_rules_severity ON stakeholder_gap_rules(severity);
CREATE INDEX IF NOT EXISTS ix_stakeholder_gap_rules_is_active ON stakeholder_gap_rules(is_active);

CREATE TABLE IF NOT EXISTS opportunity_stage_transitions (
    id VARCHAR(36) PRIMARY KEY,
    from_stage VARCHAR(120) NOT NULL,
    to_stage VARCHAR(120) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    requires_reason BOOLEAN NOT NULL DEFAULT FALSE,
    created_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    updated_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_opportunity_stage_transitions_from_to UNIQUE (from_stage, to_stage)
);

CREATE INDEX IF NOT EXISTS ix_opportunity_stage_transitions_from_stage ON opportunity_stage_transitions(from_stage);
CREATE INDEX IF NOT EXISTS ix_opportunity_stage_transitions_to_stage ON opportunity_stage_transitions(to_stage);
CREATE INDEX IF NOT EXISTS ix_opportunity_stage_transitions_is_active ON opportunity_stage_transitions(is_active);

CREATE TABLE IF NOT EXISTS account_plans (
    id VARCHAR(36) PRIMARY KEY,
    account_id VARCHAR(36) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    retention_focus TEXT,
    growth_focus TEXT,
    risks JSONB NOT NULL DEFAULT '[]'::jsonb,
    opportunities TEXT,
    commitments JSONB NOT NULL DEFAULT '[]'::jsonb,
    service_gaps JSONB NOT NULL DEFAULT '[]'::jsonb,
    review_cadence VARCHAR(80),
    next_review_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(40) NOT NULL DEFAULT 'draft',
    created_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_by_name VARCHAR(160) NOT NULL DEFAULT 'System',
    updated_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    updated_by_name VARCHAR(160),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_account_plans_account UNIQUE (account_id)
);

CREATE INDEX IF NOT EXISTS ix_account_plans_account_id ON account_plans(account_id);
CREATE INDEX IF NOT EXISTS ix_account_plans_status ON account_plans(status);

CREATE TABLE IF NOT EXISTS account_plan_versions (
    id VARCHAR(36) PRIMARY KEY,
    account_plan_id VARCHAR(36) NOT NULL REFERENCES account_plans(id) ON DELETE CASCADE,
    account_id VARCHAR(36) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    change_summary TEXT,
    actor_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    actor_name VARCHAR(160) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_account_plan_versions_plan_version UNIQUE (account_plan_id, version)
);

CREATE INDEX IF NOT EXISTS ix_account_plan_versions_account_plan_id ON account_plan_versions(account_plan_id);
CREATE INDEX IF NOT EXISTS ix_account_plan_versions_account_id ON account_plan_versions(account_id);

CREATE TABLE IF NOT EXISTS account_plan_actions (
    id VARCHAR(36) PRIMARY KEY,
    account_plan_id VARCHAR(36) NOT NULL REFERENCES account_plans(id) ON DELETE CASCADE,
    account_id VARCHAR(36) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    title VARCHAR(220) NOT NULL,
    owner_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    owner_name VARCHAR(160) NOT NULL,
    owner_email VARCHAR(255),
    due_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'open',
    priority VARCHAR(40) NOT NULL DEFAULT 'medium',
    success_criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
    completed_at TIMESTAMP WITH TIME ZONE,
    completed_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_by_name VARCHAR(160) NOT NULL DEFAULT 'System',
    updated_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_account_plan_actions_account_plan_id ON account_plan_actions(account_plan_id);
CREATE INDEX IF NOT EXISTS ix_account_plan_actions_account_id ON account_plan_actions(account_id);
CREATE INDEX IF NOT EXISTS ix_account_plan_actions_owner_id ON account_plan_actions(owner_id);
CREATE INDEX IF NOT EXISTS ix_account_plan_actions_due_at ON account_plan_actions(due_at);
CREATE INDEX IF NOT EXISTS ix_account_plan_actions_status ON account_plan_actions(status);

CREATE TABLE IF NOT EXISTS service_catalog_items (
    id VARCHAR(36) PRIMARY KEY,
    slug VARCHAR(120) NOT NULL,
    name VARCHAR(180) NOT NULL,
    category VARCHAR(120),
    description TEXT,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    updated_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_service_catalog_items_slug UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS ix_service_catalog_items_slug ON service_catalog_items(slug);
CREATE INDEX IF NOT EXISTS ix_service_catalog_items_name ON service_catalog_items(name);
CREATE INDEX IF NOT EXISTS ix_service_catalog_items_category ON service_catalog_items(category);
CREATE INDEX IF NOT EXISTS ix_service_catalog_items_is_active ON service_catalog_items(is_active);

CREATE TABLE IF NOT EXISTS service_adjacency_rules (
    id VARCHAR(36) PRIMARY KEY,
    source_service_id VARCHAR(36) NOT NULL REFERENCES service_catalog_items(id) ON DELETE CASCADE,
    target_service_id VARCHAR(36) NOT NULL REFERENCES service_catalog_items(id) ON DELETE CASCADE,
    relevance_score INTEGER NOT NULL DEFAULT 70,
    rationale TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    updated_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_service_adjacency_rules_source_target UNIQUE (source_service_id, target_service_id)
);

CREATE INDEX IF NOT EXISTS ix_service_adjacency_rules_source_service_id ON service_adjacency_rules(source_service_id);
CREATE INDEX IF NOT EXISTS ix_service_adjacency_rules_target_service_id ON service_adjacency_rules(target_service_id);
CREATE INDEX IF NOT EXISTS ix_service_adjacency_rules_is_active ON service_adjacency_rules(is_active);

CREATE TABLE IF NOT EXISTS account_whitespace_items (
    id VARCHAR(36) PRIMARY KEY,
    account_id VARCHAR(36) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    engagement_id VARCHAR(36) REFERENCES engagements(id) ON DELETE CASCADE,
    service_id VARCHAR(36) NOT NULL REFERENCES service_catalog_items(id) ON DELETE RESTRICT,
    service_name_snapshot VARCHAR(180) NOT NULL,
    coverage_status VARCHAR(40) NOT NULL DEFAULT 'unknown',
    notes TEXT,
    source VARCHAR(80) NOT NULL DEFAULT 'manual',
    created_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    updated_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_account_whitespace_items_scope_service UNIQUE (account_id, engagement_id, service_id)
);

CREATE INDEX IF NOT EXISTS ix_account_whitespace_items_account_id ON account_whitespace_items(account_id);
CREATE INDEX IF NOT EXISTS ix_account_whitespace_items_engagement_id ON account_whitespace_items(engagement_id);
CREATE INDEX IF NOT EXISTS ix_account_whitespace_items_service_id ON account_whitespace_items(service_id);
CREATE INDEX IF NOT EXISTS ix_account_whitespace_items_coverage_status ON account_whitespace_items(coverage_status);

CREATE TABLE IF NOT EXISTS service_recommendations (
    id VARCHAR(36) PRIMARY KEY,
    account_id VARCHAR(36) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    source_service_id VARCHAR(36) REFERENCES service_catalog_items(id) ON DELETE SET NULL,
    target_service_id VARCHAR(36) NOT NULL REFERENCES service_catalog_items(id) ON DELETE CASCADE,
    relevance_score INTEGER NOT NULL DEFAULT 70,
    rationale TEXT NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'recommended',
    source_context VARCHAR(120) NOT NULL DEFAULT 'adjacency',
    created_opportunity_id VARCHAR(36) REFERENCES opportunities(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_service_recommendations_account_target_source UNIQUE (account_id, target_service_id, source_service_id)
);

CREATE INDEX IF NOT EXISTS ix_service_recommendations_account_id ON service_recommendations(account_id);
CREATE INDEX IF NOT EXISTS ix_service_recommendations_source_service_id ON service_recommendations(source_service_id);
CREATE INDEX IF NOT EXISTS ix_service_recommendations_target_service_id ON service_recommendations(target_service_id);
CREATE INDEX IF NOT EXISTS ix_service_recommendations_status ON service_recommendations(status);

CREATE TABLE IF NOT EXISTS engagement_renewal_profiles (
    id VARCHAR(36) PRIMARY KEY,
    account_id VARCHAR(36) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    engagement_id VARCHAR(36) NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
    renewal_readiness VARCHAR(40) NOT NULL DEFAULT 'unknown',
    renewal_risk VARCHAR(40) NOT NULL DEFAULT 'unknown',
    confidence INTEGER NOT NULL DEFAULT 75,
    commercial_exposure NUMERIC(14, 2) NOT NULL DEFAULT 0,
    commercial_exposure_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    owner_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    owner_name VARCHAR(160),
    source_type VARCHAR(80) NOT NULL DEFAULT 'manual',
    source_citation TEXT,
    manual_override_reason TEXT,
    created_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    updated_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_engagement_renewal_profiles_engagement UNIQUE (engagement_id)
);

CREATE INDEX IF NOT EXISTS ix_engagement_renewal_profiles_account_id ON engagement_renewal_profiles(account_id);
CREATE INDEX IF NOT EXISTS ix_engagement_renewal_profiles_engagement_id ON engagement_renewal_profiles(engagement_id);
CREATE INDEX IF NOT EXISTS ix_engagement_renewal_profiles_renewal_readiness ON engagement_renewal_profiles(renewal_readiness);
CREATE INDEX IF NOT EXISTS ix_engagement_renewal_profiles_renewal_risk ON engagement_renewal_profiles(renewal_risk);
CREATE INDEX IF NOT EXISTS ix_engagement_renewal_profiles_owner_id ON engagement_renewal_profiles(owner_id);
CREATE INDEX IF NOT EXISTS ix_engagement_renewal_profiles_source_type ON engagement_renewal_profiles(source_type);

CREATE TABLE IF NOT EXISTS retention_plans (
    id VARCHAR(36) PRIMARY KEY,
    account_id VARCHAR(36) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    engagement_id VARCHAR(36) REFERENCES engagements(id) ON DELETE SET NULL,
    plan_type VARCHAR(80) NOT NULL DEFAULT 'retention',
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    title VARCHAR(220) NOT NULL,
    summary TEXT,
    owner_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    owner_name VARCHAR(160) NOT NULL,
    owner_email VARCHAR(255),
    renewal_milestone_at TIMESTAMP WITH TIME ZONE,
    success_criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
    source_context VARCHAR(160),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_by_name VARCHAR(160) NOT NULL DEFAULT 'System',
    updated_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    updated_by_name VARCHAR(160),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_retention_plans_account_id ON retention_plans(account_id);
CREATE INDEX IF NOT EXISTS ix_retention_plans_engagement_id ON retention_plans(engagement_id);
CREATE INDEX IF NOT EXISTS ix_retention_plans_plan_type ON retention_plans(plan_type);
CREATE INDEX IF NOT EXISTS ix_retention_plans_status ON retention_plans(status);
CREATE INDEX IF NOT EXISTS ix_retention_plans_owner_id ON retention_plans(owner_id);
CREATE INDEX IF NOT EXISTS ix_retention_plans_renewal_milestone_at ON retention_plans(renewal_milestone_at);

CREATE TABLE IF NOT EXISTS retention_plan_milestones (
    id VARCHAR(36) PRIMARY KEY,
    retention_plan_id VARCHAR(36) NOT NULL REFERENCES retention_plans(id) ON DELETE CASCADE,
    title VARCHAR(220) NOT NULL,
    due_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'open',
    enforce_action_due_dates BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_retention_plan_milestones_retention_plan_id ON retention_plan_milestones(retention_plan_id);
CREATE INDEX IF NOT EXISTS ix_retention_plan_milestones_due_at ON retention_plan_milestones(due_at);
CREATE INDEX IF NOT EXISTS ix_retention_plan_milestones_status ON retention_plan_milestones(status);

CREATE TABLE IF NOT EXISTS retention_plan_actions (
    id VARCHAR(36) PRIMARY KEY,
    retention_plan_id VARCHAR(36) NOT NULL REFERENCES retention_plans(id) ON DELETE CASCADE,
    milestone_id VARCHAR(36) REFERENCES retention_plan_milestones(id) ON DELETE SET NULL,
    account_id VARCHAR(36) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    engagement_id VARCHAR(36) REFERENCES engagements(id) ON DELETE SET NULL,
    title VARCHAR(220) NOT NULL,
    owner_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    owner_name VARCHAR(160) NOT NULL,
    owner_email VARCHAR(255),
    due_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'open',
    priority VARCHAR(40) NOT NULL DEFAULT 'medium',
    success_criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
    future_task_id VARCHAR(36) REFERENCES tasks(id) ON DELETE SET NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    completed_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_by_name VARCHAR(160) NOT NULL DEFAULT 'System',
    updated_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_retention_plan_actions_retention_plan_id ON retention_plan_actions(retention_plan_id);
CREATE INDEX IF NOT EXISTS ix_retention_plan_actions_milestone_id ON retention_plan_actions(milestone_id);
CREATE INDEX IF NOT EXISTS ix_retention_plan_actions_account_id ON retention_plan_actions(account_id);
CREATE INDEX IF NOT EXISTS ix_retention_plan_actions_engagement_id ON retention_plan_actions(engagement_id);
CREATE INDEX IF NOT EXISTS ix_retention_plan_actions_owner_id ON retention_plan_actions(owner_id);
CREATE INDEX IF NOT EXISTS ix_retention_plan_actions_due_at ON retention_plan_actions(due_at);
CREATE INDEX IF NOT EXISTS ix_retention_plan_actions_status ON retention_plan_actions(status);

CREATE TABLE IF NOT EXISTS retention_recommendations (
    id VARCHAR(36) PRIMARY KEY,
    account_id VARCHAR(36) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    engagement_id VARCHAR(36) REFERENCES engagements(id) ON DELETE SET NULL,
    title VARCHAR(220) NOT NULL,
    rationale TEXT NOT NULL,
    severity VARCHAR(40) NOT NULL DEFAULT 'medium',
    recommended_action TEXT NOT NULL,
    source_context VARCHAR(160) NOT NULL DEFAULT 'deterministic',
    status VARCHAR(40) NOT NULL DEFAULT 'recommended',
    created_task_id VARCHAR(36) REFERENCES tasks(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_retention_recommendations_account_id ON retention_recommendations(account_id);
CREATE INDEX IF NOT EXISTS ix_retention_recommendations_engagement_id ON retention_recommendations(engagement_id);
CREATE INDEX IF NOT EXISTS ix_retention_recommendations_severity ON retention_recommendations(severity);
CREATE INDEX IF NOT EXISTS ix_retention_recommendations_status ON retention_recommendations(status);
