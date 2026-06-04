# Governance & Reviews

## Summary

Feature 17 manages formal account governance moments such as QBRs, SteerCos, monthly reviews, and executive reviews. The current frontend already shows governance records in multiple places, but the implementation is still largely local-state driven.

## Scope

- In scope:
  - 17.1 Governance Scheduling.
  - 17.2 Source-backed Agenda Generation using deterministic templates/rules first, with an AI-agent adapter point for later.
  - 17.3 Governance Notes & Decisions.
  - 17.4 Governance Briefs using deterministic source aggregation first, with an AI-agent adapter point for later.
  - Existing non-AI governance UI behavior.
  - Fully functional `/governance` workspace, but do not add it to the sidebar in this pass.
  - Functional dashboard calendar with governance upcoming/overdue behavior.
  - Functional Account 360 Governance tab, including account-scoped event creation and event detail access.
  - Governance list search, filters, sorting, pagination, and calendar date navigation required by spec `05`.
- Held for future agent implementation:
  - Actual AI/agent/LLM generation logic, prompts, retrieval ranking, model selection, and provider integration.
  - Autonomous AI-created decisions, action items, scores, escalations, or authoritative business changes.
- Out of scope for now:
  - Google Calendar inbound sync.
  - Programmatic Fathom bot invitation and non-governance object insertion buttons.

## Requirement Links

- PRD IDs:
  - V3-FR-067: schedule and track QBRs, SteerCos, monthly reviews, and executive reviews.
  - V3-FR-069: capture meeting notes, decisions, and action items.
- User stories:
  - Story 14.1: Governance event management.
  - Story 14.2: Source-backed agenda and governance AI brief.
- Specs:
  - `specs/05-content-escalations-and-governance.md`: governance events, agendas, notes, decisions, action items, generated agenda/brief surfaces, `/governance` reachability, filters, pagination, audit.
  - `specs/08-ai-assistance-and-forecasting.md`: future AI behavior, citations, disclaimers, history, and source/retrieval guardrails.
  - `specs/12-platform-readiness-reliability-and-scope-guardrails.md`: core workflows continue when AI/integrations are unavailable.
  - `specs/IMPLEMENTATION_PLAN.md`: governance belongs in the content/escalation/governance slice; build the AI agenda/brief shell without starting production AI too early.
- Local breakdown:
  - `.local-context/Feature_Breakdown_UPDATED.md`

## Overall Feature Notes

Current UI state:

- Dashboard has an action button for adding a governance event in the Global Meetings Calendar section.
- Standalone Governance page has an action button for adding a governance event, but there is currently no direct sidebar/nav access to that page. Keep it that way for this pass; make the page fully functional and reachable through existing accepted links/actions.
- Account 360 Governance tab shows account-specific governance records, but it does not currently have an action to add a governance event. Add an account-scoped `Add governance event` action there.
- Dashboard shows upcoming calendar items in a 30-day list.
- Keep Account Governance `View calendar` pointing to Dashboard for now. We will note the PR discussion so the lead can decide whether to add Governance page navigation and later route account calendar links to `/governance?account=<id>`.

Governance reminder decisions:

