# Scoring, Signals, Playbooks, and Tasks

## Scope

Implements `/specs/04-scoring-signals-playbooks-and-tasks.md`: configurable scoring metrics, deterministic score snapshots, rule-based signals, attention center workflows, playbook templates, explicit playbook execution, task lifecycle/evidence, and unified calendar items.

## Backend

- Models: `ScoringMetricDefinition`, `ScoringMetricVersion`, `ManualScoreSubmission`, `ScoreSnapshot`, `ScoringJob`, `SignalRule`, `Signal`, `SignalEvent`, `PlaybookTemplate`, `PlaybookTemplateVersion`, `PlaybookExecution`, `Task`, `TaskEvidence`, `TaskHistory`.
- Repositories: `scoring.py`, `signals.py`, `tasks.py`.
- Services: `ScoringService`, `SignalsService`, `TaskService`.
- Routers: `scoring.py`, `signals.py`, `tasks.py`.
- Migration: `backend/migrations/20260602_scoring_signals_playbooks_tasks.sql`.
- Seed data: default account/engagement metrics, deterministic signal rules, and active playbook templates.

## API Summary

- `GET/POST/PATCH /api/admin/metrics`
- `POST /api/admin/metrics/{metric_id}/validate`
- `POST /api/admin/metrics/{metric_id}/publish`
- `GET /api/admin/metrics/{metric_id}/versions`
- `GET/POST /api/accounts/{account_id}/scores[/recalculate]`
- `GET /api/accounts/{account_id}/score-snapshots`
- `GET/POST /api/engagements/{engagement_id}/scores[/recalculate]`
- `POST /api/scoring/jobs`
- `GET /api/signals`
- `GET /api/attention-center`
- `POST /api/signals/evaluate`
- `PATCH /api/signals/{signal_id}/status`
- `POST /api/signals/{signal_id}/convert`
- `GET /api/signals/{signal_id}/evidence`
- `POST /api/signals/{signal_id}/ai-explanation`
- `GET /api/signals/{signal_id}/recommended-playbooks`
- `GET/POST/PATCH /api/admin/playbook-templates`
- `POST /api/playbooks/{template_id}/execute`
- `GET/POST/PATCH /api/tasks`
- `POST /api/tasks/{task_id}/evidence`
- `GET /api/calendar/items`

## RBAC

- Admin/Super Admin/KAM Head can configure scoring metrics, signal rules by seed, playbook templates, and task/calendar modules.
- Account Managers can view/update scores, signals, and tasks for assigned accounts.
- Ops/Delivery roles can view/update assigned delivery-facing score/signal/task work.
- Leadership viewers can view scoring, signals, playbooks, tasks, and calendar items.

## Frontend

- Admin scoring builder loads/publishes backend scoring metrics.
- Account 360 health recalculation and calculator save call backend score recalculation.
- Score history panel reads persisted score snapshots.
- Tasks board loads backend tasks, attention signals, and templates with loading/error/empty states.
- Playbook page shows active configured backend playbook templates.
- Dashboard recognizes the new `renewal_date` signal type.

## Validation And Security

- Metric formula validation rejects unsupported/unsafe operations and invalid thresholds.
- Score submissions require 0-100 manual scores.
- Signal status transitions are constrained and audited.
- Dismissed signals require reasons.
- Task completion requires outcome or evidence.
- Skipped tasks require skip reason.
- Account authorization is enforced through `AccountAccessService`.
- AI signal explanations are advisory only and do not mutate lifecycle state.

## Tests

- Backend: `backend/tests/test_scoring_signals_playbooks_tasks.py`.
- Frontend: `frontend/src/pages/Tasks.test.tsx`.
- Verified targeted backend feature tests, frontend task tests, and frontend production build.

## Notes

- Scoring jobs execute synchronously in the local adapter while still recording queued/running/complete/failed job state.
- No external AI provider is required for deterministic signal generation. The advisory signal explanation is labeled as `ai_llm_gateway_local_adapter`.
