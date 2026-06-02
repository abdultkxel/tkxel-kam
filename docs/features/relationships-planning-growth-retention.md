# Relationships Planning Growth And Retention

## Summary

Implements stakeholder relationship configuration, account plans, service whitespace, service adjacency recommendations, opportunity workflow configuration, renewal intelligence, and retention plans for strategic accounts.

## Scope

- In scope: account-level planning, service catalog and adjacency configuration, whitespace capture, recommendation-to-opportunity creation, stakeholder role and gap-rule configuration, opportunity stage transitions, renewal intelligence, retention plans, recommendation-to-task conversion.
- Out of scope: AI-generated relationship planning, external CRM/commercial integrations, CSV commercial import UI, calendar synchronization.

## Completed Scope

- Account 360 planning supports account-plan save, history display, action preservation, action filtering, review cadence, next review date, opportunities, and backend field-error display.
- Account 360 growth supports engagement-scoped whitespace capture, service coverage notes/source, recommendation filtering, and explicit recommendation-to-opportunity conversion confirmation.
- Admin service catalog supports filtering, sorting, pagination, create/update, active-state toggles, backend field-error display, and adjacency rule activation management.
- Backend service catalog and planning APIs support duplicate service-name validation, tag search, action filtering/sorting, engagement-scoped recommendations, stale recommendation conversion protection, and Swagger response metadata.

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

## Decisions

- Business rules remain backend-authoritative; frontend validation is limited to immediate workflow guards such as paired next-action title/due-date and explicit conversion confirmation.
- Existing frontend service/API helpers are used for all network calls; components do not call `fetch` directly.
- Field errors are mapped from both custom backend error payloads and FastAPI/Pydantic `detail` arrays so messages can render beside matching inputs.
- Recommendation and whitespace requests carry optional `engagement_id` so Account 360 can distinguish account-level whitespace from engagement-specific expansion planning.
- Admin adjacency edits continue to use replace-all persistence because the backend exposes adjacency replacement as the current contract.

## Database Plan

- Tables: `stakeholder_roles`, `stakeholder_gap_rules`, `opportunity_stage_transitions`, `account_plans`, `account_plan_versions`, `account_plan_actions`, `service_catalog_items`, `service_adjacency_rules`, `account_whitespace_items`, `service_recommendations`, `engagement_renewal_profiles`, `retention_plans`, `retention_plan_milestones`, `retention_plan_actions`, `retention_recommendations`.
- Columns: `opportunity_stage_definitions.requires_outcome_reason`.
- Migrations: `backend/migrations/20260602_relationships_planning_growth_retention.sql`, `backend/migrations/20260603_service_recommendation_engagement_scope.sql`.
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
- Frontend tests cover account-plan history/action preservation, recommendation conversion confirmation, admin service-catalog field errors, and retention task confirmation.

## Linting And Quality

- Passed: `docker compose run --rm --no-deps backend pytest tests/test_relationships_planning_growth_retention.py -q` (`5 passed`, 10 existing warnings for FastAPI/httpx deprecations and duplicate OpenAPI operation ID).
- Passed: `docker compose run --rm --no-deps backend python -m compileall app`.
- Passed: `docker compose run --rm --no-deps frontend npm test -- RelationshipsPlanningGrowthRetention.test.tsx` (`4 passed`).
- Passed: `docker compose run --rm --no-deps frontend npm run build`; this includes `tsc` and emitted the existing Vite large-chunk warning only.
- Skipped: no separate frontend `lint` script is configured in `frontend/package.json`.
- Skipped: no backend lint/typecheck command or config was found in `README.md`, `AGENTS.md`, `backend/README.md`, or backend config files; backend syntax/type sanity was covered with `compileall`.

## Open Questions

- CSV/manual commercial import UI and schema need a follow-up specification or dedicated implementation.
- Calendar synchronization for notice-window tasks is not implemented in this feature pass.

## Handoff Notes

- Seed data includes default stakeholder roles, gap rules, service catalog entries, adjacency rules, opportunity types, stages, and transitions.
- Field builder can coexist with this feature; no runtime custom field behavior is changed in this implementation.
- Backend follow-up for Account Planning, Whitespace, and Service Catalog added service-name uniqueness validation, service tag search, account-plan action filtering/sorting on `GET /api/accounts/{account_id}/plan`, engagement-scoped service recommendations, stale recommendation conversion protection, and richer Swagger response metadata.
- Verification for the backend follow-up passed with `docker compose run --rm --no-deps backend pytest tests/test_relationships_planning_growth_retention.py -q` and `docker compose run --rm --no-deps backend python -m compileall app`.
- Frontend follow-up for Account 360 planning, whitespace, and recommendations added account-plan history, action filtering, engagement-scoped whitespace/recommendations, explicit recommendation-to-opportunity confirmation, backend field-error mapping, and Admin service-catalog filtering, pagination, editing, and adjacency status management.
- Verification for the frontend follow-up passed with `docker compose run --rm --no-deps frontend npm test -- RelationshipsPlanningGrowthRetention.test.tsx` and `docker compose run --rm --no-deps frontend npm run build`. Build emitted the existing Vite large-chunk warning only.
