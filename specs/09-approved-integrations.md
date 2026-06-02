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
- Admin integration status must list all four approved adapters even before they are configured.
- Canonical adapter IDs are `google_calendar`, `fathom`, `csat`, and `ai_llm_gateway`; API responses must normalize to canonical IDs. Existing hyphenated aliases may be accepted for backward compatibility but must not appear as separate adapters.
- Support adapter configuration, test connection, sync status, last synced timestamp, retry, deduplication, error logging, and Admin notifications on repeated failures.
- Support manual sync for every adapter and scheduled/local background sync where a sync cadence is configured.
- Default local scheduled sync cadence is hourly for Google Calendar, hourly for Fathom, daily for AI Gateway health/run observability, and disabled for external CSAT until the future third-party CSAT adapter is available.
- Retry policy is three attempts with backoff at 5 minutes, 15 minutes, and 1 hour. Three consecutive failures for the same adapter/failure key must create an Admin alert.
- Google Calendar supports OAuth, inbound/outbound governance scheduling, tagged meetings, reminders, event type mapping, account mapping, deduplication, and timeline event generation.
- Google Calendar must request the `https://www.googleapis.com/auth/calendar.events` scope for event read/write. If calendar-list validation is implemented, `https://www.googleapis.com/auth/calendar.calendarlist.readonly` may also be requested.
- Google Calendar OAuth must support authorize, callback, token expiry, token revocation/disconnect, reconnect, minimum scopes, and token-status display.
- Google Calendar must support calendar events read/write end to end for outbound governance scheduling and reminder updates.
- Google Calendar outbound actions must be limited to configured governance scheduling/reminder updates and must preserve source links and audit history.
- KAM users must be able to add/update their primary Google Calendar ID from their own profile.
- Admins must be able to add/update another user's primary Google Calendar ID from Admin User Management.
- By default, each user's primary Google Calendar ID is initialized to that user's email address.
- When a KAM user has a primary Google Calendar ID configured, outbound KAM calendar writes for that user must use that calendar.
- When a KAM user does not have a primary Google Calendar ID configured, outbound KAM calendar writes must use the configured shared Governance Calendar as that user's KAM Calendar fallback.
- If neither the user's primary Calendar ID nor the shared Governance Calendar ID is configured, outbound calendar writes must fail with a clear configuration-required error while preserving the internal governance record.
- Fathom supports meeting summaries/transcripts for tagged governance/account meetings after review or configured approval.
- Fathom summaries/transcripts must be persisted as imported review items before they enrich governance or timeline records unless auto-approval is explicitly configured.
- Fathom sensitive transcript content must support review/redaction before becoming visible outside authorized users.
- Fathom action items must be stored as suggested task hints for the current user. Approving a suggestion creates the task; rejecting a suggestion removes/dismisses the hint without creating a task.
- CSAT supports score intake, trend display, freshness, scoring input, account/engagement mapping, score impact, and timeline events.
- Initial MVP CSAT is a manual internal module/form, not a live third-party adapter. Future third-party CSAT integration must write into the same CSAT storage and mapping model.
- CSAT score intake must store source category scores, category weights, weighted CSAT score, scale, source timestamp, source system label, account/engagement mapping, freshness, and score-impact metadata.
- Initial manual CSAT score scale defaults to 1-5 and must calculate the category-weighted CSAT score defined by the Technical Logic Document from the start.
- AI/LLM Gateway supports governed extraction, KYC enrichment, summaries, search, explanations, semantic retrieval, research-source governance, response disclaimers, logs, and guardrails.
- AI/LLM Gateway run logs must cover KYC extraction, charter/SOW extraction, AI Search, semantic search, summaries, and signal explanations, including source context, research-source labels, permissions applied, response status, latency, and errors.
- AI/LLM Gateway run logs must use a unified cross-feature AI Gateway run table while existing feature-specific run records, such as KYC agent runs, remain linked evidence.
- External systems outside approved adapters are handled through manual entry, uploaded/linked evidence, CSV/manual input, or future scope review.
- Provide unmapped item review queues and mapping rules.
- Imported records must be stored with source IDs, source links, payload metadata, mapping state, review state, deduplication key, and resulting internal record links.
- Admin Settings must include an administration/security alert email field. Default value is `abdul.rehman@tkxel.io`, and it can be updated by authorized Admin/Super Admin users.

