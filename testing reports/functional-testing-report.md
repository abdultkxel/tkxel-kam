# Functional Testing Report

Generated: 2026-06-12
Updated: 2026-06-15

Project: KAM Intelligence Platform

## 2026-06-15 UAT-Account Update

| Check | Result | Notes |
| --- | --- | --- |
| Frontend typecheck | Pass | `npm run typecheck` completed successfully after task board and modal updates. |
| Backend task/account compile check | Pass | `python -m py_compile backend/app/models.py backend/app/schemas.py backend/app/repositories/accounts.py backend/app/repositories/playbooks_tasks.py backend/app/routers/accounts.py backend/app/routers/playbooks_tasks.py backend/app/services/accounts.py backend/app/services/playbooks_tasks.py` completed successfully. |
| Task board workflow | Updated | Board-only task view now removes list mode, top summary cards, visible pagination controls, and sort direction controls. |
| Task detail workflow | Updated | Task details open in a smaller editable modal with dirty-state save gating, delete icon-only action, comments, and movement history. |
| Task movement workflow | Updated | Drag/drop status movement requires a reason and persists the reason to task history. |
| Assignment visibility | Updated | Task listing and account selector are scoped to the logged-in user's assigned accounts/tasks. |

## Validation Summary

| Check | Result | Notes |
| --- | --- | --- |
| Frontend typecheck | Pass | `npm run typecheck` completed successfully. |
| Frontend tests | Pass | `npm test`: 46 test files, 131 tests passed. |
| Frontend production build | Pass with warning | Build succeeded, but bundle size warning needs performance follow-up. |
| Backend full pytest | Not completed | Docker engine was unavailable; local full suite timed out after about 244 seconds. |
| Backend auth/RBAC/domain slice | Conditional pass | Passed with `EXPOSE_RESET_TOKENS=true`; one test fails with the default local setting. |

## Issue 1: Backend Auth Test Depends On Hidden Reset-Token Environment State

- Test type: Functional testing.
- Severity: Medium.
- Affected file/API/component:
  - `backend/tests/test_auth.py:97`
  - `backend/app/config.py:32`
  - `POST /api/auth/forgot-password`
- Steps to reproduce:
  1. Run `.venv\Scripts\python.exe -m pytest tests\test_auth.py tests\test_rbac.py tests\test_allowed_email_domains.py -q` with default local env.
  2. Observe `test_forgot_and_reset_password_flow` fail because `reset_token` is `None`.
  3. Rerun with `EXPOSE_RESET_TOKENS=true`; the same test slice passes.
- Expected result: Tests are deterministic and set their own config preconditions.
- Actual result: The reset-password functional test assumes a dev-only setting without setting it.
- Recommended fix:
  - Patch `get_settings().expose_reset_tokens` in the test fixture.
  - Add separate tests for exposed and non-exposed reset-token behavior.
  - Avoid relying on host environment state for auth tests.
- Suggested automated test:
  - One test asserts `reset_token` is returned only when explicitly enabled in a fixture.
  - Another test asserts default/production behavior returns `reset_token: null`.

## Issue 2: Full Backend Test Suite Could Not Complete In Current Environment

- Test type: Functional testing.
- Severity: Medium.
- Affected file/API/component:
  - Backend test harness.
  - Docker development workflow.
- Steps to reproduce:
  1. Run `docker compose run --rm --no-deps backend pytest -q`.
  2. Docker fails because the Docker Desktop engine is not running.
  3. Run `.venv\Scripts\python.exe -m pytest -q`.
  4. Local suite times out after about 244 seconds.
- Expected result: A complete backend regression suite can be run repeatably from the documented workflow.
- Actual result: Official Docker path was blocked, and local fallback did not finish in the available run window.
- Recommended fix:
  - Ensure Docker Desktop is running before release validation.
  - Add smaller CI jobs by domain so failures are easier to isolate.
  - Document expected runtime and required environment variables.
- Suggested automated test:
  - CI runs full backend pytest in Docker on every merge.
  - Add a smoke subset for quick pre-commit validation.

## Issue 3: Frontend Test Output Contains Noisy CKEditor/jsdom CSS Parse Errors

- Test type: Functional testing.
- Severity: Medium.
- Affected file/API/component:
  - `frontend/src/components/ui/RichTextEditor.tsx`
  - `frontend/src/test/setup.ts`
- Steps to reproduce:
  1. Run `npm test`.
  2. Observe `Error: Could not parse CSS stylesheet` messages from CKEditor/style-loader in jsdom.
- Expected result: Passing test output is clean enough that real warnings and failures are visible.
- Actual result: Tests pass, but logs are noisy and can hide real issues.
- Recommended fix:
  - Mock CKEditor globally in Vitest setup for unit/component tests.
  - Keep one focused integration test for the real editor if needed.
  - Fail on unexpected `console.error` once known noise is removed.
- Suggested automated test:
  - Add a test setup guard that fails on unexpected console errors.
  - Confirm the full frontend suite passes without CKEditor CSS parser noise.

## Functional Coverage Recommendations

- Add end-to-end flows for login, account onboarding, source upload, KYC review, governance completion, reports, and notification preferences.
- Add browser-level permission tests to confirm hidden UI paths also fail at the API layer.
- Add regression tests for route loading after frontend lazy splitting.
