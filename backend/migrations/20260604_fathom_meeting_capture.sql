-- User-owned Fathom meeting capture schema.
-- Local development initializes through SQLAlchemy create_all; apply this script
-- for persistent PostgreSQL environments that do not recreate metadata.

CREATE TABLE IF NOT EXISTS user_integration_connections (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(80) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(40) NOT NULL DEFAULT 'configuration_required',
  auth_type VARCHAR(60) NOT NULL DEFAULT 'api_key',
  credentials_json JSON,
  settings_json JSON NOT NULL DEFAULT '{}',
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_integration_connections_user_provider UNIQUE (user_id, provider)
);

CREATE TABLE IF NOT EXISTS meeting_artifacts (
  id VARCHAR(36) PRIMARY KEY,
  owner_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(80) NOT NULL DEFAULT 'fathom',
  external_id VARCHAR(255),
  title VARCHAR(255) NOT NULL,
  summary TEXT,
  action_items JSON NOT NULL DEFAULT '[]',
  meeting_url VARCHAR(1000),
  source_link VARCHAR(1000),
  occurred_at TIMESTAMPTZ,
  scheduled_at TIMESTAMPTZ,
  account_id VARCHAR(36) REFERENCES accounts(id) ON DELETE SET NULL,
  engagement_id VARCHAR(36) REFERENCES engagements(id) ON DELETE SET NULL,
  linked_object_type VARCHAR(80),
  linked_object_id VARCHAR(36),
  status VARCHAR(40) NOT NULL DEFAULT 'draft',
  metadata_json JSON NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_meeting_artifacts_owner_provider_external UNIQUE (owner_id, provider, external_id)
);

CREATE INDEX IF NOT EXISTS ix_user_integration_connections_user_id ON user_integration_connections(user_id);
CREATE INDEX IF NOT EXISTS ix_user_integration_connections_provider ON user_integration_connections(provider);
CREATE INDEX IF NOT EXISTS ix_user_integration_connections_status ON user_integration_connections(status);
CREATE INDEX IF NOT EXISTS ix_meeting_artifacts_owner_id ON meeting_artifacts(owner_id);
CREATE INDEX IF NOT EXISTS ix_meeting_artifacts_provider ON meeting_artifacts(provider);
CREATE INDEX IF NOT EXISTS ix_meeting_artifacts_external_id ON meeting_artifacts(external_id);
CREATE INDEX IF NOT EXISTS ix_meeting_artifacts_occurred_at ON meeting_artifacts(occurred_at);
CREATE INDEX IF NOT EXISTS ix_meeting_artifacts_scheduled_at ON meeting_artifacts(scheduled_at);
CREATE INDEX IF NOT EXISTS ix_meeting_artifacts_account_id ON meeting_artifacts(account_id);
CREATE INDEX IF NOT EXISTS ix_meeting_artifacts_engagement_id ON meeting_artifacts(engagement_id);
CREATE INDEX IF NOT EXISTS ix_meeting_artifacts_linked_object_type ON meeting_artifacts(linked_object_type);
CREATE INDEX IF NOT EXISTS ix_meeting_artifacts_linked_object_id ON meeting_artifacts(linked_object_id);
CREATE INDEX IF NOT EXISTS ix_meeting_artifacts_status ON meeting_artifacts(status);
