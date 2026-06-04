# Fathom Meeting Capture

## Summary

Adds a user-owned meeting capture layer for Fathom. Each user can connect a personal Fathom API key, sync their own meeting summaries/action items, manually save meeting notes or links, and use a selected meeting as draft input when completing a governance event.

## Scope

- In scope:
  - Personal Fathom connection status and encrypted API-key storage per user.
  - User-owned `meeting_artifacts` with summary, action items, Fathom/source links, optional account linkage, and linked object metadata.
  - Personal Fathom sync without transcript storage.
  - Global meeting capture drawer from the app top bar for title/link/account reference capture.
  - Governance completion prefill from a selected meeting artifact.
  - Governance completion creates owner-assigned tasks only for selected governance action items.
- Out of scope:
  - Programmatically adding the Fathom bot to a Zoom/Meet call.
  - Generic task creation from standalone Fathom meetings.
  - Object-specific insert buttons outside governance completion.
  - Full Fathom OAuth.

## Requirement Links

- Related docs: `docs/features/approved-integrations.md`, `docs/features/governance-reviews.md`.
- Product decisions:
  - Each user should use their own Fathom account/API key.
  - Meeting data is private to the user unless the user copies it or attaches it to a workflow.
  - Governance completion remains human-reviewed; Fathom output is draft input only.

## User Flow

1. User opens Meeting Capture from the top bar.
2. User saves a personal Fathom API key, or manually saves a meeting title/link/account reference for an in-flight or scheduled meeting.
3. User syncs Fathom meetings; summaries and action items are stored as private meeting artifacts and shown read-only/copyable in the drawer.
4. User can copy a meeting summary/action list anywhere in the app.
5. During governance completion, user selects a meeting, imports its summary/action items, edits the draft, chooses due dates, and saves completion.
6. Selected governance action items create owner-assigned task records; standalone meeting artifacts do not create tasks directly.

## Backend Plan

- Routers:
  - `backend/app/routers/meeting_capture.py` exposes personal Fathom connection, sync, meeting list, create, and update routes.
  - `backend/app/routers/governance.py` keeps completion route thin while accepting `meeting_artifact_id`.
- Services:
  - `backend/app/services/meeting_capture.py` owns personal Fathom sync and meeting artifact behavior.
  - `backend/app/services/governance.py` owns meeting artifact attachment and governance action task creation.
- Repositories:
  - `backend/app/repositories/meeting_capture.py` persists user integration connections and meeting artifacts.
  - `backend/app/repositories/governance.py` persists linked tasks through existing task helpers.
- Schemas/validation:
  - `UserFathomConnectionUpdateRequest`, `MeetingArtifactCreateRequest`, `MeetingArtifactUpdateRequest`, and `GovernanceEventCompleteRequest`.

## API Documentation

- Added Swagger summaries, descriptions, response descriptions, and error responses for:
  - `GET/PATCH /api/meeting-capture/fathom/connection`
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
  - Fathom sync requests `include_transcript=false`.
  - If a provider still returns transcript data, the stored metadata keeps only transcript metadata and omits the full transcript.

## Frontend Plan

- Components:
  - `frontend/src/components/meeting/MeetingCapturePanel.tsx` captures only meeting reference fields manually and displays synced Fathom output.
  - `frontend/src/components/governance/CompleteGovernanceEventDialog.tsx`
  - `frontend/src/components/layout/Topbar.tsx`
- Services:
  - `frontend/src/services/meetingCapture.ts`
  - `frontend/src/services/governance.ts`
- Form behavior:
  - No native `required` attributes.
  - Backend field errors are displayed beside matching fields where applicable.
  - Meeting summaries/action items can be copied from the drawer.

## Validation And Errors

- Personal Fathom sync returns a clear 400 when the user has not connected an API key.
- Meeting creation requires a title, URL, or summary.
- Meeting URLs must be valid HTTP/HTTPS URLs.
- Meeting action items are deduped, capped, and length-limited.
- Account-linked meeting artifacts validate account access and engagement ownership.
- Governance completion rejects a selected meeting artifact owned by another user or linked to another account.

## Tests

- Backend:
  - Personal Fathom connection sync stores private meeting artifacts and omits transcripts.
  - Other users cannot list another user's meeting artifacts.
  - Governance completion attaches a meeting artifact and creates a task for the governance action item owner.
- Frontend:
  - Meeting capture service payload mapping.
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
