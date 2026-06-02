# Feature Specification: Timeline And Handover

## Feature Overview

Provide a source-linked chronological account/engagement timeline, manual notes, event type configuration, retention/tombstone policies, and source-backed handover summaries.

## Business Goal

Preserve institutional memory across account activity and ownership changes while enforcing RBAC, sensitivity, retention, and audit requirements.

## User Roles

- Account Manager / KAM
- KAM Head / VP
- Leadership Viewer / Executive
- Admin
- Ops Lead
- Commercial Stakeholder
- Delivery Stakeholder
- Platform

## User Stories Covered

- Story 15.1 - Source-linked chronological timeline
- Story 15.2 - Manual timeline notes and event type configuration
- Story 15.3 - Timeline retention and deletion policy
- Story 16.1 - Source-backed handover summary

## Clarified Implementation Decisions

- AI Timeline Search is in scope for this feature and must be implemented as part of Timeline and Handover.
- Handover export/share supports PDF export and internal share links.
- Timeline comments/annotations are editable and deletable by authorized users.
- Critical event defaults for the software services domain include escalations, delivery delays, severe delivery health deterioration, severe account health/score drops, missed renewal/notice deadlines, executive decisions, governance decisions, approval decisions, and high-severity client risks. Admin-configurable critical rules may be added later.
- Retention must support both Admin/RBAC-authorized manual execution and a local scheduled background worker.
- Existing frontend mock timeline data can be replaced by server-backed data; mock data may remain only as a development fallback when the backend is unavailable.

## Functional Requirements

- Maintain account and engagement timelines from creation onward.
- Timeline must be part of Account Overview / Account 360 and not a disconnected module.
- Engagement timeline events must appear in both Engagement 360 and the parent Account Timeline.
- Automatically create events for account setup, document upload, AI extraction, KYC, scores, stages, signals, tasks, opportunities, content, escalations, governance, approvals, executive decisions, integrations, and AI usage.
- Link entries to source records, including account, engagement, charter, SOW, KYC snapshot, score, signal, task, opportunity, content item, escalation, governance event, approval, AI output, and attachment.
- Source links must degrade gracefully when the source record is archived, restricted, or unavailable.
- Show before/after values for configured key changes, including score, stage, owner, status, threshold, weight, signal status, escalation severity, SOW end date, renewal date, notice deadline, and approval changes.
- Allow manual timeline notes with event type, date, owner, description, mentions, attachments, and sensitivity.
- Manual notes and note comments/annotations must be persisted; frontend-only timeline notes are not sufficient.
- Timeline comments/annotations can be created, edited, and deleted by authorized users while preserving audit history.
- Notify mentioned users where notification policy permits without granting access to restricted content.
- Mentioned users without account access may receive only an allowed notification shell and must not receive restricted note content.
- Configure timeline event types, categories, visibility, retention, active state, and source module.
- Seed a default event type catalog for account setup, KYC update, score change, calculator change, stage change, opportunity event, retention event, client education, escalation event, governance event, approval event, executive event, AI event, manual note, engagement created/updated, SOW terms updated, renewal dates updated, engagement health changed, delivery status changed, and engagement archived.
- Seed default critical event type/rule flags for escalations, delivery delays, severe health or score deterioration, missed renewal/notice deadlines, executive decisions, governance decisions, approval decisions, and high-severity client risks.
- Enforce sensitive-entry rules at the data layer.
- Retain, archive, restrict, or delete eligible entries according to policy.
- Use audit-preserving tombstones for deletion.
- Tombstones must preserve traceability without exposing deleted sensitive content where policy requires redaction.
- Retention policies must support simulation/test action before applying archive/restrict/delete actions.
- Retention action history must be searchable/filterable and paginated.
- Retention policies must run through both an Admin/RBAC-authorized manual action and a local scheduled background worker.
- Generate handover summaries with citations to account data and timeline entries.
- Handover summaries include account, engagements, stage, health, score history, risks, signals, escalations, opportunities, governance, stakeholders, content, decisions, and recent timeline.
- Handover summary generation must be available from Account Overview and from the ownership-change flow.
- Ownership change should require a handover summary and timeline review where configured.
- Handover generation must support selected sections, date windows, and permission-aware source filtering.
- Persist generated handover summaries with generated-by, generated-at, account, ownership-change context, source set, redaction summary, citations, and export/share metadata where supported.
- Handover summaries support PDF export and internal share links only unless future requirements add more formats.
- Users can open cited sources from the handover view when authorized.
- AI Timeline Search must support structured timeline intents, semantic fallback, cited results, structured/semantic labels, confidence/disclaimer display, and "Try in KAM AI" handoff with account context and Timeline scope enabled.
- Optional Document Search in Timeline AI Search is off by default and must respect parent timeline/document permissions.
- Timeline writes from integrations must use source hashes or idempotency keys to deduplicate repeated external events before persistence.