## Non-Functional Requirements

- Integration failures must not block core workflows.
- Failed critical syncs must be logged and surfaced to Admin.
- Deduplication must prevent duplicate timeline/business records.
- External source IDs and mapping decisions must be retained.
- Credential values, OAuth tokens, API keys, webhook secrets, and AI provider secrets must never be returned in API responses, logs, audit payloads, frontend state, notifications, or exported reports.
- Integration list and log responses must remain performant with pagination and filters.

## Permissions & Authorization

- Admin configures integrations, credentials, mapping rules, syncs, tests, retries, and logs.
- Admin configures the shared Governance Calendar ID used as the fallback KAM Calendar.
- Admin/Super Admin configures the administration/security alert email used for repeated integration failures, security alerts, and platform exception emails.
- KAM users can configure only their own primary Google Calendar ID from profile settings.
- Admin/Super Admin can configure a user's primary Google Calendar ID from Admin User Management.
- KAM users can manually trigger approved integration syncs only when RBAC grants the required integration action.
- KAM/Admin review imported Calendar/Fathom items depending on module policy.
- KAM/KAM Head/Leadership Viewer can view mapped CSAT and meeting data only where account permissions allow.
- AI Gateway receives only RBAC-filtered context.

## Validation Rules

- Adapter type must be in the approved integration list.
- Adapter payloads must use the canonical adapter IDs `google_calendar`, `fathom`, `csat`, and `ai_llm_gateway`.
- Required credentials/config fields vary by adapter and must validate before activation.
- Credential/config updates must reject unknown secret fields and invalid URL, email, scope, webhook, sync interval, mapping-rule, score-scale, and deduplication-window values.
- OAuth adapters must validate token status, expiry, scopes, and reconnect requirements before sync.
- User profile Calendar ID must be trimmed and validated as a Google Calendar ID. Accepted values include `primary`, an email-like calendar ID, or a Google group/resource calendar ID.
- Shared Governance Calendar ID must be trimmed and validated before outbound fallback calendar writes are enabled.
- Administration/security alert email must be trimmed, normalized to lowercase, and validated as an email address.
- Google Calendar account mapping supports title tags in the form `[KAM:Account Name]` and description/body fields `KAM_ACCOUNT=Account Name`, `KAM_ENGAGEMENT=Engagement Name`, `KAM_TYPE=QBR|STEERCO|EXECUTIVE_REVIEW|CLIENT_CALL`, and `KAM_AUTO_CREATE=true|false`.
- Google Calendar mapping rules must treat unmatched, ambiguous, or low-confidence account matches as review-required and must not write timeline/governance records automatically.
- Calendar/Fathom events require account tagging or configured mapping before timeline write.
- CSAT score requires account or engagement mapping.
- CSAT score scale and category weights must be configured consistently before score impact is calculated.
- AI Gateway requests require source context and permission-filtered retrieval payload.
- Duplicate keys must include external source ID, adapter, account/engagement, event time, and mapping rule where applicable.
- Test connection must fail with a displayable validation error when required credentials, scopes, base URL, webhook secret, or gateway configuration is missing.

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
- `POST /api/admin/integrations/{integration_id}/retry`
- `POST /api/admin/integrations/{integration_id}/disconnect`
- `GET /api/admin/integrations/{integration_id}/logs`
- `GET /api/admin/integrations/{integration_id}/sync-runs`
- `GET /api/admin/integrations/{integration_id}/mapping-rules`
- `POST /api/admin/integrations/{integration_id}/mapping-rules`
- `PATCH /api/admin/integrations/{integration_id}/mapping-rules/{rule_id}`
- `DELETE /api/admin/integrations/{integration_id}/mapping-rules/{rule_id}`
- `GET /api/admin/integrations/imported-items`
- `GET /api/integrations/calendar/events`
- `POST /api/integrations/calendar/events/{event_id}/map`
- `GET /api/integrations/google-calendar/oauth/authorize`
- `GET /api/integrations/google-calendar/oauth/callback`
- `GET /api/me/profile`
- `PATCH /api/me/profile`
- `GET /api/admin/settings/security-alerts`
- `PATCH /api/admin/settings/security-alerts`
- `GET /api/integrations/fathom/items`
- `POST /api/integrations/fathom/items/{item_id}/approve`
- `POST /api/integrations/fathom/items/{item_id}/reject`
- `PATCH /api/integrations/fathom/items/{item_id}/redact`
- `GET /api/integrations/fathom/task-suggestions`
- `POST /api/integrations/fathom/task-suggestions/{suggestion_id}/approve`
- `POST /api/integrations/fathom/task-suggestions/{suggestion_id}/reject`
- `POST /api/integrations/fathom/webhook`
- `GET /api/csat/scores`
- `POST /api/csat/scores`
- `GET /api/csat/scores/{score_id}`
- `PATCH /api/csat/scores/{score_id}`
- `GET /api/integrations/csat/scores`
- `POST /api/integrations/csat/scores/{score_id}/map`
- `GET /api/admin/ai-gateway/runs`
- `GET /api/admin/ai-gateway/runs/{run_id}`

