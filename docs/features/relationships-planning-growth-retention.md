# Relationships Planning Growth And Retention

## Summary

Implements stakeholder relationship configuration, account plans, service whitespace, scalable service growth recommendations, opportunity workflow configuration, renewal intelligence, and retention plans for strategic accounts.

## Scope

- In scope: account-level planning, service catalog, service bundles, taxonomy-based growth recommendation rules, whitespace capture, recommendation-to-opportunity creation, stakeholder role and gap-rule configuration, opportunity stage transitions, renewal intelligence, retention plans, recommendation-to-task conversion.
- Out of scope: AI-generated relationship planning, external CRM/commercial integrations, CSV commercial import UI, calendar synchronization.

## Requirement Links

- PRD IDs: Stories 5.1, 5.2, 6.1, 6.2, 7.1, 7.2, 8.1, 8.2.
- Specification: `specs/03-relationships-planning-growth-retention.md`

## User Flow

KAM users work from Account 360 tabs for stakeholders, planning, growth, renewal, and retention. Admin/KAM Head users configure role taxonomies, coverage gap rules, service catalog items, service bundles, growth recommendation rules, opportunity stages, and stage transitions from Admin Settings. Opportunity stages and transitions live under the Admin Opportunities section because they directly control opportunity board workflow.

## Backend Plan

- Routers: `account_planning`, `service_catalog`, `retention`, existing `stakeholders`, existing `opportunities`.
- Services: `AccountPlanningService`, `ServiceCatalogService`, `RetentionService`, `StakeholderConfigService`, existing opportunity/stakeholder services.
- Repositories: account planning, service catalog, retention, stakeholder config, existing opportunities.
- Schemas/validation: Pydantic schemas validate slugs, required owner/due date fields, renewal date rules, growth-rule selectors, duplicate service-pair compatibility rules, stage transitions, and explicit confirmation.

## API Documentation

- Swagger route summaries and descriptions are included for new APIs.
- Admin APIs are separated from account user APIs for service catalog visibility.
- Recommendation conversion APIs require `confirm=true`.

## Database Plan

- Tables: `stakeholder_roles`, `stakeholder_gap_rules`, `opportunity_stage_transitions`, `account_plans`, `account_plan_versions`, `account_plan_actions`, `service_catalog_items`, `service_adjacency_rules`, `service_growth_bundles`, `service_growth_bundle_items`, `service_growth_rules`, `account_whitespace_items`, `service_recommendations`, `engagement_renewal_profiles`, `retention_plans`, `retention_plan_milestones`, `retention_plan_actions`, `retention_recommendations`.
- Columns: `opportunity_stage_definitions.requires_outcome_reason`.
- Migrations: `backend/migrations/20260602_relationships_planning_growth_retention.sql`.
- Snake_case schema check: all new tables and columns use snake_case.

## Frontend Plan

