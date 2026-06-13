# Admin Segments Tab Retirement

## Summary

The Admin Segments tab has been retired because account segment configuration is no longer managed from a frontend-local Admin widget.

## Scope

- Removed the `segments` entry from the Admin section tabs.
- Removed the unused `SegmentSettings` component.
- Removed the now-unused `addSegmentTag` store action.
- Kept account `segment` fields and segment filters intact for Accounts, reporting, KYC, CSV import, and dashboards.

## Tests

- Admin page coverage verifies `/admin?section=segments` falls back to Users and the Segments tab/form are absent.