## API Behavior Requirements

- Admin configuration endpoints require `integrations:configure`.
- Integration status, logs, sync runs, mapping rules, imported items, CSAT scores, and AI Gateway runs require `integrations:view` plus account-level visibility where account-specific data is returned.
- User-facing mapped Calendar/Fathom/CSAT records must respect the target module permission and account assignment rules.
- Profile Calendar ID updates may be performed by the authenticated user for their own profile or by an Admin/Super Admin through Admin User Management.
- Outbound Calendar writes must resolve the target calendar in this order: user's primary Calendar ID, then shared Governance Calendar ID, then configuration-required error.
- List endpoints must support pagination and relevant search/filter/sort parameters.
- API responses must return masked credential metadata only, such as configured/missing, token status, expiry, scopes, and last tested timestamp.
- Unsupported adapter IDs must return a validation error and must not create records.
- Repeated sync failures must create Admin-visible notifications and email-ready notification events without exposing secrets.
- Repeated sync failures, security alerts, and platform exceptions must send sanitized email alerts to the configured administration/security alert email.

## Database/Storage Requirements

- Store approved adapter status in `integration_connections` or equivalent, seeded/backfilled with exactly the four approved adapters.
- Store credential metadata separately from secret values where possible. If local encrypted storage is used, responses and logs must return only masked secret status.
- Store sync attempts in a run table or equivalent with adapter, status, trigger type, actor, started/finished timestamps, retry count, counts created/updated/skipped/errors, and failure type.
- Store detailed sync logs with source IDs, deduplication keys, mapping decisions, messages, severity, sanitized payload metadata, and links to sync runs.
- Store mapping rules with adapter, rule name, pattern/tag/source field, target account/engagement/event type, priority, active status, and audit timestamps.
- Store imported items with adapter, external ID, title, occurred/source timestamps, source link, raw/sanitized metadata, mapping status, review status, mapped account/engagement, reviewer, review timestamp, and resulting internal record IDs.
- Store CSAT scores with source ID, account/engagement mapping, original category scores, category weights, weighted score, scale, source timestamp, freshness status, score impact, trend metadata, and timeline/scoring links.
- Store AI Gateway runs with request type, status, actor, account/engagement scope, permission scope, source context IDs, research-source labels, latency, token/usage metadata when available, errors, advisory/disclaimer labels, and links to affected records.
- Store each user's primary Google Calendar ID in the user profile or user settings storage.
- Seed/backfill each user's primary Google Calendar ID from their email address when the profile value is missing.
- Store the shared Governance Calendar ID in Admin integration settings for Google Calendar.
- Store administration/security alert email in platform settings.
- Store Fathom task suggestions with imported item link, suggestion text, suggested due date/owner, status, reviewer, approval/rejection timestamp, and created task ID when approved.
- Integration-created timeline, governance, scoring, and AI records must retain immutable source references and deduplication keys.

