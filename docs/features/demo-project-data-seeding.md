# Demo Project Data Seeding

## Summary

Adds a repeatable local/demo seed command for four realistic project accounts: Cafe Zupas, Fintua, CANVS, and Signals. The seed is intended for testing role-based dashboards, account detail tabs, KYC, engagements, opportunities, governance, tasks, escalations, timeline, health/scoring, and in-app notifications.

## Behavior

- `make seed-demo-projects` seeds or updates fixed demo records without creating duplicates.
- The command seeds base/reference data first, then creates the four project accounts.
- Seeded records are marked through IDs, source context, notes, and metadata as demo data.
- No real emails are sent.
- No external APIs or AI providers are called.
- Seeded in-app notifications are persisted in `notification_records` and are visible to the relevant seeded users.

## Seeded Modules

- Accounts and account owners
- Engagements/SOW context
- Source documents, extracted text, page extraction, chunks, and citations
- KYC agent run, workstream outputs, review draft, and approved v1 snapshot
- Stakeholders, interactions, and coverage gaps
- Account plans, whitespace items, recommendations, opportunities, and retention plans
- Health snapshots, account rollups, and score snapshots
- Governance events, decisions, and action items
- Escalations and escalation updates
- Tasks
- Timeline entries
- In-app notifications for Account Manager, KAM Head, Delivery Lead, Leadership, and Admin

## Commands

```bash
make seed-demo-projects
```

Direct backend CLI:

```bash
docker compose run --rm backend python -m app.cli seed-demo-projects
```

## Test Users

Use the base seeded users from `docs/features/base-data-seeding.md`:

- `admin.user@tkxel.com` / `User@12345`
- `kam.head.user@tkxel.com` / `User@12345`
- `account.manager.user@tkxel.com` / `User@12345`
- `delivery.lead.user@tkxel.com` / `User@12345`
- `leadership.viewer.user@tkxel.com` / `User@12345`

## Implementation Files

- `backend/app/services/seed.py`
- `backend/app/cli.py`
- `Makefile`

## Test Notes

- Backend test verifies the four demo accounts, KYC draft/snapshot, engagement, tasks, and notifications are created.
- Backend test reruns the seeder to verify idempotency.
