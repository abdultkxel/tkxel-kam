# RBAC Permission Model Redesign

## Summary

Design date: 2026-06-12.

This document proposes a ground-up replacement for the current generic RBAC grid. The existing model creates the same 8 actions for every section: `approve`, `assign`, `configure`, `create`, `delete`, `export`, `update`, and `view`. That creates permissions that do not map to real behavior and misses important capabilities that the platform actually exposes.

The new model is service-specific. Permissions describe real operations users can perform in the application. Account scope, sensitive-data access, configuration authority, and generated cross-module actions are modeled explicitly instead of being inferred from role titles.

## Implementation Notes

Implemented on 2026-06-12.

- Catalog source of truth: `backend/app/rbac_catalog.py`.
- Runtime seed path: `RbacService.seed_defaults()` now upserts granular catalog permissions, removes permission rows outside the catalog, and refreshes default system role grants.
- Schema support: permission metadata columns are additive and covered by `init_db()` plus `backend/migrations/20260612_rbac_permission_catalog_metadata.sql`.
- Frontend catalog UI: `frontend/src/components/admin/AdminRolesPanel.tsx` renders catalog sections, purpose, action labels, descriptions, risk, tags, dependencies, and presets.
- Capability API: `GET /api/users/me/capabilities` returns effective permission keys and high-level booleans for frontend controls.
- Clean-break compatibility: old generic permission rows are not seeded or returned. Existing local DBs may still carry the internal `permissions.is_deprecated` column, but the application always writes `false` and does not expose or use it.
- Authorization bridge: `backend/app/permission_resolver.py` maps older internal service labels to the new catalog keys while services finish moving their domain constants; no legacy permission grants are required.

Team rollout:

- Existing local database: run `make seed`.
- Fresh local database: run `make reset-db`.
- Do not run both for the same refresh. `make reset-db` already recreates and seeds the database.

## Source Inventory

The redesign is based on the current API and service surface:

- Auth and profile: `auth.py`, `users.py`, `auth.py` service, `profile.py`.
- Admin RBAC and user management: `admin.py`, `admin_security.py`, `rbac.py`, `user_management.py`, `email_domains.py`.
- Account onboarding and account workspace: `onboarding.py`, `accounts.py`, `account_access.py`.
- Engagements and SOWs: `engagements.py`.
- KYC and source-backed AI extraction: `kyc.py`, `kyc_document_extraction.py`, `kyc_gateway.py`, `kyc_worker.py`.
- Stakeholders, stakeholder taxonomy, and coverage gaps: `stakeholders.py`, `stakeholder_config.py`, `stakeholder_gap_service.py`.
- Account planning, service catalog, whitespace, recommendations: `account_planning.py`, `service_catalog.py`.
- Opportunities, opportunity taxonomy, stage rules, decisions, action items: `opportunities.py`.
- Retention, renewal intelligence, retention plans, retention tasks: `retention.py`.
- Scoring, CSAT, signals, attention center: `scoring.py`, `csat.py`, `signals.py`.
- Playbooks, tasks, evidence, unified calendar: `tasks.py`, `playbooks_tasks.py`.
- Client education content and sent-content history: `content.py`.
- Escalations, escalation notifications, closure workflow: `escalations.py`.
- Governance events, recurrence, agenda, decisions, action items, AI briefs: `governance.py`.
- Timeline, comments, retention policies, handover summaries, AI Timeline Search: `timeline.py`.
- Notifications, SLA rules, digest schedules, notification center: `notifications.py`.
- Dashboards, reports, analytics, forecasting: `dashboards.py`, `reports.py`, `analytics.py`, `forecasting.py`.
- AI assistance, KAM AI chat, AI search, AI briefs, forecasts, vocabulary: `ai.py`, `ai_assistance.py`, `kam_ai_chat.py`.
- Approved integrations and personal meeting capture: `integrations.py`, `meeting_capture.py`.
- Runtime custom fields and field access policy: `custom_fields.py`, `admin_security.py`.

## Design Principles

- Permissions must represent real service capabilities, not a repeated generic checklist.
- Account scope must be explicit. A user can have a feature permission and still be limited to assigned accounts unless they also have portfolio scope.
- Sensitive data access must be an overlay permission, not a role-name shortcut.
- Self-service actions such as viewing own profile, changing own password, and marking own notifications read should remain baseline authenticated-user behavior unless the product explicitly wants to disable them.
- Configuration permissions should be separated from operational work. A user who can create tasks does not necessarily configure playbook templates.
- Generated cross-module actions require both the source permission and the target write permission. Example: converting a retention recommendation into tasks requires retention recommendation access and task creation.
- The frontend should read effective capabilities from the backend instead of branching on `user.role`.

## Naming Convention

Permission keys should use:

```text
section_slug:action_slug
```

Examples:

```text
accounts:view_portfolio
onboarding:approve_draft
kyc:run_agent
reports:export_report
integrations:manage_mapping_rules
```

The `section_slug` replaces the current broad module. The `action_slug` is service-specific and should be stable. Display names and descriptions should come from seeded permission metadata so the Admin UI can show clear labels and tooltips.

## Cross-Cutting Scope Model

Account-scoped services should evaluate two things:

1. Feature permission: can the user perform this type of action?
2. Account scope: which accounts can the user perform it on?

