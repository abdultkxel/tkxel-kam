# Relationships Planning Growth And Retention

## Summary

Implements stakeholder relationship configuration, account plans, service whitespace, service adjacency recommendations, opportunity workflow configuration, renewal intelligence, and retention plans for strategic accounts.

## Scope

- In scope: account-level planning, service catalog and adjacency configuration, whitespace capture, recommendation-to-opportunity creation, stakeholder role and gap-rule configuration, opportunity stage transitions, renewal intelligence, retention plans, recommendation-to-task conversion.
- Out of scope: AI-generated relationship planning, external CRM/commercial integrations, CSV commercial import UI, calendar synchronization.

## Requirement Links

- PRD IDs: Stories 5.1, 5.2, 6.1, 6.2, 7.1, 7.2, 8.1, 8.2.
- Specification: `specs/03-relationships-planning-growth-retention.md`

## User Flow

KAM users work from Account 360 tabs for stakeholders, planning, growth, renewal, and retention. Admin/KAM Head users configure role taxonomies, coverage gap rules, service catalog items, adjacency rules, opportunity stages, and stage transitions from Admin Settings.

## Backend Plan

- Routers: `account_planning`, `service_catalog`, `retention`, existing `stakeholders`, existing `opportunities`.
- Services: `AccountPlanningService`, `ServiceCatalogService`, `RetentionService`, `StakeholderConfigService`, existing opportunity/stakeholder services.
- Repositories: account planning, service catalog, retention, stakeholder config, existing opportunities.
- Schemas/validation: Pydantic schemas validate slugs, required owner/due date fields, renewal date rules, adjacency duplicates, stage transitions, and explicit confirmation.

## API Documentation

- Swagger route summaries and descriptions are included for new APIs.
- Admin APIs are separated from account user APIs for service catalog visibility.
- Recommendation conversion APIs require `confirm=true`.

## Database Plan

- Tables: `stakeholder_roles`, `stakeholder_gap_rules`, `opportunity_stage_transitions`, `account_plans`, `account_plan_versions`, `account_plan_actions`, `service_catalog_items`, `service_adjacency_rules`, `account_whitespace_items`, `service_recommendations`, `engagement_renewal_profiles`, `retention_plans`, `retention_plan_milestones`, `retention_plan_actions`, `retention_recommendations`.
- Columns: `opportunity_stage_definitions.requires_outcome_reason`.
- Migrations: `backend/migrations/20260602_relationships_planning_growth_retention.sql`.
- Snake_case schema check: all new tables and columns use snake_case.

## Frontend Plan

- Pages/components: Account 360 planning, growth, renewal, and retention tabs; Admin planning configuration panel.
- Services: `frontend/src/services/relationshipsPlanning.ts`.
- Form behavior: no HTML `required`; backend errors surface through field-level error components.
- Backend error display: `ApiError` field errors map into form fields.

## Validation And Errors

- Backend validation remains authoritative.
- Field-level errors are returned for invalid services, owners, dates, stage transitions, confirmation flags, slugs, and duplicate rules.
- Frontend surfaces loading, empty, and error states for account and admin views.

## Tests

- Backend unit/API tests cover account plan persistence, service whitespace recommendations, recommendation conversion, renewal profiles, retention plans, admin configuration, authorization, validation, pagination, and OpenAPI availability.
- Frontend tests cover admin/account UI service wiring where feasible.

## Linting And Quality

- Run: `python -m compileall backend/app`
- Run: backend pytest for relationships planning tests and affected opportunity/stakeholder tests.
- Run: frontend typecheck/build or targeted Vitest tests.

## Open Questions

- CSV/manual commercial import UI and schema need a follow-up specification or dedicated implementation.
- Calendar synchronization for notice-window tasks is not implemented in this feature pass.

## Handoff Notes

- Seed data includes default stakeholder roles, gap rules, service catalog entries, adjacency rules, opportunity types, stages, and transitions.
- Field builder can coexist with this feature; no runtime custom field behavior is changed in this implementation.
