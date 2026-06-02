ALTER TABLE service_recommendations
    ADD COLUMN IF NOT EXISTS engagement_id VARCHAR(36) REFERENCES engagements(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS ix_service_recommendations_engagement_id ON service_recommendations(engagement_id);

