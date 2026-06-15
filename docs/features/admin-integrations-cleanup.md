# Admin Integrations Cleanup

## Summary

Admin Integrations is no longer exposed from the Admin menu or top panel. The administration alert email setting now lives in Admin Settings below Allowed Email Domains. Google Calendar and AI/LLM Gateway are hidden from the Admin-owned adapters section. Global/admin Fathom has been retired because Fathom meeting capture is user-owned in Profile. CSAT remains available through Health Scores and CSAT APIs, not as an Admin integration card.

## Decisions

- Move the administration alert email control to Admin Settings below Allowed Email Domains.
- Remove the Integrations button from the Admin section menu.
- Remove the Integration health button/tile entry points from the Admin top panel and status strip.
- Hide Google Calendar and AI/LLM Gateway cards from the Admin-owned adapters section, and remove the top-right refresh/sync icon button.
- Remove Fathom from the Admin Integrations UI, admin provider allowlist, admin sync/test/retry/disconnect/configuration paths, and global webhook routes.
- Keep `/api/meeting-capture/fathom/*` unchanged for personal Fathom API keys and private meeting artifacts.
- Keep CSAT backend APIs unchanged and remove only the Admin Integrations card.
- Preserve historical Fathom database records; no migration deletes existing imported items, logs, or suggestions.

## Implementation Notes

- `/api/admin/integrations` no longer seeds or lists Fathom.
- Admin provider actions for `fathom` return `404`.
- Scheduled integration sync skips retired provider rows.
- The Admin page status tile no longer reads the old hardcoded integration fixture store.
- The Admin page no longer reads `/api/admin/integrations` for the operational status strip.
- The Admin Integrations panel no longer fetches imported items or renders Fathom meeting links.
- The Admin Integrations panel filters out all adapter cards returned by `/api/admin/integrations` and shows an empty Admin-owned adapters state.

## Tests

- Frontend coverage verifies Google Calendar, AI/LLM Gateway, stale Fathom, and CSAT rows from the API are filtered out of the Admin Integrations view.
- Frontend coverage verifies the Admin Integrations tab, Integration health controls, and direct integrations section link are absent.
- Frontend coverage verifies the administration alert email setting loads and saves from Admin Settings below Allowed Email Domains.
- Backend coverage verifies Fathom is absent from the admin integration list and global/admin Fathom endpoints return `404`.
- Existing personal Fathom and CSAT tests remain the source of truth for those workflows.
