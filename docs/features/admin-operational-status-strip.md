# Admin Operational Status Strip

## Summary

The Admin status strip now highlights operational attention points instead of low-value configuration counters.

## Scope

- Replaced the old Integrations/Open, Alert rules, and Email triggers tiles with System health, Active alerts, Integration health, and Failed jobs.
- Loaded tile values from existing API-backed services:
  - `/api/admin/system-health`
  - `/api/alerts?status=active`
  - `/api/admin/integrations`
  - `/api/admin/job-logs?status=failed`
- Kept tile navigation scoped to existing Admin sections: Audit log, Alert rules, and Integrations.
- Removed the unused inline notification settings helper left behind in the Admin page.

## Tests

- Admin page coverage verifies the new operational tiles render, the retired Email triggers tile is absent, and tile navigation still opens the matching Admin sections.