## UI Requirements

- Admin integrations screen with adapter cards, status, configure/test/sync/retry actions, and logs.
- Admin integrations screen must show exactly the four approved adapters and must be API-backed, not local mock-only state.
- Adapter cards must show configured/missing credentials, token status, enabled state, last test, last sync, sync status, repeated failure indicator, and primary action buttons.
- Configure drawer must mask secrets, show field-level validation errors, allow reconnect/disconnect where applicable, and avoid displaying raw credentials after save.
- Profile settings must include a primary Google Calendar ID field for KAM users with save success, field-level validation errors, loading state, empty state, and responsive behavior.
- Admin User Management must include a primary Google Calendar ID field with save success, field-level validation errors, loading state, empty state, and responsive behavior.
- Google Calendar configuration must include the shared Governance Calendar ID used when a KAM user's profile calendar is empty.
- Admin Settings must include an administration/security alert email field with save success, field-level validation errors, loading state, empty state, and responsive behavior.
- Mapping rules screen.
- Unmapped item review queue.
- Imported item review queue must allow search, filters, pagination, mapping, approve/reject, redaction for Fathom where authorized, and source-link display.
- Fathom imported meetings must show the Fathom meeting/share link in the Admin Integrations review area when Fathom provides one.
- Fathom task suggestion UI must display suggested action items with approve/reject actions and task creation feedback.
- CSAT trend panel.
- Manual CSAT form must allow authorized users to enter account, engagement, customer/contact, score, scale, feedback/comment, source date, source label, and optional evidence/link.
- CSAT score panel must show score source, timestamp, mapped account/engagement, category scores, weighted score, score impact, trend, freshness, empty state, and error state.
- AI Gateway run logs.
- Error log detail drawer.
- AI Gateway run log UI must show request type, actor, status, research sources, source context, permissions applied, advisory labels, errors, and affected records without exposing raw sensitive prompts to unauthorized users.
- Existing frontend integration mock store may remain only as test/development fixture data; production UI must use the API service layer.

## Loading States

- Adapter status loading.
- Test connection loading.
- Sync/retry loading.
- Imported item review queue loading.
- Log loading.

## Empty States

- Adapter not configured.
- KAM profile primary Calendar ID not configured; UI should explain that the shared Governance Calendar fallback will be used if configured.
- No imported items.
- No unmapped items.
- No sync logs.
- No CSAT scores.

## Error States

- Invalid credentials/config.
- Invalid user primary Calendar ID.
- Invalid administration/security alert email.
- Missing user Calendar ID and missing shared Governance Calendar fallback during outbound calendar write.
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
- Existing backend/frontend adapter ID mismatch (`google-calendar` versus `google_calendar`) must not create duplicate adapter records.
- OAuth token expires, is revoked externally, or lacks required scopes.
- Google Calendar event is deleted, cancelled, rescheduled, renamed, or reassigned after mapping.
- Outbound calendar updates conflict with external user edits.
- User changes their primary Calendar ID after events were already written to a prior calendar.
- User clears their primary Calendar ID and the system falls back to the shared Governance Calendar for future writes only.
- Fathom transcript arrives before the related Calendar event is mapped.
- Fathom item contains sensitive commercial, legal, executive, or escalation content.
- Fathom action item suggestion is approved after the imported item has been archived/rejected.
- Fathom action item suggestion is rejected after a task was already created by another reviewer.
- CSAT score is corrected, retracted, duplicated, delayed, or arrives outside the configured score scale.
- Manual CSAT score is submitted without account/engagement mapping.
- AI Gateway request times out, returns unsafe/unsupported content, omits citations, or returns a response from an unapproved research source.
- Admin disables an adapter while a sync is running.
- Background scheduled sync overlaps with manual sync.

## Added From Technical Logic Document

