CREATE TABLE IF NOT EXISTS service_growth_bundles (
    id VARCHAR(36) PRIMARY KEY,
    slug VARCHAR(120) NOT NULL,
    name VARCHAR(180) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    updated_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_service_growth_bundles_slug UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS ix_service_growth_bundles_slug ON service_growth_bundles(slug);
CREATE INDEX IF NOT EXISTS ix_service_growth_bundles_name ON service_growth_bundles(name);
CREATE INDEX IF NOT EXISTS ix_service_growth_bundles_is_active ON service_growth_bundles(is_active);

CREATE TABLE IF NOT EXISTS service_growth_bundle_items (
    id VARCHAR(36) PRIMARY KEY,
    bundle_id VARCHAR(36) NOT NULL REFERENCES service_growth_bundles(id) ON DELETE CASCADE,
    service_id VARCHAR(36) NOT NULL REFERENCES service_catalog_items(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_service_growth_bundle_items_bundle_service UNIQUE (bundle_id, service_id)
);

CREATE INDEX IF NOT EXISTS ix_service_growth_bundle_items_bundle_id ON service_growth_bundle_items(bundle_id);
CREATE INDEX IF NOT EXISTS ix_service_growth_bundle_items_service_id ON service_growth_bundle_items(service_id);

CREATE TABLE IF NOT EXISTS service_growth_rules (
    id VARCHAR(36) PRIMARY KEY,
    source_selector_type VARCHAR(40) NOT NULL,
    source_selector_value VARCHAR(180) NOT NULL,
    target_selector_type VARCHAR(40) NOT NULL,
    target_selector_value VARCHAR(180) NOT NULL,
    base_fit_score INTEGER NOT NULL DEFAULT 70,
    priority INTEGER NOT NULL DEFAULT 0,
    rationale_template TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    updated_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_service_growth_rules_selectors UNIQUE (source_selector_type, source_selector_value, target_selector_type, target_selector_value)
);

CREATE INDEX IF NOT EXISTS ix_service_growth_rules_source_selector_type ON service_growth_rules(source_selector_type);
CREATE INDEX IF NOT EXISTS ix_service_growth_rules_source_selector_value ON service_growth_rules(source_selector_value);
CREATE INDEX IF NOT EXISTS ix_service_growth_rules_target_selector_type ON service_growth_rules(target_selector_type);
CREATE INDEX IF NOT EXISTS ix_service_growth_rules_target_selector_value ON service_growth_rules(target_selector_value);
CREATE INDEX IF NOT EXISTS ix_service_growth_rules_is_active ON service_growth_rules(is_active);

ALTER TABLE service_recommendations ADD COLUMN IF NOT EXISTS growth_rule_id VARCHAR(36) REFERENCES service_growth_rules(id) ON DELETE SET NULL;
ALTER TABLE service_recommendations ADD COLUMN IF NOT EXISTS base_fit_score INTEGER NOT NULL DEFAULT 70;
ALTER TABLE service_recommendations ADD COLUMN IF NOT EXISTS score_factors JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS ix_service_recommendations_growth_rule_id ON service_recommendations(growth_rule_id);
