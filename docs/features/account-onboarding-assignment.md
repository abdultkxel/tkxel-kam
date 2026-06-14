# Account Onboarding Assignment

## Summary

Account onboarding drafts now require a real Account Manager assignment before approval. Manual intake and upload-assisted draft creation both load active Account Manager/KAM users from the onboarding API instead of mock frontend data.

## Workflow

- Account Managers upload source-backed Excel project charter files. The upload creates persisted onboarding draft, source document, extraction, citation, and engagement-draft records in the database.
- KAM Head and Admin users receive persisted in-app review notifications when an AM creates a draft.
- Admins and KAM Heads can create onboarding drafts and select an Account Manager from active system users.
- Account Managers can create drafts; the form defaults to the current AM when they are an eligible candidate.
- Account Managers may self-assign their own drafts but cannot assign or reassign drafts to other AMs.
- Draft approval validates the persisted assignment. Missing, inactive, or non-AM owners return field-level validation errors on `primary_owner_id`.
- Draft approval also requires at least one engagement draft, guaranteeing every newly onboarded account creates an initial engagement record.
- Reviewers can update the assigned Account Manager on ready-for-review drafts before approving.
- Admin and KAM Head reviewers can approve or reject visible drafts. Approved drafts create official account, owner, engagement, source-document links, default stakeholder, default KYC draft, audit, timeline, and outcome notification records. Rejected drafts remain stored with rationale and outcome notification records.
- Admin, KAM Head, Super Admin, and draft-capable Account Manager users see ready-for-review draft accounts in the Accounts listing. Draft rows link to onboarding review, not Account 360, until approval creates the official account.
- Account Manager Home dashboard includes an `Onboarding drafts` widget scoped to ready-for-review drafts the AM created or owns.
- Assigned Account Managers can see drafts assigned to them. Unrelated Account Managers do not see or read those drafts.
- Account Managers can open, edit, and approve their created/assigned draft review pages because the default Account Manager role now carries onboarding approval permission. Unrelated Account Managers remain blocked by draft visibility.
- Draft decision and document endpoints enforce draft visibility before mutation or source download, preventing users with general onboarding access from acting on hidden drafts by ID.

## API

- `GET /api/onboarding/account-managers` returns active users with account-manager assignment roles.
- `POST /api/onboarding/drafts` persists `primary_owner_id`, `primary_owner_name`, and `primary_owner_email` when supplied.
- `PATCH /api/onboarding/drafts/{draft_id}` can update `primary_owner_id` on open drafts.
- `POST /api/onboarding/drafts/{draft_id}/approve` rejects unassigned or invalid owners before creating the official account.
- `POST /api/onboarding/drafts/{draft_id}/reject` stores a required rejection reason and notifies the draft uploader/owner.
- `GET /api/onboarding/drafts/{draft_id}/documents/{document_id}/download` returns only stored source documents visible to the requesting user.

## Tests

- Backend coverage lives in `backend/tests/test_account_workspace.py`.
- Full DB-backed notification story coverage lives in `backend/tests/test_notification_workflow_revamp.py::test_account_onboarding_sow_upload_review_decisions_are_db_backed`.
- Frontend coverage lives in `frontend/src/components/account/CreateAccountDialog.test.tsx`, `frontend/src/pages/Accounts.test.tsx`, `frontend/src/pages/Dashboard.test.tsx`, and `frontend/src/pages/Onboarding.test.tsx`.