## Non-Functional Requirements

- Latest 100 timeline entries load within 3 seconds.
- Account timelines support 10,000+ entries.
- Keyword timeline search should return standard results within 5 seconds for authorized records.
- Unauthorized users receive no hints that restricted entries exist.
- Timeline must remain usable even when source records are restricted or unavailable.
- Account timeline, event type, retention log, and handover history lists must be server-backed; frontend-only stores are acceptable for prototypes only.

## Permissions & Authorization

- Authorized account users view timeline entries allowed by RBAC and sensitivity.
- KAM/KAM Head add manual notes.
- Ops Lead, Commercial Stakeholder, Delivery Stakeholder, and Content Specialist permissions follow module/account access and may view or create timeline entries only where their role grants the underlying account/module permission.
- Admin configures event types and retention policies.
- Admin can simulate, apply, and audit retention policy actions.
- Admin and any explicitly authorized RBAC role can manually run retention; the scheduled worker must execute as a system actor and produce the same audit trail.
- KAM Head/Leadership Viewer generate handover summaries where authorized.
- Account Manager/KAM can generate handover summaries for assigned accounts where configured, but ownership-change handover enforcement may require KAM Head/Admin approval.
- Sensitive entries require explicit permission; mentions do not grant access.
- AI Timeline Search and handover generation must apply the same RBAC and sensitivity filters as normal timeline reads.

## Validation Rules

- System event requires event type, source module, source record, actor/system actor, and timestamp.
- Manual note requires event type, date, owner, and description.
- Event type must be active for new manual notes.
- Manual note owner must be an active authorized user for the account.
- Manual note description must be length-limited and sanitized for safe display.
- Mention IDs must reference active users; notification payloads must be redacted when recipients lack timeline access.
- Attachment URLs/files must pass existing attachment validation and inherit note sensitivity unless a stricter policy applies.
- Comment/annotation edit or delete requires author ownership, Admin permission, or another explicit timeline moderation permission.
- Sensitive flag requires permitted sensitivity level.
- Retention action requires reason and policy reference.
- Critical event types cannot be hard deleted.
- Critical status is derived from configured critical flags/rules, with software-services defaults applied until custom rules are added.
- Retention simulation requires policy, entity type, and target window.
- Tombstone creation requires original event ID, policy reference, actor/system actor, timestamp, and redacted deleted metadata.
- Handover generation requires account access.
- Handover generation request must validate selected sections, date window, ownership-change reference, and export/share option when provided.
- Handover export accepts PDF only; handover share accepts internal share link only.
- AI Timeline Search requires non-empty query, account access, allowed scopes, and bounded result size.

## Search Requirements

- Keyword search across authorized event text and metadata.
- Search event types and manual notes.
- Search handover summaries by account, generated by, and section text.
- AI Timeline Search supports structured intent recognition for escalation history, stage changes, score changes, last 90 days of activity, approval events, content sent, activity since last QBR, and open timeline-linked risks.
- Semantic timeline/document fallback searches notes, timeline text, charters, SOWs, attachments, and uploaded/linked documents where authorized.

## Filter Requirements

- Timeline filters: event type, date range, owner, module, account stage, risk status, opportunity, escalation, governance activity, signal, sensitivity.
- Event type filters: active state, category, module.
- Retention log filters: entity type, retention action, active state, actor, reason.
- Handover filters: generated date, generated by, ownership change.
- AI Timeline Search filters: recognized intent, date range, source module, source type, semantic/structured mode, and document search toggle.

