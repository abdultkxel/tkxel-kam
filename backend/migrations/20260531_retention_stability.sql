-- Retention and Account Stability
-- PostgreSQL DDL companion for the SQLAlchemy models created at runtime by app.database.init_db().

CREATE TABLE IF NOT EXISTS account_retention_profiles (
    id VARCHAR(36) PRIMARY KEY,
    account_id VARCHAR(36) NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
    readiness_status VARCHAR(60) NOT NULL DEFAULT 'not_started',
    renewal_risk VARCHAR(40) NOT NULL DEFAULT 'warning',
    owner_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    owner_name VARCHAR(160),
    commercial_exposure NUMERIC(14, 2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    confidence INTEGER,
    source_kind VARCHAR(40) NOT NULL DEFAULT 'manual',
    source_title VARCHAR(220),
    source_citation TEXT,
    manual_override_reason TEXT,
    notes TEXT,
    created_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    updated_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_account_retention_profiles_account_id ON account_retention_profiles(account_id);
CREATE INDEX IF NOT EXISTS ix_account_retention_profiles_owner_id ON account_retention_profiles(owner_id);
CREATE INDEX IF NOT EXISTS ix_account_retention_profiles_readiness_status ON account_retention_profiles(readiness_status);
CREATE INDEX IF NOT EXISTS ix_account_retention_profiles_renewal_risk ON account_retention_profiles(renewal_risk);
CREATE INDEX IF NOT EXISTS ix_account_retention_profiles_source_kind ON account_retention_profiles(source_kind);
CREATE INDEX IF NOT EXISTS ix_account_retention_profiles_updated_at ON account_retention_profiles(updated_at);

CREATE TABLE IF NOT EXISTS engagement_renewals (
    id VARCHAR(36) PRIMARY KEY,
    account_id VARCHAR(36) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    engagement_id VARCHAR(36) NOT NULL UNIQUE REFERENCES engagements(id) ON DELETE CASCADE,
    owner_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    owner_name VARCHAR(160),
    readiness_status VARCHAR(60) NOT NULL DEFAULT 'not_started',
    renewal_risk VARCHAR(40) NOT NULL DEFAULT 'warning',
    sow_start_date TIMESTAMPTZ,
    sow_end_date TIMESTAMPTZ,
    renewal_date TIMESTAMPTZ,
    notice_deadline TIMESTAMPTZ,
    notice_period_days INTEGER,
    auto_renewal BOOLEAN NOT NULL DEFAULT FALSE,
    commercial_exposure NUMERIC(14, 2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    confidence INTEGER,
    source_kind VARCHAR(40) NOT NULL DEFAULT 'manual',
    source_title VARCHAR(220),
    source_document_id VARCHAR(36),
    source_citation TEXT,
    manual_override_reason TEXT,
    created_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    updated_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_engagement_renewals_account_id ON engagement_renewals(account_id);
CREATE INDEX IF NOT EXISTS ix_engagement_renewals_engagement_id ON engagement_renewals(engagement_id);
CREATE INDEX IF NOT EXISTS ix_engagement_renewals_owner_id ON engagement_renewals(owner_id);
CREATE INDEX IF NOT EXISTS ix_engagement_renewals_readiness_status ON engagement_renewals(readiness_status);
CREATE INDEX IF NOT EXISTS ix_engagement_renewals_renewal_risk ON engagement_renewals(renewal_risk);
CREATE INDEX IF NOT EXISTS ix_engagement_renewals_sow_end_date ON engagement_renewals(sow_end_date);
CREATE INDEX IF NOT EXISTS ix_engagement_renewals_renewal_date ON engagement_renewals(renewal_date);
CREATE INDEX IF NOT EXISTS ix_engagement_renewals_notice_deadline ON engagement_renewals(notice_deadline);
CREATE INDEX IF NOT EXISTS ix_engagement_renewals_auto_renewal ON engagement_renewals(auto_renewal);
CREATE INDEX IF NOT EXISTS ix_engagement_renewals_source_kind ON engagement_renewals(source_kind);
CREATE INDEX IF NOT EXISTS ix_engagement_renewals_updated_at ON engagement_renewals(updated_at);

CREATE TABLE IF NOT EXISTS retention_plans (
    id VARCHAR(36) PRIMARY KEY,
    account_id VARCHAR(36) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    engagement_id VARCHAR(36) REFERENCES engagements(id) ON DELETE SET NULL,
    title VARCHAR(220) NOT NULL,
    plan_type VARCHAR(60) NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'draft',
    risk_level VARCHAR(40) NOT NULL DEFAULT 'warning',
    owner_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    owner_name VARCHAR(160) NOT NULL,
    due_at TIMESTAMPTZ NOT NULL,
    renewal_milestone_at TIMESTAMPTZ,
    success_criteria JSONB NOT NULL DEFAULT '[]'::JSONB,
    recommendation_context JSONB,
    timeline_history JSONB NOT NULL DEFAULT '[]'::JSONB,
    created_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    updated_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_retention_plans_account_id ON retention_plans(account_id);
CREATE INDEX IF NOT EXISTS ix_retention_plans_engagement_id ON retention_plans(engagement_id);
CREATE INDEX IF NOT EXISTS ix_retention_plans_title ON retention_plans(title);
CREATE INDEX IF NOT EXISTS ix_retention_plans_plan_type ON retention_plans(plan_type);
CREATE INDEX IF NOT EXISTS ix_retention_plans_status ON retention_plans(status);
CREATE INDEX IF NOT EXISTS ix_retention_plans_risk_level ON retention_plans(risk_level);
CREATE INDEX IF NOT EXISTS ix_retention_plans_owner_id ON retention_plans(owner_id);
CREATE INDEX IF NOT EXISTS ix_retention_plans_due_at ON retention_plans(due_at);
CREATE INDEX IF NOT EXISTS ix_retention_plans_renewal_milestone_at ON retention_plans(renewal_milestone_at);
CREATE INDEX IF NOT EXISTS ix_retention_plans_updated_at ON retention_plans(updated_at);

CREATE TABLE IF NOT EXISTS retention_plan_milestones (
    id VARCHAR(36) PRIMARY KEY,
    plan_id VARCHAR(36) NOT NULL REFERENCES retention_plans(id) ON DELETE CASCADE,
    title VARCHAR(220) NOT NULL,
    milestone_type VARCHAR(60) NOT NULL DEFAULT 'renewal',
    due_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_retention_plan_milestones_plan_id ON retention_plan_milestones(plan_id);
CREATE INDEX IF NOT EXISTS ix_retention_plan_milestones_milestone_type ON retention_plan_milestones(milestone_type);
CREATE INDEX IF NOT EXISTS ix_retention_plan_milestones_due_at ON retention_plan_milestones(due_at);
CREATE INDEX IF NOT EXISTS ix_retention_plan_milestones_status ON retention_plan_milestones(status);

CREATE TABLE IF NOT EXISTS retention_plan_actions (
    id VARCHAR(36) PRIMARY KEY,
    plan_id VARCHAR(36) NOT NULL REFERENCES retention_plans(id) ON DELETE CASCADE,
    title VARCHAR(220) NOT NULL,
    owner_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    owner_name VARCHAR(160) NOT NULL,
    due_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'todo',
    success_criteria TEXT,
    source_recommendation_id VARCHAR(120),
    completed_at TIMESTAMPTZ,
    completed_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    updated_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_retention_plan_actions_plan_id ON retention_plan_actions(plan_id);
CREATE INDEX IF NOT EXISTS ix_retention_plan_actions_title ON retention_plan_actions(title);
CREATE INDEX IF NOT EXISTS ix_retention_plan_actions_owner_id ON retention_plan_actions(owner_id);
CREATE INDEX IF NOT EXISTS ix_retention_plan_actions_due_at ON retention_plan_actions(due_at);
CREATE INDEX IF NOT EXISTS ix_retention_plan_actions_status ON retention_plan_actions(status);
CREATE INDEX IF NOT EXISTS ix_retention_plan_actions_updated_at ON retention_plan_actions(updated_at);
