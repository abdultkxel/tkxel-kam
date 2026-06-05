# Feature Specification: Notification Workflow Revamp

## Purpose

Revamp the KAM notification functionality by replacing the current piecemeal notification trigger behavior with a workflow-first notification system.

This document is an analysis and implementation plan only. No code implementation is included in this phase.

## Scope Summary

The notification system should notify the correct users at the correct point in each KAM workflow, especially where a human decision, review, approval, ownership change, SLA risk, or operational failure requires attention.

The future implementation should remove the existing notification behavior as the source of truth and rebuild notifications around domain events, recipient policies, templates, preferences, RBAC, and workflow actions.

## Resolved Implementation Decisions

- Executive digests are out of scope for this notification revamp, even though the PRD includes scheduled executive digests. Existing digest behavior may remain untouched until a separate reporting/digest feature pass.
- Email delivery is in scope for mandatory and SLA notifications in this pass. Optional workflow notifications default to in-app unless Admin config enables email where supported.
- Account draft approvers are KAM Head and Admin users.
- Admin-configured timing uses business days by default. Calendar-day and month-based timing can exist as selectable units, but business days are the default for pending/reminder rules.
- All catalog triggers should be implemented in this revamp. Default-enabled and optional/disabled-by-default behavior still applies so low-value triggers do not create noise unless Admin enables them.

## Current-State Findings

The existing notification system has several trigger labels and backend/frontend surfaces, but the behavior is not yet aligned to the full project workflow.

Known current gaps include:

- Account onboarding drafts can be created without reliably notifying approvers that a draft requires approval.
- Requesters and draft owners need outcome notifications when an approver approves, rejects, requests changes, or links the draft to an existing account.
- Some events create toast alerts or local UI feedback but do not create persisted bell/notification-center records.
- Several workflows depend on ad hoc service calls instead of a single notification orchestration path.
- Notification delivery rules, recipient resolution, deduplication, and RBAC visibility need to be standardized.
- The notification center and navbar bell should show the same persisted notification source, with count and filtering consistency.
- Workflow notifications should be action-oriented, not just informational.
- Several implemented workflow modules write audit/timeline entries, but do not have an explicit persisted user notification policy for the affected owner, assignee, requester, reviewer, or approver.

## Goals

- Create one canonical notification lifecycle for all workflows.
- Persist every workflow notification that should appear in the navbar bell and notification center.
- Notify approvers when account drafts are created or resubmitted.
- Notify account owners, assignees, approvers, and admins based on role and workflow state.
- Support in-app notifications as the default delivery channel.
- Support email delivery for mandatory and SLA notifications.
- Allow future Slack and Teams delivery without changing workflow services again.
- Prevent duplicate noise with deduplication and suppression rules.
- Enforce RBAC before a notification is shown or linked.
- Support search, filters, sorting, pagination, read/unread state, and notification preferences.
- Make notification records auditable and testable.

## Non-Goals

- Do not implement this feature in this planning phase.
- Do not preserve the existing notification trigger implementation as the long-term design if it conflicts with this workflow-first model.
- Do not implement Slack or Teams notifications in this pass.
- Do not rebuild executive digests in this pass.
- Do not expose notifications for records the viewer cannot access.
- Do not use frontend-only notifications for workflow events that must appear in the bell or notification center.

## Target Notification Lifecycle

1. A domain service completes a meaningful workflow action.
2. The service emits a typed domain event.
3. A notification orchestrator receives the event.
4. The orchestrator checks the trigger catalog and trigger configuration.
5. Recipient policies resolve target users or roles.
6. RBAC and account/module access filters remove unauthorized recipients.
7. Deduplication rules suppress duplicate records.
8. Notification templates render title, body, severity, action text, and source route.
9. Notification records are persisted.
10. Delivery workers send enabled channels.
11. The navbar bell and notification center read from persisted notification records.
12. Users can mark notifications read, archive them, or open the workflow source.

## Proposed Core Concepts

### Domain Event

A backend event representing a workflow fact, such as `account_draft_created`, `task_created`, or `integration_failed`.

### Notification Trigger

A configured rule that maps a domain event to one or more notification records.

### Recipient Policy

The rule used to decide who receives the notification.

Examples:

- Draft account approvers
- Account owner
- Previous account owner
- Task assignee
- Escalation owner
- Governance meeting attendees
- Integration admins
- Platform admins

### Notification Template

Reusable copy and metadata for a notification.

Each template should define:

- Title
- Body
- Severity
- Trigger key
- Source module
- Action label
- Source route
- Required permission
- Default channels

### Notification Record

The persisted per-user notification visible in the navbar bell and notification center.

### Delivery Attempt

An audit row for each channel delivery attempt, such as in-app, email, Slack, or Teams.

## Roles And Recipient Groups

The revamp should support the following recipient groups:

- Account Manager
- Account Owner
- Previous Account Owner
- Assigned user
- Task creator
- Account approver
- KYC approver
- Governance owner
- Escalation owner
- Escalation approver
- Integration admin
- Platform admin
- KAM leadership
- Users mentioned in timeline/comment text
- Users explicitly subscribed to an account or workflow item

Exact role keys should be mapped from the existing RBAC implementation during implementation.

## Notification Trigger Catalog