## Sort Requirements

- Timeline default sorting: newest first by event date/time; oldest first optional.
- Event types sorted by display order/name.
- Retention logs sorted newest first.
- Handover history sorted newest first.
- AI Timeline Search results sorted by structured intent relevance first, then semantic/text relevance, then recency.

## Pagination Requirements

- Timeline is cursor or page paginated with latest 100 entries optimized.
- Event type list is paginated for large configurations.
- Retention logs are paginated.
- Handover history is paginated.
- Timeline comments/annotations are paginated or capped per entry with a "load more" control.
- AI Timeline Search results and document result chunks are paginated or capped with "load more".

## API Requirements

- `GET /api/accounts/{account_id}/timeline`
- `GET /api/engagements/{engagement_id}/timeline`
- `GET /api/timeline-events/{event_id}`
- `POST /api/accounts/{account_id}/timeline-notes`
- `PATCH /api/timeline-events/{event_id}`
- `POST /api/timeline-events/{event_id}/comments`
- `GET /api/timeline-events/{event_id}/comments`
- `PATCH /api/timeline-events/{event_id}/comments/{comment_id}`
- `DELETE /api/timeline-events/{event_id}/comments/{comment_id}`
- `GET /api/admin/timeline-event-types`
- `POST /api/admin/timeline-event-types`
- `PATCH /api/admin/timeline-event-types/{type_id}`
- `GET /api/admin/retention-policies`
- `POST /api/admin/retention-policies`
- `PATCH /api/admin/retention-policies/{policy_id}`
- `POST /api/admin/retention-policies/{policy_id}/simulate`
- `POST /api/admin/retention-policies/{policy_id}/run`
- `GET /api/admin/retention-actions`
- `POST /api/timeline-events/{event_id}/archive`
- `POST /api/timeline-events/{event_id}/restrict`
- `DELETE /api/timeline-events/{event_id}`
- `POST /api/accounts/{account_id}/handover-summary`
- `GET /api/accounts/{account_id}/handover-summaries`
- `GET /api/handover-summaries/{summary_id}`
- `POST /api/handover-summaries/{summary_id}/export`
- `POST /api/handover-summaries/{summary_id}/share`
- `POST /api/accounts/{account_id}/timeline/ai-search`

## Database/Storage Requirements

- Timeline entries must be persisted in the database with account, optional engagement, event type, source module, source record, source route, actor/system actor, event timestamp, before/after values, sensitivity, sensitivity level, tags, metadata, immutable flag, archived/restricted/deleted status, and retention policy reference.
- Timeline event type configuration must be persisted with slug/key, display name, category, module, color/display order, default visibility, retention policy reference, active state, critical flag, and in-use protection.
- Manual note comments/annotations must be persisted separately from timeline entries with entry ID, author, body, mentions, sensitivity inheritance, and created/updated timestamps.
- Timeline note attachments must be persisted or linked through the existing attachment/storage mechanism with inherited sensitivity.
- Retention policies must be persisted with entity type, action, duration/window, active state, reason/template, critical-event behavior, schedule configuration, last/next run timestamps, created/updated actor, and audit metadata.
- Retention action logs and tombstones must be persisted separately from normal timeline entries so deleted restricted content can remain redacted while audit traceability remains intact.
- Handover summaries must be persisted with account, generated by, generated at, ownership-change context, selected sections, source set, redaction summary, citations, content JSON, status, export/share metadata, and immutable snapshot behavior.
- AI Timeline Search requests/results must store audit metadata for query, interpreted intent, scopes, source IDs accessed, user, timestamp, and redactions without storing unauthorized result content.

## UI Requirements

