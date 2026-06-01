# Governance Reviews Merge Context

## Branch Snapshot

- Branch: `feature/governance-reviews`
- Feature commit: `01901d5 feat: implement governance reviews`
- Intended base branch: `dev`
- PR compare URL after push: `https://github.com/abdultkxel/tkxel-kam/compare/dev...feature/governance-reviews?expand=1`

This file preserves the implementation context for the governance feature before moving to another feature branch. Use it when discussing or merging with the overlapping governance work that already exists on `dev`.

## Why This Exists

After this feature was implemented, `origin/dev` already contained another governance/content/escalation implementation. A trial merge from `origin/dev` into this branch was aborted because conflicts touched core governance backend and frontend files. Resolving those conflicts requires team discussion rather than a blind `ours` or `theirs` merge.

## Implemented In This Branch

Backend:

- Governance database models for events, attendees, notes, decisions, governance-local action items, generated outputs, and generated output citations.
- Repository/service/router layers for governance scheduling, list/filter/sort/pagination, calendar projection, event updates, cancellation, completion, deterministic agenda draft, accepted agenda update, and deterministic governance brief.
- Effective status handling: future incomplete events are `upcoming`; past incomplete events are `overdue`; completed/cancelled events keep their explicit status.
- Email-based attendee validation, normalization, and duplicate detection.
- Completion flow requiring notes. Decisions and action items are optional, but action items require owner and due date when present.
- Audit and timeline hooks for scheduling, update, completion, generated outputs, and decision logging.
- Swagger/OpenAPI route descriptions under `Governance Reviews`.

Frontend:

- API-backed governance service and store.
- Add/edit/complete governance dialogs.
- Dashboard governance calendar interactions and event detail access.
- Account 360 Governance tab event creation and completion.
- Standalone `/governance` workspace with calendar, event register, search, filters, sorting, pagination, open/edit/complete/cancel actions.
- Source-backed agenda draft generation from the event detail drawer.
- Editable generated agenda draft before acceptance.
- Governance brief generation with disclaimer and source citations.
- Owner-only frontend-local `governance_overdue` notification trigger with `sourceKey` dedupe.

Docs/process:

- `AGENTS.md`, `CONTRIBUTING.md`, PR template, feature context template, feature index, and governance feature notes.
- Governance feature notes include the production concern that overdue notifications should eventually move to backend-scheduled persisted notifications.

## Important Decisions

- Actual AI/LLM integration is intentionally not implemented. Agenda and brief generation are deterministic and source-backed so a future agent can plug in later.
- Google Calendar and Fathom integrations are intentionally deferred to integration scope.
- `/governance` is functional but not added to the sidebar in this pass.
- Account Governance `View calendar` points to Dashboard for now.
- Governance events are domain records; calendar items are projections so renewal, score activity, and future item types do not depend on governance tables.
- Current overdue notification behavior is acceptable for QA only. Production notification creation should be backend-owned and scheduled.

## Known Overlap With Current `dev`

The attempted merge with `origin/dev` conflicted in:

- `backend/app/dependencies.py`
- `backend/app/main.py`
- `backend/app/repositories/governance.py`
- `backend/app/routers/governance.py`
- `backend/app/schemas.py`
- `backend/app/services/governance.py`
- `frontend/src/components/account/AccountWorkspacePanel.tsx`
- `frontend/src/components/governance/AddGovernanceEventDialog.tsx`
- `frontend/src/components/governance/GovernancePanel.tsx`
- `frontend/src/types/governance.ts`

`origin/dev` also appears to contain additional content/escalation/governance implementation, including recurrence rules, integration admin surfaces, and broader content/escalation tests. Preserve that work during the eventual merge.

## Merge Guidance

- Do not use blanket `--ours` or `--theirs` for governance files.
- Reconcile backend models first. The main model conflict is likely between this branch's generated-output/citation/email-attendee/completion model and `dev`'s recurrence/integration-oriented governance model.
- Reconcile route contracts second. Keep required PRD routes:
  - `GET /api/governance-events`
  - `POST /api/governance-events`
  - `GET /api/governance-events/{event_id}`
  - `PATCH /api/governance-events/{event_id}`
  - `POST /api/governance-events/{event_id}/complete`
  - `POST /api/governance-events/{event_id}/agenda-draft`
  - `PATCH /api/governance-events/{event_id}/agenda`
  - `POST /api/governance-events/{event_id}/ai-brief`
- Preserve this branch's tested UX additions if they are still needed:
  - editable agenda draft before acceptance
  - cited brief display with source links
  - Account 360 add/complete governance flow
  - Governance register filters and pagination
  - dashboard calendar detail interactions
- Preserve `dev`'s content/escalation/integration/admin additions.
- After merging, run both governance test sets if they still exist:
  - `docker compose run --rm --no-deps backend pytest tests/test_governance.py -q`
  - `docker compose run --rm --no-deps backend pytest tests/test_content_escalations_governance.py -q`
  - `npm test -- governance`
  - `npm run build`
  - `python3 -m compileall backend/app`
  - `git diff --check`

## Verification From This Branch

Last successful verification before the merge attempt:

- `docker compose run --rm --no-deps backend pytest tests/test_governance.py -q` -> 4 passed, 1 warning.
- `npm test -- governance` -> 5 passed.
- `npm run build` -> passed with existing Vite chunk-size warning.
- `python3 -m compileall backend/app backend/tests/test_governance.py` -> passed.
- `git diff --check` -> clean.

## Push/PR Note

The branch is committed locally, but pushing failed from this environment because GitHub HTTPS credentials were unavailable:

```text
fatal: could not read Username for 'https://github.com': No such device or address
```

Push manually after authenticating:

```bash
git push -u origin feature/governance-reviews
```
