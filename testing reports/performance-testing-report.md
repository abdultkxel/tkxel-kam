# Performance Testing Report

Generated: 2026-06-12
Updated: 2026-06-15

Project: KAM Intelligence Platform

## 2026-06-15 UAT-Account Update

| Check | Result | Notes |
| --- | --- | --- |
| Frontend typecheck | Pass | `npm run typecheck` completed successfully after Tasks page simplification. |
| Backend compile check | Pass | Task/account backend modules compiled successfully with `python -m py_compile`. |
| Task board data volume | Updated | Board request now uses first page with `page_size=100`, due-date ascending sort, and no visible pagination controls. |
| Task detail modal size | Updated | Detail modal max width reduced to `810px` and max height to `75vh`, reducing screen coverage versus the prior full-width modal. |
| Performance benchmark | Not rerun | No k6/Locust/Lighthouse benchmark was run in this update. Existing performance follow-ups remain open. |

## Validation Summary

| Check | Result | Notes |
| --- | --- | --- |
| Frontend production build | Pass with warning | Main JS chunk is 3,186.65 kB minified / 822.76 kB gzip. |
| Frontend tests | Pass | 46 files / 131 tests. Test runtime was about 63 seconds. |
| Backend performance run | Not rerun | Docker engine unavailable during this pass. Prior report showed dashboard endpoint as heaviest. |

## Issue 1: Initial Frontend Bundle Is Too Large

- Test type: Performance testing.
- Severity: Medium.
- Affected file/API/component:
  - `frontend/src/App.tsx`
  - `frontend/vite.config.ts`
  - Route/page imports.
- Steps to reproduce:
  1. Run `npm run build`.
  2. Inspect Vite build output.
- Expected result: Initial route bundle is split so users only download code required for the first screen.
- Actual result: Main JS chunk is 3,186.65 kB minified / 822.76 kB gzip, triggering Vite's chunk warning.
- Recommended fix:
  - Convert page routes to `React.lazy`.
  - Lazy-load heavy vendors such as CKEditor and Recharts.
  - Add bundle budgets to CI.
  - Use Rollup `manualChunks` after route-level splitting.
- Suggested automated test:
  - Add a build-budget script that fails when initial gzip size exceeds threshold.
  - Add route smoke tests to verify lazy chunks load correctly.

## Issue 2: Upload Path Can Cause Memory Pressure

- Test type: Performance testing.
- Severity: Medium.
- Affected file/API/component:
  - `backend/app/services/storage.py:37`
- Steps to reproduce:
  1. Upload a file significantly larger than configured max size.
  2. Monitor backend process memory.
- Expected result: Server streams and rejects oversized uploads early.
- Actual result: Entire upload is read into memory before size validation.
- Recommended fix:
  - Stream to temp file with chunk limits.
  - Add body limits at proxy and ASGI layers.
  - Add memory profiling to upload tests.
- Suggested automated test:
  - Simulate oversized upload and assert bounded reads/memory behavior.

## Issue 3: Dashboard Endpoint Is A Known Heavy API Path

- Test type: Performance testing.
- Severity: Medium.
- Affected file/API/component:
  - `/api/dashboards/me`
  - Dashboard service/repository aggregation.
- Steps to reproduce:
  1. Run the prior local baseline performance test from `review/performance-testing-report.md`.
  2. Compare dashboard latency to simpler list endpoints.
- Expected result: Dashboard remains within agreed P95 latency under concurrent users.
- Actual result: Prior baseline showed dashboard as the slowest measured endpoint and degrading under small concurrency.
- Recommended fix:
  - Add route-level timing middleware.
  - Profile dashboard queries and add indexes/caching where needed.
  - Cache expensive aggregate widgets with short TTLs.
- Suggested automated test:
  - Add k6/Locust scenario for `/api/dashboards/me` with authenticated users and enforce P95 threshold.

## Issue 4: Dependency Audit Timed Out Locally

- Test type: Performance testing, QA process.
- Severity: Low.
- Affected file/API/component:
  - `npm audit --omit=dev --json`
  - CI dependency audit workflow.
- Steps to reproduce:
  1. Run `npm audit --omit=dev --json`.
  2. Local run timed out after about 124 seconds.
- Expected result: Dependency audit completes in a predictable CI window.
- Actual result: Local audit did not finish during this pass.
- Recommended fix:
  - Run audit in CI with stable network/cache.
  - Store JSON audit artifacts.
- Suggested automated test:
  - CI job enforces audit timeout and records dependency scan output.

## Performance Coverage Recommendations

- Add k6 or Locust tests for login, dashboards, accounts, onboarding, notifications, reports, and KYC job trigger flows.
- Add Lighthouse or Playwright Web Vitals checks against production build.
- Add backend query timing and slow-query logging.
- Add AI/KYC-specific stress tests for extraction, queue behavior, retries, and timeouts.
