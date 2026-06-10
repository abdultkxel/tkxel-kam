# Performance Testing Report

Generated on: 2026-06-09

## Scope

This report records a local Docker-based baseline performance smoke test for the KAM Intelligence Platform.

Included:

- Frontend availability timing.
- Backend OpenAPI timing.
- Authenticated API timing for representative dashboard, account, onboarding, notification, and auth endpoints.
- Small concurrent request bursts for selected authenticated endpoints.
- Container resource snapshot after the run.
- Recent backend/frontend log scan for runtime errors.

Not included:

- Browser rendering metrics such as LCP, CLS, FID/INP.
- Long-running soak testing.
- High-volume load testing.
- Database query plan profiling.
- File upload/KYC/Ollama-heavy AI performance testing.
- Network testing from remote office machines.
- Production infrastructure performance testing.

## Environment

```text
Repository: /var/www/html/tkxel-kam
Frontend:   http://127.0.0.1:5173
Backend:    http://127.0.0.1:8001
Database:   PostgreSQL 16 through Docker Compose
AI runtime: Ollama container running but not exercised by this test
SonarQube:  Running during this test on port 9000
```

Application containers during test:

```text
tkxel-kam-backend-1     Up
tkxel-kam-frontend-1    Up
tkxel-kam-db-1          Up and healthy
tkxel-kam-ollama-1      Up and healthy
tkxel-kam-sonarqube-1   Up
tkxel-kam-sonar_db-1    Up and healthy
```

## Test Method

The test used Python standard-library HTTP requests from the host machine against local Docker-published ports.

Flow:

1. Started the app stack with Docker Compose.
2. Waited until frontend `/` and backend `/openapi.json` returned HTTP 200.
3. Logged in as the seeded admin user.
4. Warmed up each endpoint once.
5. Ran 10 sequential requests per endpoint.
6. Ran 25-request bursts with 5 concurrent workers against selected authenticated endpoints.
7. Captured a `docker stats --no-stream` snapshot.
8. Scanned recent backend/frontend logs for `ERROR`, `Traceback`, `500`, `Exception`, and `Failed`.

## Commands Run

```bash
docker compose up -d --build db ollama backend frontend
```

Readiness check:

```bash
curl http://127.0.0.1:5173/
curl http://127.0.0.1:8001/openapi.json
```

Resource snapshot:

```bash
docker stats --no-stream
```

Recent error scan:

```bash
docker compose logs --no-color --tail=80 backend frontend | rg -n 'ERROR|Traceback| 500 |Exception|Failed'
```

## Sequential Endpoint Results

Each endpoint was warmed up once, then requested 10 times sequentially.

| Endpoint | Requests | Success Rate | Avg | P50 | P95 | Max | Status |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Frontend home `/` | 10 | 100% | 9.69 ms | 8.95 ms | 13.63 ms | 14.80 ms | 200 |
| Backend OpenAPI `/openapi.json` | 10 | 100% | 36.47 ms | 40.10 ms | 45.47 ms | 46.21 ms | 200 |
| Auth profile `/api/auth/me` | 10 | 100% | 16.96 ms | 16.93 ms | 18.10 ms | 18.25 ms | 200 |
| Role dashboard `/api/dashboards/me` | 10 | 100% | 125.95 ms | 121.10 ms | 155.14 ms | 172.76 ms | 200 |
| Accounts list `/api/accounts?page=1&page_size=10` | 10 | 100% | 43.21 ms | 42.31 ms | 47.37 ms | 48.48 ms | 200 |
| Notifications list `/api/notifications?page=1&page_size=10` | 10 | 100% | 28.59 ms | 30.10 ms | 32.83 ms | 33.08 ms | 200 |
| Onboarding drafts `/api/onboarding/drafts?page=1&page_size=10` | 10 | 100% | 59.04 ms | 59.71 ms | 71.50 ms | 77.11 ms | 200 |

Login timing:

```text
POST /api/auth/login: 426.33 ms
```

## Concurrent Burst Results

Each endpoint was tested with 25 total requests and 5 concurrent workers.

