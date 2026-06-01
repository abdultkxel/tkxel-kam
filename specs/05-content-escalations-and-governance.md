# Feature Specification: Content Escalations And Governance

## Feature Overview

Support client education content, shared-content history, manual escalation workflows, escalation notifications, governance events, agenda drafts, and governance AI briefs.

## Business Goal

Improve account governance and client engagement by linking content, escalation management, and executive review activity into the account timeline and decision record.

## User Roles

- Account Manager / KAM
- KAM Head / VP
- Ops Lead
- Leadership Viewer / Executive
- Content Specialist
- Admin
- Platform

## User Stories Covered

- Story 12.1 - Content catalog and recommendations
- Story 12.2 - Sent-content history
- Story 13.1 - Manual escalation workflow
- Story 13.2 - Escalation notifications and deduplication
- Story 14.1 - Governance event management
- Story 14.2 - Source-backed agenda and governance AI brief

## Source Traceability

- PRD V3-FR-057 - Lightweight client education catalog through manual entries, uploaded files, or linked URLs; content must be findable without relying on a third-party external content system integration.
- PRD V3-FR-059 - Content recommendations based on account stage, opportunity, service gap, signal, or weak metric; recommendations require user action before sharing is recorded.
- PRD V3-FR-060 - Sent-content history with content name, date, sender, recipient, account, engagement, follow-up status, and timeline link.
- PRD V3-FR-061 - Manual formal escalation creation with account/engagement, severity, owner, impact, SLA, and summary.
- PRD V3-FR-062 - Escalation severity and priority classified using configurable rules while preserving human ownership.
- PRD V3-FR-064 - Escalation mitigation, recovery actions, communication cadence, Watchlist, and resolution summary; closure requires evidence or authorized override.
- PRD V3-FR-065 - Major escalations require RCA stored with the escalation and linked from timeline.
- PRD V3-FR-066 - Structured escalation notification metadata, Admin/KAM Head notification log, source escalation link, and duplicate suppression within the same SLA window.
- PRD V3-FR-067 - Governance scheduling for QBRs, SteerCos, monthly reviews, and executive reviews.
- PRD V3-FR-068 - Source-backed editable governance agenda drafts from health, signals, opportunities, activities, escalations, and recent timeline.
- PRD V3-FR-069 - Governance notes, decisions, and action items create timeline entries and feed handover summary.
- PRD V3-FR-070 - Google Calendar/Fathom can create or enrich governance events where configured using account tagging/mapping and deduplication.
- PRD V3-FR-082/V3-FR-083 - Notifications and SLA escalation apply to unresolved formal escalations, among other item types, with independent inactivity windows and qualifying activity timer resets.
- PRD V3-FR-099/V3-FR-100 - Google Calendar and Fathom adapters support governance scheduling, meeting summaries/transcripts, review, approval, deduplication, and timeline writes.
- PRD V3-FR-140/V3-FR-141 - Governance AI Brief action on detail view with pre-meeting summary and inline openable citations to source timeline events, signals, opportunities, and escalations.

## Existing Frontend Design Alignment

- Account 360 already exposes `Education` and `Governance` tabs backed by mock/local stores; implementation must replace local-only state with backend APIs while preserving the card/list visual style.
- `AccountWorkspacePanel` contains an `Escalation` branch, but Account 360 does not currently expose an Escalation tab; implementation must wire escalation visibility from Account 360 and/or provide a first-class escalation workspace.
- `/governance` already exists as a calendar-style workspace with account filters, score activity/renewal toggles, iCal export, event drawer, and AI brief button; backend integration should preserve this layout and add API-backed loading, empty, error, pagination/list behavior, and citations.
- Sidebar navigation currently omits Governance even though `/governance` exists; role-appropriate navigation must expose Governance if it is treated as a first-class workspace.
- Current client education upload text says file is not persisted; implementation must replace this with persisted content catalog/sent-content behavior and avoid implying content was sent until a share action is completed.
- Existing `EscalationLog` is timeline-only and not connected to an escalation entity; implementation must introduce persisted escalation records and link timeline entries back to escalation detail.
- Content catalog is an Admin submodule/tab. Account 360 loads account-specific recommendations and sent history only when the Education tab is opened.
- Governance and Escalations are first-class sidebar modules with role-appropriate navigation and operational list/detail pages.