Suggested account scope permissions:

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `accounts:view_assigned` | Lets AMs and delivery users view accounts where they are active owners, supporting owners, or otherwise assigned. | Required before any assigned-account feature view. |
| `accounts:view_portfolio` | Lets KAM Heads, Admins, leadership, or custom portfolio roles view accounts beyond direct ownership. | Should imply `accounts:view_assigned`; required for portfolio dashboards, portfolio reports, and global filters. |
| `accounts:update_assigned` | Lets operational owners update account-scoped data on assigned accounts. | Requires `accounts:view_assigned`. |
| `accounts:update_portfolio` | Lets trusted roles update account-scoped data across the portfolio. | Requires `accounts:view_portfolio`; replaces hardcoded `GLOBAL_EDIT_ROLES`. |
| `accounts:view_sensitive_sources` | Lets users view/download sensitive account and onboarding source documents when paired with a feature view permission. | Requires the relevant feature view permission and account scope. |
| `accounts:manage_sensitive_sources` | Lets users extract, re-extract, or delete sensitive source material. | Requires `accounts:view_sensitive_sources` plus source-document write permission. |

This section is foundational. Most account-related feature sections below depend on one of these scope permissions.

## Proposed Permission Sections

### 1. Authentication And Self Profile

Purpose: baseline authenticated-user behavior.

This should not be role-configurable by default. Every active authenticated user should be able to:

- Read own session.
- Log out.
- Change own password.
- Request and complete password reset.
- Read and update own profile fields.

Justification: these are identity baseline actions. Making them configurable creates lockout risk and adds little security value.

Dependencies: active user account and allowed email-domain policy.

### 2. Accounts And Portfolio

Purpose: account list, Account 360, lifecycle state, summary cards, and health rollups.

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `accounts:view_assigned` | Reads Account 360 and account list for assigned accounts. | Baseline account permission for AM and delivery workflows. |
| `accounts:view_portfolio` | Reads all or filtered portfolio accounts. | Required for portfolio dashboards, reports, analytics, and admin account review. |
| `accounts:update_profile_assigned` | Updates editable account profile fields for assigned accounts. | Requires `accounts:view_assigned`. |
| `accounts:update_profile_portfolio` | Updates account profile fields across portfolio scope. | Requires `accounts:view_portfolio`. |
| `accounts:update_lifecycle` | Changes account lifecycle status, including archive-like states. | Requires one update scope; high impact because it changes visibility and status. |
| `accounts:view_health_rollup` | Reads account health rollups and summary cards. | Requires assigned or portfolio view. |
| `accounts:import_csv` | Imports or upserts accounts from CSV. | Requires `onboarding:bulk_import_accounts` or `accounts:update_portfolio`; should be restricted to data stewards/admins. |

### 3. Account Ownership And Team Coverage

Purpose: manage account owners, owner history, and account responsibility coverage.

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `account_ownership:view` | Lists owners and ownership history. | Requires assigned or portfolio account view. |
| `account_ownership:assign_primary_am` | Adds or changes primary AM ownership. | Requires `accounts:update_portfolio` unless product allows self-service assignment. |
| `account_ownership:assign_supporting_am` | Adds or changes supporting AM ownership. | Requires account update scope. |
| `account_ownership:assign_delivery_lead` | Adds or changes delivery or ops owner. | Requires account update scope. |
| `account_ownership:assign_leadership_sponsor` | Adds or changes leadership sponsor. | Requires portfolio update scope. |
| `account_ownership:remove_owner` | Removes or deactivates an owner assignment. | Requires the matching assign permission. |
| `account_ownership:view_history` | Reads ownership change history. | Requires `account_ownership:view`. |

Relationship: owner eligibility should be defined by assignable user capabilities or role metadata, not hardcoded role slugs.

### 4. Source Documents And Extraction

Purpose: source documents used by onboarding, accounts, KYC, AI retrieval, and evidence workflows.

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `source_documents:view_metadata` | Lists uploaded document records and extraction status. | Requires relevant account or draft view. |
| `source_documents:upload` | Uploads source documents or attachments. | Requires update permission on the owning workflow. |
| `source_documents:download` | Downloads non-sensitive stored files. | Requires source metadata view. |
| `source_documents:download_sensitive` | Downloads sensitive stored files. | Requires `accounts:view_sensitive_sources`. |
| `source_documents:extract` | Runs or retries OCR/text/structured extraction. | Requires source metadata view and update permission on the owning workflow. |
| `source_documents:view_extraction` | Reads extraction output, chunks, and source snippets. | Requires source metadata view; sensitive output requires `download_sensitive` or KYC sensitive access. |
| `source_documents:delete` | Deletes account attachments/source documents where supported. | Requires update permission on the owning workflow. |

Relationship: KYC and AI permissions should not automatically expose sensitive document text. Sensitive source access remains separate.

### 5. Account Onboarding

Purpose: draft intake, upload-assisted extraction, draft review, duplicate handling, approval, rejection, and linking.

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `onboarding:view_drafts` | Lists and reads onboarding drafts. | Account scope determines assigned-only vs review queue visibility. |
| `onboarding:create_draft` | Creates manual or upload-assisted drafts. | May include file upload; source extraction depends on `source_documents:extract`. |
| `onboarding:update_draft` | Edits extracted or manually entered draft fields. | Requires `onboarding:view_drafts`. |
| `onboarding:assign_owner` | Assigns or clears primary account manager on drafts. | Requires `onboarding:view_drafts`; replaces Admin/KAM Head hardcode. |
| `onboarding:approve_draft` | Converts a draft into official account, owner, engagement, stakeholder, and KYC records. | Requires `onboarding:view_drafts`, valid owner assignment, and account create/update authority. |
| `onboarding:reject_draft` | Rejects a draft with rationale. | Requires `onboarding:view_drafts`. |
| `onboarding:link_existing_account` | Links draft source documents to an existing account instead of creating a duplicate. | Requires `onboarding:view_drafts` and update access to target account. |
| `onboarding:bulk_import_accounts` | Imports accounts from CSV through onboarding service. | Requires `accounts:import_csv`; high impact. |
| `onboarding:view_account_manager_candidates` | Lists assignable account-manager candidates. | Required by draft assignment UI; should be based on assignable capability metadata. |

### 6. Engagements And SOW Management

