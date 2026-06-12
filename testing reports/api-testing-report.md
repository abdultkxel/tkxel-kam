# API Testing Report

Generated: 2026-06-12

Project: KAM Intelligence Platform

## Validation Summary

Targeted backend auth/RBAC/domain tests passed with `EXPOSE_RESET_TOKENS=true`. Full backend pytest could not be completed in the current environment because Docker Desktop was unavailable and the local suite timed out.

## Issue 1: Manual Source Document API Can Reference Arbitrary Local Paths

- Test type: API testing.
- Severity: Critical.
- Affected file/API/component:
  - `POST /api/accounts/{account_id}/attachments`
  - `POST /api/accounts/{account_id}/attachments/{attachment_id}/extract`
  - `GET /api/accounts/{account_id}/attachments/{attachment_id}/chunks`
  - `backend/app/schemas.py:950`
  - `backend/app/services/accounts.py:344`
  - `backend/app/services/kyc_document_extraction.py:549`
- Steps to reproduce:
  1. Authenticate as a user with account update permission.
  2. Create an attachment with `file_url` set to a local absolute file path.
  3. Trigger extraction on that attachment.
  4. Request chunks for the attachment.
- Expected result: APIs reject local filesystem paths supplied through `file_url`.
- Actual result: Extraction path resolution accepts non-HTTP absolute paths and can treat them as local files.
- Recommended fix:
  - Do not use `file_url` as a local extraction path.
  - Only extract files created through the upload API and stored by `ContentStorageService`.
  - Resolve paths and enforce they stay inside `LOCAL_CONTENT_STORAGE_DIR`.
- Suggested automated test:
  - Create a temp file outside storage, submit it as `file_url`, trigger extraction, and assert 400/422 with no chunks created.

## Issue 2: Old Access Tokens Still Work After Password Change

- Test type: API testing.
- Severity: High.
- Affected file/API/component:
  - `POST /api/auth/change-password`
  - `POST /api/auth/reset-password`
  - `GET /api/auth/me`
  - `backend/app/security.py:21`
  - `backend/app/dependencies.py:55`
- Steps to reproduce:
  1. Log in and save the bearer token.
  2. Change the password using the saved token.
  3. Call `/api/auth/me` with the old token.
- Expected result: Old token is rejected after password change/reset.
- Actual result: Confirmed locally: old token still returned 200 from `/api/auth/me`.
- Recommended fix:
  - Add token version, password-changed timestamp, or JWT revocation lookup.
  - Validate token freshness in `get_current_user`.
- Suggested automated test:
  - Log in, change password, call `/api/auth/me` with the old token, and assert 401.

## Issue 3: Google Calendar OAuth Callback Accepts Unvalidated State

- Test type: API testing.
- Severity: High.
- Affected file/API/component:
  - `GET /api/admin/integrations/google-calendar/oauth-callback`
  - `GET /api/integrations/google-calendar/oauth/callback`
  - `backend/app/services/integrations.py:549`
  - `backend/app/services/integrations.py:566`
- Steps to reproduce:
  1. Start an OAuth flow.
  2. Call the callback with a valid-looking `code` and arbitrary `state`.
- Expected result: Unknown, expired, or replayed state is rejected.
- Actual result: State is the user ID and no stored nonce validation is visible before token exchange.
- Recommended fix:
  - Generate and store a random expiring state nonce.
  - Validate and consume state on callback.
  - Add PKCE if supported.
- Suggested automated test:
  - Call callback with unknown state and assert credentials are not updated.

## Issue 4: API Client Has No Timeout Or Abort Semantics

- Test type: API testing.
- Severity: Medium.
- Affected file/API/component:
  - `frontend/src/services/api.ts:26`
- Steps to reproduce:
  1. Mock or simulate a backend request that never resolves.
  2. Trigger a page using `apiRequest`.
- Expected result: Request times out and UI shows a retryable error.
- Actual result: `fetch` has no timeout or `AbortController`.
- Recommended fix:
  - Add default timeout handling in `apiRequest`.
  - Allow longer overrides for AI/KYC operations.
- Suggested automated test:
  - Mock hanging `fetch`, advance timers, and assert timeout error is shown.

## API Coverage Recommendations

- Add negative tests for all admin and account-scoped APIs.
- Add upload boundary tests for size, MIME, extension, and empty body.
- Add pagination, invalid filter, and invalid sort tests across list endpoints.
- Add webhook replay and malformed signature tests.