- The approved integration list remains exactly: Google Calendar, Fathom, CSAT, and AI/LLM Gateway. Travoly/Trivoly, ZoomInfo, CrunchBase, RocketReach, web search, LinkedIn, news/social sources, and future KNACK are research sources through the AI/LLM Gateway, not standalone approved adapters.
- Every approved adapter must support test connection, sync status, last synced timestamp, retry, deduplication, error logging, RBAC-protected configuration, and source-linked timeline events where applicable.
- Repeated integration failures must notify the configured administration/security alert email with sanitized details only.
- Google Calendar integration must support governance events, reminders, account-tagged meetings, timeline events, dedupe, inbound sync, and outbound governance scheduling/reminders.
- Outbound Google Calendar writes must use the KAM user's primary Calendar ID first. If missing, the user email is the default profile value; if still unavailable or intentionally cleared, the shared Governance Calendar fallback is used when configured.
- Google Calendar OAuth/scopes must include the minimum read/write permissions required for governance scheduling and reminders. Revoked/expired tokens must surface reconnect state and must not block manual governance workflows.
- Fathom integration must import tagged summaries/transcripts/action items, retain meeting/share links, and require review/redaction before official governance, KYC, timeline, handover, or AI enrichment where configured.
- Fathom action item suggestions must be displayed as task hints that can be approved or rejected. Approving creates a task for the current user or configured owner; rejecting removes the hint without creating a task.
- CSAT Phase 1 can use an internal manual submission form, but scoring must use the Technical Logic Document formula:
  - `CSAT Score = SUM(category score * category weight)`.
  - Scale: 1-5.
  - Category weights: Delivery Excellence 30%, Communication 20%, Proactiveness 15%, Trust 20%, Value for Money 15%.
  - Low CSAT or category scores of `1` or `2` must be eligible for risk signals and improvement task recommendations.
- Third-party CSAT vendor mapping is future scope, but future provider data must map into the same category score contract and source/audit model.
- AI/LLM Gateway runs must be logged across KYC extraction, AI search, briefs/summaries, stage prediction, forecast, and signal explanation with actor, request type, source context, permission filtering, status, errors, citations, confidence, and advisory labels.
- Raw credentials, OAuth tokens, webhook secrets, raw provider payloads, raw AI prompts, transcripts, and sensitive imported content must be encrypted or securely stored where possible and masked from API responses, logs, exports, notifications, and audit views.
- Integration-created records must never bypass the target module's review/approval workflow. Imported data is source context until the owning workflow accepts it as official.

## Missing Requirements

- Fathom OAuth details are pending and only needed for a future multi-user OAuth app. Current MVP Fathom activation uses API keys for internal workflows.
- Fathom OAuth redirect/callback endpoints are not implemented yet. Use the planned backend callback path `/api/integrations/fathom/oauth/callback` when building Fathom OAuth.
- Third-party CSAT vendor payload mapping is pending. The CSAT score calculation formula is defined in the Technical Logic Document and must be used for manual/internal CSAT submissions and future vendor-mapped submissions.
- Exact AI Gateway vendor/base URL/API key/model configuration is pending.

## Ambiguous Requirements

- Whether Fathom transcript redaction should be mandatory for all summaries or only for sensitive detected content is not specified.
- Whether future third-party CSAT should be API polling, webhook, CSV import, or a combination is not specified.

## Conflicting Requirements

- No explicit conflict, but "advanced connectors" in MVP scope must still be constrained to only the four approved adapter types.

## Unspecified Edge Cases

- Webhook signature failure or replayed webhook event.
- Provider rate limiting and partial-page sync failures.
- Provider API pagination returns duplicate records across pages.
- Sync is retried after a previous partial success.
- Sanitized payload differs from raw provider payload needed for debugging.

## Audit/Logging Requirements

- Audit adapter configuration changes, tests, syncs, retries, activation/deactivation.
- Audit profile primary Calendar ID changes without exposing unrelated user profile data.
- Audit administration/security alert email changes.
- Log every sync result with source IDs, dedupe decisions, mapping decisions, errors, and retries.
- Audit review/approval of imported Fathom/Calendar items.
- Audit Fathom task suggestion approvals/rejections and created task IDs.
- Log AI Gateway runs with context, permissions, source records, errors, and outputs.
- Audit credential status changes without logging secret values.
- Log background scheduled syncs separately from manual syncs.
- Log unsupported adapter access attempts.
- Log outbound Google Calendar writes with before/after source metadata.
- Log CSAT score corrections/retractions and their scoring impact.