Purpose: engagement/SOW records, health snapshots, engagement timeline, and archive behavior.

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `engagements:view` | Reads engagement records, summaries, timeline, and SOW details. | Requires account view scope. |
| `engagements:create` | Creates engagement records under an account. | Requires account update scope. |
| `engagements:update` | Updates engagement/SOW fields and delivery health inputs. | Requires `engagements:view` and account update scope. |
| `engagements:archive` | Archives engagements. | Requires `engagements:update`; high impact because it changes active delivery context. |
| `engagements:recalculate_health` | Recalculates engagement health snapshots. | Requires `engagements:update`. |
| `engagements:view_health_history` | Reads engagement health history. | Requires `engagements:view`. |

### 7. KYC And AI-Assisted KYC

Purpose: KYC drafts, KYC approval, immutable snapshots, freshness, AI agent runs, web research, and KYC configuration.

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `kyc:view` | Reads KYC drafts, snapshots, freshness, and agent run status. | Requires account view scope. |
| `kyc:create_draft` | Creates a draft from prompts or source documents. | Requires account view and source document access. |
| `kyc:update_draft` | Edits draft fields before approval. | Requires `kyc:view` and account update scope. |
| `kyc:approve_draft` | Approves a KYC draft into an immutable snapshot. | Requires `kyc:view`; replaces literal `kam_head` check. |
| `kyc:reject_draft` | Rejects a KYC draft with rationale. | Requires `kyc:view`. |
| `kyc:restore_snapshot` | Restores a prior snapshot as active. | Requires `kyc:approve_draft`; high audit impact. |
| `kyc:view_sensitive_fields` | Views unmasked KYC sensitive fields, citations, and workstream output. | Requires `kyc:view`; should align with field permissions. |
| `kyc:build_default_prompt` | Builds source-backed default prompt text. | Requires `kyc:view` and permitted source context. |
| `kyc:run_agent` | Starts KYC agent runs. | Requires `kyc:create_draft` or account update scope. |
| `kyc:retry_or_refresh_agent` | Retries, refreshes, or resumes agent runs. | Requires `kyc:run_agent`. |
| `kyc:cancel_agent` | Cancels pending/running KYC agent runs. | Requires `kyc:run_agent`. |
| `kyc:run_pending_jobs` | Processes queued local KYC jobs manually. | Requires `kyc:configure`; operational admin only. |
| `kyc:run_web_research` | Queues Tavily/web research for KYC. | Requires `kyc:run_agent`; may require integration availability. |
| `kyc:configure` | Updates required fields, thresholds, freshness rules, and AI behavior. | Should be limited to KYC administrators. |

### 8. Stakeholder Relationships

Purpose: account stakeholders, relationship attributes, hierarchy, interactions, and coverage gaps.

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `stakeholders:view` | Lists stakeholders, reads details, interactions, org chart, and coverage gaps. | Requires account view scope. |
| `stakeholders:create` | Adds stakeholders to an account. | Requires account update scope. |
| `stakeholders:update` | Updates stakeholder profile and relationship attributes. | Requires `stakeholders:view` and account update scope. |
| `stakeholders:archive` | Archives stakeholder records. | Requires `stakeholders:update`. |
| `stakeholders:create_interaction` | Logs stakeholder interactions and relationship changes. | Requires `stakeholders:view`; usually requires account update scope. |
| `stakeholders:recalculate_coverage` | Runs deterministic coverage-gap rules. | Requires `stakeholders:update`. |
| `stakeholders:view_sensitive_fields` | Views sensitive stakeholder fields such as political risk. | Requires `stakeholders:view`; should be field-policy aware. |

### 9. Stakeholder Taxonomy And Coverage Rules

Purpose: Admin configuration for stakeholder role taxonomy and coverage gap rules.

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `stakeholder_config:view_roles` | Reads stakeholder role configuration. | Needed for forms and admin previews. |
| `stakeholder_config:manage_roles` | Creates or updates stakeholder role taxonomy. | Should be limited to relationship admins. |
| `stakeholder_config:view_gap_rules` | Reads stakeholder coverage rules. | Useful for admins and auditors. |
| `stakeholder_config:manage_gap_rules` | Creates or updates coverage gap rules. | Impacts recommendations and account health context. |

### 10. Account Planning

Purpose: account plans, plan history, strategic focus, risks, commitments, and next actions.

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `account_plans:view` | Reads current account plan. | Requires account view scope. |
| `account_plans:update` | Creates or updates account plan. | Requires account update scope. |
| `account_plans:view_history` | Reads plan version history. | Requires `account_plans:view`. |

### 11. Service Catalog And Whitespace

Purpose: service catalog, adjacency rules, whitespace inputs, service recommendations, and recommendation-to-opportunity conversion.

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `service_catalog:view` | Reads active service catalog entries. | Required by whitespace and recommendation UI. |
| `service_catalog:manage_items` | Creates or updates service catalog items. | Configuration-level permission. |
| `service_catalog:manage_adjacencies` | Replaces service adjacency rules. | Configuration-level permission with recommendation impact. |
| `whitespace:view` | Reads account whitespace inputs and recommendations. | Requires account view scope. |
| `whitespace:update` | Replaces account whitespace inputs. | Requires account update scope. |
| `whitespace:convert_recommendation` | Creates an opportunity from a service recommendation. | Requires `opportunities:create` and account update scope. |

### 12. Opportunities And Pipeline

