# Admin Operational Status Strip

## Summary

The Admin status strip now highlights operational attention points instead of low-value configuration counters.

## Scope

- Replaced the old Integrations/Open, Alert rules, and Email triggers tiles with System health, Active alerts, and Failed jobs.
- Loaded tile values from existing API-backed services:
  - `/api/admin/system-health`
  - `/api/alerts?status=active`
  - `/api/admin/job-logs?status=failed`
- Kept tile navigation scoped to existing Admin sections: Audit log and Alert rules.
- Removed the Integration health status tile when Admin Integrations was removed from the Admin menu.
- Removed the unused inline notification settings helper left behind in the Admin page.

## Tests

- Admin page coverage verifies the operational tiles render, the retired Email triggers and Integration health tiles are absent, and tile navigation still opens the matching Admin sections.