## Data Entities

- `content_items`: catalog assets with title, description, type, category/tags, service lines, account stages, active state, source kind, file/link metadata, popularity/share count, created/updated actors, and timestamps.
- `sent_content_records`: account-level share history with account, optional engagement, content snapshot, sender, recipient name/email, shared date, follow-up status/due date, notes, timeline entry, and timestamps.
- `content_recommendations` or computed recommendation DTOs: recommended content, rationale, source signal/opportunity/metric/stage, relevance score, and no persisted sent status until user shares.
- `escalations`: formal manually created escalation records with account, optional engagement, summary, impact, severity, priority, status, owner, SLA due, Watchlist flag, mitigation, recovery actions, communication cadence, resolution, RCA, closure evidence, override reason, and timestamps.
- `escalation_updates`: paginated status/ops/client communication updates with update type, body, actor, created timestamp, and optional attachments/evidence references.
- `escalation_notifications`: notification metadata with escalation, recipient, channel, trigger, reason, SLA window key, delivery status, deduplication key, retry metadata, and timestamps.
- `governance_events`: QBR/SteerCo/monthly review/executive review records with account, optional engagement, owner, type, source, external event ID, date/time, status, agenda, notes, attendees, and timestamps.
- `governance_decisions`: decision text, owner/actor, source event, timeline entry, and timestamps.
- `governance_action_items`: owner, due date, status, priority, source event, completion metadata, and timestamps.
- `governance_source_citations`: source module/entity/route/excerpt for agenda drafts and AI briefs.
- `governance_recurrence_rules`: configurable recurrence templates for governance events with cadence, interval, weekday/month/day constraints, end policy, and active state.
- `integration_connections`: Google Calendar and Fathom connection/config records with provider, status, credentials reference, sync settings, last sync, and error metadata.
- `integration_sync_logs`: provider sync attempts, source record IDs, action taken, deduplication result, errors, and timestamps.

## Functional Requirements

- Maintain client education content catalog using manual entries, uploaded files, and linked URLs.
- Content catalog must be self-contained for MVP and must not depend on a third-party content management integration.
- Recommend content based on account stage, opportunity, service gap, signal, or weak metric.
- Show recommendation rationale and source context; recommendation does not create sent-content history until the user confirms share/send.
- Track content shared with clients and link to timeline.
- Manually create and manage formal escalations.
- Classify severity and priority using configurable rules while preserving human-owned final severity/priority decisions.
- Track escalation severity, priority, owner, SLA, impact, summary, mitigation, Watchlist, resolution, RCA, and notifications.
- Preserve escalation operations updates, client communication cadence, and resolution history.
- Reset escalation inactivity/SLA timers on qualifying updates and closure activity according to notification/SLA configuration.
- Suppress duplicate escalation notifications within the same SLA window.
- Schedule and manage QBRs, SteerCos, monthly reviews, and executive reviews.
- Governance event sources must distinguish manual, Google Calendar, Fathom-enriched, imported, and review-required records.
- Governance recurrence is required in this phase and must be configurable through Admin without code changes.
- Capture governance agendas, notes, decisions, action items, attendees, and status.
- Generate source-backed governance agenda drafts.
- Generate governance AI briefs with inline openable citations and non-dismissible AI disclaimer.
- Store content catalog metadata in the database. Store uploaded files locally for this phase behind a configurable storage adapter so S3 can replace local storage later.
- Fully integrate Google Calendar and Fathom where credentials are configured; when credentials are absent, the integration layer must report configuration-required status without blocking manual governance workflows.

## Non-Functional Requirements

- Formal escalations remain human-owned and are never auto-created by AI.
- Integration enrichment from Calendar/Fathom must be deduplicated and reviewed where configured.
- Governance and escalation pages must be resilient to partial module failures.

## Permissions & Authorization

- Content Specialist/Admin manage catalog.
- Content Specialist/Admin manage catalog and can share content for authorized accounts.
- KAM shares content and manages sent-content history for authorized accounts.
- KAM/KAM Head create and manage escalations.
- Ops Lead escalation status/update rights are controlled by RBAC.
- KAM/KAM Head manage governance events.
- Leadership Viewer views authorized content history, escalations, decisions, and governance records.
- Admin/KAM Head configure severities, SLAs, governance types, governance recurrence rules, integration settings, and notification rules.