Purpose: opportunity CRUD, pipeline movement, decisions, action items, and opportunity-derived tasks.

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `opportunities:view` | Lists and reads opportunities. | Requires account view scope. |
| `opportunities:create` | Creates opportunities. | Requires account view scope; owner fields may require assignment authority. |
| `opportunities:update` | Updates opportunity fields. | Requires account update scope. |
| `opportunities:archive` | Archives opportunities. | Requires `opportunities:update`. |
| `opportunities:restore` | Restores archived opportunities. | Requires `opportunities:archive`. |
| `opportunities:move_stage` | Moves stage and writes stage history. | Requires `opportunities:update`; stage transition rules apply. |
| `opportunities:view_decisions` | Reads opportunity decision log. | Requires `opportunities:view`. |
| `opportunities:add_decision` | Adds opportunity decisions. | Requires `opportunities:update`. |
| `opportunities:view_action_items` | Reads opportunity action items. | Requires `opportunities:view`. |
| `opportunities:manage_action_items` | Creates or updates opportunity action items and synced tasks. | Requires `opportunities:update`; task sync requires `tasks:create_task` or `tasks:update_task`. |

### 13. Opportunity Taxonomy And Stage Rules

Purpose: opportunity types, stages, terminal outcomes, and stage transition rules.

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `opportunity_config:view_types` | Reads active and inactive opportunity type taxonomy. | Needed by admin settings and opportunity forms. |
| `opportunity_config:manage_types` | Creates, updates, or deactivates opportunity types. | Configuration-level permission. |
| `opportunity_config:view_stages` | Reads opportunity stage definitions. | Needed by forms and pipeline board. |
| `opportunity_config:manage_stages` | Creates or updates stage definitions. | Configuration-level permission. |
| `opportunity_config:manage_stage_transitions` | Replaces allowed transition rules. | High impact because it controls pipeline workflow. |

### 14. Retention And Renewal

Purpose: renewal intelligence, retention summaries, retention plans, recommendations, and task creation from recommendations.

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `retention:view_renewals` | Reads portfolio or account renewal intelligence. | Requires account view scope. |
| `retention:update_renewal` | Updates renewal context, notice windows, manual overrides, and source provenance. | Requires account update scope. |
| `retention:refresh_summary` | Refreshes deterministic account retention recommendations and renewal profiles. | Requires account update scope. |
| `retention:view_plans` | Reads retention, renewal, and stabilization plans. | Requires account view scope. |
| `retention:create_plan` | Creates retention plans with milestones and actions. | Requires account update scope. |
| `retention:update_plan` | Updates retention plans, milestones, and actions. | Requires account update scope. |
| `retention:view_recommendations` | Reads deterministic retention recommendations. | Requires account view scope. |
| `retention:create_tasks_from_recommendations` | Converts selected recommendations into first-class tasks. | Requires `tasks:create_task`. |

### 15. Scoring And Health

Purpose: scoring metric definitions, score snapshots, score recalculation, and scoring jobs.

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `scoring:view_scores` | Reads account and engagement scores and snapshot history. | Requires account or engagement view. |
| `scoring:recalculate_account` | Recalculates account score and optionally refreshes signals. | Requires account update scope. |
| `scoring:recalculate_engagement` | Recalculates engagement score and health snapshots. | Requires engagement update scope. |
| `scoring:create_job` | Creates manual, scheduled, or event scoring jobs. | Portfolio jobs require `accounts:view_portfolio` and `scoring:recalculate_account`. |
| `scoring:view_metrics` | Reads scoring metric definitions and versions. | Needed for admin review. |
| `scoring:manage_metrics` | Creates or updates scoring metric definitions. | Configuration-level permission. |
| `scoring:validate_metrics` | Validates formulas and thresholds without publishing. | Requires `scoring:view_metrics`. |
| `scoring:publish_metrics` | Publishes immutable metric versions. | Requires `scoring:manage_metrics`; high impact. |

### 16. CSAT Feedback

Purpose: manual and imported CSAT scores, account mapping, and CSAT updates.

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `csat:view_scores` | Lists and reads CSAT scores. | Requires account view scope when mapped to an account. |
| `csat:create_score` | Creates manual CSAT scores. | Requires account update scope. |
| `csat:update_score` | Updates CSAT details and status. | Requires account update scope. |
| `csat:map_score` | Maps imported or unmapped CSAT score to a target account. | Requires update access to source and target account context. |

### 17. Signals And Attention Center

Purpose: signal rules, signal evaluation, attention center, evidence, lifecycle status, conversion, and AI explanations.

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `signals:view` | Lists signals, attention center, evidence, and recommended playbooks. | Requires account view scope. |
| `signals:evaluate` | Runs deterministic signal evaluation. | Portfolio evaluation requires portfolio scope. |
| `signals:update_status` | Updates signal lifecycle state. | Requires account update scope. |
| `signals:convert` | Converts signal into task, escalation, opportunity, or other target. | Requires target create permission such as `tasks:create_task` or `escalations:create`. |
| `signals:generate_ai_explanation` | Generates advisory AI explanation for a signal. | Requires `ai:generate_advisory` and `signals:view`. |
| `signals:view_rules` | Reads signal rule configuration. | Admin review permission. |
| `signals:manage_rules` | Creates or updates deterministic signal rules. | Configuration-level permission. |

### 18. Playbook Templates

Purpose: configurable playbook templates, activities, owner rules, due-date rules, and execution eligibility.

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `playbooks:view_templates` | Reads playbook template/manual content. | Needed by all roles that see the playbook manual. |
| `playbooks:manage_templates` | Creates or updates playbook templates. | Configuration-level permission; replaces Super Admin-only hardcode if product agrees. |
| `playbooks:execute` | Executes a playbook and creates account tasks. | Requires `tasks:create_task` and account update scope. |
| `playbooks:view_recommendations` | Reads recommended playbooks for a signal. | Requires `signals:view`. |

### 19. Tasks, Evidence, And Unified Calendar

