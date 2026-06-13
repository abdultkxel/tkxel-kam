INSERT INTO timeline_event_types (
    id,
    slug,
    name,
    category,
    module,
    color_token,
    display_order,
    default_visibility,
    is_active,
    is_critical,
    critical_rule_json
) VALUES
    ('10101010-1010-4010-8010-101010101010', 'manual_note', 'Manual note', 'manual', 'manual', 'surface-border', 10, 'public', TRUE, FALSE, '{}'::jsonb),
    ('20202020-2020-4020-8020-202020202020', 'governance_event', 'Governance update', 'governance', 'governance', 'brand-blue-dark', 20, 'public', TRUE, FALSE, '{}'::jsonb),
    ('30303030-3030-4030-8030-303030303030', 'escalation_event', 'Escalation update', 'escalation', 'escalation', 'brand-orange', 30, 'public', TRUE, FALSE, '{}'::jsonb),
    ('40404040-4040-4040-8040-404040404040', 'opportunity_event', 'Opportunity update', 'opportunity', 'opportunity', 'brand-blue', 40, 'public', TRUE, FALSE, '{}'::jsonb),
    ('50505050-5050-4050-8050-505050505050', 'client_education', 'Client education', 'education', 'education', 'rag-green', 50, 'public', TRUE, FALSE, '{}'::jsonb)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    module = EXCLUDED.module,
    color_token = EXCLUDED.color_token,
    display_order = EXCLUDED.display_order,
    default_visibility = EXCLUDED.default_visibility,
    is_active = TRUE,
    is_critical = FALSE,
    critical_rule_json = '{}'::jsonb,
    updated_at = NOW();
