# SOW Upload Field Auto-Fill

## Summary

The account creation SOW/charter upload now runs silently in the background and uses extracted document content to fill the account intake fields. The create dialog no longer shows a PDF preview or extracted-data CKEditor section during account creation.

## Behavior

- Uploaded PDF/DOCX/TXT/CSV/XLSX/XLS files continue to be stored and extracted by the backend onboarding flow.
- File selection calls `/api/onboarding/uploads/extract`, which reads the upload temporarily and returns autofill fields without creating an onboarding draft or source document.
- Clicking `Create draft` calls `/api/onboarding/drafts/upload`, stores the source document, and creates the onboarding draft with the reviewed form values as the source of truth for Account Information.
- The create dialog uses extracted content to fill `Name of Account`, `Name of Project`, `Company URL`, and `LinkedIn URL`.
- Account creation upload field mapping uses the shared SOW structured extraction service: OpenAI first when `AI_KYC_API_KEY` is configured, then local/deterministic fallback if AI is unavailable.
- The same source file may be reused across drafts or account attachments; file checksum is retained for traceability but does not block upload.
- Duplicate validation is account-focused: matching account name or company URL marks the draft as a possible duplicate before approval.
- Missing values remain blank so the user can fill them manually.
- If the uploaded source does not include an engagement start date, the onboarding draft uses the current date as an editable project start default so KAM Head/Admin approval can proceed in one click.
- Approval also normalizes legacy drafts with blank engagement start dates before validation and writes an audit entry for defaults applied during approval.
- Re-uploading/replacing the source document clears the mapped fields and reruns extraction against the new file.
- The backend does not use the uploaded filename as a fallback account or project name.
- Stored source documents remain downloadable in onboarding and account review workflows.
- Stored source documents are retained for future KYC/RAG source context, not as an override for reviewed Account Information fields.
- Engagement tab `Import Charter` uses the same extraction contract for project charter/SOW files and creates an engagement plus stakeholders from mapped content.

## Files

- `backend/app/services/onboarding.py`
- `backend/app/services/sow_extraction.py`
- `backend/app/services/engagements.py`
- `backend/app/routers/accounts.py`
- `backend/app/services/kyc_document_extraction.py`
- `backend/app/services/storage.py`
- `backend/app/schemas.py`
- `frontend/src/components/account/CreateAccountDialog.tsx`

## Tests

- `backend/tests/test_account_workspace.py`
- `frontend/src/components/account/CreateAccountDialog.test.tsx`
