# Feature Context Index

Use this folder to preserve focused context for each feature. Every feature must have one markdown file here and must be linked in this index.

Start new feature files from:

```text
docs/features/_feature-template.md
```

## Features

- [Account Health Score Metrics](account-health-score-metrics.md)
- [Configurable Scoring And Metric Engine](configurable-scoring-metric-engine.md)
- [Account Overview](account-overview.md)
- [Governance & Reviews](governance-reviews.md)
- [Growth & Opportunity Management](growth-opportunity-management.md)
- [Mailtrap Email Delivery](mailtrap-email-delivery.md)
- [Notifications, Dashboards, And Reporting](notifications-dashboards-reporting.md)
- [Relationships Planning Growth And Retention](relationships-planning-growth-retention.md)
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