| Endpoint | Requests | Workers | Success Rate | Throughput | Avg | P95 | Max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/api/auth/me` | 25 | 5 | 100% | 72.22 req/s | 64.34 ms | 119.05 ms | 122.47 ms |
| `/api/dashboards/me` | 25 | 5 | 100% | 11.01 req/s | 440.77 ms | 499.25 ms | 587.83 ms |
| `/api/accounts?page=1&page_size=10` | 25 | 5 | 100% | 30.90 req/s | 153.99 ms | 189.83 ms | 195.15 ms |
| `/api/notifications?page=1&page_size=10` | 25 | 5 | 100% | 50.79 req/s | 93.84 ms | 119.67 ms | 127.29 ms |

## Container Resource Snapshot

Captured after the local performance test run:

| Container | CPU | Memory | Memory % |
| --- | ---: | ---: | ---: |
| Backend | 0.41% | 317.9 MiB / 38.86 GiB | 0.80% |
| Frontend | 0.12% | 155.0 MiB / 38.86 GiB | 0.39% |
| PostgreSQL app DB | 1.04% | 42.68 MiB / 38.86 GiB | 0.11% |
| Ollama | 0.00% | 153.1 MiB / 38.86 GiB | 0.38% |
| SonarQube | 1.77% | 1.883 GiB / 38.86 GiB | 4.85% |
| Sonar DB | 0.00% | 136.3 MiB / 38.86 GiB | 0.34% |

## Log Review

Recent backend/frontend logs were scanned for:

```text
ERROR
Traceback
500
Exception
Failed
```

Result:

```text
No matching backend/frontend runtime errors were found in the scanned tail logs.
```

## Observations

- All tested endpoints returned 100% success.
- The dashboard endpoint is the slowest tested endpoint.
- Sequential dashboard P95 was 155.14 ms, which is acceptable for local baseline behavior.
- Concurrent dashboard P95 increased to 499.25 ms at 5 workers, suggesting dashboard aggregation is heavier than simple list endpoints.
- Login took 426.33 ms in this local Docker run; password hashing and auth DB access likely dominate this endpoint.
- The frontend dev server response was fast for the basic HTML entry point, but this does not represent full browser rendering performance.
- SonarQube was running during the test and consumed about 1.88 GiB RAM, so application-only performance may improve slightly when SonarQube is stopped.

## Risks And Gaps

| Severity | Area | Finding | Recommended Action |
| --- | --- | --- | --- |
| Medium | Dashboard performance | `/api/dashboards/me` is the slowest measured endpoint and degrades under small concurrency. | Profile dashboard queries, add query-level timing, review indexes, and consider caching expensive aggregate widgets. |
| Medium | Test coverage | This was a lightweight local baseline, not a full load test. | Add k6, Locust, or JMeter scenarios for real concurrent users. |
| Medium | Frontend UX | The test did not measure browser render, route transitions, bundle size, or Web Vitals. | Add Lighthouse/WebPageTest or Playwright performance checks. |
| Medium | AI workflows | KYC/Ollama/Tavily paths were not load-tested. | Test AI job queue behavior separately with timeout, retry, and resource metrics. |
| Low | Environment interference | SonarQube was running during testing. | Re-run without SonarQube for a cleaner application-only baseline. |

## Recommended Performance Targets

Suggested local/pre-production targets:

| Area | Target |
| --- | --- |
| Basic API GET P95 | Under 250 ms |
| Dashboard API P95 | Under 750 ms initially; under 400 ms after optimization |
| Login P95 | Under 800 ms |
| List endpoints under 5 concurrent users | 100% success, P95 under 300 ms |
| Dashboard under 5 concurrent users | 100% success, P95 under 750 ms |
| Frontend initial app shell | Under 500 ms local dev server response |

## Recommended Next Steps

1. Add a repeatable `k6` or `Locust` test suite under `review/performance/` or `tests/performance/`.
2. Add backend middleware for request timing logs by route.
3. Add dashboard service/query profiling for `/api/dashboards/me`.
4. Capture database query plans for dashboard, accounts, notifications, and onboarding list endpoints.
5. Add frontend production build performance checks instead of dev-server-only timing.
6. Re-run the report with SonarQube stopped for an application-only baseline.
7. Create a separate AI/KYC performance report because Ollama and Tavily workflows have very different latency and resource behavior.

## Re-run Instructions

Start the app:

```bash
docker compose up -d --build db ollama backend frontend
```

Verify readiness:

```bash
curl -fsS http://127.0.0.1:5173/ >/dev/null
curl -fsS http://127.0.0.1:8001/openapi.json >/dev/null
```

Run a future scripted performance test from the host machine or add a dedicated tool such as k6:

```bash
k6 run review/performance/k6-smoke.js
```

For now, this report is the baseline reference for local endpoint timing.