| Trigger Key | Workflow | Event Source | Primary Recipients | Default Priority | Default Channel | Action |
| --- | --- | --- | --- | --- | --- | --- |
| `account_draft_created` | Account onboarding | AM creates manual draft | Account approvers | High | In-app | Review draft |
| `account_draft_pending_review` | Account onboarding | Draft remains unapproved after configured pending threshold | Account approvers, KAM Head | High | In-app | Review draft |
| `account_draft_imported` | Account onboarding | CSV creates draft rows | Account approvers, importer | High | In-app | Review import |
| `account_draft_resubmitted` | Account onboarding | AM resubmits rejected draft | Account approvers | High | In-app | Review draft |
| `account_draft_rejected` | Account onboarding | Approver rejects draft | Draft creator, primary AM | High | In-app | Fix draft |
| `account_draft_approved` | Account onboarding | Approver approves draft | Draft creator, assigned AM | Medium | In-app | Open account |
| `account_draft_changes_requested` | Account onboarding | Approver requests changes | Draft creator, draft owner | High | In-app | Update draft |
| `account_draft_linked_existing` | Account onboarding | Approver links draft to existing account | Draft creator, assigned AM | Medium | In-app | Open linked account |
| `account_draft_approval_conflict` | Account onboarding | Concurrent approval/link attempt fails | Acting approver | High | In-app | Refresh draft |
| `account_duplicate_detected` | Account onboarding | Manual or CSV duplicate check | Draft creator, approvers | High | In-app | Resolve duplicate |
| `csv_import_completed` | Account onboarding | CSV import finishes | Importer | Medium | In-app | View import results |
| `csv_import_failed` | Account onboarding | CSV import validation or processing fails | Importer | High | In-app | Fix import |
| `account_owner_assigned` | Account ownership | Account owner assigned | New owner | Medium | In-app | Open account |
| `account_owner_changed` | Account ownership | Owner changed | New owner, previous owner | Medium | In-app | Review handover |
| `account_owner_removed` | Account ownership | Owner removed | Account admins, previous owner | High | In-app | Assign owner |
| `account_handover_required` | Account ownership | Ownership change requires handover | Previous owner, new owner, approver | High | In-app | Complete handover |
| `account_handover_overdue` | Account ownership | Required handover remains incomplete after configured threshold | Previous owner, new owner, KAM Head | High | In-app | Complete handover |
| `account_handover_ready` | Account ownership | Handover summary generated | New owner, requester | Medium | In-app | Review handover |
| `account_lifecycle_changed` | Account management | Lifecycle/status changes | Account owner, watchers | Medium | In-app | Review status |
| `account_archived` | Account management | Account archived | Account owner, leadership where configured | Medium | In-app | Review account |
| `account_attachment_added` | Account evidence | Source/evidence added | Account owner, uploader if different | Low | In-app | Review evidence |
| `account_attachment_removed` | Account evidence | Source/evidence removed | Account owner, affected source owners | Medium | In-app | Review evidence |
| `account_change_alert` | Account management | Material account field changed | Account owner, watchers | Medium | In-app | Review change |
| `account_health_drop` | Account scoring | Health score crosses threshold | Account owner, KAM leadership | High | In-app | Review health |
| `account_risk_detected` | Account scoring | Risk indicators rise | Account owner, KAM leadership | High | In-app | Review risk |
| `stale_kyc` | KYC | KYC becomes stale | Account owner, KYC approvers | High | In-app | Refresh KYC |
| `kyc_draft_created` | KYC | AI/manual KYC draft created | Responsible owner, configured reviewers | Medium | In-app | Review KYC draft |
| `kyc_review_submitted` | KYC | KAM submits KYC for approval | KYC approvers | High | In-app | Approve KYC |
| `kyc_review_pending` | KYC | Submitted KYC remains pending after configured threshold | KYC approvers, KAM Head | High | In-app | Approve KYC |
| `kyc_review_required` | KYC | KYC evidence or draft ready | KYC approvers | High | In-app | Review KYC |
| `kyc_approved` | KYC | Approver approves KYC | Draft creator, account owner | Medium | In-app | View snapshot |
| `kyc_rejected` | KYC | Approver rejects KYC | Account owner | High | In-app | Fix KYC |
| `kyc_changes_requested` | KYC | Approver requests KYC changes | Draft creator, account owner | High | In-app | Update KYC |
| `kyc_workstream_failed` | KYC | One or more AI workstreams fail | Requester, account owner | Medium | In-app | Review run |
| `source_document_failed` | Source documents | Extraction or upload failure | Uploader, account owner | High | In-app | Review document |
| `source_document_low_confidence` | Source documents | Low confidence extraction | Uploader, account owner | Medium | In-app | Verify document |
| `engagement_created` | Engagements | Engagement created | Account owner | Medium | In-app | Open engagement |
| `engagement_owner_assigned` | Engagements | Engagement owner assigned/changed | New owner, previous owner | Medium | In-app | Open engagement |
| `engagement_status_changed` | Engagements | Status changes | Account owner, engagement owner | Medium | In-app | Review engagement |
| `engagement_health_drop` | Engagements | Engagement health crosses threshold | Engagement owner, account owner | High | In-app | Review engagement health |
| `renewal_due` | Engagements | Renewal window opens | Account owner, KAM leadership | High | In-app | Start renewal |
| `renewal_overdue` | Engagements | Renewal action overdue | Account owner, KAM leadership | Critical | In-app | Escalate renewal |
| `stakeholder_gap_detected` | Stakeholders | Missing sponsor/coverage | Account owner | Medium | In-app | Update stakeholders |
| `stakeholder_risk_changed` | Stakeholders | Sentiment, influence, or political risk worsens | Account owner | Medium | In-app | Review stakeholder |
| `account_plan_action_assigned` | Account planning | Plan action owner assigned | Action owner | Medium | In-app | Open plan |
| `account_plan_action_due` | Account planning | Plan action due soon/overdue | Action owner, account owner | High | In-app | Update action |
| `retention_plan_created` | Retention | Retention/stabilization plan created | Plan owner, account owner | Medium | In-app | Open plan |
| `retention_action_assigned` | Retention | Retention action assigned | Action owner | Medium | In-app | Open action |
| `retention_action_overdue` | Retention | Retention action overdue | Action owner, account owner | High | In-app | Update action |
| `whitespace_recommendation_ready` | Growth | Whitespace/adjacency recommendation generated | Account owner | Low | In-app | Review recommendation |
| `opportunity_created` | Opportunities | Opportunity created | Account owner, opportunity owner | Medium | In-app | Open opportunity |
| `opportunity_assigned` | Opportunities | Opportunity owner assigned/changed | New owner, previous owner | Medium | In-app | Open opportunity |
| `opportunity_stage_changed` | Opportunities | Stage changed | Account owner, opportunity owner | Medium | In-app | Review opportunity |
| `opportunity_decision_required` | Opportunities | Approval/decision needed | Approver, account owner | High | In-app | Make decision |
| `opportunity_overdue` | Opportunities | Target date overdue | Opportunity owner, account owner | High | In-app | Update opportunity |
| `opportunity_won` | Opportunities | Opportunity marked won | Account owner, leadership where configured | Medium | In-app | Review win |
| `opportunity_lost` | Opportunities | Opportunity marked lost/deferred | Account owner, opportunity owner | Medium | In-app | Review outcome |
| `opportunity_value_changed` | Opportunities | Material value/probability change | Account owner, opportunity owner | Medium | In-app | Review forecast |
| `scoring_job_failed` | Scoring | Score recalculation job fails | Requester, scoring admins | High | In-app | Review job |
| `score_snapshot_published` | Scoring | Manual/event recalculation completes | Requester where manually triggered | Low | In-app | View score |
| `metric_config_published` | Scoring admin | Metric configuration published | Scoring admins, affected owners where configured | Low | In-app | Review config |
| `metric_config_failed` | Scoring admin | Metric validation/publish fails | Config actor | High | In-app | Fix metric |
| `new_signal` | Signals | Signal created | Account owner, assigned reviewer | Medium | In-app | Review signal |
| `signal_assigned` | Signals | Signal assigned | Assigned user | Medium | In-app | Review signal |
| `signal_unreviewed` | Signals | Signal remains unreviewed | Assigned user, account owner | High | In-app | Review signal |
| `signal_lifecycle_changed` | Signals | Signal accepted/dismissed/converted/resolved | Signal owner, account owner | Low | In-app | View signal |
| `signal_converted` | Signals | Signal converted to task or playbook | New assignee, signal owner | Medium | In-app | Review work |
| `playbook_recommended` | Playbooks | Playbook recommendation generated | Account owner | Medium | In-app | Review playbook |
| `playbook_started` | Playbooks | Playbook started | Account owner, task owners | Medium | In-app | Open playbook |
| `playbook_execution_failed` | Playbooks | Playbook execution cannot create tasks | Acting user, playbook admins | High | In-app | Fix execution |
| `playbook_template_published` | Playbooks admin | Template published/deactivated | Playbook admins | Low | In-app | Review template |
| `task_created` | Tasks | Task created manually or by workflow | Task assignee | Medium | In-app | Open task |
| `task_assigned` | Tasks | Assignee changes | New assignee | Medium | In-app | Open task |
| `task_reassigned` | Tasks | Task owner changes | New assignee, previous assignee | Medium | In-app | Open task |
| `task_blocked` | Tasks | Task marked blocked | Task creator, account owner | Medium | In-app | Review blocker |
| `task_due_soon` | Tasks | Due date approaching | Task assignee | Medium | In-app | Complete task |
| `overdue_activity` | Tasks | Task overdue | Task assignee, account owner | High | In-app | Complete task |
| `task_completed` | Tasks | Task completed | Task creator, account owner | Low | In-app | View task |
| `task_cancelled` | Tasks | Task cancelled/skipped | Task creator, account owner, assignee | Low | In-app | View task |
| `task_evidence_added` | Tasks | Evidence added to task | Task creator, account owner where configured | Low | In-app | Review evidence |
| `timeline_comment` | Timeline | Comment added | Account owner, subscribed users | Low | In-app | View comment |
| `timeline_mention` | Timeline | User mentioned | Mentioned user | High | In-app | View mention |
| `timeline_note_restricted` | Timeline | Sensitive/restricted note created | Mentioned user with redacted shell, authorized subscribers | Medium | In-app | Request access or view note |
| `timeline_retention_run_failed` | Timeline/admin | Retention worker or manual run fails | Admins | High | In-app | Review retention |
| `timeline_retention_run_completed` | Timeline/admin | Manual retention run completes | Acting admin | Low | In-app | View retention log |
| `content_recommended` | Content | Content recommendation generated | Account owner | Low | In-app | Review content |
| `content_sent` | Content | Content sent to stakeholder | Account owner | Low | In-app | View content |
| `content_followup_due` | Content | Follow-up date due | Account owner | Medium | In-app | Follow up |
| `content_upload_failed` | Content | Content file upload/storage fails | Uploader, content admins | High | In-app | Fix content |
| `content_recommendation_stale` | Content | Recommendation source context changes | Account owner | Low | In-app | Refresh recommendation |
| `escalation_opened` | Escalations | Escalation opened | Escalation owner, account owner | High | In-app | Review escalation |
| `escalation_owner_changed` | Escalations | Escalation owner assigned/changed | New owner, previous owner | High | In-app | Open escalation |
| `escalation_update_added` | Escalations | Material escalation update added | Escalation owner, account owner, watchers | Medium | In-app | Review update |
| `sla_escalation` | Escalations | SLA threshold breached | Escalation owner, leadership | Critical | In-app | Resolve SLA |
| `unresolved_escalation` | Escalations | Escalation remains open too long | Escalation owner, leadership | Critical | In-app | Resolve escalation |
| `escalation_rca_required` | Escalations | Major/critical escalation closure needs RCA | Escalation owner | High | In-app | Add RCA |
| `escalation_closed` | Escalations | Escalation closed | Escalation owner, account owner | Low | In-app | View escalation |
| `escalation_reopened` | Escalations | Escalation reopened | Escalation owner, account owner | High | In-app | Resolve escalation |
| `governance_scheduled` | Governance | Governance event scheduled | Owner, attendees where internal users | Medium | In-app | Prepare meeting |
| `governance_rescheduled` | Governance | Governance event date/time changes | Owner, attendees | Medium | In-app | Review schedule |
| `governance_cancelled` | Governance | Governance event cancelled | Owner, attendees | Low | In-app | View event |
| `governance_reminder` | Governance | Meeting/action reminder | Meeting owner, attendees | Medium | In-app | Prepare meeting |
| `governance_overdue` | Governance | Governance item overdue | Meeting owner, account owner | High | In-app | Update governance |
| `governance_brief_ready` | Governance | AI brief generated | Meeting owner | Medium | In-app | Open brief |
| `governance_brief_failed` | Governance | Agenda/brief generation fails | Requester | Medium | In-app | Retry brief |
| `governance_decision_recorded` | Governance | Decision recorded | Account owner, subscribed stakeholders | Low | In-app | View decision |
| `governance_action_assigned` | Governance | Governance action item assigned | Action owner | Medium | In-app | Open action |
| `governance_action_overdue` | Governance | Governance action item overdue | Action owner, governance owner | High | In-app | Update action |
| `integration_failure` | Integrations | Connector failure or sync error | Integration admins | Critical | In-app | Fix integration |
| `integration_recovered` | Integrations | Connector recovers | Integration admins | Low | In-app | View integration |
| `external_import_review_required` | Integrations | Imported records need review | Integration admins, owners | High | In-app | Review import |
| `external_import_pending_review` | Integrations | Imported records remain unreviewed after configured threshold | Integration admins, mapped owners | High | In-app | Review import |
| `integration_reconnect_required` | Integrations | OAuth/token/scopes revoked or expired | Integration admins, affected user | Critical | In-app | Reconnect |
| `integration_test_failed` | Integrations | Test connection fails | Acting admin | High | In-app | Fix integration |
| `integration_sync_completed` | Integrations | Manual sync completes with changes | Acting user | Low | In-app | View sync log |
| `fathom_review_required` | Fathom | Imported meeting requires review/redaction | Reviewers, meeting owner | High | In-app | Review meeting |
| `fathom_review_pending` | Fathom | Imported meeting remains unreviewed after configured threshold | Reviewers, integration admins | High | In-app | Review meeting |
| `fathom_item_approved` | Fathom | Imported item approved | Reviewer/requester where applicable | Low | In-app | View item |
| `fathom_item_rejected` | Fathom | Imported item rejected | Reviewer/requester where applicable | Low | In-app | View item |
| `fathom_task_suggestion_ready` | Fathom | Suggested action item imported | Suggested owner, reviewer | Medium | In-app | Review suggestion |
| `fathom_task_suggestion_approved` | Fathom | Suggestion approved into task | Suggested owner | Medium | In-app | Open task |
| `csat_received` | CSAT | Score received | Account owner | Low | In-app | View CSAT |
| `low_csat_detected` | CSAT | Score below threshold | Account owner, leadership | High | In-app | Review CSAT |
| `csat_corrected` | CSAT | CSAT score corrected or remapped | Account owner, scoring owner | Medium | In-app | Review CSAT |
| `ai_stage_change_confirmed` | AI | AI confirms stage change | Account owner | Medium | In-app | Review stage |
| `ai_stage_prediction_ready` | AI | Stage prediction generated | Requester | Low | In-app | Review prediction |
| `ai_brief_ready` | AI | Account brief generated | Requester | Low | In-app | Open brief |
| `ai_forecast_ready` | AI | Forecast generated | Requester | Low | In-app | Open forecast |
| `ai_output_failed` | AI | AI job fails | Requesting user, admins | Medium | In-app | Retry job |
| `analytics_alert_created` | Analytics | Account-change alert created | Alert owner, account owner | Medium | In-app | Review alert |
| `analytics_alert_status_changed` | Analytics | Alert acknowledged/resolved/dismissed | Alert owner, account owner | Low | In-app | View alert |
| `admin_role_changed` | Admin/RBAC | Role or permission changed | Affected user, admins | High | In-app | Review access |
| `admin_access_changed` | Admin/RBAC | Account/engagement access granted/revoked | Affected user, admins | High | In-app | Review access |
| `admin_field_permission_changed` | Admin/RBAC | Field security rule changed | Affected admins/config actor | Medium | In-app | Review field security |
| `admin_user_deactivation_blocked` | Admin/RBAC | User cannot deactivate until records reassigned | Acting admin, required reassignees | High | In-app | Reassign work |
| `admin_configuration_published` | Admin/config | Configuration published | Config admins | Low | In-app | Review config |
| `admin_configuration_failed` | Admin/config | Configuration validation/publish fails | Config actor | High | In-app | Fix config |
| `security_alert_email_changed` | Admin/security | Security alert destination changed | Admins/Super Admin | High | In-app | Review setting |
| `audit_export_ready` | Admin/Audit | Export generated | Requesting user | Low | In-app | Download export |
| `audit_export_failed` | Admin/Audit | Export generation fails | Requesting user | Medium | In-app | Retry export |

