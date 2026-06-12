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
- [Fireflies Meeting Capture](fireflies-meeting-capture.md)
- [AI KYC Pipeline Phase 1-4](ai-kyc-pipeline-phase-1-to-4.md)
- [KYC Snapshot Restore](kyc-snapshot-restore.md)
- [KYC Ollama Output And Debug Sidebar](kyc-ollama-output-debug-sidebar.md)
- [KYC OpenAI Prompt And Onboarding Defaults](kyc-openai-prompt-onboarding.md)
- [SOW Upload Field Auto-Fill](sow-extracted-text-review.md)
- [Local Qwen AI KYC Phase 5-10](local-qwen-ai-kyc-phase-5-to-10.md)
- [Base Data Seeding](base-data-seeding.md)
- [Demo Project Data Seeding](demo-project-data-seeding.md)
- [Account Detail Tabs](account-detail-tabs.md)
- [Account Numeric Display ID](account-numeric-display-id.md)
- [Account Onboarding Assignment](account-onboarding-assignment.md)
- [Account Onboarding LinkedIn URL](account-onboarding-linkedin.md)
- [Mailtrap Email Delivery](mailtrap-email-delivery.md)
- [Notifications, Dashboards, And Reporting](notifications-dashboards-reporting.md)
- [Notification Workflow Revamp](notification-workflow-revamp.md)
- [Relationships Planning Growth And Retention](relationships-planning-growth-retention.md)
- [Role-Based Dashboards](role-based-dashboards.md)
- [RBAC Hardcoded Role Audit](rbac-hardcoded-role-audit.md)
- [RBAC Permission Model Redesign](rbac-permission-model-redesign.md)
- [KAM AI Six-Month Forecast](kam-ai-six-month-forecast.md)
- [KAM AI Chat Sessions And Vector Search](kam-ai-chat-sessions-vector-search.md)
- [UI Design Quality Tooling](ui-design-quality-tooling.md)
- [UI KYC, Account, And Engagement Cleanup](ui-kyc-account-engagement-cleanup.md)
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
