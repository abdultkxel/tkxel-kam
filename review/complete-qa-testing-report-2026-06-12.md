# Complete QA Testing Report

Generated: 2026-06-12
Updated: 2026-06-15

Project: KAM Intelligence Platform

Scope reviewed:

- Backend: FastAPI, SQLAlchemy, PostgreSQL-oriented service/repository architecture.
- Frontend: React, Vite, TypeScript, Vitest, Tailwind.
- Primary areas: functional behavior, API contracts, security, edge cases, performance, and test readiness.

## Validation Run Summary

| Check | Result | Notes |
| --- | --- | --- |
| Frontend typecheck | Pass | `npm run typecheck` completed successfully. |
| Frontend tests | Pass | `npm test`: 46 test files, 131 tests passed. Logs contain CKEditor/jsdom CSS parse noise. |
| Frontend production build | Pass with warning | `npm run build` succeeded. Main JS chunk is 3,186.65 kB minified / 822.76 kB gzip. |
| Backend Docker pytest | Blocked | Docker CLI exists, but Docker Desktop engine was not running. |
| Backend full local pytest | Timeout | `.venv\Scripts\python.exe -m pytest -q` timed out after about 244 seconds. |
| Backend auth/RBAC/domain tests | Conditional pass | Failed once with default local `EXPOSE_RESET_TOKENS=false`; passed 31 tests when `EXPOSE_RESET_TOKENS=true`. |
| Frontend dependency audit | Incomplete | `npm audit --omit=dev --json` timed out after about 124 seconds. |

Existing review context found:

- `review/security-testing-report.md`: prior Sonar run had 0 vulnerabilities, 24 unreviewed security hotspots, 10 bugs, and 0.0% imported coverage.
- `review/performance-testing-report.md`: prior local baseline showed dashboard endpoints as the heaviest API path under light concurrency.

## 2026-06-15 UAT-Account Validation Update

| Check | Result | Notes |
| --- | --- | --- |
| Frontend typecheck | Pass | `npm run typecheck` completed successfully after task board and task detail modal changes. |
| Backend task/account compile check | Pass | `python -m py_compile backend/app/models.py backend/app/schemas.py backend/app/repositories/accounts.py backend/app/repositories/playbooks_tasks.py backend/app/routers/accounts.py backend/app/routers/playbooks_tasks.py backend/app/services/accounts.py backend/app/services/playbooks_tasks.py` completed successfully. |
| Task workflow coverage | Updated | Board-only task page, editable task detail modal, dirty-state close warning, delete task, drag/drop move reasons, and task history are now covered in the current report set. |
| API authorization coverage | Updated | Task list and account selector report notes now reflect logged-in-user assignment scoping. |
| Full regression suite | Not rerun | No full backend pytest, frontend Vitest suite, production build, security scan, or performance benchmark was rerun for this update. |

## Issues

### 1. Arbitrary Local File Extraction Through Source Document `file_url`

- Test type: Security testing, API testing, edge-case testing.
- Severity: Critical.
- Affected file/API/component:
  - `POST /api/accounts/{account_id}/attachments`
  - `POST /api/accounts/{account_id}/attachments/{attachment_id}/extract`
  - `GET /api/accounts/{account_id}/attachments/{attachment_id}/chunks`
  - `backend/app/schemas.py:950`
  - `backend/app/services/accounts.py:344`
  - `backend/app/services/kyc_document_extraction.py:549`
  - `backend/app/schemas.py:1016`
- Steps to reproduce:
  1. Log in as any user who can update an assigned or portfolio account.
  2. Create a manual attachment with `file_url` set to an absolute local path outside content storage, for example a server `.env` file, and set `file_name` to a text-like name such as `secret.txt`.
  3. Trigger extraction for the attachment.
  4. Read generated chunks from the chunks API.
- Expected result: The API rejects local absolute paths and only extracts files previously stored by the upload storage adapter under the configured content storage directory.
- Actual result: `_document_path()` accepts non-HTTP absolute `file_url` values. If MIME/type inference treats the path as text, extraction can read local server files and expose their content through `chunk_text`.
- Recommended fix:
  - Remove `file_url` from local extraction candidates.
  - Track storage provenance and only extract files created by `ContentStorageService`.
  - Resolve candidate paths and require them to stay under `LOCAL_CONTENT_STORAGE_DIR`.
  - Treat external URLs as links only; never as local filesystem paths.
  - Add defense-in-depth redaction for chunk responses containing suspected secrets.