## Admin Notification Configuration Plan

Admin settings must expose notification configuration as a first-class area. The goal is to keep the default notification set focused, allow Admin/KAM Head users to tune reminders and pending thresholds, and prevent low-value informational events from overwhelming the navbar bell.

### Admin Settings Surface

Create an Admin settings section named `Notifications & Reminders`.

The page should support:

- Workflow grouping: Account onboarding, KYC, Ownership, Tasks, Governance, Escalations, Integrations, CSAT, AI, Admin/Security.
- Trigger enable/disable controls.
- Mandatory trigger badges for security, approvals, ownership responsibility, and SLA/risk events.
- Default recipient policy selection where more than one valid policy exists.
- Severity/priority selection.
- Default channels with in-app enabled by default.
- Email channel support for mandatory and SLA notifications.
- Reminder lead-time configuration for due-date based events.
- Pending-age threshold configuration for review/approval/import states.
- Repeat interval configuration for unresolved pending or overdue items.
- Escalation threshold configuration to notify KAM Head/Admin after a pending item remains unresolved.
- Quiet hours and timezone handling for scheduled notifications.
- Test notification action for Admin users.
- Audit log link for configuration changes.

### Default Enabled Trigger Set

The implementation should not enable every catalog trigger by default. Default enabled notifications should be limited to events that create responsibility, communicate an approval/review outcome, or require timely action.

Default enabled:

- Account draft created, pending review, approved, rejected, changes requested, linked to existing account.
- CSV import failed and CSV import completed with errors.
- Account owner assigned, changed, removed, handover required, handover overdue.
- KYC review submitted, pending, approved, rejected, changes requested, stale KYC.
- Engagement owner assigned, engagement health drop, renewal due, renewal overdue.
- Account plan action assigned/due, retention action assigned/overdue.
- Opportunity assigned, decision required, overdue, stalled/status-critical changes.
- Score job failed, account health drop, account risk detected.
- New signal, signal assigned, signal unreviewed, signal converted.
- Task created, reassigned, due soon, overdue, blocked.
- Timeline mention and restricted mention shell.
- Content follow-up due and content upload failed.
- Escalation opened, owner changed, SLA breach, unresolved, RCA required, reopened.
- Governance scheduled, rescheduled, reminder, overdue, action assigned, action overdue, brief failed.
- Integration failure, reconnect required, test failed, external import review required, pending review, Fathom review required, Fathom review pending.
- Low CSAT detected and CSAT corrected when score impact changes.
- AI output failed.
- Analytics alert created.
- Admin role/access/field-permission/security-alert-email changes, user deactivation blocked, configuration failed, audit export ready/failed.

### Disabled By Default Or Optional Triggers

The following are useful in some organizations but should be disabled by default or hidden behind optional workflow toggles because they are informational and can become noisy:

- `account_attachment_added`
- `content_recommended`
- `content_sent`
- `content_recommendation_stale`
- `whitespace_recommendation_ready`
- `score_snapshot_published`
- `metric_config_published`
- `playbook_template_published`
- `timeline_comment`
- `timeline_retention_run_completed`
- `governance_decision_recorded`
- `integration_recovered`
- `integration_sync_completed`
- `fathom_item_approved`
- `fathom_item_rejected`
- `csat_received`
- `ai_stage_prediction_ready`
- `ai_brief_ready`
- `ai_forecast_ready`
- `analytics_alert_status_changed`
- `admin_configuration_published`

These triggers are not removed from the catalog; they are removed from the default enabled notification behavior. Admin can enable them if the business wants a more verbose notification model.

### Reminder And Pending Timing Configuration

Admin must be able to configure both due-date reminders and pending-state reminders.

