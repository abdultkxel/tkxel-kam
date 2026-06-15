from __future__ import annotations

from dataclasses import dataclass


OPTIONAL_TRIGGERS = {"alert_created", "csat_received", "admin_configuration_published"}

MANDATORY_TRIGGERS = {
    "account_draft_created",
    "account_draft_updated",
    "account_draft_rejected",
    "account_draft_approved",
    "account_draft_linked_existing",
    "account_duplicate_detected",
    "account_owner_assigned",
    "account_owner_changed",
    "account_owner_removed",
    "kyc_review_required",
    "kyc_rejected",
    "kyc_workstream_failed",
    "source_document_failed",
    "engagement_draft_created",
    "engagement_draft_updated",
    "engagement_draft_rejected",
    "engagement_draft_approved",
    "engagement_health_drop",
    "opportunity_decision_required",
    "governance_reminder",
    "integration_failure",
    "escalation_opened",
    "sla_escalation",
    "escalation_rca_required",
    "low_csat_detected",
    "admin_role_changed",
    "admin_access_changed",
    "admin_field_permission_changed",
    "admin_configuration_failed",
}

REMINDER_DEFAULTS = {"governance_reminder": ("before_due", 3, "business_days")}


@dataclass(frozen=True)
class NotificationTriggerDefinition:
    trigger: str
    label: str
    workflow: str
    recipients: str
    priority: str
    action_label: str
    description: str


def _label(trigger: str) -> str:
    return trigger.replace("_", " ").capitalize()


def _definition(trigger: str, workflow: str, recipients: str, priority: str, action: str, description: str | None = None) -> NotificationTriggerDefinition:
    return NotificationTriggerDefinition(
        trigger=trigger,
        label=_label(trigger),
        workflow=workflow,
        recipients=recipients,
        priority=priority,
        action_label=action,
        description=description or f"{_label(trigger)} requires workflow attention.",
    )


