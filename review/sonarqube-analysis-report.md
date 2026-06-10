# SonarQube Analysis Report

Generated on: 2026-06-09

## Local Dashboard

```text
SonarQube URL: http://127.0.0.1:9000
Project URL:   http://127.0.0.1:9000/dashboard?id=tkxel-kam
Project key:   tkxel-kam
Project name:  Tkxel KAM Intelligence Platform
```

## Run Summary

```text
SonarQube version: 9.9.8.100196
Scanner image:     sonarsource/sonar-scanner-cli:latest
Analysis status:   SUCCESS
Quality gate:      OK
Analysis task id:  AZ6r-YCLwhbPD0kLbfN4
Analysis id:       AZ6r-YrBjSKkzcvDe16C
```

## Key Metrics

| Metric | Value |
| --- | ---: |
| Lines of code | 88,217 |
| Bugs | 10 |
| Vulnerabilities | 0 |
| Security hotspots | 24 |
| Code smells | 486 |
| Coverage | 0.0% |
| Duplicated lines density | 1.4% |
| Maintainability rating | A |
| Security rating | A |
| Reliability rating | E |
| Security review rating | E |

## Issue Breakdown

| Severity | Count |
| --- | ---: |
| Blocker | 4 |
| Critical | 209 |
| Major | 264 |
| Minor | 18 |
| Info | 1 |

| Type | Count |
| --- | ---: |
| Code smell | 486 |
| Bug | 10 |
| Vulnerability | 0 |

## Warnings / Notes

- Coverage reports were not found at `backend/coverage.xml` or `frontend/coverage/lcov.info`, so this first report is static-analysis focused and shows `0.0%` coverage.
- The scanner image reported Node.js 22 as not recommended for the bundled JavaScript analyzer. The scan still completed successfully.
- SonarQube Community Edition provides the dashboard report in the web UI. PDF/exported executive reports require additional tooling or a commercial/reporting plugin.

## How To Re-run

Start SonarQube:

```bash
make sonar-up
```

Create a token in SonarQube:

```text
Open http://127.0.0.1:9000
Log in with the configured local admin account.
Create a user token from Account > Security.
```

Run analysis:

```bash
make sonar-scan SONAR_TOKEN=your_token
```

Open the dashboard:

```text
http://127.0.0.1:9000/dashboard?id=tkxel-kam
```