- Suggested automated test:
  - Create a temporary secret file outside the storage directory.
  - Add an attachment with `file_url` pointing to that file and `file_name="secret.txt"`.
  - Assert extraction returns 400/422 and no chunks are created.

### 2. Stored XSS Risk In Rich Text Rendering

- Test type: Security testing, functional UI testing.
- Severity: High.
- Affected file/API/component:
  - `frontend/src/components/ui/RichTextEditor.tsx:39`
  - `frontend/src/components/account/AccountWorkspacePanel.tsx:391`
  - Governance completion notes and any other rich-text values rendered through the shared component.
- Steps to reproduce:
  1. Insert rich text containing unsafe HTML, such as an element with an event handler, through an API, database seed, or compromised integration.
  2. Open the governance/account workspace view that renders the stored value.
- Expected result: Only sanitized safe HTML is rendered; scripts, event handlers, unsafe URLs, and dangerous attributes are stripped.
- Actual result: Stored HTML is rendered with `dangerouslySetInnerHTML` without a visible sanitizer in the render path.
- Recommended fix:
  - Sanitize rich text with a vetted sanitizer such as DOMPurify before rendering and preferably before storage.
  - Restrict the allowed tag/attribute list to the CKEditor toolbar surface.
  - Add a strict Content Security Policy to reduce impact.
  - Avoid using stored HTML as a React key.
- Suggested automated test:
  - Render rich-text notes containing `<img src=x onerror=...>` and `<script>...</script>`.
  - Assert the DOM contains no script tags, no event-handler attributes, and no `javascript:` URLs.

### 3. Existing JWTs Remain Valid After Password Change, Reset, And Logout

- Test type: Security testing, API testing.
- Severity: High.
- Affected file/API/component:
  - `backend/app/security.py:21`
  - `backend/app/dependencies.py:55`
  - `backend/app/services/auth.py:79`
  - `backend/app/services/auth.py:102`
  - `backend/app/services/auth.py:118`
  - `frontend/src/contexts/AuthContext.tsx:65`
- Steps to reproduce:
  1. Log in and save the bearer token.
  2. Change the password using `/api/auth/change-password`.
  3. Call `/api/auth/me` with the old token.
- Expected result: Old access tokens are rejected after password change/reset and ideally after logout.
- Actual result: Confirmed locally: old token still returned 200 from `/api/auth/me` after password change. Tokens only contain `sub`, `iat`, and `exp`, and logout is client-side only.
- Recommended fix:
  - Add a token version, password-changed timestamp, or JWT `jti` revocation table.
  - Check token version/timestamp in `get_current_user`.
  - Invalidate all user sessions on password reset/change.
  - Consider short access tokens plus rotating refresh tokens stored in httpOnly secure cookies.
- Suggested automated test:
  - Log in, change password, then assert the old token receives 401 from `/api/auth/me`.
  - Repeat for reset password and logout if server-side revocation is implemented.

### 4. Google Calendar OAuth Callback Does Not Validate A Cryptographic State

- Test type: Security testing, API testing.
- Severity: High.
- Affected file/API/component:
  - `GET /api/admin/integrations/google-calendar/oauth-callback`
  - `GET /api/integrations/google-calendar/oauth/callback`
  - `backend/app/services/integrations.py:549`
  - `backend/app/services/integrations.py:566`
  - `backend/app/services/integrations.py:587`
  - `backend/app/routers/integrations.py:272`
- Steps to reproduce:
  1. Start an OAuth flow or obtain a valid authorization code for the configured OAuth client.
  2. Call the unauthenticated callback with `code=<valid_code>&state=<any_user_id_or_random_value>`.
- Expected result: Callback validates a random, single-use, expiring state nonce tied to the initiating user/session and rejects unknown or expired state values.
- Actual result: The authorize URL uses `state=current_user.id`; callback exchanges the code without validating a stored nonce or authenticating the callback user, then writes the global Google Calendar connection.
- Recommended fix:
  - Generate a cryptographically random OAuth state and persist only a hash plus user ID, expiry, and intended provider.
  - Validate and consume state on callback.
  - Add PKCE where possible.
  - Store tokens per user/tenant where appropriate instead of a single global connection.
- Suggested automated test:
  - Call the callback with a valid-looking code and an unknown state.
  - Assert the service rejects it and does not update `google_calendar` credentials.