Due-date reminder configuration applies to records with a known due date, meeting date, renewal date, notice deadline, SLA date, or follow-up date.

Pending-state configuration applies to records that have been waiting in a status for too long, such as pending approval, pending review, unreviewed import, unreviewed signal, or incomplete handover.

| Trigger Key | Timing Type | Default Timing | Repeat Policy | Escalation Policy |
| --- | --- | --- | --- | --- |
| `account_draft_pending_review` | Pending age | 2 business days after draft creation/resubmission | Every 2 business days | Notify KAM Head after 5 business days |
| `kyc_review_pending` | Pending age | 3 business days after submission | Every 3 business days | Notify KAM Head after 7 business days |
| `account_handover_overdue` | Pending age | 3 business days after ownership change | Every 3 business days | Notify KAM Head after 7 business days |
| `external_import_pending_review` | Pending age | 3 days after import | Every 3 days | Notify Integration Admin after 7 days |
| `fathom_review_pending` | Pending age | 3 days after import | Every 3 days | Notify Integration Admin after 7 days |
| `signal_unreviewed` | Pending age | 7 days after signal creation | Weekly | Notify account owner/KAM Head after 14 days |
| `task_due_soon` | Due lead time | 3 days before due date | Once per lead-time window | None |
| `overdue_activity` | Overdue age | 1 day after due date | Every 3 days | Notify account owner after 7 days |
| `account_plan_action_due` | Due lead time and overdue age | 3 days before due date, then 1 day after due date | Every 3 days while overdue | Notify account owner after 7 days |
| `retention_action_overdue` | Overdue age | 1 day after due date | Every 3 days | Notify KAM Head after 7 days |
| `governance_reminder` | Due lead time | 7 days and 1 day before event date | Once per configured lead time | None |
| `governance_overdue` | Overdue age | 1 day after scheduled event/cadence due date | Every 7 days | Notify KAM Head after 14 days |
| `governance_action_overdue` | Overdue age | 1 day after due date | Every 3 days | Notify governance owner after 7 days |
| `content_followup_due` | Due lead time | 3 days before follow-up date | Once per lead-time window | Notify account owner when overdue by 7 days |
| `renewal_due` | Due lead time | 120, 90, 60, and 30 days before renewal/notice date | Once per configured checkpoint | Notify KAM Head at 30 days |
| `renewal_overdue` | Overdue age | 1 day after missed notice/renewal deadline | Weekly | Notify leadership immediately for critical exposure |
| `sla_escalation` | SLA lead/overdue | 25% of SLA remaining and at SLA breach | Once before breach, repeat after breach by severity | Notify leadership at breach for high/critical |
| `unresolved_escalation` | Pending age | Severity-based: critical 1 hour, high 4 hours, medium 2 days, low 5 days | Severity-based repeat | Notify leadership after breach |
| `stale_kyc` | Age since approved snapshot | 90 days after latest approved snapshot by default | Every 30 days | Notify KAM Head after 120 days |
| `opportunity_overdue` | Overdue age | 1 day after target date | Weekly | Notify KAM Head after 30 days |
| `analytics_alert_created` | Rule threshold | When configured alert rule fires | Dedupe until status changes or condition worsens | Notify owner/KAM Head by severity |
| `integration_failure` | Failure threshold | Immediately for critical failure, or after 3 consecutive failures | Repeat after retry window if still failing | Notify Admin/security alert email after 3 failures |
| `integration_reconnect_required` | Pending age | Immediately when token/scope is invalid | Daily | Notify Admin after 3 days |

Admin should be able to change each default value using value/unit controls such as:

- `3 days before due date`
- `1 week before due date`
- `2 business days after created`
- `1 month after pending`
- `2 months after pending`
- `repeat every 1 week until resolved`
- `escalate after 2 reminders`

Business days are the default timing unit for pending and reminder workflows unless Admin explicitly selects calendar days, weeks, or months.

### Timing Configuration Fields

Each configurable trigger should support these fields where applicable:

- `enabled`
- `mandatory`
- `priority`
- `recipient_policy`
- `channels`
- `timing_mode`: `event_immediate`, `due_lead_time`, `overdue_age`, `pending_age`, `recurring_checkpoint`, `threshold`
- `lead_time_value`
- `lead_time_unit`: `minutes`, `hours`, `days`, `business_days`, `weeks`, `months`
- `lead_time_direction`: `before_due`, `after_due`, `after_created`, `after_status_entered`
- `checkpoint_values_json` for multiple reminders such as 120/90/60/30 days.
- `repeat_enabled`
- `repeat_every_value`
- `repeat_every_unit`
- `repeat_limit`
- `escalation_enabled`
- `escalation_after_value`
- `escalation_after_unit`
- `escalation_recipient_policy`
- `quiet_hours_start`
- `quiet_hours_end`
- `timezone_policy`: user timezone, account timezone, or platform default.
- `business_day_calendar`: platform default, account region, or custom calendar where supported.

### Mandatory Versus Optional Admin Control

Admin can adjust timing and recipients for mandatory notifications, but cannot fully disable them.

Mandatory examples:

- Approval required and approval outcome notifications.
- Ownership/assignment notifications.
- SLA breach and critical escalation notifications.
- Integration reconnect/security failure notifications.
- Admin role/access/security setting changes.
- Audit export completion/failure for the requesting user.

Mandatory and SLA notifications should support both in-app and email delivery. User preference can control email where policy allows, but Admin policy can force email for critical SLA/security workflows.

Optional examples:

- Recommendation ready.
- Content sent.
- AI brief/forecast ready.
- Manual sync completed.
- Timeline comment for non-mentioned subscribers.
- Governance decision recorded without assigned action.

### Dropped From Default Bell Behavior

The future implementation should avoid creating navbar bell records for low-value informational events unless Admin enables them:

- Successful manual syncs.
- Generic content sent history.
- Recommendation generated with no assignment or due date.
- AI output ready when the user is still on the page and no review is required.
- Timeline comments where the user is not mentioned or subscribed.
- Admin configuration published successfully when no action is required.
- Score recalculation completed successfully when it was not explicitly requested by the current user.

These events may still be written to audit logs, timeline, integration logs, or activity history without becoming user notifications.

## Workflow Details

## Second-Pass Workflow Gap Inventory

This section captures notification gaps found by tracing the project workflow specs and service boundaries again. These are the moments where a user either becomes responsible for work, needs to know the result of their submitted work, must review a system/import/AI result, or must respond to a risk/SLA/security state.

### Approval And Review Outcome Gaps

Every review workflow needs two directions of notification:

- Work submitted for review notifies the approver group.
- Approver outcome notifies the requester, draft owner, or affected record owner.

Required notification moments:

- Account draft created, resubmitted, linked to existing account, approved, rejected, or changes requested.
- CSV/manual import creates reviewable drafts, partially fails, detects duplicates, or finishes with row errors.
- KYC draft submitted for approval, approved, rejected, or changes requested.
- Fathom imported meeting approved, rejected, or returned for redaction.
- Fathom task suggestion approved into a real task or rejected.
- Governance action item approved/confirmed into a task.
- AI stage prediction is applied through a human workflow.
- Configuration changes are validated, published, failed, or rolled back.

The requester should not have to poll a page to learn that an approver approved or rejected their work.

### Ownership And Assignment Gaps

Whenever responsibility changes, the new responsible user should receive a notification. The previous responsible user should be notified when the change materially affects their active work or handover responsibility.

Required notification moments:

- Account owner assigned, changed, removed, or blocked because handover is required.
- Engagement owner assigned or changed.
- Opportunity owner assigned or changed.
- Signal owner assigned or reassigned.
- Task owner assigned, reassigned, or owner deactivated.
- Escalation owner assigned or changed.
- Governance event owner or governance action owner assigned.
- Account plan action or retention action owner assigned.
- User deactivation blocked because that user owns active accounts, tasks, escalations, approvals, or governance items.

### Due, Overdue, SLA, And Cadence Gaps

Scheduled workflows should create persisted notifications, not only dashboard badges.

Required notification moments:

- Task due soon, overdue, blocked, completed, cancelled, or evidence added.
- Account plan action due or overdue.
- Retention plan action due or overdue.
- Governance event reminder, overdue cadence, overdue action item, or missed completion.
- Renewal due, notice deadline approaching, missed notice deadline, and renewal overdue.
- Escalation SLA approaching, breached, unresolved, or reopened.
- Stale KYC and quarterly KYC review reminder.
- Content follow-up due.
- Opportunity target date overdue or opportunity stalled.
- Signal remains unreviewed past threshold.

### Risk, Score, Signal, And Analytics Gaps