- Use governance overdue status to drive in-app reminders in the user's top-right Notifications tray.
- Add a `governance_overdue` notification trigger for this feature.
- Creating a governance event creates a linked task with `source_type=governance_event` and `source_record_id=<event id>`.
- The linked reminder task is assigned to the governance event owner, not the event creator.
- The linked reminder task due date equals the governance event scheduled date/time; task reminder lead time will be handled by the notification/reminder layer.
- Rescheduling a governance event updates the linked reminder task due date/title/owner. Cancelling the governance event cancels the linked task. Completing the governance event marks the linked task done.
- A governance event becomes overdue when its scheduled date/time is in the past and the event is not completed/cancelled.
- When an event becomes overdue, create/dedupe an in-app notification for the event owner.
- Do not notify KAM Head for every overdue governance event in this pass; that would create too much notification noise. Keep this as a future discussion point for digest/escalation-style notifications.
- Dashboard should show upcoming governance events in the upcoming list and overdue governance events in the overdue list.
- Keep the Dashboard upcoming window at 30 days.
- Google Calendar is integration scope and pushes governance events outbound only. It does not pull Google events into governance and does not invite governance attendee emails.
- Fathom meeting capture is user-owned. Governance completion can pull a selected meeting artifact as draft notes/action items, but the user must review and save the completion.
- Future notification implementation concern: overdue governance notification creation should move to a backend-owned scheduled process, not a frontend login/session scan. The notification feature should provide persistent notification storage, backend dedupe by source/event/owner/status transition, and a scheduler/dispatcher that can later support in-app, email, push, Slack, or Teams delivery channels.
- Until the notification feature exists, frontend-triggered owner-only overdue notifications are acceptable for QA/prototype behavior, but they should be treated as temporary wiring.

Attendee management decisions:

- The current Add Governance Event dialog accepts attendees as comma-separated names only.
- There will not be a people/persons section for project participants in this pass.
- Change attendee capture from names to email addresses for now.
- Allow any valid email address, not only internal/company-domain addresses.
- Normalize and dedupe attendee emails case-insensitively.
- Prefer a repeatable attendee email editor or email-chip style input over comma-separated text.
- Later, attendee entry can evolve to known users/stakeholders plus manually added external attendees.

Calendar decoupling decisions:

- Governance events are authoritative domain records.
- Calendar events/items are projections for calendar surfaces and can represent governance, renewal, score activity, and future item types.
- Creating/updating a governance event should update the governance record and expose a corresponding calendar item projection.
- Do not model dashboard/governance calendars as governance-only tables.
- Calendar item detail routing should branch by item type:
  - Governance item: open governance event detail or Account 360 Governance tab.
  - Renewal item: open the relevant engagement/renewal context.
  - Score activity item: open the relevant health/score activity context.
- This keeps governance implementation from coupling future renewal, score activity, task, or integration calendar features to governance tables.

Completion/action-item decisions:

- Completing a governance event requires notes.
- Decisions are optional for completion.
- Action items are optional for completion.
- Fathom-imported meeting data is draft input only; governance completion remains the approval point.
- Selected action items saved during governance completion create owner-assigned Task records with `source_type=governance_action_item`.
- Standalone Fathom meeting artifacts do not create Task records directly.

Generated agenda/brief notes:

- The new direction is to implement anything feasible without AI first. Governance agenda drafts and governance briefs are feasible as deterministic, source-backed generators.
- The first implementation should expose the API surface, service boundaries, persistence shape, validation, permissions, OpenAPI docs, and tests needed by a future governance agent while returning useful non-AI output now.
- The generation layer should depend on an interface/port so a future AI agent can replace or enhance deterministic generation without changing route contracts or governance event persistence.
- Deterministic generation should use account, engagement, health, opportunities, escalations, activities/tasks, prior governance records, open action items, decisions, and timeline data where those backend sources exist.
- Missing source data should produce clear gap statements or empty sections, not fabricated content.
- Manual agenda editing must continue to work even if generation fails or source context is sparse.
- Generated output is advisory, source-backed, human-owned, and must never create decisions or action items automatically.

## Existing UI Entry Points

- Dashboard calendar:
  - `frontend/src/pages/Dashboard.tsx`
  - Renders `AddGovernanceEventDialog` in the Global Meetings Calendar toolbar.
- Standalone Governance page:
  - `frontend/src/pages/Governance.tsx`
  - `frontend/src/components/governance/GovernancePanel.tsx`
  - Renders `AddGovernanceEventDialog` in the governance calendar toolbar.
- Account 360 Governance tab:
  - `frontend/src/components/account/AccountWorkspacePanel.tsx`
  - Shows governance details for the current account.
  - Current action is only `View calendar`.

## User Flow