### 5. Authentication Endpoints Lack Rate Limiting Or Account Lockout

- Test type: Security testing, API abuse testing.
- Severity: High.
- Affected file/API/component:
  - `POST /api/auth/login`
  - `POST /api/auth/forgot-password`
  - `backend/app/services/auth.py:53`
  - `backend/app/services/auth.py:82`
- Steps to reproduce:
  1. Send repeated bad login attempts for the same email/IP.
  2. Send repeated forgot-password requests for the same email/IP.
- Expected result: Requests are throttled with 429/backoff, risk is logged, and repeated failures can temporarily lock or challenge the account.
- Actual result: No rate-limiting, lockout, or anti-automation control is visible in the auth service or dependencies.
- Recommended fix:
  - Add IP and identifier-based rate limits for login and reset requests.
  - Add progressive backoff and alerting for credential stuffing patterns.
  - Store failed login metadata and reset-request counters.
- Suggested automated test:
  - Submit more than the allowed failed login threshold and assert 429 or locked response.
  - Verify counters reset after the configured window.

### 6. Local/Docker Defaults Are Unsafe If Promoted To Shared QA Or Production

- Test type: Security configuration testing.
- Severity: High for shared deployments, Medium for local-only development.
- Affected file/API/component:
  - `backend/app/config.py:17`
  - `backend/app/config.py:22`
  - `backend/app/config.py:23`
  - `docker-compose.yml:38`
  - `docker-compose.yml:47`
  - `docker-compose.yml:59`
- Steps to reproduce:
  1. Run Docker Compose without overriding security-sensitive environment variables.
  2. Use documented seeded credentials.
  3. Request forgot password while `EXPOSE_RESET_TOKENS=true`.
- Expected result: Non-local startup fails on placeholder secrets/default passwords and reset tokens are never exposed in shared environments.
- Actual result: Compose includes placeholder JWT/encryption secrets, default admin/user passwords, and `EXPOSE_RESET_TOKENS="true"`.
- Recommended fix:
  - Add an `APP_ENV` or equivalent and fail startup outside `LOCAL` when placeholder secrets/default passwords are used.
  - Set `EXPOSE_RESET_TOKENS=false` for QA/pre-prod/prod.
  - Rotate any shared demo credentials.
  - Move secrets to managed secret storage.
- Suggested automated test:
  - Start settings with `APP_ENV=production` and placeholder secrets; assert startup/config validation fails.
  - Assert forgot-password never returns `reset_token` unless an explicit local test override is set.

### 7. Configurable Integration Base URLs Can Become SSRF Primitives

- Test type: Security testing, API testing.
- Severity: Medium.
- Affected file/API/component:
  - Integration configuration and sync/test APIs.
  - `backend/app/services/integrations.py:725`
  - `backend/app/services/integrations.py:1139`
  - `backend/app/services/integrations.py:1144`
  - `backend/app/services/integrations.py:1175`
- Steps to reproduce:
  1. As a user with integration configuration rights, set a provider `base_url` to a loopback, private network, or metadata-service URL.
  2. Trigger integration test/sync.
- Expected result: Private, loopback, link-local, and unapproved hosts are blocked; production providers use an allowlist and HTTPS.
- Actual result: Validation accepts any `http://` or `https://` URL, and `_json_get/_json_post/_json_patch` call it server-side.
- Recommended fix:
  - Enforce provider allowlists or tenant-managed endpoint allowlists.
  - Require HTTPS for external providers.
  - Resolve hostnames and reject private, loopback, link-local, multicast, and metadata IP ranges.
  - Add network egress controls outside the app.
- Suggested automated test:
  - Attempt to configure `http://127.0.0.1:8001`, `http://169.254.169.254`, and RFC1918 addresses; assert validation rejects them.

### 8. Backend Auth Tests Depend On Hidden Reset-Token Environment State

- Test type: Functional testing, API testing, QA process.
- Severity: Medium.
- Affected file/API/component:
  - `backend/tests/test_auth.py:97`
  - `backend/app/config.py:32`
- Steps to reproduce:
  1. Run `.venv\Scripts\python.exe -m pytest tests\test_auth.py tests\test_rbac.py tests\test_allowed_email_domains.py -q` with default local env.
  2. Observe `test_forgot_and_reset_password_flow` fail because `reset_token` is `None`.
  3. Rerun with `EXPOSE_RESET_TOKENS=true`; the same slice passes.