Risk and health changes should notify the people accountable for action while avoiding duplicate noise from repeated recalculation.

Required notification moments:

- Account health drops into amber/red or crosses a configured threshold.
- Engagement health drops into amber/red or crosses a configured threshold.
- Score recalculation job fails.
- Manual score recalculation completes when explicitly requested.
- New deterministic signal is created.
- Signal is accepted, dismissed, converted, resolved, or reopened.
- Stakeholder coverage gap is detected, resolved, or reopened.
- Stakeholder relationship risk worsens.
- Low CSAT or CSAT decline is detected.
- CSAT score is corrected, remapped, or retracted.
- Analytics/account-change alert is created, assigned, acknowledged, dismissed, or resolved.

### Import, Integration, And External Review Gaps

Integration workflows need notifications at the point where human review or admin action is required.

Required notification moments:

- Integration test fails.
- Integration sync fails, partially fails, repeatedly fails, recovers, or completes after a manual user action.
- OAuth token expires, scopes are insufficient, provider connection is revoked, or reconnect is required.
- Calendar/Fathom imported item has weak account mapping and requires review.
- Calendar outbound write fails because user calendar and shared governance fallback are unavailable.
- Fathom webhook is rejected due to invalid signature/replay.
- Fathom review item is ready for redaction/approval.
- Fathom task suggestion is ready for approval.
- AI Gateway run fails, times out, or returns insufficient citation/source data.

### Governance, Escalation, And Decision Record Gaps

Governance and escalation records often create downstream obligations. Those obligations should notify owners when created and notify submitters when completed.

Required notification moments:

- Governance event scheduled, rescheduled, cancelled, completed, or overdue.
- Governance agenda draft ready or failed.
- Governance AI brief ready or failed.
- Governance decision recorded.
- Governance action item assigned, due, overdue, completed, or converted to task.
- Escalation opened, updated, owner changed, SLA breached, RCA required, closed, or reopened.
- Escalation closure blocked because evidence or RCA is missing.
- Major/critical escalation reaches leadership notification threshold.

### Timeline, Handover, And Institutional Memory Gaps

Timeline is the system memory layer. Notifications should fire only when a timeline action creates attention or accountability.

Required notification moments:

- User is mentioned in a timeline note or comment.
- User is mentioned in restricted content and should receive only a redacted notification shell if policy allows.
- Comment is added on a note the user owns or is subscribed to.
- Handover is required during ownership change.
- Handover summary is generated, shared internally, exported, or fails.
- Retention simulation completes when manually requested.
- Retention run fails or deletes/restricts critical entries through tombstone policy.

### Admin, Security, And Configuration Gaps

Security and configuration notifications should be mandatory and not fully suppressible by user preference.

Required notification moments:

- Role, permission, account access, engagement access, or field permission changes affect a user.
- User is invited, activated, deactivated, or blocked from deactivation due to active responsibilities.
- Custom field definition is deleted, disabled, or changed in a way that affects captured values.
- Security alert email changes.
- Admin integration credential changes or disconnects.
- Audit/access log export is ready or fails.
- Configuration publish fails validation.
- Retention policy run fails.

### Low-Priority Informational Gaps

These notifications should be optional or preference-controlled because they can become noisy:

- Content recommendation ready.
- Whitespace recommendation ready.
- AI brief ready.
- AI forecast ready.
- Manual score recalculation completed.
- Integration manual sync completed successfully.
- Governance decision recorded without assigned action.
- Task evidence added where the user is only a watcher.

### Account Onboarding

When an AM creates an account manually as a draft, the draft should not silently wait in the approval queue. The system should create an `account_draft_created` notification for every active approver who can approve account onboarding drafts.

Expected flow:

1. AM creates a draft account.
2. Draft status becomes ready for review.
3. Notification event `account_draft_created` is emitted.
4. Approvers receive a bell notification.
5. Approver opens the notification and lands on the draft review screen.
6. Approver approves, rejects, requests changes, or links the draft to an existing account.
7. Creator/requester receives `account_draft_approved`, `account_draft_rejected`, `account_draft_changes_requested`, or `account_draft_linked_existing`.
8. The assigned primary AM receives the result when they are different from the creator.
9. If changes are requested or the draft is rejected, creator updates and resubmits.
10. Approvers receive `account_draft_resubmitted`.

CSV import should follow the same approval visibility rules. If a CSV import creates drafts, approvers should receive an import summary notification instead of one noisy notification per row unless the row has critical conflicts.

### Account Ownership

Ownership changes should notify both the incoming and outgoing owner when relevant. Removing an owner without assigning a replacement should notify account admins or leadership because it creates an operational gap.

### Account Health And Risk

Material account health changes should notify the account owner. Large score drops or critical risks should also notify leadership. Notification rules should avoid sending repeated alerts for every recalculation unless the account crosses a configured threshold or remains critical after a configured interval.

### KYC And Source Documents

KYC notifications should cover stale records, review-required states, approval, rejection, requested changes, partial AI workstream failures, and failed evidence extraction. Source document extraction failures should be visible in the bell, not only as local upload errors. When a KAM submits KYC for approval, approvers need a review notification; when the approver acts, the submitter/account owner needs the outcome notification.

### Engagements And Renewals

Renewal due and overdue notifications should be scheduled based on contract dates and notice windows. Renewal overdue notifications should escalate if no action is taken.

### Stakeholders

Stakeholder coverage gaps should notify the account owner when a required stakeholder category is missing, a sponsor is not assigned, or relationship coverage falls below configured rules.

### Opportunities

Opportunity owners should be notified when opportunities are created, assigned, moved to an important stage, materially changed in value/probability, won, lost, deferred, stalled, or become overdue. Approval or decision gates should notify the required approvers, and the requester/owner should receive the outcome of those decisions.

### Signals

New signals should notify reviewers or account owners. Signals that remain unreviewed should escalate after the configured time window. Dismissed or resolved signals should not repeatedly alert users unless re-opened.

### Playbooks And Tasks

Task creation should always notify the assigned user if the creator and assignee are different. Workflow-created tasks should use the same trigger as manually created tasks. Due-soon and overdue task notifications should be scheduled and deduplicated. Reassignment should notify both the new and previous owner. Blocked, cancelled, completed, and evidence-added events should notify the creator/account owner only when they are accountable for review.

### Timeline And Mentions

Mentions should notify the mentioned user even when the user is not subscribed to the account, provided the user has access to the linked account or workflow record. General comments should notify subscribed users or owners based on account settings.

### Content

Content recommendations and follow-up reminders should notify account owners only when the recommendation is actionable or the follow-up date is due.

### Escalations

Escalations should notify the escalation owner and account owner when opened. SLA breaches and unresolved escalations should notify leadership based on severity.

### Governance

Governance reminders should notify meeting owners and relevant attendees. Overdue governance items should notify owners and account owners. AI-generated meeting briefs should notify the owner when ready or failed. Decisions and action items should notify the account owner and the assigned action owner. Reschedules and cancellations should notify internal attendees where they have platform accounts.

### Integrations

Integration failures should notify integration admins and, where appropriate, users impacted by the failed sync. Reconnect-required, weak-mapping review, Fathom review/redaction, action-item suggestion, and outbound Calendar write failures should create actionable notifications. Recovery notifications should be low priority and should resolve or link back to the original failure thread.

### CSAT

Low CSAT scores should notify account owners and leadership. Normal CSAT receipt can be low priority or preference-controlled.

### AI Assistance

AI outputs that require human review should notify the requesting user or workflow owner. AI failures should notify the requester and admins when the failure is systemic. Stage prediction, account brief, and forecast readiness should be optional or preference-controlled unless they are part of a required approval workflow.

### Admin And Security

Role changes, sensitive access changes, audit export readiness, and domain/security configuration changes should notify admins and affected users as appropriate.

## Backend Architecture Plan

### Files To Create

- `backend/app/events/` for typed domain events.
- `backend/app/services/notification_orchestrator.py` for event-to-notification orchestration.
- `backend/app/services/notification_recipient_resolver.py` for recipient policies.
- `backend/app/services/notification_template_renderer.py` for template rendering.
- `backend/app/services/notification_delivery.py` for channel dispatch.
- `backend/app/repositories/notifications.py` for persistence.
- `backend/app/repositories/notification_preferences.py` for preference persistence.
- `backend/app/repositories/notification_trigger_configs.py` for trigger configuration.
- `backend/app/schemas/notifications.py` for API request/response schemas.
- `backend/app/routers/notifications.py` for notification APIs.
- `backend/app/jobs/notification_schedulers.py` for due-soon, overdue, SLA, stale, and digest jobs.
- `backend/tests/test_notification_orchestrator.py`.
- `backend/tests/test_notification_recipients.py`.
- `backend/tests/test_notification_api.py`.
- `backend/tests/test_notification_workflows.py`.