Current intended user flow:

1. User opens a calendar-style governance view.
2. User clicks `Add governance event`.
3. User selects account, event type, date, agenda, and attendees.
4. Event appears in governance/calendar views.
5. A linked timeline event is emitted.

17.1 scheduling flow notes:

1. User schedules the governance event manually from Dashboard, Governance page, or eventually the Account 360 Governance tab.
2. System stores the event against an account and optional engagement.
3. System calculates status from event date and completion state:
   - `upcoming` for future scheduled events.
   - `overdue` for past events not completed.
   - `completed` after required notes are captured and the event is closed. Decisions/action items are optional.
4. System should expose upcoming events for dashboards and reminder generation.
5. System should emit source-linked timeline events for scheduling and completion.

Account 360 expected future flow:

1. User opens an account.
2. User opens the Governance tab.
3. User clicks an account-scoped `Add governance event` action.
4. Dialog opens with the current account preselected.
5. User saves the event.
6. The Governance tab refreshes to show the new record.

Dashboard calendar flow:

1. User opens the Dashboard calendar.
2. User sees calendar items from a unified calendar projection, including governance events, renewal items, and score activities.
3. User can create a governance event from the Dashboard action.
4. System stores the governance event as a governance domain record.
5. Dashboard receives the event as a `kind = governance` calendar item projection.
6. Upcoming governance events within 30 days appear in the Dashboard upcoming list.
7. Overdue governance events appear in the Dashboard overdue list and create/dedupe top-right notification reminders for the event owner.

Account Governance tab flow:

1. User opens an account.
2. User opens the Governance tab.
3. User sees governance domain records for the current account, not generic calendar items.
4. User can add, view, update, complete, and review event notes/decisions/governance-local action items from this tab.
5. Event details shown here should be governance-specific and can deep-link to the same detail used by `/governance`.

Standalone Governance page flow:

1. User opens `/governance` from accepted links/actions, not from sidebar navigation in this pass.
2. User sees a complete calendar/list workspace.
3. Calendar can show governance, renewal, and score activity item types.
4. Governance creation and governance event details remain backed by governance APIs.
5. Non-governance calendar items remain routed to their own feature contexts.

Reminder flow notes:

1. Upcoming governance events should appear in dashboards/calendar views.
2. Overdue governance events should generate an in-app top-right notification for the event owner.
3. Reminder notifications must be deduped per event/owner/status transition so the same overdue event does not spam the user.
4. Google Calendar reminders are part of integration scope and should not be mixed into the first manual scheduling implementation.

Source-backed agenda draft flow:

1. User opens a governance event detail view.
2. User clicks `Generate agenda`.
3. Frontend calls `POST /api/governance-events/{event_id}/agenda-draft`.
4. Backend validates permission, event existence, account context, and source access.
5. Backend calls a generator interface. The initial implementation uses deterministic templates/rules rather than a real AI agent.
6. If generation fails or source context is sparse, frontend shows a clear non-blocking error/gap state and keeps manual agenda editing available.
7. The initial implementation returns an editable deterministic, source-backed draft with citations/gap notes.
8. User edits/accepts the agenda.
9. Frontend calls `PATCH /api/governance-events/{event_id}/agenda`.
10. Backend stores the accepted agenda text and source links used for the accepted version.

Governance brief flow:

1. User opens a governance event detail view.
2. User clicks `AI Brief`.
3. Frontend calls `POST /api/governance-events/{event_id}/ai-brief`.
4. Backend validates permission, event existence, account context, and source access.
5. Backend calls a brief-generator interface. The initial implementation uses deterministic source aggregation rather than a real AI agent.
6. Backend returns a cited prep brief with a disclaimer, source gaps, and `generation_method = deterministic`.
7. When a future agent is configured, the same interface can return an AI-assisted brief with `generation_method = ai_agent`.
8. User can read/copy/reference the brief, but the brief cannot directly create decisions or action items.

## Backend Plan