## Validation Rules

- Content requires title, type, tag/category, and file or URL.
- URL must be valid; file uploads must pass configured validation.
- Content `delete` behaves as archive/inactivation when sent history exists; historical shares retain content title/type snapshot.
- Shared content requires content, sender, date, recipient, and account.
- Escalation requires account/engagement, severity, owner, impact, SLA, and summary.
- Escalation status defaults: open, watchlist, mitigated, resolved, closed, reopened, cancelled.
- Escalation severity defaults: low, medium, high, critical; `critical` and configurable `major` thresholds require RCA at closure.
- Closure requires resolution summary and evidence.
- Major escalations require RCA.
- Override closure requires authorized role and reason.
- Default SLA targets follow common IT escalation practice unless overridden in Admin: critical = 4 hours, high = 1 business day, medium = 3 business days, low = 5 business days.
- Qualifying escalation activity resets inactivity timers when it is a status change, owner change, mitigation/recovery update, client communication update, evidence upload, closure, reopen, or explicit operations update.
- Governance event type defaults: QBR, SteerCo, Monthly Review, Executive Review.
- Governance event status defaults: draft, scheduled, completed, overdue, cancelled.
- Governance event requires account, governance type, date/time, status, and owner.
- Governance completion requires notes/decisions where configured.
- Recurrence rules require cadence, start date, owner, governance type, account scope, and end policy.
- Action items require owner and due date.
- Sent-content recipient email must be valid where captured.
- AI brief requires authorized source retrieval.
- Google Calendar events require external event ID, source calendar, account mapping confidence, and deduplication key when synced.
- Fathom notes require source transcript/summary ID and explicit review status unless auto-approval is configured.

## Search Requirements

- Search content by title, description, and tag.
- Search sent-content by content name and recipient.
- Search escalations by summary, impact, RCA, and update text.
- Search governance agendas, notes, decisions, and action items.
- Search notification logs by escalation/source ID and reason.

## Filter Requirements

- Content: tag, service line, account stage, type, active state.
- Sent-content: date range, sender, recipient, content tag, follow-up status, engagement.
- Escalations: account, engagement, severity, priority, owner, status, SLA, Watchlist, created date.
- Notification logs: recipient, channel, trigger, escalation, delivery status, date range.
- Governance: account, engagement, type, status, date range, owner, attendee.
- Governance source filters: manual, Google Calendar, Fathom-enriched, unmapped/review required where applicable.
- Admin recurrence filters: cadence, governance type, active state, owner, account/segment scope.
- Admin integration filters: provider, status, last sync state, error state.

## Sort Requirements

- Content: name, updated date, popularity/relevance.
- Sent-content: shared date, follow-up status.
- Escalations: severity, SLA due, created date, updated date.
- Notification logs: timestamp newest first.
- Governance: event date, status, updated date.

## Pagination Requirements

- Content catalog is paginated.
- Sent-content history is paginated.
- Escalation list and update history are paginated.
- Escalation communication/resolution history is paginated.
- Notification logs are paginated.
- Governance list, notes, decisions, and action-item history are paginated where records grow; calendar supports date navigation.

## API Requirements

