-- Allowed email domain settings.
-- Local databases are initialized through SQLAlchemy create_all; apply this PostgreSQL
-- script for persistent environments that do not recreate metadata.

CREATE TABLE IF NOT EXISTS platform_settings (
  id VARCHAR(36) PRIMARY KEY,
  key VARCHAR(120) NOT NULL UNIQUE,
  value_json JSON,
  updated_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_platform_settings_key ON platform_settings(key);

INSERT INTO platform_settings (id, key, value_json, created_at, updated_at)
SELECT '00000000-0000-4000-8000-000000000013', 'allowed_email_domains', '["tkxel.com", "tkxel.io", "camp1.tkxel.com"]'::json, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM platform_settings WHERE key = 'allowed_email_domains'
);
