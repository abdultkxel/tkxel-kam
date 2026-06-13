# Timeline And Handover

## Summary

Account Timeline keeps a source-linked account history with standard keyword search, filters, manual event creation, comments, retention-aware records, and handover support.

## Current Scope

- Account Timeline view continues to show account history, sort controls, manual event creation, keyword search, filters, and timeline cards.
- The Account Timeline add-event dialog uses a structured event form with title, type, description, attachment, date, and event metadata. Manual events created from this dialog are saved as non-sensitive.
- Timeline cards render in normal page flow so expanded change details and comment forms reserve their own vertical space.
- Admin Timeline has been removed; account teams access Timeline from the account detail page only.
- Manual account events use a fixed seeded catalog: Manual note, Governance update, Escalation update, Opportunity update, and Client education.
- Account Timeline add-event and filters read event types through the non-admin `GET /api/timeline-event-types` endpoint.
- The AI-powered timeline search panel is intentionally hidden from the timeline view as of this change.
- Existing backend AI Timeline Search APIs remain available for now; this change only removes the frontend affordance from the Account Timeline experience.

## Decisions

- Removed the `TimelineAISearch` mount from `TimelineFeed` instead of deleting the reusable AI component or backend route, keeping the change scoped to the requested view.
- Kept standard timeline keyword search in place because it is part of the non-AI timeline filtering workflow.
- Removed the Admin Timeline navigation tab, status tile, explanatory panel, and type editor.
- Removed the Account Timeline dependency on Admin Timeline setup; unavailable event types now show a non-admin retry message.
- Removed the manual add-event visibility/sensitivity toggle because manual event classification is handled by event type and the toggle was not meeting a distinct business gap.
- Seed data and migration now upsert the fixed manual timeline event catalog idempotently without deleting historical/custom rows.
- Removed fixed-height virtualized timeline rows because guessed row sizes caused empty gaps and expansion overlap for change details and comments.

## Test Notes

- Added `frontend/src/components/timeline/TimelineFeed.test.tsx` to verify timeline entries and standard search still render while the AI search panel, Ask input, document toggle, and KAM AI handoff are absent.
- Added TimelineFeed regression coverage that timeline cards render as a normal semantic list without fixed virtual row heights.
- Added `frontend/src/components/timeline/AddNoteModal.test.tsx` coverage for the revised add-event dialog, fixed-catalog payload submission, absence of sensitivity controls, and non-admin unavailable state.
- Added Admin page coverage that the Timeline tab, status tile, and type editor are absent and `/admin?section=timeline` falls back to Users.
- Added backend coverage that default seeding creates the fixed event catalog and non-admin timeline users can read active event types.
