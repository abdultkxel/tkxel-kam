# Timeline And Handover

## Summary

Account Timeline keeps a source-linked account history with standard keyword search, filters, manual event creation, comments, retention-aware records, and handover support.

## Current Scope

- Account Timeline view continues to show account history, sort controls, manual event creation, keyword search, filters, and timeline cards.
- The Account Timeline add-event dialog uses a structured event form with title, type, description, attachment, date, event metadata, and sensitivity controls.
- Timeline cards render in normal page flow so expanded change details and comment forms reserve their own vertical space.
- Admin Timeline explains the account history view and keeps the timeline type editor available for fresh setup.
- Timeline type seed/mock data is intentionally empty so admins can create the taxonomy themselves instead of starting with preloaded rows.
- The Admin Timeline section includes a direct account Timeline link so users can move from Admin to the first available account history view.
- The AI-powered timeline search panel is intentionally hidden from the timeline view as of this change.
- Existing backend AI Timeline Search APIs remain available for now; this change only removes the frontend affordance from the Account Timeline experience.

## Decisions

- Removed the `TimelineAISearch` mount from `TimelineFeed` instead of deleting the reusable AI component or backend route, keeping the change scoped to the requested view.
- Kept standard timeline keyword search in place because it is part of the non-AI timeline filtering workflow.
- Added concise Admin copy explaining that Timeline captures KYC updates, score changes, stage movement, opportunities, governance, escalations, notes, comments, source links, and retention state.
- Removed only the preloaded timeline type rows from frontend fallback data and backend default seeding; the Admin Timeline type management controls remain available.
- Backend tests that create manual timeline notes now create the required `manual_note` event type explicitly in their setup.
- Add-event now blocks saving and links to Admin Timeline setup when there are no active timeline types.
- Admin Timeline Type creation stores the selected event-type slug separately from the display name, and Add-event submits that selected slug.
- Removed fixed-height virtualized timeline rows because guessed row sizes caused empty gaps and expansion overlap for change details and comments.

## Test Notes

- Added `frontend/src/components/timeline/TimelineFeed.test.tsx` to verify timeline entries and standard search still render while the AI search panel, Ask input, document toggle, and KAM AI handoff are absent.
- Added TimelineFeed regression coverage that timeline cards render as a normal semantic list without fixed virtual row heights.
- Added `frontend/src/components/timeline/AddNoteModal.test.tsx` coverage for the revised add-event dialog, payload submission, and empty timeline-type setup state.
- Added Admin page coverage for the Timeline explanation, account Timeline navigation link, empty timeline type editor, and empty-state row.
- Added backend coverage that default seeding leaves timeline event types empty.