Purpose: task management, task evidence, and unified calendar item projections.

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `tasks:view` | Lists tasks and calendar items. | Requires account view scope for account-linked tasks. |
| `tasks:create_task` | Creates manual tasks or generated tasks. | Requires account update scope for account-linked tasks. |
| `tasks:update_task` | Updates task fields, status, priority, owner, and due date. | Requires task ownership or account update scope. |
| `tasks:assign_task` | Assigns or reassigns task owner. | Requires `tasks:update_task`; important for workload management. |
| `tasks:add_evidence` | Adds note, URL, or file-style evidence to a task. | Requires `tasks:update_task` or task ownership. |
| `tasks:view_calendar` | Reads unified calendar items across tasks, governance, SOW expiry, and renewals. | Requires relevant account scope and task view. |

### 20. Client Education Content

Purpose: content catalog, uploads, recommendations, sent-content history, and follow-up tracking.

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `content:view_catalog` | Reads active content catalog. | Baseline for recommendations and content library. |
| `content:manage_catalog` | Creates, uploads, updates, archives, or deletes content items. | Content admin permission. |
| `content:view_recommendations` | Reads account-specific recommendations. | Requires account view scope. |
| `content:view_sent_history` | Reads content sent to an account. | Requires account view scope. |
| `content:record_sent_content` | Records sent content. | Requires account update scope and `content:view_catalog`. |
| `content:update_sent_followup` | Updates follow-up status for sent content. | Requires account update scope. |

### 21. Escalations

Purpose: escalation lifecycle, escalation updates, closure, RCA, reopen, and escalation notification visibility.

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `escalations:view` | Lists and reads escalations. | Requires account view scope. |
| `escalations:create` | Creates escalations. | Requires account update scope. |
| `escalations:update` | Updates escalation fields and owner/status metadata. | Requires account update scope or escalation ownership. |
| `escalations:add_update` | Adds escalation updates. | Requires `escalations:view`; usually account update or escalation ownership. |
| `escalations:close` | Closes escalations with evidence and RCA validation. | Requires `escalations:update`. |
| `escalations:override_closure_evidence` | Closes without standard closure evidence when rationale is provided. | Requires `escalations:close`; high risk. |
| `escalations:reopen` | Reopens closed escalations. | Requires `escalations:update`. |
| `escalations:view_notifications` | Reads escalation notification history. | Requires `escalations:view`. |
| `escalations:test_notifications` | Queues test escalation notification. | Requires notification configuration authority. |

### 22. Governance Reviews

Purpose: governance events, calendar, completion, agendas, AI brief, decisions, and action items.

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `governance:view_events` | Lists, reads, and calendars governance events. | Requires account view scope when event is account-linked. |
| `governance:create_event` | Creates governance events. | Requires account update scope for account-linked events. |
| `governance:update_event` | Updates event schedule, owner, agenda metadata, and status. | Requires account update scope or event ownership. |
| `governance:delete_event` | Deletes governance events. | Requires `governance:update_event`; high impact. |
| `governance:complete_event` | Completes governance events and captures completion data. | Requires `governance:update_event`. |
| `governance:generate_agenda` | Generates deterministic/AI agenda draft. | Requires `governance:view_events`; AI usage may require AI permission. |
| `governance:update_agenda` | Edits persisted agenda. | Requires `governance:update_event`. |
| `governance:generate_ai_brief` | Generates source-backed AI brief. | Requires `ai:generate_advisory` and governance/account view. |
| `governance:view_decisions` | Reads governance decisions. | Requires `governance:view_events`. |
| `governance:add_decision` | Adds governance decisions. | Requires `governance:update_event`. |
| `governance:view_action_items` | Reads governance action items. | Requires `governance:view_events`. |
| `governance:manage_action_items` | Creates or updates governance action items. | Requires `governance:update_event`; task sync may require task permissions. |

### 23. Governance Configuration

Purpose: governance recurrence rules and governance integration sync settings.

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `governance_config:view_recurrence_rules` | Reads governance recurrence rules. | Admin review permission. |
| `governance_config:manage_recurrence_rules` | Creates, updates, or deletes recurrence rules. | Configuration-level permission. |
| `governance_config:sync_integrations` | Runs governance-related integration sync. | Requires integration sync permission. |

### 24. Timeline

Purpose: account timeline, manual notes, comments, sensitive/restricted entries, and timeline moderation.

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `timeline:view` | Lists and reads account timeline events. | Requires account view scope. |
| `timeline:create_note` | Creates manual timeline notes. | Requires account view scope; may require update scope if notes are considered record mutation. |
| `timeline:update_own_note` | Updates own mutable manual notes. | Requires `timeline:create_note`. |
| `timeline:moderate_entries` | Updates, archives, restricts, or deletes other users' mutable entries. | Replaces hardcoded timeline moderator roles. |
| `timeline:delete_entry` | Deletes timeline entry with tombstone. | Requires `timeline:moderate_entries`; high audit impact. |
| `timeline:view_sensitive` | Views sensitive non-legal timeline entries. | Requires `timeline:view`. |
| `timeline:view_legal_sensitive` | Views legal/executive restricted entries. | Requires `timeline:view`; should be rare. |
| `timeline:view_comments` | Lists comments. | Requires `timeline:view`. |
| `timeline:create_comment` | Creates comments. | Requires `timeline:view`. |
| `timeline:update_own_comment` | Updates own comments. | Requires `timeline:create_comment`. |
| `timeline:moderate_comments` | Updates or deletes comments by other users. | Requires `timeline:moderate_entries` or explicit moderation grant. |

### 25. Timeline Configuration And Retention

Purpose: timeline event type configuration and retention policy simulation/execution.

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `timeline_config:view_event_types` | Reads timeline event type configuration. | Admin review permission. |
| `timeline_config:manage_event_types` | Creates or updates timeline event types. | Configuration-level permission. |
| `timeline_config:view_retention_policies` | Reads retention policies and retention action history. | Admin review permission. |
| `timeline_config:manage_retention_policies` | Creates or updates retention policies. | Configuration-level permission. |
| `timeline_config:simulate_retention_policy` | Simulates retention impact without mutation. | Requires policy view. |
| `timeline_config:run_retention_policy` | Manually executes retention policy. | Requires policy manage; high data-retention impact. |