## Security Requirements

- Only Admin/Super Admin or roles with `integrations:configure` can update credentials, OAuth state, mapping rules, sync cadence, and adapter enabled state.
- KAM users can update their own primary Google Calendar ID. Admin/Super Admin can update another user's primary Google Calendar ID through Admin User Management.
- Users with `integrations:view` can see adapter health/log metadata, but account-specific imported records must still be filtered by account/module permissions.
- OAuth scopes must be minimal and displayed in the admin UI.
- Credentials, tokens, API keys, webhook secrets, and raw AI prompts must be masked or omitted from API responses, logs, notifications, audit entries, and exports.
- Administration/security alert emails must contain sanitized failure summaries and must not include credentials, OAuth tokens, raw provider payloads, raw AI prompts, or sensitive transcript content.
- Webhook endpoints must validate signatures/secrets and reject replayed events where the provider supports it.
- AI Gateway retrieval must apply RBAC before retrieval, not only after the response.
- AI output must remain advisory and must not directly approve business records, create autonomous decisions, or expand the integration adapter list.
- Integration errors must be actionable without revealing sensitive payload details to unauthorized users.

## Test Scenarios

- Verify `GET /api/admin/integrations` returns exactly Google Calendar, Fathom, CSAT, and AI/LLM Gateway.
- Verify canonical adapter IDs are normalized and unsupported/duplicate aliases do not create extra adapters.
- Configure approved adapter and test connection.
- Reject unsupported adapter type.
- Verify credentials are saved/masked and never returned in responses/logs.
- Verify RBAC blocks non-authorized users from configure/test/sync/retry/log views as appropriate.
- Sync Calendar event, map account, and verify timeline event.
- Configure KAM user's primary Calendar ID and verify outbound governance event is written to that user's calendar.
- Clear KAM user's primary Calendar ID and verify outbound governance event uses the shared Governance Calendar fallback.
- Verify outbound Calendar write fails gracefully when both user Calendar ID and shared Governance Calendar ID are missing.
- Verify users default to their email address as primary Calendar ID when the field is missing.
- Verify Admin/Super Admin can update another user's primary Calendar ID through Admin User Management.
- Verify non-admin users cannot update another user's primary Calendar ID.
- Deduplicate duplicate Calendar event.
- Verify Calendar OAuth expired/revoked token errors and reconnect state.
- Verify Calendar deleted/rescheduled event handling.
- Import Fathom item and require review before timeline write.
- Redact/approve/reject Fathom sensitive transcript content.
- Approve Fathom suggested action item and verify task creation for the current user.
- Reject Fathom suggested action item and verify no task is created.
- Configure administration/security alert email and verify repeated integration failures send a sanitized email alert.
- Verify invalid administration/security alert email shows a field-level validation error.
- Create manual CSAT category scores and verify source, trend, freshness, weighted score, timeline/scoring linkage, validation, pagination, search, filter, and sort.
- Import CSAT score and verify trend/source/timeline/scoring impact.
- Verify CSAT duplicate, correction, retraction, invalid scale, and unmapped-score behavior.
- Retry failed sync and verify logs.
- Verify Admin notification on repeated failures.
- Verify AI Gateway receives permission-filtered context.
- Verify AI Gateway run logs for KYC, search, summary, and signal explanation are paginated and sanitized.
- Verify logs, sync history, imported item queues, and CSAT lists support pagination/search/filter/sort.
- Verify loading, empty, error, and responsive UI states for adapter cards, drawers, review queues, CSAT panel, and AI run logs.

## Acceptance Criteria

