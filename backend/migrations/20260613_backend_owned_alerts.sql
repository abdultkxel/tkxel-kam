CREATE TABLE IF NOT EXISTS alert_rules (
    id VARCHAR(36) PRIMARY KEY,
    rule_key VARCHAR(120) NOT NULL UNIQUE,
    name VARCHAR(180) NOT NULL,
    description TEXT NOT NULL,
    alert_type VARCHAR(120) NOT NULL,
    source_type VARCHAR(120) NOT NULL,
    threshold_value DOUBLE PRECISION NOT NULL,
    threshold_unit VARCHAR(40) NOT NULL,
    severity VARCHAR(40) NOT NULL DEFAULT 'medium',
    snooze_days INTEGER NOT NULL DEFAULT 7,
    recipient_policy VARCHAR(80) NOT NULL DEFAULT 'source_owner_first',
    escalation_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    updated_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alerts (
    id VARCHAR(36) PRIMARY KEY,
    rule_id VARCHAR(36) REFERENCES alert_rules(id) ON DELETE SET NULL,
    rule_key VARCHAR(120) NOT NULL,
    alert_type VARCHAR(120) NOT NULL,
    title VARCHAR(260) NOT NULL,
    detail TEXT NOT NULL,
    severity VARCHAR(40) NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'open',
    owner_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    owner_name VARCHAR(160),
    owner_email VARCHAR(255),
    account_id VARCHAR(36) REFERENCES accounts(id) ON DELETE CASCADE,
    account_name VARCHAR(180),
    engagement_id VARCHAR(36) REFERENCES engagements(id) ON DELETE SET NULL,
    engagement_name VARCHAR(180),
    project_name VARCHAR(180),
    source_record_type VARCHAR(120) NOT NULL,
    source_record_id VARCHAR(120) NOT NULL,
    source_record_route VARCHAR(500),
    source_evidence_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    previous_value_json JSONB,
    new_value_json JSONB,
    recommended_action TEXT NOT NULL,
    deduplication_key VARCHAR(255) NOT NULL,
    first_triggered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_triggered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    snoozed_until TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_reason TEXT,
    created_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    updated_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alert_status_history (
    id VARCHAR(36) PRIMARY KEY,
    alert_id VARCHAR(36) NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    from_status VARCHAR(40),
    to_status VARCHAR(40) NOT NULL,
    reason TEXT,
    actor_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    actor_name VARCHAR(160),
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_alert_rules_rule_key ON alert_rules(rule_key);
CREATE INDEX IF NOT EXISTS ix_alert_rules_active ON alert_rules(is_active);
CREATE INDEX IF NOT EXISTS ix_alerts_rule_id ON alerts(rule_id);
CREATE INDEX IF NOT EXISTS ix_alerts_rule_key ON alerts(rule_key);
CREATE INDEX IF NOT EXISTS ix_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS ix_alerts_severity ON alerts(severity);
CREATE INDEX IF NOT EXISTS ix_alerts_account_id ON alerts(account_id);
CREATE INDEX IF NOT EXISTS ix_alerts_owner_id ON alerts(owner_id);
CREATE INDEX IF NOT EXISTS ix_alerts_source ON alerts(source_record_type, source_record_id);
CREATE INDEX IF NOT EXISTS ix_alerts_deduplication_key ON alerts(deduplication_key);
CREATE INDEX IF NOT EXISTS ix_alerts_snoozed_until ON alerts(snoozed_until);
CREATE INDEX IF NOT EXISTS ix_alert_status_history_alert_id ON alert_status_history(alert_id);

INSERT INTO alert_rules (
    id,
    rule_key,
    name,
    description,
    alert_type,
    source_type,
    threshold_value,
    threshold_unit,
    severity,
    snooze_days,
    recipient_policy,
    escalation_enabled,
    is_active,
    sort_order
) VALUES
    ('11111111-1111-4111-8111-111111111111', 'low_overall_health', 'Low overall health', 'Creates an alert when an account overall health score is below the configured floor.', 'health_risk', 'account', 60, 'score', 'high', 7, 'source_owner_first', TRUE, TRUE, 10),
    ('22222222-2222-4222-8222-222222222222', 'overall_score_drop', 'Overall score drop', 'Creates an alert when the latest account score dropped by the configured number of points.', 'score_drop', 'score_snapshot', 10, 'points', 'high', 7, 'source_owner_first', TRUE, TRUE, 20),
    ('33333333-3333-4333-8333-333333333333', 'engagement_renewal_window', 'Engagement/SOW renewal or notice/end window', 'Creates an alert when an active engagement renewal, notice, or end date is inside the configured day window.', 'engagement_renewal_window', 'engagement', 60, 'days', 'medium', 14, 'source_owner_first', FALSE, TRUE, 30),
    ('44444444-4444-4444-8444-444444444444', 'opportunity_stalled', 'Opportunity stalled', 'Creates an alert when an open opportunity has not moved stages within the configured day window.', 'opportunity_stalled', 'opportunity', 90, 'days', 'medium', 7, 'source_owner_first', FALSE, TRUE, 40),
    ('55555555-5555-4555-8555-555555555555', 'task_overdue', 'Task overdue', 'Creates an alert when a task due date has elapsed and the task is not complete or cancelled.', 'task_overdue', 'task', 0, 'days', 'medium', 3, 'source_owner_first', FALSE, TRUE, 50),
    ('66666666-6666-4666-8666-666666666666', 'governance_event_overdue', 'Governance event overdue', 'Creates an alert when a governance event is overdue by the configured number of days.', 'governance_event_overdue', 'governance_event', 1, 'days', 'high', 3, 'source_owner_first', TRUE, TRUE, 60),
    ('77777777-7777-4777-8777-777777777777', 'governance_action_overdue', 'Governance action overdue', 'Creates an alert when a governance action due date is overdue by the configured number of days.', 'governance_action_overdue', 'governance_action_item', 1, 'days', 'high', 3, 'source_owner_first', TRUE, TRUE, 70)
ON CONFLICT (rule_key) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    alert_type = EXCLUDED.alert_type,
    source_type = EXCLUDED.source_type,
    threshold_unit = EXCLUDED.threshold_unit,
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();