- Routers:
  - Governance event CRUD/list APIs.
  - Governance event complete API.
  - Governance calendar projection/list API for calendar surfaces, or a service method consumed by existing dashboard/calendar APIs if those are introduced elsewhere.
  - `POST /api/governance-events/{event_id}/agenda-draft`.
  - `PATCH /api/governance-events/{event_id}/agenda`.
  - `POST /api/governance-events/{event_id}/ai-brief`.
- Services:
  - Governance scheduling and notes/decision handling.
  - Governance status calculation.
  - Calendar projection service that maps governance domain events into unified calendar items without coupling other calendar item types to governance storage.
  - Reminder candidate lookup for overdue governance events and dashboard upcoming events.
  - Notification dispatch/dedupe hook for governance overdue reminders.
  - Source context service that gathers authorized account, engagement, health, opportunity, escalation, activity/task, timeline, and prior governance context where available.
  - Agenda draft orchestration service that validates context, calls an agenda-generator port, and stores generated draft metadata/citations.
  - Governance brief orchestration service that validates context, calls a brief-generator port, and stores generated brief metadata/citations.
  - Default deterministic generator adapters so routes are useful before the real AI agent exists.
- Repositories:
  - Persistence for governance events, attendees, notes, decisions, and action items.
  - Query governance events by account, engagement, type, status, date range, owner, attendee, source, agenda/notes/decisions/action-item search text, sort, and pagination.
  - Query upcoming and overdue governance events by account, owner, date range, and status for dashboard/reminder consumers.
  - Persist notification dedupe metadata if the notification layer does not already provide per-source dedupe.
  - Persistence for generated output records and citation records.
- Schemas/validation:
  - Create/update schemas with meaningful field-level errors.
  - Agenda draft request/response schemas.
  - Agenda update schema that stores accepted edited agenda content and source references.
  - Governance brief request/response schemas with cited sections, source gaps, disclaimer, and generation method.
  - Calendar item response schema with `kind`, source record id/type, account, owner, date, status, title, detail, and route.
- Helpers:
  - Status calculation for upcoming, completed, and overdue records.
  - Attendee normalization/parsing if free-form import remains supported.
  - Source/citation serialization helpers, kept separate from provider-specific generation.
  - Deterministic agenda section builder by governance type.
  - Deterministic brief section builder for health snapshot, recent changes, open signals/escalations, talking points, pending decisions, and action items.

Generated agenda/brief design guardrails:

- Do not put provider-specific AI code in routers.
- Do not hard-code LLM prompts into governance event services.
- Use an interface/port such as `GovernanceAgendaGenerator` and `GovernanceBriefGenerator`, backed first by deterministic implementations.
- Keep source retrieval behind a separate context provider so RBAC filtering can be enforced before any future AI call.
- Return stable domain errors for missing event, unauthorized source context, insufficient context, generation failure, and future provider-not-configured cases.
- Prefer deterministic output over provider-not-configured errors when authorized source context is available.
- Tests should be able to inject a fake generator without external network access.

Suggested deterministic agenda sections:

- Account health and risk review.
- Open opportunities and expansion discussion.
- Escalations, blockers, and client-impact review.
- Pending decisions from prior governance events.
- Open action items and overdue follow-ups.
- Upcoming renewal/SOW/engagement milestones where available.
- Next-step ownership and due dates.

Suggested deterministic brief sections:

- Health snapshot.
- Recent changes since the last governance event.
- Open signals/escalations or a clear no-data/no-open-items state.
- Talking points derived from opportunities, risks, overdue actions, and recent timeline entries.
- Pending decisions.
- Open action items.
- Source gaps/insufficient data notes.

## API Documentation

- Add Swagger summaries and descriptions for governance APIs.
- Document validation errors and unauthorized responses.
- Document response models for governance events and action items.
- Document agenda draft and governance brief endpoints as deterministic now and AI-agent compatible later.
- Document insufficient-context/source-gap behavior for generation endpoints.
- Clearly state that generated output is advisory, cited, human-owned, and does not create decisions or action items automatically.