- `GET /api/content`
- `POST /api/content`
- `PATCH /api/content/{content_id}`
- `DELETE /api/content/{content_id}`
- `GET /api/accounts/{account_id}/content-recommendations`
- `GET /api/accounts/{account_id}/sent-content`
- `POST /api/accounts/{account_id}/sent-content`
- `PATCH /api/sent-content/{sent_content_id}`
- `GET /api/escalations`
- `POST /api/escalations`
- `GET /api/escalations/{escalation_id}`
- `PATCH /api/escalations/{escalation_id}`
- `POST /api/escalations/{escalation_id}/updates`
- `GET /api/escalations/{escalation_id}/updates`
- `POST /api/escalations/{escalation_id}/close`
- `POST /api/escalations/{escalation_id}/reopen`
- `GET /api/escalations/{escalation_id}/notifications`
- `GET /api/admin/notification-log`
- `POST /api/escalations/{escalation_id}/notifications/test`
- `GET /api/governance-events`
- `POST /api/governance-events`
- `GET /api/governance-events/{event_id}`
- `PATCH /api/governance-events/{event_id}`
- `POST /api/governance-events/{event_id}/complete`
- `POST /api/governance-events/{event_id}/agenda-draft`
- `PATCH /api/governance-events/{event_id}/agenda`
- `POST /api/governance-events/{event_id}/ai-brief`
- `GET /api/governance-events/{event_id}/decisions`
- `POST /api/governance-events/{event_id}/decisions`
- `GET /api/governance-events/{event_id}/action-items`
- `POST /api/governance-events/{event_id}/action-items`
- `PATCH /api/governance-action-items/{action_item_id}`
- `GET /api/admin/content`
- `GET /api/admin/governance-recurrence-rules`
- `POST /api/admin/governance-recurrence-rules`
- `PATCH /api/admin/governance-recurrence-rules/{rule_id}`
- `DELETE /api/admin/governance-recurrence-rules/{rule_id}`
- `GET /api/admin/integrations`
- `PATCH /api/admin/integrations/{provider}`
- `POST /api/admin/integrations/{provider}/sync`
- `GET /api/admin/integrations/sync-logs`

## UI Requirements

- Content catalog list/detail, upload/link form, content picker, recommendation cards, share/send dialog, and sent-content table.
- Admin Content tab must show the content catalog and lazy-load its API data when the tab is selected.
- Account 360 Education tab must show recommendations separately from sent history and display sent-content timeline links.
- Escalation create/edit form and detail page with SLA, mitigation, updates, Watchlist, RCA, closure, reopen, and notifications.
- Account 360 must expose account escalations as a dedicated tab/section or deep-linked workspace, not only timeline entries.
- Sidebar must expose Escalations as a first-class module for authorized users.
- Governance calendar/list and detail page with agenda, attendees, notes, decisions, action items, and status.
- Governance should remain reachable as a first-class workspace (`/governance`) from role-appropriate sidebar navigation/dashboard actions; escalation and content detail must also deep-link back to Account 360.
- Governance workspace must preserve calendar design with account filters, governance/score/renewal toggles, detail drawer, iCal export, and add API-backed list/search/pagination behavior.
- Admin must expose configurable governance recurrence rules and integration health/settings for Google Calendar and Fathom.
- Agenda generation and AI Brief actions with inline openable citation display and non-dismissible disclaimer.

## Loading States

- Content recommendation loading.
- Sent-content history loading.
- Escalation detail/update loading.
- Escalation notification delivery/loading.
- Governance event detail loading.
- Agenda/AI brief generation loading.

## Empty States

- No content in catalog.
- No content recommendations.
- No sent-content history.
- No active escalations.
- No escalation notifications.
- No governance events.
- Empty agenda before manual entry or generation.

## Error States

- Content source unavailable.
- Invalid URL or file upload failure.
- Local file storage unavailable or configured storage adapter failure.
- Escalation closure blocked by missing evidence/RCA.
- Duplicate notification suppressed.
- Google Calendar OAuth/configuration missing, revoked, or insufficient scopes.
- Fathom API key missing, revoked, rate-limited, or meeting/transcript unavailable.
- Governance sync conflict.
- Agenda/AI brief generation failure or insufficient source data.

## Edge Cases

- Inactive content remains in sent history.
- Recommendation does not imply content was sent.
- Severity recommendation does not override human decision.
- Formal escalations are never auto-created by AI.
- Notification preferences apply unless mandatory escalation policy overrides.
- Fathom notes require review or configured approval before timeline write.
- AI brief cannot create decisions or action items automatically.
- Reopened escalations preserve prior closure evidence, RCA, and timeline history.
- Cancelled governance events preserve decisions/action items already captured and prevent completion unless reopened/rescheduled.
- Synced governance events with weak account mapping are held in review-required state and excluded from authoritative timeline until approved.
- Content recommendations can become stale if account stage/opportunity/signal context changes; stale recommendations should be refreshed or labeled.
- Recurring governance generation must avoid duplicate events when a rule is edited or re-run.
- Google Calendar/Fathom retries must not duplicate governance events, decisions, notes, or action items.

## Missing Requirements