- Expected result: Tests are deterministic and set their own config preconditions.
- Actual result: The test assumes a dev-only setting without setting it.
- Recommended fix:
  - Patch `get_settings().expose_reset_tokens` in the test/fixture or inspect the stored reset token through a repository fake.
  - Add separate tests for both exposed and non-exposed reset-token behavior.
- Suggested automated test:
  - One test asserts `reset_token` is present only when an explicit test fixture enables exposure.
  - Another asserts the production/default response keeps `reset_token` null.

### 9. Frontend Test Logs Hide Signal With CKEditor/jsdom CSS Parse Errors

- Test type: Functional testing, QA process.
- Severity: Medium.
- Affected file/API/component:
  - `frontend/src/components/ui/RichTextEditor.tsx:1`
  - `frontend/src/test/setup.ts:1`
- Steps to reproduce:
  1. Run `npm test`.
  2. Observe many `Error: Could not parse CSS stylesheet` messages from CKEditor/style-loader in jsdom even though tests pass.
- Expected result: Test output is clean enough that real warnings and errors are visible.
- Actual result: The passing suite emits noisy CKEditor CSS parse errors.
- Recommended fix:
  - Globally mock CKEditor in Vitest setup for unit/component tests.
  - Add explicit integration tests for the real editor only where needed.
  - Consider failing tests on unexpected `console.error` once known noise is removed.
- Suggested automated test:
  - Add a test setup assertion that unexpected `console.error` calls fail the suite.
  - Confirm RichTextEditor tests use a stable mock and produce no jsdom CSS parser errors.

### 10. Upload Service Reads Entire File Into Memory Before Enforcing Size

- Test type: Edge-case testing, performance testing, security testing.
- Severity: Medium.
- Affected file/API/component:
  - Account/source uploads.
  - Content uploads.
  - Task evidence uploads.
  - `backend/app/services/storage.py:37`
- Steps to reproduce:
  1. Send a very large multipart upload with an allowed or omitted content type.
  2. Observe server memory pressure before the size check executes.
- Expected result: Uploads are streamed and rejected as soon as the byte limit is exceeded.
- Actual result: `await upload.read()` reads the whole file into memory before checking `len(data)`.
- Recommended fix:
  - Stream upload content to a temporary file in bounded chunks.
  - Abort once size exceeds configured limit.
  - Reject missing/unknown content types and validate file signatures/extensions.
  - Enforce reverse-proxy and ASGI body limits.
- Suggested automated test:
  - Use a fake upload stream larger than the limit and assert the service stops reading after limit + one chunk.
  - Add tests for omitted content type and mismatched extension/MIME.

### 11. Frontend Production Bundle Exceeds Practical Initial Load Budget

- Test type: Performance testing.
- Severity: Medium.
- Affected file/API/component:
  - `frontend/src/App.tsx:4`
  - `frontend/src/App.tsx:22`
  - `frontend/vite.config.ts:8`
- Steps to reproduce:
  1. Run `npm run build`.
  2. Inspect Vite output.
- Expected result: Route chunks and vendor chunks keep initial load close to the current route's needs.
- Actual result: Vite warns that the main JS chunk is 3,186.65 kB minified / 822.76 kB gzip. `App.tsx` imports all pages eagerly, including heavy admin, charting, and editor flows.
- Recommended fix:
  - Convert page routes to `React.lazy` with `Suspense`.
  - Split heavy vendors such as CKEditor and Recharts into lazy chunks.
  - Add Rollup `manualChunks` only after route-level splitting.
  - Add a bundle budget to CI.
- Suggested automated test:
  - Add a build-budget script that fails when the initial app chunk exceeds the agreed gzip threshold.
  - Add a Playwright smoke test to ensure lazy route loading still works.

### 12. Frontend API Client Has No Timeout Or Abort Handling

- Test type: Edge-case testing, performance testing, functional testing.
- Severity: Medium.
- Affected file/API/component:
  - `frontend/src/services/api.ts:26`
- Steps to reproduce:
  1. Simulate a request that never resolves or a stalled backend response.
  2. Trigger any page relying on `apiRequest`.
- Expected result: UI exits loading state with a clear retryable error after a configured timeout.
- Actual result: `apiRequest` awaits `fetch` with no `AbortController`, no timeout, and no standardized retry/backoff.
- Recommended fix:
  - Add default request timeout using `AbortController`.
  - Allow per-request timeout overrides for long AI/KYC jobs.
  - Normalize abort errors into user-displayable API errors.
