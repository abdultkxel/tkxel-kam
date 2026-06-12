# Edge Cases Testing Report

Generated: 2026-06-12

Project: KAM Intelligence Platform

## Issue 1: Upload Service Reads Entire File Before Size Enforcement

- Test type: Edge-case testing.
- Severity: Medium.
- Affected file/API/component:
  - Account attachment uploads.
  - Content uploads.
  - Task evidence uploads.
  - `backend/app/services/storage.py:37`
- Steps to reproduce:
  1. Submit a very large multipart upload.
  2. Use an allowed content type or omit content type.
- Expected result: Upload is rejected as soon as configured size is exceeded.
- Actual result: `await upload.read()` loads the whole file into memory before checking size.
- Recommended fix:
  - Stream uploads in bounded chunks.
  - Abort once size exceeds the limit.
  - Add reverse-proxy and ASGI body limits.
- Suggested automated test:
  - Fake a stream larger than the max size and assert reading stops after the limit is crossed.

## Issue 2: Missing Or Mismatched Upload MIME Types Are Not Strongly Validated

- Test type: Edge-case testing.
- Severity: Medium.
- Affected file/API/component:
  - `backend/app/services/storage.py:19`
  - `backend/app/services/storage.py:40`
- Steps to reproduce:
  1. Upload a file with omitted content type.
  2. Upload a file whose extension/content does not match its declared MIME type.
- Expected result: Unknown and mismatched upload types are rejected or inspected safely.
- Actual result: Content type is checked only when present; file signature validation is not visible.
- Recommended fix:
  - Require content type.
  - Validate extension and magic bytes for supported document types.
  - Quarantine unsupported or ambiguous uploads.
- Suggested automated test:
  - Upload a fake executable as `text/plain` and assert rejection.
  - Upload with no content type and assert rejection.

## Issue 3: Local Path Handling Does Not Constrain Extraction Candidates

- Test type: Edge-case testing.
- Severity: Critical.
- Affected file/API/component:
  - `backend/app/services/kyc_document_extraction.py:549`
- Steps to reproduce:
  1. Supply relative paths containing traversal or absolute paths in manual source metadata.
  2. Trigger extraction.
- Expected result: Only canonical paths under content storage are accepted.
- Actual result: Absolute path candidates are returned without storage containment checks.
- Recommended fix:
  - Use `Path.resolve()` and compare against resolved storage root.
  - Reject traversal, absolute user-supplied paths, and symlinks escaping storage.
- Suggested automated test:
  - Try `..\..\secret.txt`, absolute temp paths, and symlink escapes; assert rejection.

## Issue 4: Frontend Requests Can Hang Indefinitely

- Test type: Edge-case testing.
- Severity: Medium.
- Affected file/API/component:
  - `frontend/src/services/api.ts:26`
- Steps to reproduce:
  1. Simulate a stalled backend response.
  2. Trigger a page that uses `apiRequest`.
- Expected result: Request times out and the UI exits loading state.
- Actual result: No timeout or abort behavior exists in the shared API client.
- Recommended fix:
  - Add `AbortController` and timeout handling.
  - Expose per-endpoint timeout overrides.
- Suggested automated test:
  - Mock unresolved fetch and assert timeout error appears.

## Issue 5: Password Reset Test Does Not Cover Default Non-Exposed Token Behavior Cleanly

- Test type: Edge-case testing.
- Severity: Medium.
- Affected file/API/component:
  - `backend/tests/test_auth.py:97`
  - `POST /api/auth/forgot-password`
- Steps to reproduce:
  1. Run auth tests with `EXPOSE_RESET_TOKENS=false`.
  2. Observe reset-token flow test fail.
- Expected result: Default behavior is tested separately from local/dev token exposure.
- Actual result: Test expects token exposure.
- Recommended fix:
  - Split tests for exposed-token and hidden-token paths.
  - Use repository inspection or fixture override for reset flow.
- Suggested automated test:
  - Assert forgot-password response is generic and token-hidden by default.

## Edge Case Coverage Recommendations

- Invalid date ranges and timezone boundaries.
- Pagination overflow and page size bounds.
- Empty search results and invalid sort values.
- Expired, reused, malformed, and cross-user reset/OAuth tokens.
- Provider responses with malformed JSON, timeout, partial data, and duplicate records.