- Content taxonomy and required tags are not fully specified.
- Escalation status lifecycle values are not fully enumerated.
- Major escalation threshold is not defined.
- Governance event status values and recurrence rules are not specified.
- AI brief prompt/configuration controls are not specified.
- Malware/type scanning policy for uploaded content is not specified.

## Ambiguous Requirements

- Governance completion requirements vary "where configured" but defaults are absent.
- Exact Google Workspace OAuth app ownership, consent mode, redirect URI, calendar scope, and tenant approval process are environment-specific.
- Exact Fathom account API key, webhook secret, and meeting ownership model are environment-specific.

## Conflicting Requirements

- No explicit conflict, but governance events may be created manually or by Google Calendar; source-of-truth behavior needs definition.
- Frontend currently has `/governance` route but no sidebar navigation item; implementation must decide whether to expose it as first-class navigation per this spec.
- Frontend currently has an Escalation panel branch but no Account 360 Escalation tab; implementation must reconcile the UI surface with PRD escalation requirements.

## Unspecified Edge Cases

- Duplicate content entries.
- Escalation reopening after closure.
- Governance event cancellation/rescheduling.
- Recipient handling for shared content without email.
- Sensitive Fathom transcript handling and redaction.
- Expired Google OAuth refresh tokens during scheduled sync.
- Fathom meeting summary exists but transcript is unavailable.

## Audit/Logging Requirements

- Audit content create/update/delete and shared-content records.
- Timeline sent-content events where configured.
- Audit escalation create/update, severity changes, Watchlist changes, updates, closure, override, and RCA.
- Log escalation notifications with recipient, channel, timestamp, source escalation, reason, and delivery state.
- Audit governance event creation/update/completion, notes, decisions, action items, agenda generation, and AI brief generation.
- Timeline escalation and governance material events.

## Test Scenarios

- Create content item with uploaded file and URL.
- Recommend content and verify user action required before sent history is created.
- Record sent content and verify timeline link.
- Create escalation with required fields.
- Block escalation closure without evidence.
- Require RCA for major escalation.
- Add Ops update to escalation.
- Suppress duplicate escalation notification within same SLA window.
- Schedule governance event and complete with notes/actions.
- Generate source-backed agenda draft.
- Generate governance AI brief and verify citations/disclaimer.
- Verify Leadership Viewer cannot edit escalation/governance records.

## Acceptance Criteria

- Content, escalation, and governance workflows are source-linked, auditable, and permission-aware.
- Escalations are manually created and cannot close without required evidence.
- Governance outputs can be generated but remain editable and human-owned.
- All list views support required search, filters, sorting, and pagination.

## Implementation Status

### Completed Items

- Backend data models are implemented for content catalog, sent-content history, escalations, escalation updates, escalation notifications, governance recurrence rules, governance events, decisions, action items, source citations, integration connections, and integration sync logs.
- Backend API routes are implemented and Swagger-documented for content catalog CRUD/archive, content upload, recommendations, sent-content history, escalation lifecycle, escalation updates, escalation notifications, notification logs, governance events, agenda drafts, AI briefs, decisions, action items, recurrence rules, integrations, and sync logs.
- Repository and service patterns are implemented for content, escalation, governance, storage, and runtime Field Builder support.
- RBAC authorization checks are implemented for content, escalation, governance, notification, recurrence, integration, and runtime custom-field APIs.
- Validation rules are implemented for required content fields, valid URLs, uploaded file MIME/size checks, sent-content recipient email, escalation required fields, escalation closure evidence, critical escalation RCA, governance event required fields, recurrence scope/end-policy rules, action item owner/due date, and Field Builder custom values.
- Content catalog supports URL, manual, and uploaded-file sources. Uploaded files are stored locally through a configurable storage adapter.
- Admin Content UI supports catalog list/search/pagination, URL/manual/file creation, runtime Field Builder fields, loading/empty/error states, and delete/archive confirmation.
- Account 360 Education tab loads backend content recommendations and sent-content history, and only records sent-content history after confirmed share action.
- Sent-content history is stored in the same backend schema as manual sharing and includes timeline linkage.
- Escalation backend supports create, read, update, updates history, close, reopen, notification test queueing, duplicate suppression, notification log filters/search, audit logging, and timeline writes.
- Escalation list UI is implemented as a first-class sidebar module with cards, create form, search, severity/status filters, pagination, loading/empty/error states, close/reopen actions, success/failure messages, and runtime Field Builder fields.
- Account 360 exposes account escalations in a dedicated tab backed by backend escalation data.
- Governance backend supports events, agenda drafts, AI briefs with citations/disclaimer, decisions, action items, completion validation, recurrence rules, integration connections, integration sync, deduplication, review-required weak mapping, audit logging, and timeline writes.
- Governance workspace remains available at `/governance`, is exposed in sidebar navigation, and preserves the existing calendar design with account filter, toggles, detail drawer, iCal export, loading/empty/error states, and API-backed event loading.
- Admin Governance UI supports recurrence rule creation/listing and Google Calendar/Fathom integration status/sync actions.
- Field Builder impacts this module family: `client_education_content`, `escalation_management`, and `governance_reviews` runtime fields render on supported create forms and persist to `custom_field_values`.
- Automated backend tests cover happy path, validation, authorization, pagination, search/filter behavior, content upload, sent history, timeline/audit writes, escalation closure/RCA, duplicate notification suppression, governance recurrence, governance pagination, cancelled-event completion guard, integration configuration-required behavior, integration dedupe, and runtime custom fields.
- Automated frontend tests cover Escalations list/create/filter flow and Admin Content file upload with runtime Field Builder values.

