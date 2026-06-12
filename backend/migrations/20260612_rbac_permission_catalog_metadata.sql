ALTER TABLE permissions ADD COLUMN IF NOT EXISTS section_name VARCHAR(160);
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS section_purpose TEXT;
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS action_label VARCHAR(160);
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS risk_level VARCHAR(40) DEFAULT 'medium';
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS dependencies_json JSONB DEFAULT '[]'::jsonb;
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS tags_json JSONB DEFAULT '[]'::jsonb;
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS is_deprecated BOOLEAN DEFAULT false;

UPDATE permissions SET risk_level = 'medium' WHERE risk_level IS NULL OR risk_level = '';
UPDATE permissions SET dependencies_json = '[]'::jsonb WHERE dependencies_json IS NULL;
UPDATE permissions SET tags_json = '[]'::jsonb WHERE tags_json IS NULL;
UPDATE permissions SET display_order = 0 WHERE display_order IS NULL;
UPDATE permissions SET is_deprecated = false WHERE is_deprecated IS NULL;

ALTER TABLE permissions ALTER COLUMN risk_level SET NOT NULL;
ALTER TABLE permissions ALTER COLUMN dependencies_json SET NOT NULL;
ALTER TABLE permissions ALTER COLUMN tags_json SET NOT NULL;
ALTER TABLE permissions ALTER COLUMN display_order SET NOT NULL;
ALTER TABLE permissions ALTER COLUMN is_deprecated SET NOT NULL;