- Account Timeline tab with event cards, filters, search, source links, diff display, and detail drawer.
- Engagement timeline subset.
- Add note modal with event type picker, date, owner, mentions, attachments, sensitivity.
- Admin event type configuration.
- Admin retention policy screen with simulation/test action, action controls, retention logs, and tombstone display.
- Admin retention policy screen must expose manual retention run, scheduled retention status, last run, next run, and run errors.
- Handover summary generation action from Account Overview and ownership-change flow, summary page/drawer, citations, section navigation, history, print/PDF export/internal share controls where permitted, and redaction indicators.
- Account Timeline must use server-backed pagination/infinite loading instead of only local store filtering.
- Account Timeline should preserve the existing virtualized/card design and current filters/search controls from the frontend where possible.
- Timeline AI Search panel with structured-intent suggestions, result cards, source cards, optional Document Search toggle, empty suggestions, loading state, and KAM AI handoff.
- Timeline event detail drawer must expose source metadata, before/after values, comments/annotations, attachments, tombstone metadata, and retention/restriction state where authorized.
- Timeline event detail drawer must allow authorized comment/annotation edit and delete actions.
- Manual note edit/delete controls must be disabled or hidden for immutable/system-generated entries and must use backend authorization for mutable notes.

## Loading States

- Latest timeline loading.
- Additional page loading.
- Source record detail loading.
- Mention suggestions loading.
- Retention simulation/action loading.
- Handover generation loading.
- Handover history loading.
- AI Timeline Search loading.
- Timeline comments/annotations loading.

## Empty States

- No timeline events.
- No manual notes.
- No event types configured.
- No retention policies.
- No handover summaries.
- No timeline comments.
- No AI Timeline Search results.
- No authorized citations for a handover section.

## Error States

- Restricted timeline entry/source record.
- Source record missing.
- Inactive event type selected.
- Retention action prohibited.
- Scheduled retention worker failed.
- Handover generation partially failed.
- Handover source citation restricted or unavailable.
- AI Timeline Search intent unsupported or semantic search unavailable.
- Timeline comment/annotation create denied.
- Export/share denied.

## Edge Cases

- Restricted events are omitted without count/hint.
- Inactive event types remain on historical entries but hidden from new selection.
- Attachments inherit note sensitivity unless stricter policy applies.
- Critical entries use tombstones instead of silent deletion.
- Tombstones must not leak sensitive deleted content to unauthorized users.
- Handover redacts sections where viewer lacks permission.
- Integration duplicates should be deduplicated before timeline write.
- Ownership changes without a generated handover should be blocked or flagged when handover enforcement is enabled.
- AI Timeline Search must not expose restricted result counts, citations, snippets, or document chunks.
- Existing frontend mock/local timeline events must not be treated as source of truth after server-backed timeline is enabled; they may remain only as development fallback data.

## Missing Requirements

- Exact event type catalog is not specified.
- Sensitivity levels are not enumerated.
- Retention durations by entity type are not specified.
- Ownership-change handover enforcement rules and approver flow are not specified.
- AI Timeline Search provider/adapter, semantic index, and document chunking strategy are not fully specified; implementation should use the best available local/backend pattern and coordinate with the AI Assistance feature where reusable.

## Ambiguous Requirements

- Whether users can edit manual timeline notes after creation is not clear.
- Handover summary generation may be AI-assisted or system-assembled; generation method is not fully specified.

## Conflicting Requirements

- No explicit conflict, but deletion support and immutable audit expectations require a strict tombstone policy.

## Unspecified Edge Cases

- Restoring archived/restricted timeline entries.
- Timeline behavior when source entity is hard-deleted by retention.
- Handling mentions of users without access.
- Concurrent note edits.
- Concurrent retention action and note edit.
- Handover summary regenerated after source records change.
- Citation link behavior when the cited source becomes restricted after handover generation.
- Duplicate external integration event with changed payload but same source identifier.

## Audit/Logging Requirements

- Audit automatic event creation source and actor/system actor.
- Audit manual note create/update and sensitivity changes.
- Audit event type configuration changes.
- Audit retention policy changes and every archive/restrict/delete action.
- Audit handover generation, source set, viewer, redactions, and export/share if supported.
- Audit timeline comments/annotations and mention notifications.
- Audit AI Timeline Search query, interpreted intent, accessed source IDs, handoff to KAM AI, and redactions.
- Audit handover export/share attempts and denied attempts.

## Test Scenarios