### Remaining Items

- Full Google Calendar OAuth consent/callback UI and scheduled background sync are not implemented. Current integration supports configured credentials/sample records and manual sync only.
- Live Google Calendar/Fathom sync has not been verified with real provider credentials, tenant scopes, rate limits, revoked credentials, or production webhooks.
- Fathom transcript redaction, retention, and approval workflow are not fully specified or implemented beyond review-required source handling.
- Escalation frontend detail/edit screen is not fully implemented for update history, communication cadence history, RCA editing, notification log display, and notification delivery inspection.
- Governance frontend does not yet provide full CRUD screens for backend decisions and action items. Backend APIs exist and are tested.
- AI brief citations are generated and returned by the backend, but the frontend brief UI does not yet render each citation as an inline openable source link.
- Admin configuration for escalation severity/priority rules, SLA targets, major escalation threshold, governance completion rules, and notification rules is not implemented as configurable UI yet.
- Notification delivery is metadata/queue-oriented only. Real email/Slack/in-app delivery workers and retry execution are not implemented.
- Malware/virus scanning for uploaded content is not implemented because the scanning policy remains unspecified. Current implementation uses MIME allow-list and size limits.
- Content duplicate detection and taxonomy governance are not fully implemented because required content taxonomy is not specified.

### Technical Notes

- Local content files are intentionally ignored by git via `backend/storage/`; metadata remains in database tables.
- S3 migration is prepared through `CONTENT_STORAGE_BACKEND`, `S3_BUCKET_NAME`, and `S3_REGION`, but only the local adapter is implemented.
- Default escalation SLA targets follow the spec assumption: critical = 4 hours, high = 1 business day, medium = 3 business days, low = 5 business days.
- Integration sync creates review-required governance events when account mapping confidence is weak or missing.
- Sync deduplication uses provider/source record IDs and writes per-record sync logs for created, skipped, and duplicate records.
- Verified test commands after implementation: `backend/.venv/bin/pytest backend/tests -q` passed with 30 tests, `npm test -- --run` passed with 25 tests, and `npm run build` passed with the existing Vite chunk-size warning.

## Cross-Module Trace Note: Playbooks, Tasks, And Calendar

- Governance calendar source context must include playbook-generated tasks, manually created tasks, task due dates, SOW expiry dates, renewal dates, and notice deadlines alongside governance events and governance action items.
- Governance calendar and AI/context surfaces must preserve permission-aware source links for playbook tasks, task evidence, renewal/SOW source records, and governance records.
- Recommendation-created playbook activities require explicit user confirmation through playbook execution and must not silently create governance records or task records.
- Task evidence and task completion events should remain timeline/audit visible where the user has account and module access.
- Renewal and playbook calendar items are projections from their source modules; governance should not duplicate or mutate those source records when displaying calendar context.
