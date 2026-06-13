# Admin Integrations Cleanup

## Summary

Admin Integrations now shows only admin-owned external integrations that are functional from the Admin module: Google Calendar and AI/LLM Gateway. Global/admin Fathom has been retired because Fathom meeting capture is user-owned in Profile. CSAT remains available through Health Scores and CSAT APIs, not as an Admin integration card.

## Decisions

- Keep the existing Admin Integrations visual design and alert email setting.
- Remove Fathom from the Admin Integrations UI, admin provider allowlist, admin sync/test/retry/disconnect/configuration paths, and global webhook routes.
- Keep `/api/meeting-capture/fathom/*` unchanged for personal Fathom API keys and private meeting artifacts.
- Keep CSAT backend APIs unchanged and remove only the Admin Integrations card.
- Preserve historical Fathom database records; no migration deletes existing imported items, logs, or suggestions.

## Implementation Notes

- `/api/admin/integrations` no longer seeds or lists Fathom.
- Admin provider actions for `fathom` return `404`.
- Scheduled integration sync skips retired provider rows.
- The Admin page status tile no longer reads the old hardcoded integration fixture store.
- The Admin Integrations panel no longer fetches imported items or renders Fathom meeting links.

## Tests

- Frontend coverage verifies stale Fathom/CSAT rows from the API are filtered out of the Admin Integrations view.
- Backend coverage verifies Fathom is absent from the admin integration list and global/admin Fathom endpoints return `404`.
- Existing personal Fathom and CSAT tests remain the source of truth for those workflows.
