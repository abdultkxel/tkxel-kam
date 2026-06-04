# Feature Context Index

Use this folder to preserve focused context for each feature. Every feature must have one markdown file here and must be linked in this index.

Start new feature files from:

```text
docs/features/_feature-template.md
```

## Features

- [Governance & Reviews](governance-reviews.md)
- [Growth & Opportunity Management](growth-opportunity-management.md)
- [Approved Integrations](approved-integrations.md)
- [Approved Integrations Coverage Report](approved-integrations-coverage-report.md)
- [Fathom Meeting Capture](fathom-meeting-capture.md)
- [AI KYC Pipeline Phase 1-4](ai-kyc-pipeline-phase-1-to-4.md)
- [Base Data Seeding](base-data-seeding.md)
- [Mailtrap Email Delivery](mailtrap-email-delivery.md)
- [Notifications, Dashboards, And Reporting](notifications-dashboards-reporting.md)
- [Relationships Planning Growth And Retention](relationships-planning-growth-retention.md)
- [Role-Based Dashboards](role-based-dashboards.md)
- [Scoring, Signals, Playbooks, and Tasks](scoring-signals-playbooks-and-tasks.md)
- [Timeline And Handover](timeline-and-handover.md)

## Handoff Notes

- [Governance Reviews Merge Context](governance-reviews-merge-context.md)

## Naming Convention

Use short kebab-case names:

```text
docs/features/account-bulk-import.md
docs/features/profile-validation.md
docs/features/governance-calendar-sync.md
```

## Maintenance Rules

- Add the feature file when feature work starts.
- Keep decisions, API contracts, validation behavior, and tests updated during development.
- Link PRs, tickets, or requirement IDs when available.
- Move completed follow-ups into a backlog or issue tracker instead of leaving stale notes.