- Pages/components: Account 360 planning, growth, renewal, and retention tabs; Admin planning configuration panel.
- Admin Planning keeps service catalog, service bundle, growth recommendation rule, stakeholder role, and stakeholder gap-rule controls in separate stacked sections, with paginated rows/cards so large configuration sets do not overflow or create a long unbroken settings wall. Services are added and edited from a focused dialog with placeholder guidance, add/remove tag chips, and multiline descriptions; service rows can be toggled active/inactive from the row. Service bundles use the same dialog pattern with placeholder guidance, multiline descriptions, searchable multi-select service picking across service name, slug, category, and tags, selected service chips, and row-level edit/status actions. Growth rules are added from a focused dialog. Stakeholder roles and coverage gap rules are added and edited from focused dialogs with row-level active/inactive actions, search/status filters, gap-rule severity filtering, and independent pagination. Stakeholder roles can be deleted only when no stakeholder record or coverage gap rule references the role; referenced roles stay available for historical data integrity and should be deactivated instead. Service, bundle, role, and gap-rule sort order is assigned automatically when adding records; admins rely on search, category, status, bundle, selector-type, and severity filters plus pagination for day-to-day catalog navigation.
- Engagement service lines use the active service catalog as the option source. Manual engagement create/edit, imported charter engagement draft review, and onboarding draft engagement review expose searchable multi-select service-line controls while preserving already-selected legacy/custom values.
- Growth recommendation rules use source and target selectors of type service, category, tag, or bundle. Active rules cannot overlap on the same effective source-service to target-service pair after selector expansion. Legacy service adjacency endpoints remain as compatibility aliases for service-to-service rules.
- Opportunity stages use `display_order` for board/list ordering; lower numbers appear earlier. New opportunities default to the first active stage in that order when no explicit stage is supplied, including opportunities created from growth recommendations. Admin Opportunities shows stages as compact pipeline rows, adds/edits stages from focused dialogs, lets admins place new stages at the start, end, or after another stage without typing order numbers, and uses a dedicated drag-and-drop reorder dialog that normalizes the sequence into 10-point order steps. Stage transitions are managed in a separate grouped section by source stage, with row-scoped add, optional reverse-transition creation, reason-toggle, and remove actions backed by the existing replace-transitions API. Stages with existing opportunity records cannot be deactivated or renamed, preserving Kanban visibility and historical stage references.
- Account Stage > Growth is labeled service coverage and growth recommendations, with service search/category/status filters, paginated coverage rows, partial coverage saves, and recommendation cards that show base fit, account fit, and score factors.
- Stakeholder tab UI shows role, influence, relationship, sentiment, status, optional LinkedIn URL, coverage, activity fields, and LinkedIn links in the hierarchy; political risk is not exposed in the tab, form, or detail drawer. Stakeholder `role` is persisted as plain text on the stakeholder record. The add/edit stakeholder form and role filter keep a dropdown UX using configured role names as option text, but backend create/update no longer requires the value to exist in stakeholder role configuration. Coverage rules normalize display-text roles and legacy slug roles so existing rules continue to work. Stakeholders without a `Reports to` value are presented as top-level/no-reporting-line hierarchy entries rather than errors.
- Stakeholder gap rules keep the flexible `condition_json` API/database contract, but Admin Planning uses guided condition controls for supported deterministic rule types instead of requiring admins to hand-write JSON.
- Services: `frontend/src/services/relationshipsPlanning.ts`.
- Form behavior: no HTML `required`; backend errors surface through field-level error components.
- Backend error display: `ApiError` field errors map into form fields.

## Validation And Errors

- Backend validation remains authoritative.
- Field-level errors are returned for invalid services, owners, dates, stage transitions, stage deactivation/rename conflicts, confirmation flags, slugs, and duplicate rules.
- Frontend surfaces loading, empty, and error states for account and admin views.

## Tests

- Backend unit/API tests cover account plan persistence, service whitespace recommendations, taxonomy growth rules, account-aware score factors, recommendation suppression, recommendation conversion, renewal profiles, retention plans, admin configuration, authorization, validation, pagination, and OpenAPI availability.
- Frontend tests cover admin/account UI service wiring where feasible, including catalog-backed engagement service-line selection.
- Frontend Admin Planning coverage verifies the service catalog no longer renders as a horizontally overflowing table, bundles and growth rules render in their own sections with scoped filters, service creation stays scoped to the service form, larger service catalogs paginate, stakeholder role/gap-rule dialogs support add, edit, status toggle, and pagination workflows, and unused stakeholder roles can be deleted while referenced roles are blocked. Frontend Admin Opportunities coverage verifies opportunity stages with linked opportunities cannot be deactivated from the stage list, stage add/reorder dialogs normalize display order without requiring manual numeric gaps, grouped stage transitions can be added or removed through the replace-transitions API, and reverse movement can be configured from the transition dialog.
- Frontend account Stakeholder coverage verifies configured stakeholder roles appear in account filters and add/edit stakeholder forms.
- Frontend account Growth coverage verifies service coverage pagination, partial PATCH saves, and base-fit/account-fit explanation display.

## Linting And Quality

- Run: `python -m compileall backend/app`
- Run: backend pytest for relationships planning tests and affected opportunity/stakeholder tests.
- Run: frontend typecheck/build or targeted Vitest tests.

## Open Questions

- CSV/manual commercial import UI and schema need a follow-up specification or dedicated implementation.
- Calendar synchronization for notice-window tasks is not implemented in this feature pass.

## Handoff Notes

- Seed data includes default stakeholder roles, gap rules, the 49 legacy/raw-design service catalog entries, compatibility adjacency rules, service bundles, growth recommendation rules, opportunity types, stages, and transitions.
- Field builder can coexist with this feature; no runtime custom field behavior is changed in this implementation.
