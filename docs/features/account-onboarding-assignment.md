# Account Onboarding Assignment

## Summary

Account onboarding drafts now require a real Account Manager assignment before approval. Manual intake and upload-assisted draft creation both load active Account Manager/KAM users from the onboarding API instead of mock frontend data.

## Workflow

- Admins and KAM Heads can create onboarding drafts and select an Account Manager from active system users.
- Account Managers can create drafts; the form defaults to the current AM when they are an eligible candidate.
- Account Managers may self-assign their own drafts but cannot assign or reassign drafts to other AMs.
- Draft approval validates the persisted assignment. Missing, inactive, or non-AM owners return field-level validation errors on `primary_owner_id`.
- Draft approval also requires at least one engagement draft, guaranteeing every newly onboarded account creates an initial engagement record.
- Reviewers can update the assigned Account Manager on ready-for-review drafts before approving.
- Admin, KAM Head, and Super Admin users see ready-for-review draft accounts in the Accounts listing. Draft rows link to onboarding review, not Account 360, until approval creates the official account.
- Assigned Account Managers can see drafts assigned to them. Unrelated Account Managers do not see or read those drafts.

## API

- `GET /api/onboarding/account-managers` returns active users with account-manager assignment roles.
- `POST /api/onboarding/drafts` persists `primary_owner_id`, `primary_owner_name`, and `primary_owner_email` when supplied.
- `PATCH /api/onboarding/drafts/{draft_id}` can update `primary_owner_id` on open drafts.
- `POST /api/onboarding/drafts/{draft_id}/approve` rejects unassigned or invalid owners before creating the official account.

## Tests

- Backend coverage lives in `backend/tests/test_account_workspace.py`.
- Frontend coverage lives in `frontend/src/components/account/CreateAccountDialog.test.tsx`.
