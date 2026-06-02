-- Reconcile older playbook template DDL with the current SQLAlchemy model.
-- Older branches created playbook_templates before slug/status/current_version/activity JSON existed.

ALTER TABLE playbook_templates
    ADD COLUMN IF NOT EXISTS slug VARCHAR(120),
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS activities_json JSONB,
    ADD COLUMN IF NOT EXISTS status VARCHAR(40),
    ADD COLUMN IF NOT EXISTS current_version INTEGER,
    ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

UPDATE playbook_templates
SET slug = lower(regexp_replace(coalesce(nullif(name, ''), 'playbook-template'), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || left(id, 8)
WHERE slug IS NULL OR slug = '';

UPDATE playbook_templates
SET activities_json = '[]'::jsonb
WHERE activities_json IS NULL;

UPDATE playbook_templates
SET status = CASE WHEN is_active THEN 'active' ELSE 'inactive' END
WHERE status IS NULL OR status = '';

UPDATE playbook_templates
SET version = 1
WHERE version IS NULL OR version = 0;

UPDATE playbook_templates
SET current_version = version
WHERE current_version IS NULL OR current_version = 0;

ALTER TABLE playbook_templates
    ALTER COLUMN slug SET NOT NULL,
    ALTER COLUMN activities_json SET DEFAULT '[]'::jsonb,
    ALTER COLUMN activities_json SET NOT NULL,
    ALTER COLUMN status SET DEFAULT 'active',
    ALTER COLUMN status SET NOT NULL,
    ALTER COLUMN current_version SET DEFAULT 1,
    ALTER COLUMN current_version SET NOT NULL,
    ALTER COLUMN version SET DEFAULT 1,
    ALTER COLUMN version SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_playbook_templates_slug ON playbook_templates(slug);
CREATE INDEX IF NOT EXISTS ix_playbook_templates_slug ON playbook_templates(slug);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'playbook_templates'
          AND column_name = 'default_owner_rule'
          AND data_type IN ('json', 'jsonb')
    ) THEN
        ALTER TABLE playbook_templates
            ALTER COLUMN default_owner_rule DROP DEFAULT,
            ALTER COLUMN default_owner_rule TYPE VARCHAR(80)
            USING CASE
                WHEN default_owner_rule IS NULL THEN 'account_primary_am'
                WHEN jsonb_typeof(default_owner_rule::jsonb) = 'string' THEN trim(both '"' from default_owner_rule::text)
                WHEN default_owner_rule::jsonb ? 'default' THEN
                    CASE
                        WHEN default_owner_rule::jsonb ->> 'default' = 'primary_am' THEN 'account_primary_am'
                        ELSE default_owner_rule::jsonb ->> 'default'
                    END
                ELSE 'account_primary_am'
            END,
            ALTER COLUMN default_owner_rule SET DEFAULT 'account_primary_am';
    END IF;
END $$;