- Only approved integrations are configurable.
- Admin integration status shows exactly the four approved adapters.
- Every integration supports test, sync, status, retry, dedupe, and logs.
- Imported records are mapped, reviewed where required, and source-linked.
- KAM users can store a primary Google Calendar ID in profile, and outbound Calendar writes use it before the shared Governance Calendar fallback.
- Authorized users can create manual CSAT scores through the internal CSAT module before any third-party CSAT adapter exists.
- Fathom action item suggestions can be approved into current-user tasks or rejected without creating tasks.
- Repeated integration failures send sanitized email alerts to the configured administration/security alert email.
- Integration failures are visible to Admin and do not block core workflows.
- Credentials and secrets are never exposed after save.
- Calendar/Fathom/CSAT/AI Gateway imported or generated records retain source links and audit trails.
- AI Gateway run logs show permission-filtered source context and advisory labels.

## Implementation Notes

- Existing Google Calendar/Fathom sync behavior currently lives in governance code and should be extracted into a dedicated approved-integrations service/repository layer while preserving existing API compatibility where needed.
- Google Calendar credentials must be stored through environment/admin integration settings only; client secrets must not be committed into this specification or source code.
- The backend callback URI may reuse the existing Google Sign-In redirect host pattern, but Calendar OAuth should have its own integration callback endpoint if required by Google OAuth configuration.
- Google OAuth credentials supplied for local/demo use must be placed in environment variables or secure admin integration storage, never committed to source or documentation.
- CSAT Phase 1 should be implemented as an internal manual module with `source_label=manual`; the future third-party CSAT adapter should map into the same API/storage contract.
- Fathom internal workflow credentials use an API key and optional webhook secret stored in environment variables or Admin integration configuration. Sync uses `GET https://api.fathom.ai/external/v1/meetings/` with the `X-Api-Key` header and requests summary/action item metadata by default; transcript and CRM match payloads can be enabled from settings when needed.
- Fathom webhook receiver is `/api/integrations/fathom/webhook`; it validates `webhook-id`, `webhook-timestamp`, and `webhook-signature` against the configured webhook secret before storing an imported meeting.
- Planned Fathom OAuth redirect reference:
  - Development redirect URL: `http://127.0.0.1:8001/api/integrations/fathom/oauth/callback`.
  - If local backend host port is overridden, keep the same path and replace the port, for example `http://127.0.0.1:8002/api/integrations/fathom/oauth/callback`.
  - If Fathom requires HTTPS even for development, use a tunnel URL with the same path, for example `https://<dev-tunnel-domain>/api/integrations/fathom/oauth/callback`.
  - Production redirect URL: `https://<production-api-domain>/api/integrations/fathom/oauth/callback`, or `https://<production-app-domain>/api/integrations/fathom/oauth/callback` when the app domain reverse-proxies `/api` to the backend.
  - Do not use the frontend `/auth/callback` Google Sign-In route for Fathom OAuth; Fathom token exchange should be completed server-side.
- Existing frontend integration cards currently use local mock state for all four adapters; Phase 2 should replace production behavior with API-backed services while keeping mock data only for tests/development fixtures.
- Existing KYC agent runs and signal AI explanation audits can provide source evidence for AI Gateway run logs, but a unified AI Gateway run log may still be required for cross-feature visibility.
- Existing integration connection/log tables can be reused if they are extended for all four adapters, secret masking, sync runs, mapping rules, imported item review, CSAT scores, and AI run observability.

## Implementation Status

### Completed Items

