# Security Testing Report

Generated on: 2026-06-09

## Scope

This report covers local security-oriented verification for the KAM Intelligence Platform repository.

Included areas:

- Authentication and password reset/change behavior.
- RBAC role and permission enforcement.
- Allowed email domain enforcement for login/user management.
- Static analysis security metrics from SonarQube.
- Basic dependency/security tooling readiness.
- Masked environment/configuration hygiene review.

Not included in this run:

- External penetration testing.
- Dynamic OWASP ZAP/browser attack scan.
- Full dependency vulnerability audit for Python packages.
- Full frontend dependency audit result, because `npm audit --omit=dev --audit-level=moderate` did not complete within the local session and the temporary container was removed.
- Production infrastructure, cloud IAM, TLS, WAF, object storage policy, or network firewall testing.

## Environment

```text
Repository: /var/www/html/tkxel-kam
Date:       2026-06-09
Sonar URL:  http://127.0.0.1:9000/dashboard?id=tkxel-kam
```

Docker status during report generation:

```text
SonarQube: running on port 9000
Sonar DB:  running and healthy
Main app:  not running during the security test report creation
```

## Tests And Checks Run

| Check | Command | Result |
| --- | --- | --- |
| Authentication/RBAC/domain test suite | `docker compose run --rm --no-deps backend pytest tests/test_auth.py tests/test_rbac.py tests/test_allowed_email_domains.py -q` | Passed: 27 tests |
| SonarQube static analysis | `sonar-scanner` through Docker | Passed: analysis successful |
| SonarQube quality gate | SonarQube API | Passed: `OK` |
| Python dependency audit availability | Import check for `pip_audit` in backend image | Not available |
| Frontend dependency audit | `docker compose run --rm --no-deps frontend npm audit --omit=dev --audit-level=moderate` | Did not complete in local session |
| Masked env/config hygiene scan | Local Python key-name scan across `.env*` files | Completed with masked output |

Backend security-related tests:

```text
27 passed, 4 warnings in 72.20s
```

Warnings were framework deprecation warnings only:

- `StarletteDeprecationWarning` for TestClient/httpx compatibility.
- FastAPI `HTTP_422_UNPROCESSABLE_ENTITY` deprecation warnings.

## SonarQube Security Summary

| Metric | Value |
| --- | ---: |
| Quality gate | OK |
| Vulnerabilities | 0 |
| Security hotspots | 24 |
| Security rating | A |
| Security review rating | E |
| Bugs | 10 |
| Reliability rating | E |
| Code smells | 486 |

Interpretation:

- SonarQube did not identify direct vulnerabilities in this run.
- The 24 security hotspots require manual review in the SonarQube UI before production readiness can be claimed.
- Security review rating is poor because hotspots are not reviewed yet.
- Reliability rating is poor because SonarQube reported 10 bugs.

## Authentication And Authorization Coverage

Status: Passed for targeted automated tests.

Evidence:

- `backend/tests/test_auth.py`
- `backend/tests/test_rbac.py`
- `backend/tests/test_allowed_email_domains.py`

Covered behaviors include:

- Login/authentication API behavior.
- RBAC role and permission access boundaries.
- Allowed email domain rules.
- Admin/security authorization controls represented in those tests.

Remaining work:

- Run full backend and frontend suites before release.
- Add browser-level authorization tests for hidden/blocked UI paths.
- Add tests for sensitive KYC, commercial, attachment, dashboard, integration, and timeline permissions if not already covered by module-specific suites.

## Configuration And Secret Hygiene

Status: Partial.

Findings:

- Real secrets are present in local `.env` and `backend/.env`; values were not printed in this report.
- `.env` and `backend/.env` are ignored by git, which is correct for local development.
- `.env.example` and `backend/.env.example` include placeholder/default values for some secret-like settings. These should stay non-sensitive.
- `EXPOSE_RESET_TOKENS` is enabled in local configuration for development convenience and should be disabled outside local/demo use.
- Mail, Google, Fathom, OpenAI/Qwen, and Tavily settings must be rotated or replaced before any shared/pre-production environment if they were ever exposed outside the local machine.

Masked scan examples:

