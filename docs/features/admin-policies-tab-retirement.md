# Admin Policies Tab Retirement

## Summary

The Admin Policies tab has been retired because it showed frontend-local mock sensitive access policy data and did not grant or enforce real permissions.

## Scope

- Removed the `policies` entry from the Admin section tabs.
- Removed the unused `SensitivePolicyTable` component.
- Removed the mock sensitive policy and access audit store state.
- Removed the client-only timeline sensitive-view audit write that only fed the retired mock panel.
- Kept real RBAC-backed sensitive access behavior intact for timeline entries, KYC/source documents, account sources, roles, and permissions.
- Kept backend field-permission APIs unchanged; they are separate from the retired mock tab.

## Tests

- Admin page coverage verifies `/admin?section=policies` falls back to Users and the Policies tab/mock panel are absent.
