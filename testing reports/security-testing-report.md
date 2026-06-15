# Security Testing Report

Generated: 2026-06-12
Updated: 2026-06-15

Project: KAM Intelligence Platform

## 2026-06-15 UAT-Account Update

| Security area | Result | Notes |
| --- | --- | --- |
| Task list authorization surface | Updated | Task listing is now scoped to the logged-in user's assigned tasks and assigned account IDs. |
| Account selector exposure | Updated | Account dropdown calls `/api/accounts` with `assigned_user_id`, covering active ownership roles for the current user. |
| Task mutation permissions | Retained | Update/delete/evidence flows continue to use task/account authorization checks before mutation. |
| Task movement auditability | Updated | Status movement requires a reason and records task history for later review. |
| Backend/frontend compile checks | Pass | `python -m py_compile ...` and `npm run typecheck` passed for this update. |
| Security regression suite | Not rerun | No full security regression, dependency audit, or penetration scan was run in this update. Existing findings below remain open unless separately remediated. |

## Issue 1: Arbitrary Local File Extraction Through Source Document `file_url`

- Test type: Security testing.
- Severity: Critical.
- Affected file/API/component:
  - `POST /api/accounts/{account_id}/attachments`
  - `POST /api/accounts/{account_id}/attachments/{attachment_id}/extract`
  - `GET /api/accounts/{account_id}/attachments/{attachment_id}/chunks`
  - `backend/app/services/kyc_document_extraction.py:549`
  - `backend/app/schemas.py:1016`
- Steps to reproduce:
  1. Log in as a user who can update an account.
  2. Create a source document with `file_url` pointing to a local server file.
  3. Trigger extraction.
  4. Read chunks.
- Expected result: User-provided paths cannot cause server-side local file reads.
- Actual result: Non-HTTP absolute paths can be accepted as extraction candidates.
- Recommended fix:
  - Only extract storage-backed uploads.
  - Canonicalize paths and enforce storage-directory containment.
  - Reject absolute paths from API payloads.
- Suggested automated test:
  - Attempt extraction from a temp file outside storage and assert rejection.

## Issue 2: Stored XSS Risk In Rich Text Rendering

- Test type: Security testing.
- Severity: High.
- Affected file/API/component:
  - `frontend/src/components/ui/RichTextEditor.tsx:39`
  - `frontend/src/components/account/AccountWorkspacePanel.tsx:391`
- Steps to reproduce:
  1. Store unsafe HTML in a rich-text field through API, database, or integration.
  2. Open a view that renders the value.
- Expected result: Unsafe tags, attributes, and URLs are stripped.
- Actual result: HTML is rendered with `dangerouslySetInnerHTML` without a visible sanitizer.
- Recommended fix:
  - Sanitize with DOMPurify or equivalent before rendering and preferably before storage.
  - Limit allowed tags and attributes to the editor feature set.
  - Add a strict Content Security Policy.
- Suggested automated test:
  - Render malicious HTML and assert there are no script tags, event handlers, or `javascript:` URLs.

## Issue 3: JWTs Are Not Revoked After Password Change, Reset, Or Logout

- Test type: Security testing.
- Severity: High.
- Affected file/API/component:
  - `backend/app/security.py:21`
  - `backend/app/dependencies.py:55`
  - `backend/app/services/auth.py`
  - `frontend/src/contexts/AuthContext.tsx:65`
- Steps to reproduce:
  1. Log in and save token.
  2. Change password.
  3. Use old token on `/api/auth/me`.
- Expected result: Old token returns 401.
- Actual result: Old token remains valid until expiry.
- Recommended fix:
  - Add token version or password-changed timestamp validation.
  - Add server-side revocation for logout or use short-lived access tokens with refresh rotation.
- Suggested automated test:
  - Assert old token is rejected after password change and reset.

## Issue 4: Google Calendar OAuth State Is Not Cryptographically Validated