### 26. Handover Summaries

Purpose: source-backed account handover summaries, export, and internal share links.

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `handover:view` | Lists and reads handover summaries. | Requires account view scope. |
| `handover:generate` | Generates a new handover summary. | Requires account view scope and source visibility. |
| `handover:export_pdf` | Exports handover summary as PDF. | Requires `handover:view`; sensitive content rules apply. |
| `handover:share_internal` | Creates internal share link. | Requires `handover:view`; should respect recipient authorization. |

### 27. Notifications, SLA, And Digests

Purpose: notification center, preferences, trigger defaults, SLA rules, scheduler, escalated items, and executive digests.

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `notifications:view_own` | Reads own notification center and bell summary. | Baseline authenticated-user behavior. |
| `notifications:manage_own` | Marks own notifications read/archive and updates own preferences. | Baseline authenticated-user behavior. |
| `notifications:view_configuration` | Reads trigger defaults, notification defaults, scheduler runs, and SLA rules. | Admin review permission. |
| `notifications:manage_triggers` | Updates trigger configuration, resets defaults, and sends trigger tests. | Configuration-level permission. |
| `notifications:manage_defaults` | Updates global notification defaults and delivery channels. | Configuration-level permission. |
| `notifications:dry_run_scheduler` | Runs notification scheduler dry-run. | Requires configuration view. |
| `notifications:view_sla_items` | Reads escalated SLA items. | Requires account scope for linked items. |
| `notifications:manage_sla_rules` | Creates or updates SLA rules. | Configuration-level permission. |
| `notifications:evaluate_sla` | Runs SLA evaluation job. | Requires SLA rule view; operational admin permission. |
| `digests:view` | Lists and reads digest history. | Scope should match generated content. |
| `digests:preview` | Previews digest content. | Requires source data view and digest view. |
| `digests:manage_schedules` | Creates or updates digest schedules. | Requires recipient authorization checks. |
| `digests:send` | Sends digest run manually. | Requires `digests:preview` and schedule/manage authority. |

### 28. Dashboards

Purpose: AM Home, KAM Head Portfolio, Leadership Dashboard, dashboard widgets, and manual task summary refresh.

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `dashboards:view_assigned` | Views dashboards scoped to assigned accounts/work. | Requires account assigned scope. |
| `dashboards:view_portfolio` | Views portfolio dashboards. | Requires `accounts:view_portfolio`. |
| `dashboards:view_leadership` | Views leadership/executive dashboard profile. | Requires portfolio scope and sensitive value rules. |
| `dashboards:refresh_task_summary` | Refreshes AI task summary widget. | Requires task/signal view in the requested scope. |
| `dashboards:view_commercial_values` | Views unmasked commercial forecast/revenue values on dashboards. | Requires sensitive commercial data permission. |

Relationship: dashboard profile should be selected from permissions and account scope, not from role slug.

### 29. Reports

Purpose: report field catalog, preview, report definitions, exports, runs, and schedules.

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `reports:view_fields` | Lists reportable fields. | Requires report view; field list should respect sensitive-field policy. |
| `reports:preview` | Previews report rows. | Requires view permission for each selected data source and account scope. |
| `reports:view_reports` | Lists and reads report definitions and runs. | Shared/private report rules still apply. |
| `reports:create_report` | Creates report definitions. | Requires `reports:preview`. |
| `reports:update_report` | Updates report definitions owned by user or configurable by role. | Requires `reports:view_reports`. |
| `reports:delete_report` | Deletes report definitions. | Requires `reports:update_report`. |
| `reports:export_report` | Exports report output. | Requires data-source view and sensitive export checks. |
| `reports:view_schedules` | Lists report schedules. | Requires report view. |
| `reports:manage_schedules` | Creates or updates report schedules. | Requires `reports:update_report`. |
| `reports:run_schedule` | Runs report schedule immediately. | Requires `reports:export_report`. |

### 30. Analytics And Portfolio Intelligence

Purpose: portfolio analytics, benchmarks, KAM performance, account-change alerts, and advisory forecast context.

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `analytics:view_portfolio` | Reads portfolio analytics. | Requires `accounts:view_portfolio`. |
| `analytics:view_benchmarks` | Reads benchmark cohorts. | Requires appropriate account/data scope. |
| `analytics:view_kam_performance` | Reads KAM performance analytics. | Requires portfolio scope; may include user performance sensitivity. |
| `analytics:view_account_change_alerts` | Lists account-change alerts. | Requires account view scope. |
| `analytics:update_account_change_alerts` | Updates alert status. | Requires alert visibility and account update scope. |
| `analytics:generate_forecast` | Generates shared six-month forecast outside AI chat. | Requires account/portfolio scope and commercial-value rules. |

### 31. AI Assistance And KAM AI

