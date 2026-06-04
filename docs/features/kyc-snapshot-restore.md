# KYC Snapshot Restore

## Summary

Adds a safe way for KAM Head users to make a previous approved KYC version active without mutating or deleting historical snapshots.

## Behavior

- Approved KYC snapshots remain immutable.
- Restoring an older snapshot creates a new snapshot version copied from the selected version.
- The restored copy becomes active because it is the latest approved snapshot version.
- Restore reason is mandatory.
- Only KAM Head can restore a snapshot.
- Restoring the current active snapshot is blocked.
- Audit and timeline entries record the restore action, previous active version, restored-from version, actor, and reason.

Example:

| Version | Meaning |
|---|---|
| v1 | Original approved KYC |
| v2 | Later approved KYC |
| v3 | Restored copy of v1; active KYC |

## API

- `POST /api/accounts/{account_id}/kyc/snapshots/{snapshot_id}/restore`

Request:

```json
{
  "reason": "Previous version has the correct stakeholder and financial context."
}
```

Response:

- New `KycSnapshotRead` for the restored version.

## Files

- `backend/app/schemas.py`
- `backend/app/services/kyc.py`
- `backend/app/routers/kyc.py`
- `frontend/src/services/kyc.ts`
- `frontend/src/components/account/KYCAssistedReview.tsx`
- `frontend/src/components/account/KYCAssistedReview.test.tsx`
- `backend/tests/test_kyc_ai_extraction.py`

## Tests

- Backend: restores v1 as v3 after v2 is active.
- Backend: non-KAM Head restore is rejected.
- Backend: empty restore reason is rejected.
- Backend: active snapshot cannot be restored.
- Frontend: Snapshot History opens restore modal and calls restore API with reason.