```text
.env: JWT_SECRET_KEY=<masked> (set)
.env: SUPER_ADMIN_PASSWORD=<masked> (set)
.env: GOOGLE_CALENDAR_CLIENT_SECRET=<masked> (set)
.env: MAIL_PASSWORD=<masked> (set)
.env: FATHOM_API_KEY=<masked> (set)
.env: FATHOM_WEBHOOK_SECRET=<masked> (set)
.env: AI_KYC_API_KEY=<masked> (set)
.env: TAVILY_API_KEY=<masked> (set)
backend/.env: JWT_SECRET_KEY=<masked> (set)
backend/.env: GOOGLE_CALENDAR_CLIENT_SECRET=<masked> (set)
backend/.env: FATHOM_API_KEY=<masked> (set)
backend/.env: AI_KYC_API_KEY=<masked> (set)
```

Recommended actions:

- Keep `.env` and `backend/.env` out of source control.
- Rotate demo credentials before giving the application to a wider team.
- Use a secret manager for pre-production and production.
- Disable reset token exposure outside local development.
- Avoid verbose AI/KYC logs in shared environments because prompts and extracted document text can contain customer-sensitive content.

## Dependency Security

Status: Partial.

Observations:

- Python dependency vulnerability scanning is not configured in the backend image.
- Frontend `npm audit` was attempted but did not complete during this local run.
- SonarQube static analysis completed but does not replace package vulnerability scanning.

Recommended actions:

- Add `pip-audit` or `safety` as a backend dependency audit step.
- Add a repeatable frontend `npm audit` or SCA tool step to CI.
- Consider Dependabot or Renovate for dependency update visibility.
- Store dependency audit output under `review/` or CI artifacts for release gates.

## Security Risks Identified

| Severity | Area | Finding | Recommended Fix |
| --- | --- | --- | --- |
| High | Sonar security review | 24 security hotspots are pending manual review. | Review hotspots in SonarQube and mark safe/fix with evidence. |
| High | Reliability/security adjacent | SonarQube reports 10 bugs and reliability rating `E`. | Triage bugs by severity and fix before pre-production signoff. |
| High | Secrets | Local env files contain real integration and AI credentials. | Rotate credentials before sharing beyond local demo; use a secrets manager. |
| Medium | Dependency security | Python package vulnerability scan is not configured. | Add `pip-audit`/`safety` and CI enforcement. |
| Medium | Dependency security | Frontend `npm audit` did not complete in this run. | Re-run with network stability or configure CI SCA. |
| Medium | Development settings | `EXPOSE_RESET_TOKENS` is enabled locally. | Keep enabled only for local demos; disable in pre-production/production. |
| Medium | AI/KYC logging | Verbose logs can expose prompts, source text, and customer context. | Disable verbose AI logs in shared environments and redact sensitive fields. |
| Low | Framework deprecations | Test warnings for FastAPI/Starlette deprecations. | Update deprecated constants and track TestClient/httpx compatibility. |

## Release Readiness Assessment

Current status: Not production-ready from a security perspective.

Reason:

- Static analysis completed and quality gate is green, but Sonar hotspots still need manual review.
- Dependency vulnerability scanning is incomplete.
- Local/demo credentials exist and must not be reused for production.
- Coverage was not imported into SonarQube, so security-critical test coverage is not visible in the dashboard.

Suggested pre-production gate:

1. Review and disposition all Sonar security hotspots.
2. Triage all Sonar bugs.
3. Add backend and frontend dependency audit commands.
4. Generate backend and frontend coverage reports and import them into SonarQube.
5. Disable local-only settings such as reset token exposure.
6. Rotate credentials and move secrets to managed environment storage.
7. Run a dynamic application security test against the running app.

## How To Re-run This Review

Run targeted backend security tests:

```bash
docker compose run --rm --no-deps backend pytest tests/test_auth.py tests/test_rbac.py tests/test_allowed_email_domains.py -q
```

Start SonarQube and run analysis:

```bash
make sonar-up
make sonar-scan SONAR_TOKEN=your_token
```

Open SonarQube:

```text
http://127.0.0.1:9000/dashboard?id=tkxel-kam
```

Run dependency audits once tooling/network is available:

```bash
docker compose run --rm --no-deps frontend npm audit --omit=dev --audit-level=moderate
docker compose run --rm --no-deps backend pip-audit
```