Purpose: KAM AI chat, source-backed search, query history, account briefs, stage predictions, forecasts, handoff summaries, and feedback.

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `ai:use_chat` | Creates, reads, updates, archives chat sessions, and sends messages. | Requires source access by account/module scope. |
| `ai:search_sources` | Runs KAM AI search/query across authorized sources. | Requires view permission for selected source modules. |
| `ai:view_query_history` | Lists own or authorized query history. | Requires `ai:search_sources`. |
| `ai:rerun_query` | Reruns stored query history. | Requires `ai:search_sources` and original source permissions. |
| `ai:generate_account_brief` | Generates account AI briefs. | Requires account view and source module views. |
| `ai:view_account_briefs` | Lists persisted account brief runs. | Requires account view. |
| `ai:refresh_account_brief` | Refreshes a persisted brief. | Requires `ai:generate_account_brief`. |
| `ai:record_feedback` | Records human feedback on AI output. | Requires ability to view the AI run. |
| `ai:create_timeline_note_from_brief` | Creates timeline note from reviewed AI brief. | Requires `timeline:create_note`. |
| `ai:generate_stage_prediction` | Generates advisory account stage prediction. | Requires account view and source views. |
| `ai:apply_stage_prediction` | Applies human-confirmed AI stage recommendation. | Requires `accounts:update_lifecycle`. |
| `ai:generate_forecast` | Generates account or portfolio forecast through AI API. | Requires account or portfolio scope and commercial-value rules. |
| `ai:generate_handoff` | Generates account handoff brief. | Requires handover view/generate permissions. |
| `ai:view_sensitive_context` | Allows sensitive AI source chunks in retrieval results. | Requires underlying source permissions and sensitive overlay. |

### 32. AI Administration And Model Governance

Purpose: AI source index, AI vocabulary, searchable field settings, and AI Gateway run inspection.

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `ai_admin:view_index_status` | Reads KAM AI source index status. | Admin review permission. |
| `ai_admin:reindex_sources` | Rebuilds/reindexes AI source records. | High operational impact; requires source visibility. |
| `ai_admin:view_vocabulary` | Reads AI vocabulary terms. | Admin review permission. |
| `ai_admin:manage_vocabulary` | Creates or updates AI vocabulary. | Configuration-level permission. |
| `ai_admin:view_search_fields` | Reads AI searchable field settings. | Admin review permission. |
| `ai_admin:manage_search_fields` | Updates AI searchable field settings. | Impacts retrieval and data exposure. |
| `ai_admin:view_gateway_runs` | Reads AI Gateway run logs and payload metadata. | Sensitive operational audit permission. |

### 33. Approved Integrations Administration

Purpose: provider connections, sync, retry, disconnect, mapping rules, imported items, AI gateway logs, OAuth, and security alert settings.

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `integrations:view_connections` | Lists configured integration connections. | Admin review permission. |
| `integrations:manage_connections` | Updates provider credentials/settings and disconnects providers. | High-risk configuration permission. |
| `integrations:test_connection` | Sends provider test requests. | Requires connection view. |
| `integrations:sync` | Runs provider sync. | Requires connection view; may create imported records. |
| `integrations:retry_sync` | Retries failed sync. | Requires sync permission. |
| `integrations:view_logs` | Reads provider logs, sync runs, and sync logs. | Admin review permission. |
| `integrations:manage_mapping_rules` | Creates, updates, or deletes provider mapping rules. | Configuration-level permission. |
| `integrations:view_imported_items` | Reads imported items requiring review or mapping. | Requires provider log visibility and account scope where mapped. |
| `integrations:map_imported_items` | Maps imported records into accounts, governance events, CSAT, or other targets. | Requires target service update/create permission. |
| `integrations:approve_imported_items` | Approves Fathom/imported items or task suggestions. | Requires imported item view and target create permission. |
| `integrations:reject_imported_items` | Rejects imported items or suggestions. | Requires imported item view. |
| `integrations:redact_imported_items` | Redacts imported sensitive content. | Requires sensitive data administration. |
| `integrations:manage_security_alerts` | Updates security/admin alert email settings. | Platform admin permission. |
| `integrations:manage_google_oauth` | Creates OAuth URL and completes Google Calendar OAuth. | Requires connection management. |

### 34. Personal Meeting Capture

Purpose: user-owned Fathom/Fireflies connections and personal meeting artifact management.

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `meeting_capture:view_own_connection` | Reads own Fathom/Fireflies connection status. | Self-service integration permission. |
| `meeting_capture:manage_own_connection` | Updates own personal meeting capture credentials/settings. | Requires provider availability. |
| `meeting_capture:sync_own_meetings` | Syncs personal Fathom meetings. | Requires own connection management. |
| `meeting_capture:view_own_meetings` | Lists personal meeting artifacts. | Self-service permission. |
| `meeting_capture:create_own_meeting` | Creates personal meeting artifacts manually. | Requires own meeting view. |
| `meeting_capture:update_own_meeting` | Updates owned meeting artifacts. | Requires own meeting view. |
| `meeting_capture:resolve_meeting` | Resolves imported meeting to account/governance/task context. | Requires target service permission. |

### 35. Admin Users, Roles, And Access Policy

Purpose: managed users, roles, permission grants, allowed email domains, and high-level access policy.

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `access_admin:view_users` | Lists and reads managed users. | Admin section visibility. |
| `access_admin:create_user` | Creates managed users. | Requires allowed-domain policy. |
| `access_admin:update_user` | Updates user metadata and active state. | Requires `access_admin:view_users`. |
| `access_admin:deactivate_user` | Deactivates/deletes managed users. | Requires `access_admin:update_user`; cannot target protected Super Admin. |
| `access_admin:assign_roles` | Changes user role assignment. | Requires role view. |
| `access_admin:view_roles` | Lists and reads roles and permission grants. | Required for Roles tab. |
| `access_admin:create_role` | Creates custom roles. | Requires permission catalog view. |
| `access_admin:update_role` | Updates role metadata. | Requires role view. |
| `access_admin:delete_role` | Deletes unused custom roles. | Requires role view; cannot delete protected/system roles. |
| `access_admin:manage_role_permissions` | Updates permission grants for roles. | Highest RBAC-risk permission; should require audit logging. |
| `access_admin:view_permission_catalog` | Lists available permission definitions. | Required for role editor. |
| `access_admin:manage_allowed_domains` | Reads and updates allowed login/email domains. | Security-sensitive platform policy. |

### 36. Field Builder And Field-Level Access

