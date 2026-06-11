# Timeline And Handover

## Summary

Account Timeline keeps a source-linked account history with standard keyword search, filters, manual event creation, comments, retention-aware records, and handover support.

## Current Scope

- Account Timeline view continues to show account history, sort controls, manual event creation, keyword search, filters, and timeline cards.
- The AI-powered timeline search panel is intentionally hidden from the timeline view as of this change.
- Existing backend AI Timeline Search APIs remain available for now; this change only removes the frontend affordance from the Account Timeline experience.

## Decisions

- Removed the `TimelineAISearch` mount from `TimelineFeed` instead of deleting the reusable AI component or backend route, keeping the change scoped to the requested view.
- Kept standard timeline keyword search in place because it is part of the non-AI timeline filtering workflow.

## Test Notes

- Added `frontend/src/components/timeline/TimelineFeed.test.tsx` to verify timeline entries and standard search still render while the AI search panel, Ask input, document toggle, and KAM AI handoff are absent.
