# Fathom Meeting Capture

## Summary

Adds a user-owned Fathom meeting layer. Each user connects or disconnects a personal Fathom API key from the Profile Meeting Integrations tab, then enters a specific Fathom recording ID or share URL when a workflow needs meeting details. Governance completion is the first consumer: it fetches one meeting on demand, stores only that private meeting artifact, and uses the returned summary/action items as editable draft input.

## Scope

- In scope:
  - Personal Fathom connection status and encrypted API-key storage per user.
  - Profile disconnect action that disables Fathom and removes the stored personal API key.
  - User-owned `meeting_artifacts` with summary, action items, Fathom/source links, optional account linkage, and linked object metadata.
  - On-demand Fathom resolve by recording ID or share URL without broad meeting-list management.
  - Governance completion prefill from the resolved meeting artifact.
  - Governance completion creates owner-assigned tasks only for selected governance action items.
- Out of scope:
  - Programmatically adding the Fathom bot to a Zoom/Meet call.
  - Generic task creation from standalone Fathom meetings.
  - Object-specific insert buttons outside governance completion.
  - Full Fathom OAuth.
  - Global top-bar meeting capture drawer and user-managed synced meeting list.

## Requirement Links

- Related docs: `docs/features/approved-integrations.md`, `docs/features/governance-reviews.md`.
- Product decisions:
  - Each user should use their own Fathom account/API key.
  - Meeting data is private to the user unless the user copies it or attaches it to a workflow.
  - Governance completion remains human-reviewed; Fathom output is draft input only.

## User Flow

1. User opens Profile, selects Meeting Integrations, and saves a personal Fathom API key.
2. User can disconnect Fathom from Profile, which disables the connection and clears the stored API key.
3. During governance completion, user selects Fathom and enters a Fathom recording ID or share URL.
4. Backend fetches only that specific meeting using the user's personal API key and stores/updates one private meeting artifact.
5. Governance completion imports the summary/action items as editable draft content.
6. Selected governance action items create owner-assigned task records; standalone meeting artifacts do not create tasks directly.

## Backend Plan

- Routers:
  - `backend/app/routers/meeting_capture.py` exposes personal Fathom connection, on-demand resolve, and compatibility routes for sync/list/create/update.
  - `backend/app/routers/governance.py` keeps completion route thin while accepting `meeting_artifact_id`.
- Services:
  - `backend/app/services/meeting_capture.py` owns personal Fathom resolve and meeting artifact behavior.
  - `backend/app/services/governance.py` owns meeting artifact attachment and governance action task creation.
- Repositories:
  - `backend/app/repositories/meeting_capture.py` persists user integration connections and meeting artifacts.
  - `backend/app/repositories/governance.py` persists linked tasks through existing task helpers.
- Schemas/validation:
  - `UserFathomConnectionUpdateRequest` supports saving a key and `clear_api_key` disconnects/removes it. `FathomMeetingResolveRequest`, `MeetingArtifactCreateRequest`, `MeetingArtifactUpdateRequest`, and `GovernanceEventCompleteRequest` remain workflow schemas.

## API Documentation

- Added Swagger summaries, descriptions, response descriptions, and error responses for:
  - `GET/PATCH /api/meeting-capture/fathom/connection`
  - `POST /api/meeting-capture/fathom/resolve`
  - `POST /api/meeting-capture/fathom/sync`
  - `GET/POST /api/meeting-capture/meetings`
  - `PATCH /api/meeting-capture/meetings/{meeting_id}`
- Governance completion now documents the same route but accepts `meeting_artifact_id` and action item `create_task`.

## Database Plan

- Tables:
  - `user_integration_connections`
  - `meeting_artifacts`
- Migration:
  - `backend/migrations/20260604_fathom_meeting_capture.sql`
- Transcript policy:
  - Fathom resolve/list enrichment requests `include_transcript=false`.
  - If a provider still returns transcript data, the stored metadata keeps only transcript metadata and omits the full transcript.

## Frontend Plan

- Components:
  - `frontend/src/pages/Profile.tsx` stores the personal Fathom API key under Meeting Integrations and displays masked connection status.
  - `frontend/src/components/governance/CompleteGovernanceEventDialog.tsx` selects Fathom or Fireflies before resolving a meeting artifact.
- Services:
  - `frontend/src/services/meetingCapture.ts`
  - `frontend/src/services/governance.ts`
- Form behavior:
  - No native `required` attributes.
  - Backend field errors are displayed beside matching fields where applicable.
  - Governance completion fetches one provider meeting by ID/URL on demand and never lists all personal meetings.

## Validation And Errors

- Personal Fathom resolve returns a clear 400 when the user has not connected an API key.
- Fathom identifier accepts numeric recording IDs and Fathom HTTP/HTTPS URLs only.
- Meeting creation requires a title, URL, or summary.
- Meeting URLs must be valid HTTP/HTTPS URLs.
- Meeting action items are deduped, capped, and length-limited.
- Account-linked meeting artifacts validate account access and engagement ownership.
- Governance completion rejects a resolved meeting artifact owned by another user or linked to another account.

## Tests

- Backend:
  - Personal Fathom connection sync stores private meeting artifacts and omits transcripts.
  - Fathom resolve by recording ID or share URL stores only the matched private artifact.
  - Other users cannot list another user's meeting artifacts.
  - Governance completion attaches a meeting artifact and creates a task for the governance action item owner.
- Frontend:
  - Meeting capture service payload mapping.
  - Profile Fathom key save/status behavior.
  - Governance completion on-demand Fathom resolve behavior.
  - Governance completion payload mapping for meeting artifact and task flag.

## Linting And Quality

- Verification commands:
  - `docker compose run --rm --no-deps backend python -m compileall app tests/test_governance.py tests/test_content_escalations_governance.py`
  - `docker compose run --rm --no-deps backend pytest tests/test_governance.py tests/test_content_escalations_governance.py -q`
  - `docker compose run --rm --no-deps frontend npm run test -- governance.test.ts meetingCapture.test.ts`
  - `docker compose run --rm --no-deps frontend npx tsc --noEmit`
  - `git diff --check`

## Open Questions

- Whether Fathom should be connected through OAuth later instead of personal API keys.
- Whether non-governance objects should get contextual "use meeting notes" buttons after real user cases are observed.
- Whether raw transcript storage is ever needed; current decision is no by default.