## Database Plan

- Tables:
  - `governance_events`
  - `governance_event_attendees`
  - `governance_notes`
  - `governance_decisions`
  - `governance_action_items`
  - `governance_generated_outputs`
  - `governance_generated_output_citations`
  - Notification/dedupe storage for governance overdue reminders only if the existing notification layer does not provide source-level dedupe.
- Columns:
  - Use snake_case.
  - Event fields should include account, optional engagement, type, scheduled date/time, agenda, status, source, owner, created/updated metadata.
  - Attendee fields should support email as the primary first-pass value. Name/title/company/internal-external type can be added later when a people/stakeholder module is available.
  - Note fields should support event, body, author, source, created/updated metadata, and future pagination.
  - Decision fields should support event, decision text, owner/decider where available, source, and created metadata.
  - Action-item fields should support event, title, owner, due date, status, source, and created/updated metadata.
  - Generated output fields should support event, output type, generation method, status, content, disclaimer, source filter metadata, provider/model metadata when available, error code/message, created/updated metadata.
  - Citation fields should support output, source type, source id, source title, source URL/reference, snippet/summary, and source timestamp where available.
- Migrations:
  - Current project uses SQLAlchemy metadata creation; revisit if migration tooling is introduced.
- Snake_case schema check:
  - Extend schema test coverage.

## Frontend Plan

- Pages/components:
  - Reuse existing governance UI where possible.
  - Make `/governance` fully functional but do not add it to the sidebar in this pass.
  - Keep accepted dashboard/page links to `/governance` where already present or needed.
  - Add account-scoped action on Account 360 Governance tab.
  - Replace comma-separated attendee names with email-based attendee capture.
  - Add `Generate agenda` and governance brief controls on governance detail.
  - Add editable agenda draft area that works manually even when generation is unavailable or sparse.
  - Add cited brief display shape with disclaimer, source gaps, loading, empty, and error states.
- Stores/hooks/services:
  - Replace local governance store writes with API-backed calls.
  - Add frontend service functions for agenda draft, agenda update, and AI brief endpoints.
- Form behavior:
  - Remove HTML `required` usage from governance forms.
  - Display backend validation errors beside matching fields.
  - Attendee UX should allow adding/removing attendee email rows or chips rather than asking users to type comma-separated names.
  - Generation errors should be non-blocking and should not erase manually entered agenda content.
- Backend error display:
  - Use existing API field-error pattern.

List behavior:

- Governance list/calendar should support search over agenda, notes, decisions, and action items.
- Filters should include account, engagement, governance type, status, date range, owner, attendee, and source.
- Sorting should include event date, status, and updated date.
- List APIs should be paginated; calendar views should support date navigation.
- Dashboard calendar and Governance page calendar should use a unified calendar item shape so governance, renewal, and score activity items can coexist without sharing persistence tables.
- Account 360 Governance tab should display governance records only, not generic calendar items.
- Calendar item detail actions should route by item kind.

## Validation And Errors

- Required backend validation:
  - Account is required.
  - Event type is required and must be supported. Specs list QBR, SteerCo, Monthly Review, and Executive Review.
  - Date is required and valid.
  - Agenda is required with meaningful min/max length rules.
  - Attendees must be parsed and validated consistently as email addresses.
  - Attendee email should be required when an attendee row/chip is present.
  - Attendee emails should be normalized and deduped per event.
  - Duplicate attendee emails should return a meaningful field-level error.
  - Governance brief generation requires account context and authorized source retrieval.
  - Agenda draft generation requires an existing governance event and authorized account context.
  - Agenda acceptance stores edited content and source links when a draft was source-backed.
  - Generated output must include citations for factual claims or explicit insufficient-data/source-gap notes.
  - Generation failures must not block manual agenda editing.
  - Generated briefs cannot create decisions or action items automatically.
  - Completion requires notes. Decisions and action items are optional.
  - Overdue notification creation should be idempotent per governance event and owner.
