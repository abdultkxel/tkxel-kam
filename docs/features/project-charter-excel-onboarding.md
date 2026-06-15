# Project Charter Excel Onboarding

## Summary

The Create Account upload flow reads Excel project charters with deterministic spreadsheet/document parsers, fills the intake form, and creates an editable onboarding draft. The CSV import flow remains unchanged.

## Workflow

- Create Account accepts only Excel project charter uploads: `.xlsx`, `.xlsm`, and `.xls`. PDF, DOCX, TXT, and CSV files are rejected in this flow.
- The Create Account upload preview and draft creation calls send `use_ai=false`, so parser-backed extraction is used and no SOW AI enrichment runs for this path.
- Excel key/value rows such as `Account Name`, `Project Name`, `Industry Vertical`, `Project Kickoff Date`, finance terms, streams, and risk rows are mapped into account and engagement draft fields.
- Missing company or LinkedIn URLs do not block draft creation when a source file is uploaded. Reviewers can add or edit them on the onboarding draft before approval.
- Draft creation notifies the assigned Account Manager, unless they created it, and always notifies KAM Head, including when KAM Head created the draft.
- Account Managers can save and approve visible drafts they created or own, including drafts assigned to them by KAM/Admin users; KAM Heads retain portfolio approval rights.
- Saving changed draft fields sends an `account_draft_updated` notification to the assigned AM and KAM Head, excluding the user who made the change.
- Approval creates the official account and sends KAM Head a `New account onboarded` notification.
- The side upload and draft queue rail is hidden while a draft is selected so the review screen focuses on draft details.
- The selected draft review screen shows source document download and SOW/charter re-upload together in the left-side `SOW / charter source` section. Re-uploading replacement source files refreshes extracted account fields, citations, and the engagement draft before approval.

## API

- `POST /api/onboarding/uploads/extract` accepts `use_ai` form data. `false` disables AI enrichment after parser extraction.
- `POST /api/onboarding/drafts/upload` accepts `use_ai` form data and persists source-backed drafts from parser output.
- `POST /api/onboarding/drafts/{draft_id}/documents/upload` replaces source files on a draft that is still ready for review and re-runs source extraction.
- `PATCH /api/onboarding/drafts/{draft_id}` saves editable draft account fields and Account Manager assignment.
- `POST /api/onboarding/drafts/{draft_id}/approve` onboards the account after validation.

## Tests

- Backend coverage: `backend/tests/test_account_workspace.py::test_create_account_charter_upload_uses_excel_parser_draft_edits_and_am_approval`.
- Backend re-upload coverage: `backend/tests/test_account_workspace.py::test_onboarding_draft_source_reupload_replaces_document_and_refreshes_fields`.
- Frontend Create Account coverage: `frontend/src/components/account/CreateAccountDialog.test.tsx`.
- Frontend draft edit coverage: `frontend/src/pages/Onboarding.test.tsx`.