- Suggested automated test:
  - Mock `fetch` to never resolve and assert the UI shows a timeout error and clears loading state.

### 13. Dependency Vulnerability Scanning Is Not A Reliable Gate Yet

- Test type: Security testing, QA process.
- Severity: Medium.
- Affected file/API/component:
  - `frontend/package-lock.json`
  - `backend/requirements.txt`
  - CI/release process.
- Steps to reproduce:
  1. Run frontend dependency audit in this environment; it timed out.
  2. Check backend tooling; `pip-audit` is not configured in `requirements-dev.txt`.
- Expected result: Repeatable dependency vulnerability scans run in CI and produce release artifacts.
- Actual result: Frontend audit did not complete locally, and backend dependency audit tooling is absent.
- Recommended fix:
  - Add `npm audit --omit=dev --audit-level=moderate` or a stronger SCA tool to CI.
  - Add `pip-audit` or equivalent for Python dependencies.
  - Enable Dependabot/Renovate.
  - Fail release gates on high/critical findings unless explicitly waived.
- Suggested automated test:
  - CI job runs frontend and backend SCA and uploads JSON results as artifacts.

### 14. Static Analysis Findings Are Not Fully Actioned

- Test type: Security testing, maintainability testing.
- Severity: Medium.
- Affected file/API/component:
  - SonarQube project configuration and review workflow.
  - `sonar-project.properties`
  - Prior report: `review/sonarqube-analysis-report.md`
- Steps to reproduce:
  1. Review the existing SonarQube report.
  2. Note 24 security hotspots, 10 bugs, and 0.0% imported coverage in the prior run.
- Expected result: Hotspots are reviewed, bugs triaged, and coverage imported for release readiness.
- Actual result: Existing report shows security review rating E and reliability rating E despite quality gate OK.
- Recommended fix:
  - Review and disposition all hotspots.
  - Triage/fix Sonar bugs.
  - Generate backend `coverage.xml` and frontend `lcov.info` during CI.
  - Fail release gates on unreviewed high-risk hotspots.
- Suggested automated test:
  - CI runs tests with coverage, runs Sonar, and fails if new hotspots or bugs are introduced.

## Functional Testing Focus Areas

Passed locally:

- Frontend type safety.
- Frontend component/page unit tests.
- Frontend production build.
- Targeted backend auth/RBAC/domain tests when the expected reset-token flag is set.

Recommended additional functional scenarios:

- Account source document lifecycle with uploaded and manual sources.
- Governance completion notes round-trip with safe rich text.
- Password change/reset session invalidation.
- Google Calendar OAuth success, bad state, expired state, and replayed state.
- Large CSV import with duplicate modes and custom fields.
- AI/KYC job cancellation, retry, and stale running states.

## API Testing Focus Areas

Priority API tests to add:

- Negative auth/session tests for old-token reuse.
- Attachment path validation and extraction rejection tests.
- OAuth callback state validation tests.
- Upload MIME/size boundary tests.
- Pagination upper-bound tests on all list endpoints.
- Public webhook signature/replay tests.

## Security Testing Focus Areas

Highest priorities:

1. Fix local file extraction from `file_url`.
2. Add HTML sanitization for rich-text rendering.
3. Add token revocation/session invalidation.
4. Fix OAuth state validation.
5. Add auth rate limiting.
6. Harden deployment defaults and reset-token exposure.

## Edge Case Testing Focus Areas

Recommended edge scenarios:

- Empty, missing, and mismatched MIME uploads.
- Oversized uploads that exceed limits by one byte and by large margins.
- Network-stalled frontend requests.
- Expired, reused, malformed, and cross-user reset/OAuth tokens.
- Invalid date ranges, page overflow, and empty search results.
- External provider failures, timeouts, malformed JSON, and partial sync results.

## Performance Testing Focus Areas

Current signals:

- Frontend build is functional but has a large initial JS chunk.
- Prior local baseline showed `/api/dashboards/me` as the heaviest tested endpoint under small concurrency.
- Upload and AI/KYC flows need separate performance testing because they are file/CPU/network heavy.

Recommended performance tests:

- Add k6 or Locust scenarios for login, dashboard, accounts, notifications, onboarding, and reports.
- Add route-level frontend bundle budgets and Lighthouse/Playwright Web Vitals checks.
- Add dashboard query timing and database query-plan review.
- Add upload memory profiling and KYC extraction stress tests.