- Frontend should show backend field errors near each field.

## Audit And Timeline

- Audit governance event creation, updates, cancellation/rescheduling if supported, completion, notes, decisions, action items, agenda generation, and governance brief generation.
- Emit account timeline entries for material governance events, especially scheduling, completion, decisions, and action items where product-visible.
- Generated output records should retain generation method, actor, timestamp, source filters, cited records, and failure reason where applicable.
- Log or otherwise dedupe governance overdue notification creation by event, owner, and overdue state.

## Implementation Sequence

1. Use the new backend account/engagement foundation from `dev`; do not add a separate minimal account model for governance.
2. Write or update backend tests first for governance CRUD, email-attendee validation, RBAC, OpenAPI, snake_case schema coverage, pagination, filtering, sorting, audit/timeline hooks, overdue notification dedupe, calendar projection, and at least one relevant edge case.
3. Add governance database models, repositories, services, schemas, and routes for scheduling, notes, decisions, email attendees, and action items.
4. Add deterministic generation tests before implementation:
   - Source-backed agenda draft generated without AI/network calls.
   - Source-backed governance brief generated without AI/network calls.
   - Missing source data produces gap notes rather than fabricated claims.
   - Generator port can be swapped with a fake future-agent implementation.
5. Add generated-output storage, repository methods, source context provider, service ports, deterministic generators, route handlers, schemas, and Swagger docs.
6. Update frontend API services/stores so governance data is API-backed rather than local-only.
7. Update frontend UI for dashboard calendar functionality, `/governance` functionality without sidebar nav, account-scoped scheduling, email attendee rows/chips, field-level backend errors, agenda editing, deterministic generation, cited brief display, and non-blocking generation errors.
8. Run targeted backend/frontend tests, lint/typecheck, and update this feature file with final decisions and test notes.

## Tests

- Backend unit/API tests:
  - Create governance event.
  - List governance events.
  - Validation error cases.
  - Attendee email validation, normalization, and duplicate handling.
  - Auth required.
  - RBAC permission boundaries for view/create/update/generate.
  - Search/filter/sort/pagination for governance lists.
  - Calendar projection returns governance items without treating the calendar as governance-only storage.
  - Upcoming dashboard query returns future governance items.
  - Overdue query/status returns past incomplete governance events.
  - Overdue governance notification is created once per event owner and deduped.
  - Agenda draft endpoint returns deterministic source-backed output without AI.
  - Agenda draft service can use an injected fake generator and persist output/citations.
  - Manual agenda update works without AI generation.
  - Governance brief endpoint returns deterministic source-backed output without AI.
  - Governance brief service can use an injected fake generator and persist output/citations.
  - Governance brief output cannot create decisions or action items.
  - Missing source data creates gap notes rather than fabricated claims.
  - Audit/timeline hooks are called for material governance changes.
  - OpenAPI includes governance CRUD, agenda, and AI brief routes.
  - Snake_case schema coverage.
- Frontend unit/component tests:
  - Form displays backend validation errors.
  - Successful creation updates visible governance records.
  - Account-scoped creation preselects the current account if implemented.
  - Account Governance tab can add and view governance event details.
  - Dashboard calendar shows governance upcoming/overdue items.
  - Governance page calendar distinguishes governance, renewal, and score activity item types.
  - Attendee email rows/chips show field-level validation errors.
  - Generate agenda returns a deterministic draft and preserves manual edits until accepted.
  - Editable agenda draft can be saved through the agenda update flow.
  - Governance brief shows deterministic sections, source gaps, disclaimer, and citations.
  - Generation error state is non-blocking.
  - Cited brief display renders disclaimer and source links when given mocked data.

## Implementation Update - 2026-05-31