- Approved adapter registry is implemented and tested: Admin integration status returns exactly `google_calendar`, `fathom`, `csat`, and `ai_llm_gateway`, with canonical ID normalization and unsupported adapter rejection.
- Integration service/repository/API layer is implemented and tested for configuration-required sync, sync execution, retry metadata, deduplication, sync runs, sync logs, and credential masking.
- Sync-run and sync-log list behavior is implemented and tested for pagination plus provider/status/severity/date/search/failure-type filtering.
- Fathom API-key activation is implemented and tested for meeting sync, imported review item persistence, meeting/share links, transcript omission metadata, action-item suggestions, signed webhook validation, and webhook replay rejection.
- Imported item search is implemented and tested for title/source metadata and sanitized payload content such as external participant names.
- Repeated integration failure handling is implemented and tested for backoff state, sanitized alert logging, configured administration email usage, and Admin in-app notification creation.
- Manual CSAT module is implemented against the Technical Logic Document category-weighted formula, including default 1-5 scale, category weights, normalization, trend/freshness metadata, timeline linkage, and scoring snapshot linkage.
- Credential encryption at rest is implemented for stored integration secrets using encrypted JSON markers, with masked API responses, logs, audits, notifications, and tests.
- Profile and Admin User Management primary Google Calendar ID persistence is implemented and tested, including defaulting missing values from user email.
- Google Calendar inbound sync/deduplication path is implemented and tested through the approved integration service with mapped governance/timeline output.
- Unified AI Gateway run table and API are implemented, with tested Timeline AI Search logging and implemented KYC extraction/signal explanation logging hooks.
- Admin Integrations UI is API-backed and tested for loading approved adapters and triggering backend sync through the frontend service layer.
- Profile, Admin Users, Admin Integrations, and CSAT UI surfaces include loading, empty, error, validation, save-success, and responsive behavior matching the implemented workflows.
- Feature context and coverage artifacts are created and linked: `docs/features/approved-integrations.md` and `docs/features/approved-integrations-coverage-report.md`.

### Remaining Items

- Fathom OAuth is not implemented. Current MVP uses Fathom API keys and signed webhooks for internal workflows; future multi-user/public Fathom OAuth should use `/api/integrations/fathom/oauth/callback`.
- Final third-party CSAT integration is not implemented. The manual CSAT module and storage/API contract already follow the Technical Logic Document CSAT category formula and are ready for a future vendor API mapping.
- Full frontend workspaces for mapping rules, complete unmapped item review queues, AI Gateway run-log browsing, and error-log detail drawers remain partial.
- Google Calendar OAuth token expiry/revocation handling, provider pagination, external deletion/cancellation/reschedule reconciliation, and outbound edit conflict handling need additional implementation and tests.
- Outbound Google Calendar write fallback/error branches are implemented in service code but still need dedicated automated coverage for user calendar, shared Governance Calendar fallback, and missing-calendar failure.
- Unified AI Gateway logging still needs automated tests for KYC extraction and signal explanation paths, plus future summary/semantic retrieval paths when those workflows are expanded.
- Strict log severity semantics are partial because the current storage model filters severity through operational status/message/payload rather than a dedicated `severity` column.
- Sync concurrency protection is partial for scheduled/manual overlap and disabling an adapter while a sync is running.
- CSAT retraction workflow is not implemented; corrections/updates are supported, but explicit retraction semantics remain future scope.

### Technical Notes

- Phase 3 coverage report: `docs/features/approved-integrations-coverage-report.md`.
- Backend implementation uses service/repository separation in `backend/app/services/integrations.py`, `backend/app/repositories/integrations.py`, `backend/app/services/csat.py`, and `backend/app/repositories/csat.py`.
- API routes are in `backend/app/routers/integrations.py`, `backend/app/routers/csat.py`, and compatibility integration routes in `backend/app/routers/governance.py`.
- Storage uses additive startup migrations/backfills in `backend/app/database.py`; new tables/columns use snake_case.
- Local scheduled sync is controlled by integration worker settings in `backend/app/config.py`.
- Supplied local/demo provider credentials must remain in ignored environment files or Admin settings and must not be committed.
- Field builder impact: none found. Approved integrations use fixed domain schemas/tables and do not write to custom field definition/value storage.
- Verification completed:
  - `python -m compileall backend/app`
  - `PYTHONPATH=backend backend/.venv/bin/pytest backend/tests/test_content_escalations_governance.py -q`
  - `cd frontend && npx tsc --noEmit`
  - `cd frontend && npm run test -- IntegrationsPanel.test.tsx`
  - `cd frontend && npm run build -- --outDir /tmp/tkxel-kam-frontend-build --emptyOutDir`
  - `git diff --check`
  - tracked secret scan for supplied Fathom credentials
