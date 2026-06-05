# Fireflies Meeting Capture

## Summary

Adds Fireflies.ai as a second personal meeting provider beside Fathom. Users save or disconnect their own Fireflies API key from Profile, then fetch one specific transcript by transcript ID or transcript URL when completing a governance event. The app stores only the resolved meeting artifact summary, safe metadata, source links, and action-item drafts.

## Scope

- In scope:
  - Personal Fireflies connection status and encrypted API-key storage per user.
  - Profile Meeting Integrations tab with Fireflies save and disconnect controls.
  - `POST /api/meeting-capture/fireflies/resolve` for one on-demand transcript lookup.
  - User-owned `meeting_artifacts` with provider `fireflies`.
  - Governance completion provider selector for Fathom or Fireflies.
  - Summary and action-item prefill for human review before completion.
- Out of scope:
  - Fireflies webhooks.
  - Admin/global Fireflies integration settings.
  - Fireflies meeting-list management or broad sync.
  - Raw transcript sentence storage.
  - Automatic task creation outside governance completion.

## User Flow

1. User opens Profile and selects Meeting Integrations.
2. User saves a personal Fireflies API key, or disconnects to clear it.
3. During governance completion, user selects Fireflies and enters a transcript ID or transcript URL.
4. Backend calls Fireflies GraphQL for that one transcript using the user's personal key.
5. The returned summary and action items populate editable completion notes and action drafts.
6. Completion submits the selected `meetingArtifactId`; governance owns any created action tasks.

## API Contract

- `GET /api/meeting-capture/fireflies/connection`
  - Returns masked personal connection status.
- `PATCH /api/meeting-capture/fireflies/connection`
  - Saves, disables, or clears the user's personal Fireflies API key.
- `POST /api/meeting-capture/fireflies/resolve`
  - Request: `identifier`, optional account/engagement/linkage fields.
  - Identifier accepts a transcript ID or a Fireflies transcript URL that contains a transcript ID.
  - Response: existing `MeetingArtifactRead`.

## Backend Notes

- Uses existing `user_integration_connections` with provider `fireflies`.
- Uses existing `meeting_artifacts` with provider `fireflies`; no migration is required.
- Calls `https://api.fireflies.ai/graphql` with `Authorization: Bearer <api_key>`.
- Requests only `id`, `title`, `transcript_url`, `meeting_link`, `date`, and safe summary fields.
- Does not request or store raw transcript sentences.
- Account and engagement links use existing account-access validation.

## Frontend Notes

- `Profile` now has three tabs:
  - Account & Security
  - Meeting Integrations
  - Notifications
- The Meeting Integrations tab contains Fathom and Fireflies cards with connected state, save, and disconnect.
- Governance completion has a provider selector and provider-specific placeholder text.
- Backend field errors are shown beside the meeting identifier field.

## Tests

- Backend:
  - Fireflies connection save/read masks the key.
  - Fireflies disconnect clears the key.
  - Resolve by transcript ID creates or returns one owned artifact.
  - Summary and action items map from safe Fireflies summary fields.
  - Missing key, bad URL, and inaccessible transcript return displayable errors.
  - Governance completion accepts Fireflies artifacts and preserves owner isolation.
- Frontend:
  - Profile tabs render the new panes.
  - Fireflies key save and disconnect work.
  - Governance completion calls the Fireflies resolve endpoint and uses the returned artifact.
  - Existing Fathom flow remains intact.

## Verification

- `docker compose run --rm --no-deps backend pytest tests/test_content_escalations_governance.py tests/test_governance.py -q`
- `docker compose run --rm --no-deps frontend npm test -- Profile.test.tsx CompleteGovernanceEventDialog.test.tsx meetingCapture.test.ts`
- `docker compose run --rm --no-deps frontend npm run typecheck`
- `git diff --check`