### Files To Modify

Future implementation should modify domain services only to emit domain events, not to directly create notification records.

Likely services to modify:

- Account onboarding service
- Account service
- KYC service
- Source document service
- Engagement service
- Opportunity service
- Signal service
- Playbook/task service
- Timeline service
- Escalation service
- Governance service
- Integration service
- CSAT service
- AI job service
- Admin/RBAC service

Likely frontend areas to modify:

- Navbar notification bell
- Notification tray
- Notification center page
- Notification settings/preferences
- Account onboarding review page
- Task list/details pages
- Escalation pages
- Governance pages
- Integration settings/status pages

## Database Migration Plan

The future migration should either replace or reshape the current notification tables so the new schema is the canonical source.

Recommended tables:

### `notification_events`

Stores raw workflow events for auditability and debugging.

Important fields:

- `id`
- `event_key`
- `source_module`
- `source_type`
- `source_id`
- `actor_user_id`
- `account_id`
- `payload_json`
- `created_at`

### `notification_records`

Stores per-recipient notifications visible in the bell and notification center.

Important fields:

- `id`
- `event_id`
- `recipient_user_id`
- `trigger_key`
- `title`
- `body`
- `severity`
- `state`
- `channel`
- `source_module`
- `source_type`
- `source_id`
- `source_route`
- `action_label`
- `dedupe_key`
- `read_at`
- `archived_at`
- `created_at`
- `expires_at`

### `notification_trigger_configs`

Stores enabled/disabled trigger settings and default delivery behavior.

Important fields:

- `id`
- `trigger_key`
- `enabled`
- `default_priority`
- `default_channels`
- `mandatory`
- `timing_mode`
- `lead_time_value`
- `lead_time_unit`
- `lead_time_direction`
- `checkpoint_values_json`
- `pending_threshold_value`
- `pending_threshold_unit`
- `repeat_enabled`
- `repeat_every_value`
- `repeat_every_unit`
- `repeat_limit`
- `escalation_enabled`
- `escalation_after_value`
- `escalation_after_unit`
- `escalation_recipient_policy`
- `quiet_hours_start`
- `quiet_hours_end`
- `timezone_policy`
- `dedupe_window_minutes`
- `created_at`
- `updated_at`

### `notification_preferences`

Stores user-level preferences.

Important fields:

- `id`
- `user_id`
- `trigger_key`
- `channel`
- `enabled`
- `created_at`
- `updated_at`

Mandatory security, approval, assignment, and SLA notifications should not be fully suppressible.

### `notification_delivery_attempts`

Stores delivery attempts for future email, Slack, Teams, or webhook channels.

Important fields:

- `id`
- `notification_record_id`
- `channel`
- `status`
- `attempt_count`
- `last_error`
- `sent_at`
- `created_at`

### `notification_suppressions`

Stores deduplication and suppression metadata.

Important fields:

- `id`
- `dedupe_key`
- `recipient_user_id`
- `trigger_key`
- `suppressed_until`
- `created_at`

### `notification_schedule_rules`

Stores expanded scheduler rules derived from trigger configuration. This table can be skipped if the scheduler reads directly from `notification_trigger_configs`, but a separate table is useful when triggers support multiple checkpoints such as 120/90/60/30 days before renewal.

Important fields:

- `id`
- `trigger_key`
- `source_module`
- `timing_mode`
- `offset_value`
- `offset_unit`
- `offset_direction`
- `repeat_enabled`
- `repeat_every_value`
- `repeat_every_unit`
- `escalation_after_value`
- `escalation_after_unit`
- `active`
- `created_at`
- `updated_at`

### `notification_scheduler_runs`

Stores scheduler execution metadata so Admin can debug reminder and pending notification behavior.

Important fields:

- `id`
- `trigger_key`
- `started_at`
- `finished_at`
- `status`
- `records_scanned`
- `notifications_created`
- `notifications_suppressed`
- `error_message`
- `created_at`

## API Plan

### Notification Center

- `GET /api/notifications`
  - Supports search, trigger filter, state filter, severity filter, module filter, account filter, channel filter, date range, sorting, and pagination.
- `GET /api/notifications/summary`
  - Returns unread count and high-priority count for the navbar bell.
- `PATCH /api/notifications/{id}/read`
  - Marks a notification as read.
- `PATCH /api/notifications/read-all`
  - Marks the current user's visible notifications as read.
- `PATCH /api/notifications/{id}/archive`
  - Archives one notification.

### Preferences

- `GET /api/notification-preferences`
  - Returns current user's preferences and mandatory trigger metadata.
- `PATCH /api/notification-preferences`
  - Updates user preferences.

### Admin Trigger Configuration

- `GET /api/admin/notification-triggers`
  - Lists trigger catalog, default enabled state, mandatory state, timing mode, recipient policy, channels, repeat policy, escalation policy, and workflow grouping.
- `PATCH /api/admin/notification-triggers/{trigger_key}`
  - Updates enabled state, default channel, priority, dedupe window, recipient policy, reminder lead time, pending threshold, repeat interval, escalation threshold, quiet hours, and timezone policy.
- `PATCH /api/admin/notification-triggers/bulk`
  - Updates multiple trigger configurations from the Admin settings grid.
- `POST /api/admin/notification-triggers/{trigger_key}/test`
  - Sends a sanitized test notification to the acting Admin.
- `POST /api/admin/notification-triggers/{trigger_key}/reset-defaults`
  - Restores the trigger to product defaults.
- `GET /api/admin/notification-scheduler-runs`
  - Lists reminder/pending scheduler run history with search, filters, sort, and pagination.
- `POST /api/admin/notification-scheduler-runs/test`
  - Runs a dry-run scheduler simulation for a selected trigger/date window and returns impacted records without creating notifications.

### Internal Event Ingestion

This should be internal service behavior, not a public API by default.

- `NotificationOrchestrator.handle(event)`
- `NotificationOrchestrator.emit(event_key, payload)`

## Frontend Plan

### Navbar Bell

The navbar bell should:

- Read from persisted notification summary.
- Show unread count.
- Display the most recent unread and high-priority notifications.
- Allow marking a notification as read.
- Link to the correct workflow source.
- Match notification center records exactly.
- Refresh after relevant mutations.

### Notification Center

The notification center should:

- List persisted notifications.
- Support search.
- Support trigger, state, severity, module, account, channel, and date filters.
- Support sorting by newest, oldest, priority, and unread first.
- Support pagination.
- Preserve filter state in the URL where practical.
- Show empty states clearly.
- Respect RBAC and never show unauthorized notifications.

### Notification Settings

The settings page should:

- Group preferences by workflow.
- Show which notifications are mandatory.
- Allow enabling/disabling optional triggers.
- Allow channel selection when non-in-app channels are available.
- Explain unavailable channels without creating broken controls.

### Admin Notifications And Reminders Settings

Admin settings should:

- Show only the curated default trigger set as enabled by default.
- Place disabled optional triggers in an expandable `Optional notifications` area.
- Use workflow sections instead of one long list.
- Provide timing controls based on trigger type:
  - Immediate event triggers show no schedule controls.
  - Due-date triggers show `send before due date` controls.
  - Overdue triggers show `send after due date` controls.
  - Pending triggers show `send after pending for` controls.
  - Checkpoint triggers show a multi-value list such as `120, 90, 60, 30 days before`.
- Provide repeat controls:
  - Repeat every value/unit.
  - Stop after count.
  - Stop when source is resolved.
- Provide escalation controls:
  - Escalate after value/unit or after N repeats.
  - Escalation recipient policy.
- Display mandatory trigger locks with editable timing where allowed.
- Validate all timing inputs through the backend and show field-level errors.
- Include a scheduler dry-run/test action for each reminder or pending trigger.

### Action Routing

Every actionable notification should route to the most useful page:

- Draft approval notification routes to draft review.
- Task notification routes to task detail or filtered task list.
- Integration failure routes to integration status/settings.
- Governance overdue routes to governance item.
- Timeline mention routes to the specific account timeline entry where supported.

## Search, Filter, Sort, And Pagination Requirements

Search should match:

- Title
- Body
- Account name
- Source module
- Trigger label

Filters should include:

- State: unread, read, archived
- Trigger key
- Workflow/module
- Severity
- Account
- Channel
- Created date range

Sorting should include:

- Newest first
- Oldest first
- Unread first
- Priority first

Pagination should:

- Use backend pagination.
- Return total count or enough metadata for page navigation.
- Keep navbar summary independent from current page filters.

## Validation Requirements

Backend validation should ensure:

