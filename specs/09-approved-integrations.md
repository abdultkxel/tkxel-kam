# Feature Specification: Approved Integrations

## Feature Overview

Configure and operate the approved MVP integrations: Google Calendar, Fathom, CSAT, and AI/LLM Gateway, with mapping, sync, deduplication, retries, logs, and review queues.

## Business Goal

Bring governed external context into account workflows without expanding integration scope or compromising source traceability, deduplication, or permissions.

## User Roles

- Admin
- Account Manager / KAM
- KAM Head / VP
- Leadership Viewer / Executive
- Platform

## User Stories Covered

- Story 20.1 - Integration adapter configuration
- Story 20.2 - Google Calendar, Fathom, CSAT, and AI/LLM flows

## Functional Requirements

- Only Google Calendar, Fathom, CSAT, and AI/LLM Gateway are approved MVP integration adapters.
- Support adapter configuration, test connection, sync status, last synced timestamp, retry, deduplication, error logging, and Admin notifications on repeated failures.
- Google Calendar supports OAuth, inbound/outbound governance scheduling, tagged meetings, reminders, event type mapping, account mapping, deduplication, and timeline event generation.
- Fathom supports meeting summaries/transcripts for tagged governance/account meetings after review or configured approval.
- CSAT supports score intake, trend display, freshness, scoring input, account/engagement mapping, score impact, and timeline events.
- AI/LLM Gateway supports governed extraction, KYC enrichment, summaries, search, explanations, semantic retrieval, research-source governance, response disclaimers, logs, and guardrails.
- External systems outside approved adapters are handled through manual entry, uploaded/linked evidence, CSV/manual input, or future scope review.
- Provide unmapped item review queues and mapping rules.

## Non-Functional Requirements

- Integration failures must not block core workflows.
- Failed critical syncs must be logged and surfaced to Admin.
- Deduplication must prevent duplicate timeline/business records.
- External source IDs and mapping decisions must be retained.

## Permissions & Authorization

- Admin configures integrations, credentials, mapping rules, syncs, tests, retries, and logs.
- KAM/Admin review imported Calendar/Fathom items depending on module policy.
- KAM/KAM Head/Leadership Viewer can view mapped CSAT and meeting data only where account permissions allow.
- AI Gateway receives only RBAC-filtered context.

## Validation Rules

- Adapter type must be in the approved integration list.
- Required credentials/config fields vary by adapter and must validate before activation.
- OAuth adapters must validate token status, expiry, scopes, and reconnect requirements before sync.
- Calendar/Fathom events require account tagging or configured mapping before timeline write.
- CSAT score requires account or engagement mapping.
- AI Gateway requests require source context and permission-filtered retrieval payload.
- Duplicate keys must include external source ID, adapter, account/engagement, event time, and mapping rule where applicable.

## Search Requirements

- Search integration logs by message, source ID, account, and adapter.
- Search unmapped imported items by title, source ID, external participant, and date.
- Search mapping rules by name/tag/account pattern.

## Filter Requirements

- Adapter logs: adapter, status, severity, date range.
- Imported items: adapter, mapped/unmapped, account, date, status.
- Sync history: adapter, status, started date, failure type.
- CSAT: account, engagement, score range, date range, source.

## Sort Requirements

- Logs sorted newest first.
- Imported items sorted by event/imported date and status.
- Sync history sorted newest first.
- CSAT trends sorted by score date.

## Pagination Requirements

- Logs are paginated.
- Imported item queues are paginated.
- Sync history is paginated.
- CSAT score lists are paginated.

## API Requirements

- `GET /api/admin/integrations`
- `PATCH /api/admin/integrations/{integration_id}`
- `POST /api/admin/integrations/{integration_id}/test`
- `POST /api/admin/integrations/{integration_id}/sync`
- `GET /api/admin/integrations/{integration_id}/logs`
- `GET /api/integrations/calendar/events`
- `POST /api/integrations/calendar/events/{event_id}/map`
- `GET /api/integrations/fathom/items`
- `POST /api/integrations/fathom/items/{item_id}/approve`
- `GET /api/integrations/csat/scores`
- `GET /api/admin/ai-gateway/runs`

## UI Requirements

- Admin integrations screen with adapter cards, status, configure/test/sync/retry actions, and logs.
- Mapping rules screen.
- Unmapped item review queue.
- CSAT trend panel.
- AI Gateway run logs.
- Error log detail drawer.

## Loading States

- Adapter status loading.
- Test connection loading.
- Sync/retry loading.
- Imported item review queue loading.
- Log loading.

## Empty States

- Adapter not configured.
- No imported items.
- No unmapped items.
- No sync logs.
- No CSAT scores.

## Error States

- Invalid credentials/config.
- Test connection failed.
- Sync failed or partially failed.
- Mapping conflict.
- Duplicate event detected.
- Repeated failures requiring Admin notification.

## Edge Cases

- Unsupported adapter type rejected.
- Travoly, ZoomInfo, and CrunchBase are AI research sources through AI/LLM Gateway, not standalone adapters.
- Fathom transcript may be sensitive and require review/redaction.
- Deduplication windows prevent duplicate timeline events.
- Integration-created records still respect module permissions.
- Manual/CSV fallback records from non-approved systems must be labeled as manual evidence, not as integration-synced records.

## Missing Requirements

- Credential storage/encryption requirements are not described.
- Exact Google Calendar tagging/mapping syntax is not specified.
- Fathom approval rules and redaction policy are not specified.
- CSAT source schema and score scale are not defined.
- Retry intervals and backoff policy are not specified.

## Ambiguous Requirements

- Google Calendar is inbound/outbound but exact outbound actions are unclear.
- Whether KAM can manually trigger syncs is not specified.
- Whether Fathom items can auto-create notes under configured approval is unclear.

## Conflicting Requirements

- No explicit conflict, but "advanced connectors" in MVP scope must still be constrained to only the four approved adapter types.

## Unspecified Edge Cases

- OAuth token expiry and reconnect flow.
- Deleted external calendar events.
- External event time changes after mapping.
- CSAT score correction/retraction.
- AI Gateway timeout during business workflow.

## Audit/Logging Requirements

- Audit adapter configuration changes, tests, syncs, retries, activation/deactivation.
- Log every sync result with source IDs, dedupe decisions, mapping decisions, errors, and retries.
- Audit review/approval of imported Fathom/Calendar items.
- Log AI Gateway runs with context, permissions, source records, errors, and outputs.

## Test Scenarios

- Configure approved adapter and test connection.
- Reject unsupported adapter type.
- Sync Calendar event, map account, and verify timeline event.
- Deduplicate duplicate Calendar event.
- Import Fathom item and require review before timeline write.
- Import CSAT score and verify trend/source/timeline/scoring impact.
- Retry failed sync and verify logs.
- Verify Admin notification on repeated failures.
- Verify AI Gateway receives permission-filtered context.

## Acceptance Criteria

- Only approved integrations are configurable.
- Every integration supports test, sync, status, retry, dedupe, and logs.
- Imported records are mapped, reviewed where required, and source-linked.
- Integration failures are visible to Admin and do not block core workflows.