- Backend governance slice implemented:
  - Added SQLAlchemy models for governance events, attendees, notes, decisions, governance-local action items, generated outputs, and generated output citations.
  - Added repository/service/router layers for scheduling, listing, calendar projection, completion, deterministic agenda draft, accepted agenda update, and deterministic governance brief.
  - Added Swagger/OpenAPI descriptions under the `Governance Reviews` tag.
  - Added audit/timeline hooks for governance scheduling, updates, completion, and generated-output actions.
  - Enforced governance action-item ownership when action items are captured, alongside required due dates.
  - Added decision-specific governance timeline entries during completion so decision history is source-linked independently of the completion note.
- Frontend governance slice implemented:
  - Added API service and API-backed governance store.
  - Updated governance types to include Monthly Review, email attendees, notes, decisions, action item records, and generated outputs.
  - Reworked Add Governance Event dialog to use attendee email rows, backend field errors, and account-scoped creation.
  - Added Account 360 Governance tab scheduling and completion flow.
  - Updated Governance page event drawer to call deterministic agenda draft and governance brief APIs.
  - Added a Governance page event register for QA-complete event discovery, searching, filtering, sorting, opening, editing, completing, and cancelling.
  - Added Governance page register filters for engagement, attendee email, source, and date range, plus UI pagination.
  - Made generated agenda drafts editable before acceptance and displayed source citations with source links where available.
  - Added shared edit/complete action dialogs so Governance page and Account 360 use the same backend-backed event actions.
  - Kept `/governance` route functional without adding sidebar navigation.
  - Made Dashboard calendar month navigation functional and kept Account Governance `View calendar` pointing to Dashboard.
  - Added owner-only `governance_overdue` notification trigger with source-key dedupe.
- Verification run:
  - `docker compose run --rm --no-deps backend pytest tests/test_governance.py -q` -> 4 passed, 1 warning.
  - `python3 -m compileall backend/app backend/tests/test_governance.py` -> passed.
  - `npm test -- governance` -> 4 passed.
  - `npm run build` -> passed with existing Vite chunk-size warning.

## Linting And Quality

- Lint/typecheck commands:
  - `make test` or targeted backend/frontend tests.
- Known code smells or tradeoffs:
  - Existing frontend has a unified calendar projection; keep that pattern and avoid making calendar persistence governance-specific.
  - The `ai-brief` route name comes from the spec, but first implementation should return deterministic source-backed output with `generation_method = deterministic`.
  - Real agent/LLM implementation will plug into the same generator ports later.

## Resolved Decisions

- First-pass statuses are `upcoming`, `overdue`, `completed`, and `cancelled`; cancellation has backend support but no dedicated UI action in this pass.
- Recurrence is excluded from this pass.
- Frontend brief action uses `Generate brief`; the backend route remains `/ai-brief` for spec compatibility.
- Agenda drafts are stored as generated output records and accepted edited content updates the governance event agenda.
- Generated output history is retained.
- Deterministic generation uses currently available backend-backed context and returns source-gap notes when context is sparse.
- Generation follows Story 14.2 permissions while the real AI agent remains a future plug-in.

## Open Questions

- Should a future PR add Governance to sidebar navigation and change Account Governance `View calendar` links from Dashboard to `/governance?account=<id>`?
- Should KAM Head receive digest/escalation-style notifications for overdue governance events instead of per-event notifications?
- When the notification feature is implemented, should overdue governance reminders use an immediate overdue trigger, a 30-day grace threshold, or configurable reminder policies per governance type/account?
- Should governance-local action items later sync into the Tasks module after task ownership rules are defined?

## Handoff Notes

- Agenda generation and governance briefs are in scope as deterministic, source-backed workflows now; real agent/LLM implementation is intentionally held for a future plug-in.
- Integration sync with Google Calendar/Fathom belongs to Feature 28 and should not be mixed into this work.
- Governance overdue notifications currently exist as frontend-local QA wiring. The proper production implementation should live in the future notification feature as backend-scheduled, persisted, source-deduped notification creation that is not dependent on the event owner being logged in.