- Test type: Security testing.
- Severity: High.
- Affected file/API/component:
  - Google Calendar OAuth authorize and callback endpoints.
  - `backend/app/services/integrations.py:549`
  - `backend/app/services/integrations.py:587`
- Steps to reproduce:
  1. Call callback with authorization code and arbitrary state.
  2. Observe callback attempts token exchange and global connection update.
- Expected result: Callback validates a random, single-use, expiring state value.
- Actual result: State appears to be only the user ID and is not validated against stored state.
- Recommended fix:
  - Persist hashed state nonce with expiry and consume on callback.
  - Reject missing, unknown, expired, or reused state.
- Suggested automated test:
  - Unknown/replayed state returns error and leaves credentials unchanged.

## Issue 5: Login And Password Reset Lack Anti-Automation Controls

- Test type: Security testing.
- Severity: High.
- Affected file/API/component:
  - `POST /api/auth/login`
  - `POST /api/auth/forgot-password`
  - `backend/app/services/auth.py`
- Steps to reproduce:
  1. Send repeated bad login attempts for one account/IP.
  2. Send repeated reset requests for the same email.
- Expected result: Requests are throttled and risk is logged.
- Actual result: No rate limiting, lockout, or challenge control is visible.
- Recommended fix:
  - Add IP and account-based rate limiting.
  - Add progressive backoff and security alerts.
- Suggested automated test:
  - Exceed threshold and assert 429 or lockout response.

## Issue 6: Unsafe Local/Docker Defaults For Shared Environments

- Test type: Security testing.
- Severity: High for shared deployments, Medium for local-only.
- Affected file/API/component:
  - `backend/app/config.py`
  - `docker-compose.yml`
- Steps to reproduce:
  1. Run Compose without overriding secrets and passwords.
  2. Use default admin credentials or request reset token exposure.
- Expected result: Non-local startup refuses placeholder secrets/default passwords.
- Actual result: Compose includes placeholder JWT/encryption secrets, default passwords, and `EXPOSE_RESET_TOKENS=true`.
- Recommended fix:
  - Fail startup outside local when insecure defaults are present.
  - Disable reset-token exposure for QA/pre-prod/prod.
  - Use managed secrets and rotate shared credentials.
- Suggested automated test:
  - `APP_ENV=production` plus placeholder secret fails config validation.

## Issue 7: Configurable Integration Base URLs Can Enable SSRF

- Test type: Security testing.
- Severity: Medium.
- Affected file/API/component:
  - Integration configuration APIs.
  - `backend/app/services/integrations.py:725`
  - `backend/app/services/integrations.py:1144`
  - `backend/app/services/integrations.py:1175`
- Steps to reproduce:
  1. Configure provider `base_url` as loopback/private/metadata address.
  2. Trigger test or sync.
- Expected result: Private and unapproved hosts are rejected.
- Actual result: Any HTTP/HTTPS base URL is accepted.
- Recommended fix:
  - Enforce provider allowlists.
  - Block loopback, private, link-local, multicast, and metadata IP ranges.
  - Require HTTPS for external providers.
- Suggested automated test:
  - Reject `127.0.0.1`, `169.254.169.254`, and RFC1918 URLs.

## Issue 8: Dependency And Static Security Gates Are Incomplete

- Test type: Security testing.
- Severity: Medium.
- Affected file/API/component:
  - `frontend/package-lock.json`
  - `backend/requirements.txt`
  - `sonar-project.properties`
- Steps to reproduce:
  1. Run frontend audit; local run timed out.
  2. Check backend dev requirements; no `pip-audit` configured.
  3. Review prior Sonar report showing 24 hotspots and 0.0% imported coverage.
- Expected result: Dependency scans and static-analysis review are release gates.
- Actual result: Scans are incomplete and hotspots are not fully actioned.
- Recommended fix:
  - Add frontend and backend SCA jobs to CI.
  - Review all Sonar hotspots.
  - Import backend and frontend coverage.
- Suggested automated test:
  - CI fails on high/critical dependency findings or new unreviewed hotspots.