- Load latest 100 timeline entries under performance target.
- Apply all major timeline filters.
- Search authorized timeline entries.
- Verify restricted entries are omitted without hints.
- Add manual sensitive note and verify permissions.
- Configure inactive event type and verify hidden from new note picker.
- Delete critical event and verify tombstone behavior.
- Generate handover summary and open citations.
- View handover as restricted user and verify redactions.
- Generate handover from ownership-change flow where enforcement is enabled.
- Simulate retention policy and verify no data changes occur.
- Apply archive/restrict/delete retention action and verify audit log plus tombstone behavior.
- Run AI Timeline Search structured intent and semantic fallback with RBAC-sensitive results.
- Use "Try in KAM AI" from Timeline Search and verify query/account context handoff.
- Add a timeline comment with mentions and verify notifications do not leak restricted content.
- Edit and delete a timeline comment and verify permissions plus audit history.
- Attempt to view restricted citation/source record from handover and verify graceful restricted state.
- Export a handover summary as PDF.
- Create and open an internal handover share link with RBAC-sensitive redactions.
- Run retention manually from Admin and verify the same policy behavior as the scheduled worker.
- Execute the scheduled retention worker locally and verify audit logs, tombstones, and no restricted data leakage.

## Acceptance Criteria

- Timeline provides chronological, source-linked, searchable, filterable account history.
- Sensitive and retained entries comply with RBAC and retention policy.
- Handover summaries cite source records and preserve context across ownership changes.
- Performance targets for timeline loading are achievable through pagination.

## Added From Technical Logic Document

- Automatic timeline events must be created for account setup, Charter/SOW upload, AI extraction, KYC draft creation, KYC approval, KYC version creation, score changes, stage/status changes, signal lifecycle events, task/activity creation and completion, opportunities, content shared, escalations, governance events, approvals, executive decisions, integration events, and AI usage.
- Manual timeline events must capture event type, event date, owner/actor, description, mentions, attachments/source links, sensitivity level, account context, optional engagement context, and audit metadata.
- Sensitive entries must be filtered at the backend/data layer before response serialization. Hidden restricted entries must not reveal counts, titles, or hints to unauthorized users.
- Critical timeline event deletion must create a tombstone entry instead of silent removal. Tombstones must retain enough metadata to prove the event existed, who removed/restricted it, when, and why, without leaking restricted content.
- Timeline comments and annotations must be editable/deletable only by authorized users. Edits and deletes require audit history and must not change the source timeline event's immutable business payload.
- AI Timeline Search must support structured intents, semantic/text fallback, account context, source citations, confidence, redaction metadata, and handoff to the global KAM AI panel.
- AI Timeline Search must apply RBAC before retrieval and must not expose restricted source records, hidden-record counts, or citation payloads that the user cannot access.
- Handover summaries must include source sets, citations, redactions, owner/change context, account health, active risks/signals, KYC freshness, renewal posture, governance context, escalations, open opportunities, open tasks, and critical recent timeline events where the user is authorized.
- Handover export formats must include PDF and internal share link. Internal share links must re-check RBAC at view time and must apply redactions based on the viewer, not only the creator.
- Handover generated during ownership transfer must preserve source context and should be required when the configured ownership-change workflow marks handover as mandatory.
- Retention must support both Admin/RBAC-triggered manual run and local scheduled worker execution. Simulation/test mode must show impacted entries without changing data.
- Retention actions must not hard-delete critical events without tombstone/audit behavior. Archive, restrict, and delete outcomes must preserve traceability.
- Duplicate external integration events with the same provider/source identifier must dedupe while allowing changed payloads to create update events when the provider record materially changes.

## Implementation Status

### Completed Items

