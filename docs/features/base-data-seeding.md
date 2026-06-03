# Base Data Seeding

## Overview

Local startup and the backend seed CLI now seed only base access data needed to log in and administer the application.

## Seeded Data

- RBAC permission catalog.
- Default RBAC roles.
- Super admin user from environment configuration.
- One default user per seeded non-super-admin role.
- Allowed email domains required by the login/user-management domain policy.

## Excluded Data

- No demo accounts.
- No demo opportunities.
- No demo engagements, tasks, dashboards, notifications, KYC snapshots, or integration records.
- Feature reference-data helpers remain available in code for tests and targeted module setup, but the application startup path and `python -m app.cli seed` no longer call the full feature-reference seed.

## Local Usage

```bash
docker compose run --rm backend python -m app.cli seed
```

The command is idempotent and can be rerun after a database refresh.

## Test Notes

- Verify a fresh database creates only users/roles plus the allowed-domain platform setting.
- Verify seeded users can log in because their domains match the allowed-domain policy.
- Verify accounts and opportunities are empty after startup until users create them manually.