Purpose: runtime custom field definitions and field-level access policy.

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `field_builder:view_modules` | Lists modules that support custom fields. | Admin review permission. |
| `field_builder:view_definitions` | Lists and reads custom field definitions. | Required by Admin Field Builder. |
| `field_builder:create_definition` | Creates custom field definitions. | Configuration-level permission. |
| `field_builder:update_definition` | Updates custom field definitions. | Configuration-level permission. |
| `field_builder:delete_definition` | Deletes custom field definitions. | High impact because record values may exist. |
| `field_access:view_policies` | Lists field-level permission policies. | Security admin review permission. |
| `field_access:manage_policies` | Creates, updates, or deletes field-level permission policies. | Sensitive-data governance permission. |

Relationship: runtime field values should be governed by the owning feature's create/update permission, not by Field Builder configuration permission.

### 37. Audit, Access Logs, And Change Control

Purpose: immutable audit logs, access logs, configuration-change workflow, validation, publishing, and rollback.

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `audit:view_audit_logs` | Lists and reads audit logs. | Security/audit review permission. |
| `audit:export_audit_logs` | Exports audit logs. | Requires audit log view; high data exposure. |
| `audit:view_access_logs` | Lists and reads access logs. | Security/audit review permission. |
| `audit:export_access_logs` | Exports access logs. | Requires access log view; high data exposure. |
| `change_control:view_changes` | Lists and reads configuration changes. | Admin review permission. |
| `change_control:create_change` | Creates configuration change records. | Used to propose changes. |
| `change_control:validate_change` | Validates proposed configuration change. | Should be separable from creator for segregation of duties. |
| `change_control:publish_change` | Publishes validated configuration change. | High impact; should require validation first. |
| `change_control:rollback_change` | Rolls back published configuration change. | High impact; should audit rationale. |

### 38. Platform Health And Job Operations

Purpose: system health, job logs, error logs, and operational troubleshooting.

| Permission | Justification | Dependencies |
| --- | --- | --- |
| `platform_ops:view_system_health` | Reads system health. | Operational admin permission. |
| `platform_ops:view_job_logs` | Lists background job logs. | Operational troubleshooting. |
| `platform_ops:view_error_logs` | Lists error logs. | Sensitive operational troubleshooting. |
| `platform_ops:run_manual_jobs` | Runs manual jobs such as KYC pending jobs, SLA evaluation, retention policy run, or report schedule run when paired with feature-specific run permission. | Requires matching feature-specific job permission. |

## Permissions Not Recommended

The following current generic permissions should not be generated for every section:

- `approve`: only onboarding drafts, KYC drafts, and imported integration items currently have approval/rejection workflows.
- `assign`: only ownership, onboarding owners, task owners, and similar owner fields need explicit assignment permissions.
- `configure`: should be replaced by specific `manage_*` actions for each configuration surface.
- `delete`: should be `archive_*`, `deactivate_*`, `delete_*`, or `remove_*` depending on actual behavior.
- `export`: should exist only for reports, audit/access logs, handover PDF, and other real export operations.

## UI Redesign Requirements For Roles & Permissions Tab

- Group permissions by the proposed sections above, with section purpose text visible in the role editor.
- Show action labels and descriptions from permission metadata, not just raw action slugs.
- Show dependency chips such as `Requires accounts:view_assigned` or `Requires tasks:create_task`.
- Warn when selecting a permission without dependencies; optionally offer to add dependencies automatically.
- Provide filters for "Operational", "Configuration", "Sensitive Data", "AI", "Admin", and "Export".
- Replace "Select all permissions" with safer presets such as "Portfolio admin", "Account operator", "Read-only leadership", "Integration admin", and "Custom".
- Include a "granted count by risk" summary instead of a single grant count.
- Disable protected setup role editing where required, but do not hide permission behavior behind role titles.

## Implementation Notes

- Implemented an explicit backend catalog in `backend/app/rbac_catalog.py` with section metadata, action labels, descriptions, dependencies, tags, risk level, and display order.
- Added additive permission metadata columns and a SQL migration. Existing generic permission rows are removed during seed because this project has no production/customer data dependency.
- `RbacService.seed_defaults()` now seeds from the catalog, removes non-catalog permission rows and their grants, and preserves custom roles.
- Added `GET /api/users/me/capabilities` and frontend capability loading after auth.
- Replaced title-based service gates across account access, onboarding, KYC, dashboards, reports, analytics, timeline, playbooks, tasks, signals, governance, escalations, opportunities, retention, AI, notifications, and stakeholder controls.
- Redesigned the Admin Roles tab around catalog sections, metadata, dependency assistance, risk/category summaries, and permission presets.
- Kept `super_admin` protected/hidden as setup behavior, not as the general authorization model.

## Migration Strategy

1. Existing local/team database: run `make seed`.
2. Fresh local/team database: run `make reset-db`.
3. Do not run both for the same setup path.
4. `make seed` is the clean-break upgrade path: it removes old generic permission rows and grants before applying the new catalog defaults.

## Test Notes

- `python3 -m compileall backend/app`
- `docker compose run --rm --no-deps backend pytest tests/test_rbac.py`
- `docker compose run --rm --no-deps backend pytest tests/test_account_workspace.py tests/test_kyc_ai_extraction.py`
- `docker compose run --rm --no-deps backend pytest tests/test_rbac.py tests/test_notifications_dashboards_reporting.py tests/test_scoring_signals_playbooks_tasks.py tests/test_timeline_and_handover.py tests/test_content_escalations_governance.py tests/test_playbooks_tasks_calendar.py`
- `docker compose run --rm --no-deps frontend npm run typecheck`
- `docker compose run --rm --no-deps frontend npm test -- AdminRolesPanel.test.tsx Admin.test.tsx Tasks.test.tsx TimelineFeed.test.tsx AddNoteModal.test.tsx KYCAssistedReview.test.tsx`