NOTIFICATION_TRIGGER_DEFINITIONS = [
    _definition("account_draft_created", "account_onboarding", "account_approvers", "high", "Review draft", "A new account draft is ready for approval."),
    _definition("account_draft_updated", "account_onboarding", "draft_owner_approvers", "medium", "Review draft", "An account onboarding draft was updated."),
    _definition("account_draft_rejected", "account_onboarding", "draft_creator_owner", "high", "Fix draft"),
    _definition("account_draft_approved", "account_onboarding", "draft_creator_owner", "medium", "Open account"),
    _definition("account_draft_linked_existing", "account_onboarding", "draft_creator_owner", "medium", "Open linked account"),
    _definition("account_duplicate_detected", "account_onboarding", "draft_creator_approvers", "high", "Resolve duplicate"),
    _definition("account_owner_assigned", "account_ownership", "new_owner", "medium", "Open account"),
    _definition("account_owner_changed", "account_ownership", "new_previous_owner", "medium", "Review handover"),
    _definition("account_owner_removed", "account_ownership", "account_admins_previous_owner", "high", "Assign owner"),
    _definition("account_lifecycle_changed", "account_management", "account_owner", "medium", "Review status"),
    _definition("account_attachment_added", "account_evidence", "account_owner_uploader", "low", "Review evidence"),
    _definition("account_attachment_removed", "account_evidence", "account_owner", "medium", "Review evidence"),
    _definition("alert_created", "alerts", "source_owner_first", "medium", "Open alert", "A backend-owned alert needs review."),
    _definition("kyc_draft_created", "kyc", "responsible_owner_reviewers", "medium", "Review KYC draft"),
    _definition("kyc_review_required", "kyc", "kyc_approvers", "high", "Review KYC"),
    _definition("kyc_approved", "kyc", "draft_creator_owner", "medium", "View snapshot"),
    _definition("kyc_rejected", "kyc", "account_owner", "high", "Fix KYC"),
    _definition("kyc_workstream_failed", "kyc", "requester_owner", "medium", "Review run"),
    _definition("source_document_failed", "source_documents", "uploader_owner", "high", "Review document"),
    _definition("source_document_low_confidence", "source_documents", "uploader_owner", "medium", "Verify document"),
    _definition("engagement_draft_created", "engagements", "assigned_am_kam_head", "high", "Review draft", "An imported engagement draft is ready for review."),
    _definition("engagement_draft_updated", "engagements", "assigned_am_kam_head", "medium", "Review draft", "An imported engagement draft was updated."),
    _definition("engagement_draft_rejected", "engagements", "draft_creator_owner", "high", "Fix draft", "An imported engagement draft was rejected."),
    _definition("engagement_draft_approved", "engagements", "draft_creator_owner_kam_head", "medium", "Open engagement", "An imported engagement draft was approved and onboarded."),
    _definition("engagement_created", "engagements", "account_owner", "medium", "Open engagement"),
    _definition("engagement_owner_assigned", "engagements", "new_previous_owner", "medium", "Open engagement"),
    _definition("engagement_status_changed", "engagements", "account_engagement_owner", "medium", "Review engagement"),
    _definition("engagement_health_drop", "engagements", "account_engagement_owner", "high", "Review health"),
    _definition("opportunity_created", "opportunities", "account_opportunity_owner", "medium", "Open opportunity"),
    _definition("opportunity_assigned", "opportunities", "new_previous_owner", "medium", "Open opportunity"),
    _definition("opportunity_stage_changed", "opportunities", "account_opportunity_owner", "medium", "Review opportunity"),
    _definition("opportunity_decision_required", "opportunities", "approver_account_owner", "high", "Make decision"),
    _definition("opportunity_won", "opportunities", "account_owner_leadership", "medium", "Review win"),
    _definition("opportunity_lost", "opportunities", "account_opportunity_owner", "medium", "Review outcome"),
    _definition("opportunity_value_changed", "opportunities", "account_opportunity_owner", "medium", "Review forecast"),
    _definition("task_created", "tasks", "task_assignee", "medium", "Open task"),
    _definition("task_assigned", "tasks", "new_assignee", "medium", "Open task"),
    _definition("task_reassigned", "tasks", "new_previous_assignee", "medium", "Open task"),
    _definition("governance_scheduled", "governance", "owner_attendees", "medium", "Prepare meeting"),
    _definition("governance_rescheduled", "governance", "owner_attendees", "medium", "Review schedule"),
    _definition("governance_cancelled", "governance", "owner_attendees", "low", "View event"),
    _definition("governance_reminder", "governance", "owner_attendees", "medium", "Prepare meeting"),
    _definition("governance_decision_recorded", "governance", "account_owner_subscribers", "low", "View decision"),
    _definition("governance_action_assigned", "governance", "assigned_user", "medium", "Open action"),
    _definition("integration_failure", "integrations", "integration_admins", "critical", "Fix integration"),
    _definition("escalation_opened", "escalations", "escalation_owner_account_owner", "high", "Review escalation"),
    _definition("escalation_owner_changed", "escalations", "new_previous_owner", "high", "Open escalation"),
    _definition("escalation_update_added", "escalations", "escalation_owner_account_owner", "medium", "Review update"),
    _definition("sla_escalation", "escalations", "escalation_owner_leadership", "critical", "Resolve SLA"),
    _definition("escalation_rca_required", "escalations", "escalation_owner", "high", "Add RCA"),
    _definition("escalation_closed", "escalations", "escalation_owner_account_owner", "low", "View escalation"),
    _definition("escalation_reopened", "escalations", "escalation_owner_account_owner", "high", "Resolve escalation"),
    _definition("csat_received", "csat", "account_owner", "low", "View CSAT"),
    _definition("low_csat_detected", "csat", "account_owner_leadership", "high", "Review CSAT"),
    _definition("csat_corrected", "csat", "account_owner", "medium", "View CSAT"),
    _definition("ai_stage_change_confirmed", "ai_assistance", "account_owner", "medium", "Review stage"),
    _definition("admin_role_changed", "admin", "affected_user_admins", "critical", "Review access"),
    _definition("admin_access_changed", "admin", "affected_user_admins", "critical", "Review access"),
    _definition("admin_field_permission_changed", "admin", "admins", "high", "Review permissions"),
    _definition("admin_configuration_published", "admin", "admins", "low", "Review config"),
    _definition("admin_configuration_failed", "admin", "actor_admins", "high", "Fix config"),
]

RUNTIME_NOTIFICATION_TRIGGERS = {definition.trigger for definition in NOTIFICATION_TRIGGER_DEFINITIONS}
HIDDEN_NOTIFICATION_TRIGGER_DEFAULTS = {
    "escalation_opened",
    "escalation_owner_changed",
    "escalation_update_added",
    "sla_escalation",
    "escalation_rca_required",
    "escalation_closed",
    "escalation_reopened",
}
CONFIGURABLE_NOTIFICATION_TRIGGERS = RUNTIME_NOTIFICATION_TRIGGERS - HIDDEN_NOTIFICATION_TRIGGER_DEFAULTS