- Trigger keys exist in the catalog.
- Preferences cannot disable mandatory notifications.
- Admin configuration cannot disable mandatory triggers.
- Timing mode is compatible with the trigger source. For example, `due_lead_time` requires a source due date, and `pending_age` requires a source status timestamp.
- Lead-time values are positive integers and use allowed units.
- Pending threshold values are positive integers and use allowed units.
- Checkpoint values are positive integers, unique, and sorted before persistence.
- Repeat interval cannot be shorter than the minimum supported scheduler cadence.
- Repeat limit cannot be negative.
- Escalation policy must reference a valid recipient policy.
- Quiet hours must have valid `HH:mm` values and cannot produce an invalid window.
- Timezone policy must be one of user timezone, account timezone, or platform default.
- Admin dry-run date windows must be bounded.
- Source routes are generated from trusted route builders, not arbitrary user input.
- Recipient users exist and are active.
- Notification payloads include required source identifiers.
- Date filters are valid and bounded.
- Pagination values are bounded.
- Unknown trigger filters return meaningful errors.

Frontend validation should:

- Avoid HTML `required` attributes.
- Display backend validation errors near matching controls.
- Disable impossible preference combinations.

## RBAC And Security Requirements

- A user must only see notifications for records they can access.
- The notification count must not reveal hidden records.
- Source links must be rechecked when opened.
- Sensitive payload fields must not be stored in notification body text.
- Custom field values from field builder must be sanitized and permission-filtered.
- Admin/security notifications should be visible only to authorized users.
- Deleted or archived source records should not expose stale sensitive details.
- External delivery channels must not include sensitive data without policy review.

## Field Builder Impact

Field builder can impact notifications if custom fields are used in trigger conditions, templates, filters, or account-change alerts.

Rules:

- Custom fields should not automatically create notification triggers.
- Only configured custom fields should be eligible for account-change alerts.
- Notification templates should not render sensitive custom field values unless the recipient has permission.
- Field labels used in notification text should be sanitized.
- Field deletion should not break historical notifications.
- Trigger conditions depending on custom fields should fail safely if the field is removed.

## Deduplication And Noise Control

The system should dedupe notifications using keys such as:

- `trigger_key + recipient_user_id + source_type + source_id`
- `trigger_key + recipient_user_id + account_id + threshold_bucket`
- `trigger_key + recipient_user_id + integration_id + failure_type`

Recommended suppression windows:

- Task creation: no suppression for distinct tasks.
- Task overdue: once per task per day.
- Integration failure: once per integration failure type until recovered or changed.
- Account health drop: once per threshold transition.
- Governance reminder: once per configured reminder window.
- Draft approval: once per draft status transition.
- Pending approval reminders: once per configured pending threshold/repeat interval.
- Renewal checkpoints: once per configured checkpoint.
- Escalation SLA reminders: once per severity-specific SLA phase.

Admin-configured repeat rules must still pass through deduplication. A repeat rule should never create more than one notification per recipient/source/trigger inside its configured repeat window.

## Migration And Removal Plan

The future implementation should:

1. Inventory all current notification trigger call sites.
2. Stop treating existing trigger calls as the notification contract.
3. Introduce domain events for workflow actions.
4. Build the new notification orchestrator.
5. Migrate or archive existing notification records.
6. Rebuild the navbar bell and notification center to use the new persisted records.
7. Reconnect each workflow one at a time.
8. Remove obsolete frontend-local notification behavior.
9. Remove obsolete backend helper methods once all workflows use the orchestrator.

Existing records can be retained as historical notifications if their schema can be safely mapped. Otherwise, they should remain archived and hidden from the new notification center after migration.

## Tests Required

### Backend Unit Tests

- Trigger catalog validation.
- Recipient resolution for every recipient policy.
- Mandatory preference protection.
- Mandatory admin trigger configuration cannot be disabled.
- Reminder timing validation accepts valid lead-time/pending/checkpoint settings.
- Reminder timing validation rejects invalid units, negative values, duplicate checkpoints, unsupported timing modes, invalid quiet hours, and invalid escalation recipient policies.
- Deduplication rules.
- Deduplication rules respect admin repeat intervals.
- Template rendering.
- RBAC filtering.
- Source route generation.

### Backend Workflow Tests

- Manual draft account creation notifies approvers.
- Draft pending review scheduler uses the configured pending threshold.
- CSV draft import notifies approvers/importer.
- Draft approval notifies creator and assigned AM.
- Draft rejection notifies creator.
- Draft changes-requested and link-to-existing decisions notify creator/requester.
- Concurrent draft approval conflict notifies acting approver only.
- KYC review submission notifies approvers.
- KYC pending review scheduler uses the configured pending threshold.
- KYC approval, rejection, and requested changes notify submitter/account owner.
- KYC partial workstream failure notifies requester without blocking manual review.
- Account owner assignment, reassignment, removal, and handover-required events notify the correct users.
- Engagement owner assignment and engagement health drop notify engagement/account owners.
- Account plan and retention actions notify assignees on assignment and overdue windows.
- Opportunity assignment, stage change, won/lost, stalled, and overdue events notify owners.
- Score recalculation failure notifies requester/admins and health drop notifications dedupe by threshold transition.
- Signal lifecycle changes and signal conversion notify the owner/new assignee.
- Playbook execution failure notifies acting user/admins.
- Task creation notifies assignee.
- Task reassignment notifies new and previous assignee.
- Task blocked/cancelled/completed/evidence-added notification policies notify only accountable recipients.
- Task overdue scheduler creates deduped notifications.
- Task due-soon scheduler uses configured lead time.
- Renewal checkpoint scheduler uses configured 120/90/60/30-style checkpoints.
- Governance reminder scheduler uses configured event lead times.
- Pending import/Fathom review schedulers use configured pending thresholds.
- Repeat reminders stop when the source record is resolved, approved, closed, completed, or archived.
- Escalation recipient policy applies after configured escalation threshold.
- Integration failure creates admin notification.
- Integration reconnect-required, weak mapping review, Fathom review, Fathom task suggestion, and outbound calendar failure create actionable notifications.
- Integration recovery resolves or follows up failure notification.
- Timeline mention notifies mentioned user.
- Restricted timeline mention creates only redacted notification shell where policy allows.
- Handover-required and handover-ready events notify previous owner/new owner/requester.
- Governance overdue creates notification.
- Governance scheduled/rescheduled/cancelled/completed, brief-ready/failed, decision-recorded, action-assigned, and action-overdue policies notify correct recipients.
- SLA breach creates critical notification.
- Escalation owner change, update added, RCA required, close, and reopen notify correct recipients.
- Low CSAT creates high-priority notification.
- CSAT correction/remap notifies account owner/scoring owner when the score impact changes.
- Admin role/access/field-permission/security-alert-email changes notify affected user/admins and cannot be disabled when mandatory.
- Audit export ready/failed notification is visible only to the requester.
- Analytics account-change alert creation and status changes notify the alert/account owner.

### API Tests

- Notification list pagination.
- Search and filters.
- Read/read-all/archive mutations.
- Preferences list and update.
- Mandatory preference cannot be disabled.
- Admin trigger list returns workflow groups, enabled state, mandatory state, timing config, repeat config, and escalation config.
- Admin trigger update persists reminder/pending timing values.
- Admin trigger update rejects invalid timing values with field-level errors.
- Admin bulk trigger update validates atomically or returns per-field errors.
- Admin test notification creates a sanitized test notification.
- Admin reset-defaults restores product default timing.
- Scheduler dry run returns impacted counts without creating notifications.
- Scheduler run history is searchable, filterable, sortable, and paginated.
- Unauthorized users cannot access hidden notifications.
- Navbar summary count excludes hidden notifications.

### Frontend Tests

- Navbar bell shows unread persisted notifications.
- Bell tray opens source route.
- Notification center filters by trigger and state.
- Notification center marks read.
- Settings page groups preferences by workflow.
- Mandatory preferences cannot be disabled.
- Field-level errors display for invalid preference updates.
- Admin notification settings groups triggers by workflow.
- Admin settings show optional disabled triggers separately from default enabled triggers.
- Admin settings render the correct timing controls for immediate, due-date, overdue, pending, checkpoint, and threshold triggers.
- Admin settings save lead-time and pending-threshold values through the service layer.
- Admin settings display backend field-level errors for invalid timing configuration.
- Admin dry-run/test action displays impacted counts without implying notifications were sent.

### End-To-End Tests

- AM creates draft account and approver sees navbar notification.
- Approver approves draft and AM sees approval notification.
- Task is created for another user and assignee sees task notification.
- Integration failure appears in bell and notification center.
- Unauthorized user cannot see another account's notification.

## Implementation Phases

