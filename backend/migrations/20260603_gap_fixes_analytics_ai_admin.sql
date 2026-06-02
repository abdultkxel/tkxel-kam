CREATE TABLE IF NOT EXISTS field_permissions (
    id VARCHAR(36) PRIMARY KEY,
    module VARCHAR(120) NOT NULL,
    field_key VARCHAR(120) NOT NULL,
    role VARCHAR(80) NOT NULL,
    can_view BOOLEAN NOT NULL DEFAULT TRUE,
    can_edit BOOLEAN NOT NULL DEFAULT FALSE,
    redaction_strategy VARCHAR(40) NOT NULL DEFAULT 'mask',
    condition_json JSON NOT NULL DEFAULT '{}',
    created_by_id VARCHAR(36) NULL REFERENCES users(id) ON DELETE SET NULL,
    updated_by_id VARCHAR(36) NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT uq_field_permissions_module_field_role UNIQUE (module, field_key, role)
);

CREATE TABLE IF NOT EXISTS configuration_changes (
    id VARCHAR(36) PRIMARY KEY,
    module VARCHAR(120) NOT NULL,
    change_type VARCHAR(80) NOT NULL,
    entity_type VARCHAR(120) NOT NULL,
    entity_id VARCHAR(36) NULL,
    title VARCHAR(220) NOT NULL,
    description TEXT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'draft',
    payload_json JSON NOT NULL DEFAULT '{}',
    validation_json JSON NOT NULL DEFAULT '{}',
    created_by_id VARCHAR(36) NULL REFERENCES users(id) ON DELETE SET NULL,
    created_by_name VARCHAR(160) NOT NULL,
    published_by_id VARCHAR(36) NULL REFERENCES users(id) ON DELETE SET NULL,
    published_by_name VARCHAR(160) NULL,
    rolled_back_by_id VARCHAR(36) NULL REFERENCES users(id) ON DELETE SET NULL,
    rolled_back_by_name VARCHAR(160) NULL,
    published_at TIMESTAMP WITH TIME ZONE NULL,
    rolled_back_at TIMESTAMP WITH TIME ZONE NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS account_change_alerts (
    id VARCHAR(36) PRIMARY KEY,
    account_id VARCHAR(36) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    alert_type VARCHAR(80) NOT NULL,
    reason_code VARCHAR(120) NOT NULL,
    affected_metric VARCHAR(120) NOT NULL,
    previous_value_json JSON NULL,
    new_value_json JSON NULL,
    change_magnitude DOUBLE PRECISION NULL,
    severity VARCHAR(40) NOT NULL DEFAULT 'medium',
    status VARCHAR(40) NOT NULL DEFAULT 'open',
    owner_id VARCHAR(36) NULL REFERENCES users(id) ON DELETE SET NULL,
    owner_name VARCHAR(160) NULL,
    recommended_action TEXT NOT NULL,
    source_evidence_json JSON NOT NULL DEFAULT '[]',
    deduplication_key VARCHAR(255) NOT NULL,
    created_by_id VARCHAR(36) NULL REFERENCES users(id) ON DELETE SET NULL,
    updated_by_id VARCHAR(36) NULL REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMP WITH TIME ZONE NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT uq_account_change_alerts_deduplication_key UNIQUE (deduplication_key)
);

ALTER TABLE ai_gateway_runs ADD COLUMN IF NOT EXISTS prompt_json JSON NOT NULL DEFAULT '{}';
ALTER TABLE ai_gateway_runs ADD COLUMN IF NOT EXISTS response_json JSON NOT NULL DEFAULT '{}';
ALTER TABLE ai_gateway_runs ADD COLUMN IF NOT EXISTS feedback_json JSON NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS ix_field_permissions_module ON field_permissions(module);
CREATE INDEX IF NOT EXISTS ix_field_permissions_field_key ON field_permissions(field_key);
CREATE INDEX IF NOT EXISTS ix_field_permissions_role ON field_permissions(role);
CREATE INDEX IF NOT EXISTS ix_configuration_changes_module ON configuration_changes(module);
CREATE INDEX IF NOT EXISTS ix_configuration_changes_status ON configuration_changes(status);
CREATE INDEX IF NOT EXISTS ix_configuration_changes_created_at ON configuration_changes(created_at);
CREATE INDEX IF NOT EXISTS ix_account_change_alerts_account_id ON account_change_alerts(account_id);
CREATE INDEX IF NOT EXISTS ix_account_change_alerts_status ON account_change_alerts(status);
CREATE INDEX IF NOT EXISTS ix_account_change_alerts_severity ON account_change_alerts(severity);
CREATE INDEX IF NOT EXISTS ix_account_change_alerts_created_at ON account_change_alerts(created_at);
