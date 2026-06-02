-- Align P1 technical logic defaults and deterministic signal catalog.

UPDATE kyc_configurations
SET freshness_threshold_days = 90
WHERE freshness_threshold_days IS NULL OR freshness_threshold_days = 180;

UPDATE signal_rules
SET condition_json = '{"freshness_days": 90}'::jsonb
WHERE slug = 'stale_kyc';

INSERT INTO signal_rules (
    id,
    slug,
    name,
    signal_type,
    description,
    severity,
    condition_json,
    owner_rule_json,
    sla_rule_json,
    is_active,
    current_version,
    created_at,
    updated_at
)
SELECT
    rule.id,
    rule.slug,
    rule.name,
    rule.signal_type,
    'Seeded deterministic rule for ' || lower(rule.name) || '.',
    rule.severity,
    rule.condition_json::jsonb,
    '{"default": "primary_am"}'::jsonb,
    CASE WHEN rule.severity = 'critical' THEN '{"due_in_days": 3}'::jsonb ELSE '{"due_in_days": 7}'::jsonb END,
    1,
    1,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT 'sig-rule-red-health' AS id, 'red_account_health' AS slug, 'Red Account Health' AS name, 'red_account_health' AS signal_type, 'critical' AS severity, '{"rag_status": ["red"]}' AS condition_json
    UNION ALL SELECT 'sig-rule-csat-low', 'csat_low', 'Low CSAT', 'csat_low', 'warning', '{"weighted_score_max": 3.0, "category_score_max": 2.5}'
    UNION ALL SELECT 'sig-rule-csat-decline', 'csat_decline', 'CSAT Decline', 'csat_decline', 'warning', '{"decline_points_min": 0.5}'
    UNION ALL SELECT 'sig-rule-opp-stalled', 'opportunity_stalled', 'Opportunity Stalled', 'opportunity_stalled', 'warning', '{"stale_after_days": 30}'
    UNION ALL SELECT 'sig-rule-gov-overdue', 'governance_overdue', 'Governance Overdue', 'governance_overdue', 'critical', '{"scheduled_before": "now", "status_not_in": ["completed", "cancelled"]}'
    UNION ALL SELECT 'sig-rule-score-drop', 'score_dimension_drop', 'Score Dimension Drop', 'score_dimension_drop', 'warning', '{"drop_points_min": 10}'
    UNION ALL SELECT 'sig-rule-payment-risk', 'payment_risk', 'Payment or Commercial Risk', 'payment_risk', 'warning', '{"keywords": ["late payment", "payment overdue", "overdue invoice", "invoice dispute", "budget cut"]}'
) AS rule
WHERE NOT EXISTS (SELECT 1 FROM signal_rules existing WHERE existing.slug = rule.slug);