- Account Timeline is implemented in Account 360 with server-backed timeline loading, latest-page loading state, empty state, error state, pagination/load more, keyword search, event type filter, module filter, owner filter, date filters, sensitivity toggle where authorized, and newest/oldest sorting.
- Engagement timeline subset is implemented through `GET /api/engagements/{engagement_id}/timeline`, with pagination and RBAC/sensitivity filtering.
- Timeline events are persisted with account, optional engagement, event type, module/source context, source route, actor, event timestamp, before/after values, metadata, tags, mentions, attachments, sensitivity, immutable flag, status, retention metadata, source hash, and idempotency key.
- Manual timeline notes are persisted with active event type validation, owner validation, mentions, attachments, sensitivity handling, backend authorization, audit logging, and frontend loading/error/empty states.
- Timeline comments/annotations are persisted separately, can be created/edited/deleted by authorized users, inherit sensitivity from the entry, and are covered by backend tests.
- Timeline event type configuration is implemented in Admin with server-backed list/create/update, search/filter/pagination API, active/inactive handling, default seeded event type catalog, and seeded critical defaults for software-services critical events.
- Sensitive and restricted timeline entries are enforced at the data/API layer; unauthorized users receive no restricted-entry count or hint.
- Retention policies are implemented with persisted policy configuration, simulation, manual run, local scheduled worker, archive/restrict/delete behavior, action history, tombstone creation for deletes, and searchable/filterable/paginated Admin history.
- Handover summaries are generated from authorized account/timeline data with selected sections, optional date window, ownership-change context, source set, citations, redaction metadata, persisted summary history, PDF export, internal share link, and frontend history/loading/error/empty states.
- AI Timeline Search is implemented as a local deterministic backend search with structured intent recognition, semantic/text fallback, optional authorized document search, confidence/disclaimer display, result citations/source routes, and audit metadata.
- Timeline and handover API routes include Swagger/OpenAPI metadata and meaningful error responses for authorization, missing records, validation failures, immutable entries, inactive event types, retention actions, and export/share denial.
- Feature context documentation is created in `docs/features/timeline-and-handover.md` and linked from `docs/features/README.md`.
- Automated coverage exists for timeline notes, search/filter/pagination, sensitive RBAC omission, comment create/edit/delete, owner validation, retention simulation/run/tombstones/action filters, handover generation/history/PDF/share, AI Timeline Search, and engagement timeline sensitive filtering.
- Frontend verification passed for the full existing Vitest suite plus a focused retention history test, and Docker production build passed.

### Remaining Items

- Automatic timeline event creation is broadly wired across backend services, but some frontend prototype paths still use local `emitTimelineEvent`; those paths should be migrated to server-backed timeline writes before they can be considered fully complete.
- Ownership-change handover enforcement is not complete because exact blocking rules, approver flow, and ownership-change workflow integration are still unspecified.
- Production-grade AI Timeline Search semantic indexing, provider/adapter selection, document chunking, and "Try in KAM AI" deep handoff remain future work beyond the tested local deterministic implementation.
- Backend mention notification delivery and notification audit are not fully implemented; frontend uses redacted notification shells only.
- Source record detail drawers and source citation restricted/unavailable UX are partially represented by source routes and graceful omission, but a full source-detail drawer for every source type remains future work.
- Timeline note attachments are stored as structured metadata/URLs with validation; full file upload/storage integration for note attachments remains future work unless existing attachment workflows are explicitly reused.
- Performance target validation for 10,000+ entries and latest 100 entries under 3 seconds has not been load-tested; pagination is implemented to make the target achievable.
- Custom critical-rule builder is not implemented; only seeded critical defaults and event type critical flags are implemented.
- Retention restore/unarchive flows are not implemented because they are listed as unspecified edge cases.

### Technical Notes

- Database changes are additive and represented in `backend/migrations/20260602_timeline_and_handover.sql`; `backend/app/database.py` also includes additive schema sync for local/dev startup.
- Local scheduled retention is controlled by `TIMELINE_RETENTION_WORKER_ENABLED`, `TIMELINE_RETENTION_WORKER_INITIAL_DELAY_SECONDS`, and `TIMELINE_RETENTION_WORKER_INTERVAL_SECONDS`.
- Handover PDF export uses a lightweight built-in PDF generator without adding a new dependency.
- Handover redaction metadata intentionally avoids exposing unauthorized restricted-source counts.
- Field Builder does not directly alter Timeline/Handover forms or persistence; timeline entries can reference source records from modules that have Field Builder values, but timeline/handover does not currently render custom fields itself.
- Verified commands: `docker compose run --rm backend pytest -q tests/test_timeline_and_handover.py`, `docker compose run --rm frontend npm test`, `docker compose run --rm frontend npx vitest run src/components/admin/RetentionJobHistory.test.tsx`, and `docker compose run --rm frontend npm run build`.