### Phase 1: Catalog And Data Model

- Finalize trigger catalog.
- Finalize default enabled, disabled-by-default, mandatory, and optional trigger groups.
- Finalize product default timing for due-date, pending-age, overdue, checkpoint, threshold, repeat, and escalation rules.
- Add database migrations.
- Add schemas, repositories, and seed/config defaults for trigger configuration and schedule rules.
- Add tests for catalog and persistence.

### Phase 2: Admin Configuration And Scheduler Foundation

- Implement Admin notification trigger configuration APIs.
- Implement timing validation for immediate, due-date, overdue, pending, checkpoint, threshold, repeat, escalation, quiet-hour, and timezone settings.
- Implement scheduler dry-run support.
- Implement scheduler run logging.
- Build the Admin `Notifications & Reminders` settings UI.
- Add backend and frontend tests for configuration and validation.

### Phase 3: Orchestrator

- Implement domain event types.
- Implement notification orchestrator.
- Implement recipient resolver.
- Implement template renderer.
- Implement dedupe, preference, admin trigger configuration, and timing checks.
- Add unit tests.

### Phase 4: Full Catalog Workflow Migration

Implement every catalog trigger. Start with the highest-risk mandatory/SLA workflows, then continue through the optional catalog without changing the public contract.

- Account draft created
- Account draft pending review
- Account draft approved/rejected
- Account draft changes requested/link-to-existing
- CSV import review required
- KYC review submitted/pending/outcomes
- Task created
- Task due-soon
- Task overdue
- Integration failure
- Integration reconnect required
- SLA escalation
- Remaining enabled and optional catalog triggers

### Phase 5: Frontend Notification Surfaces

- Rebuild navbar bell against persisted notification summary.
- Rebuild notification center against backend list API.
- Rebuild notification settings against preferences API.
- Add frontend tests.

### Phase 6: Remaining Workflow Migration

Migrate:

- KYC
- Source documents
- Engagements and renewals
- Opportunities
- Signals
- Playbooks
- Timeline
- Governance
- CSAT
- AI
- Admin/security

### Phase 7: Cleanup

- Remove obsolete notification services, local-only notification logic, and direct trigger calls.
- Archive or migrate old records.
- Complete end-to-end tests.
- Update documentation and feature files.

## Implementation Status

### Completed Items

The following items are fully implemented and covered by automated tests:

- Workflow-first notification catalog with workflow, recipient policy, priority, channel, action, timing, repeat, escalation, and mandatory metadata.
- Product default seeding for all catalog triggers, including default-enabled, optional, mandatory, and business-day timing metadata.
- Persisted in-app notification records for the navbar bell and Notification Center.
- Navbar bell summary backed by persisted notifications, including unread count and recent notification display.
- Notification Center list backed by persisted notifications with search, trigger filter, workflow filter, priority filter, account filter, channel filter, date filters, read/archived state filters, sort options, and backend pagination.
- Notification read, read-all, and archive behavior.
- Mandatory user preference protection.
- Admin trigger configuration protection so mandatory triggers cannot be disabled.
- Admin notification configuration UI for trigger state, channel mode, timing, repeat, escalation, reset, test notification, and scheduler dry-run.
- Scheduler dry-run and scheduler run history API/UI.
- Email delivery metadata for mandatory and SLA notifications.
- Account draft creation notifications to KAM Head/Admin approvers.
- Account draft approval, rejection, and link-to-existing outcome notifications to the draft creator/owner.
- Task creation notifications to assignees through the standard task service and playbook task service.
- RBAC filtering for notification list/count/read behavior so users do not see notifications for inaccessible account records.
- Unknown trigger and workflow filter validation with meaningful backend errors.
- Feature documentation in `docs/features/notification-workflow-revamp.md`.

Verified commands:

- `docker compose run --rm --no-deps backend pytest tests/test_notification_workflow_revamp.py tests/test_notifications_dashboards_reporting.py -q`
- `docker compose run --rm --no-deps frontend npm test -- NotificationTray.test.tsx Notifications.test.tsx`
- `docker compose run --rm --no-deps frontend npm run typecheck`

### Remaining Items

The following requirements are not marked complete because they are missing, partially implemented, or not fully tested:

- Production scheduler worker that materializes due-date, overdue, pending, checkpoint, repeat, and escalation notifications from Admin timing configuration.
- Full workflow migration for every trigger in the catalog, including KYC, source documents, engagements, renewals, opportunities, signals, governance, CSAT, AI assistance, admin/security, and content workflows.
- Draft resubmission, changes-requested, and concurrent approval conflict notifications.
- CSV import summary/importer notifications.
- Focused automated coverage for task reassignment notifications to both new and previous assignees.
- User notification settings grouped by workflow.
- Dedicated expandable `Optional notifications` area in Admin notification settings.
- Separate `notification_delivery_attempts` persistence table for channel attempt audit history.
- Dedicated notification orchestrator, template renderer, and recipient resolver classes.
- Field-level frontend error rendering in Admin notification settings for timing/config validation failures.
- End-to-end browser tests for AM draft creation, approver bell notification, approval, and AM outcome bell notification.
- Full recipient-policy unit tests for every catalog recipient policy.
- Holiday-aware business-day scheduling. Current implementation stores business-day timing metadata but does not yet run a production scheduler against holidays.

### Technical Notes

- The current implementation keeps workflow services calling `NotificationsService` directly. This centralizes persistence and catalog behavior, but it is not yet the dedicated domain-event orchestrator described as the long-term architecture.
- Mandatory and SLA notifications include email channel metadata. The implementation uses the current notification delivery metadata path rather than a separate delivery-attempt audit table.
- The field builder does not automatically create notification triggers and current notification bodies do not render arbitrary custom field values, which reduces privacy risk. Future template interpolation must check sensitive-field flags, field permissions, and recipient access before rendering values.
- Archived notifications use `archived_at` and are excluded from default notification lists and unread counts.
- Deduplication is implemented for current notification creation paths through deduplication keys and repository constraints, but repeat-reminder dedupe still depends on the future production scheduler.
- Source routes are stored as trusted application routes and notification read behavior redacts inaccessible links, but destination pages must continue enforcing their own RBAC.
- The detailed Phase 3 coverage review is available in `specs/15-notification-workflow-revamp-coverage-report.md`.

## Risks And Assumptions

- Exact RBAC role keys need to be confirmed during implementation.
- Some workflows may not yet have dedicated detail pages for notification deep links.
- CSV import behavior may need product confirmation: one summary notification versus one notification per draft.
- External channels should remain disabled until in-app behavior is stable.
- Existing notification records may not migrate cleanly if old payloads are incomplete.
- Scheduler timing must be tested carefully to avoid duplicate overdue reminders.
- Admin-configured reminder timings can create noisy notification behavior if product defaults are too aggressive.
- Month-based pending thresholds need a clear calendar policy because one month can mean 28, 30, or 31 days.
- Business-day timing needs holiday/calendar rules if product expects more than weekday-only calculation.
- Field builder values may introduce privacy risk if rendered in notification text.

## Open Questions

- Resolved: account draft approvers are KAM Head and Admin users.
- Should CSV imports that auto-approve accounts still notify approvers, or only notify the importer with a completion summary?
- Should account-change alerts be limited to material fields only, and who configures those fields?
- Which notifications are mandatory and cannot be disabled by user preference?
- Resolved: mandatory/SLA notifications include email delivery in this pass.
- Resolved: mandatory notifications can be timing-configurable by Admin but cannot be disabled.
- Resolved: pending-age reminders use business days by default.
- Resolved: all catalog triggers are in scope for this implementation pass.
- Month-based settings should be stored as calendar months or normalized days?
- What should the global default timezone be when a user/account timezone is missing?
- Should Admin be able to configure multiple reminder checkpoints for every due-date notification, or only for renewal/governance workflows?
- What is the maximum repeat count allowed before a notification escalates or stops?
- Should notification records expire automatically after a retention period?
- Should read notifications remain in the navbar tray or only in the full notification center?
- Should leadership notifications be sent for all critical accounts or only named portfolios?
- Should future Slack/Teams notifications be supported, and which data can be included safely?

## Definition Of Done For Future Implementation

- All workflow notifications listed in this spec are either implemented or explicitly deferred.
- Navbar bell and notification center use the same persisted notification records.
- Account draft creation notifies approvers.
- Notification preferences work and protect mandatory triggers.
- RBAC is enforced for list, count, and source-route visibility.
- Search, filtering, sorting, and pagination are implemented.
- Backend, frontend, and end-to-end tests cover critical notification workflows.
- Obsolete notification logic is removed or documented as intentionally retained.
- Feature documentation is updated with final API contracts, data model, and testing notes.
