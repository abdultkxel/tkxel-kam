ALTER TABLE notification_trigger_configs ADD COLUMN workflow VARCHAR(80) NOT NULL DEFAULT 'general';
ALTER TABLE notification_trigger_configs ADD COLUMN priority VARCHAR(40) NOT NULL DEFAULT 'medium';
ALTER TABLE notification_trigger_configs ADD COLUMN recipient_policy VARCHAR(120) NOT NULL DEFAULT 'explicit';
ALTER TABLE notification_trigger_configs ADD COLUMN action_label VARCHAR(120);
ALTER TABLE notification_trigger_configs ADD COLUMN timing_mode VARCHAR(40) NOT NULL DEFAULT 'immediate';
ALTER TABLE notification_trigger_configs ADD COLUMN timing_unit VARCHAR(40) NOT NULL DEFAULT 'business_days';
ALTER TABLE notification_trigger_configs ADD COLUMN lead_time_value INTEGER;
ALTER TABLE notification_trigger_configs ADD COLUMN lead_time_direction VARCHAR(40);
ALTER TABLE notification_trigger_configs ADD COLUMN pending_threshold_value INTEGER;
ALTER TABLE notification_trigger_configs ADD COLUMN repeat_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE notification_trigger_configs ADD COLUMN repeat_every_value INTEGER;
ALTER TABLE notification_trigger_configs ADD COLUMN repeat_limit INTEGER;
ALTER TABLE notification_trigger_configs ADD COLUMN escalation_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE notification_trigger_configs ADD COLUMN escalation_after_value INTEGER;
ALTER TABLE notification_trigger_configs ADD COLUMN escalation_recipient_policy VARCHAR(120);
ALTER TABLE notification_trigger_configs ADD COLUMN quiet_hours_start VARCHAR(10);
ALTER TABLE notification_trigger_configs ADD COLUMN quiet_hours_end VARCHAR(10);
ALTER TABLE notification_trigger_configs ADD COLUMN template_json JSON NOT NULL DEFAULT '{}';

CREATE INDEX ix_notification_trigger_configs_workflow ON notification_trigger_configs (workflow);
CREATE INDEX ix_notification_trigger_configs_priority ON notification_trigger_configs (priority);

ALTER TABLE notification_records ADD COLUMN workflow VARCHAR(80);
ALTER TABLE notification_records ADD COLUMN action_label VARCHAR(120);
ALTER TABLE notification_records ADD COLUMN archived_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX ix_notification_records_workflow ON notification_records (workflow);
CREATE INDEX ix_notification_records_archived_at ON notification_records (archived_at);
