# Timeline And Handover

## Summary

Implements the PRD-backed Account History and Timeline plus source-backed Handover Summary workflows. The feature persists account/engagement timeline entries, manual notes, comments, event type configuration, retention/tombstones, handover summaries, PDF/internal share outputs, and AI Timeline Search audit metadata.

## Scope

- In scope: account timeline APIs, manual notes, comments edit/delete, Admin event types, retention policies, manual/scheduled retention, tombstones, handover generation/history/export/share, AI Timeline Search, server-backed frontend timeline and Admin surfaces.
- Out of scope: final custom critical-rule builder, non-PDF exports, external share links, production-grade semantic index, and ownership-change approver workflow.

## Requirement Links

- PRD IDs: Story 15.1, Story 15.2, Story 15.3, Story 16.1
- Specs: `specs/06-timeline-and-handover.md`

## User Flow

Users open Account 360, review the server-backed timeline, search/filter/sort events, add manual notes, comment on entries, and generate handover summaries. Admins configure event types and retention policies, simulate retention, run retention manually, and monitor retention action history. Scheduled local retention checks run in the backend worker.

## Backend Plan

- Routers: `backend/app/routers/timeline.py`
- Services: `backend/app/services/timeline.py`
- Repositories: `backend/app/repositories/timeline.py`
- Schemas/validation: timeline, comments, event types, retention, handover, and AI search schemas in `backend/app/schemas.py`
- Helpers: RBAC through `AccountAccessService`, audit through `AuditService`

## API Documentation

- Swagger route metadata added for timeline list, notes, comments, Admin event types, retention policies/actions, handover, export/share, and AI Timeline Search.
- Error responses cover unauthorized access, missing records, immutable entries, inactive event types, and validation failures.

## Database Plan

- Tables: `timeline_event_types`, `timeline_comments`, `timeline_retention_policies`, `timeline_retention_actions`, `timeline_tombstones`, `handover_summaries`, `handover_shares`, `timeline_ai_search_audits`
- Columns: timeline entry status, event timestamp, sensitivity level, tags, mentions, attachments, retention metadata, source hash/idempotency key
- Migrations: `backend/migrations/20260602_timeline_and_handover.sql`
- Snake_case schema check: table and column names use snake_case.

## Frontend Plan

- Pages/components: Account Timeline, Add Note modal, Timeline Card comments, AI Timeline Search, Handover drawer, Admin timeline event type table, Admin retention history.
- Stores/hooks/services: new `frontend/src/services/timeline.ts`; legacy timeline store remains as fallback/mock data only.
- Form behavior: frontend validation remains lightweight; backend validation is authoritative.
- Backend error display: timeline feed, add note modal, comments, AI search, handover, and Admin retention show backend errors.

## Validation And Errors

- Backend validation classes/schemas enforce note/comment length, active event types, mention user existence, attachment URLs, retention limits, handover sections, and AI query bounds.
- Field-level errors use the existing `{ detail: { message, errors } }` pattern.
- Frontend shows modal/feed/panel level errors and keeps loading/empty states visible.

## Tests

- Backend unit/API tests cover timeline notes, search/pagination, comments create/edit/delete, sensitive filtering, retention simulation/run/tombstones, handover generation/export/share, and AI Timeline Search.
- Frontend build/typecheck is used to catch service/component wiring issues.

## Linting And Quality

- Commands to run: backend pytest for timeline tests, frontend `npm run build`.
- Known tradeoff: AI Timeline Search is deterministic/local against authorized timeline/document text until a production semantic index is specified.

## Open Questions

- Exact sensitivity level matrix.
- Exact retention durations per entity type.
- Ownership-change handover enforcement and approver flow.
- Full semantic index/provider strategy.

## Handoff Notes

- Local scheduled retention worker starts after a delay and runs due enabled policies.
- Default seeded retention policy is inactive for scheduling to avoid surprise data movement.
