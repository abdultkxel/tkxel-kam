# Feature Specification: Admin Security RBAC And Audit

## Feature Overview

Manage users, roles, account/engagement access, product field builder definitions, field permissions, reference data, controlled taxonomies, configuration versions, audit logs, and retention policies.

## Business Goal

Provide a secure, configurable administration layer that enforces least privilege, maintains controlled business terminology, and preserves traceability for critical changes.

## User Roles

- Admin
- Super Admin / setup owner
- KAM Head / VP
- Account Manager / KAM
- Ops Lead
- Leadership Viewer / Executive
- Content Specialist
- Commercial Stakeholder
- Delivery Stakeholder
- Platform

## User Stories Covered

- Story 21.1 - User, role, access, and restricted permissions management
- Story 21.2 - Reference data and controlled taxonomies
- Story 21.3 - Configuration, audit logs, and retention policies
- Story 23 - Multi-owner and tenant-ready architecture guardrails where they affect admin/security storage and access isolation

## Functional Requirements

- Manage users, roles, role inheritance, account access, engagement access, matrix ownership, and restricted permissions.
- Role inheritance and effective permissions must be governed by the RBAC permission model rather than hard-coded role assumptions.
- Manage role permission matrix by module/action.
- Account access levels are `viewer`, `contributor`, `owner`, `approver`, and `executive_viewer`.
- Engagement access levels are `viewer`, `contributor`, `owner`, `approver`, and `delivery_viewer`.
- Account/engagement access assignments must support role-scoped and user-scoped grants with active/inactive state, reason, created/updated actor, and effective timestamps.
- Manage product custom field definitions by PRD module, including field key, label, type, options, required/sensitive flags, active state, visibility, and display order.
- Support field-level security for protected commercial, executive, escalation, legal, stakeholder, attachment, report, timeline, and AI context data.
- Field-level security must support the effects `allow`, `read_only`, `masked`, and `hidden`.
- Field-level security must support role, user, account, engagement, sensitivity level, entity type, and field key scopes.
- Sensitive field categories include commercial value/rate/margin/payment data, executive notes/decisions, escalation severity/root-cause/legal-risk data, stakeholder influence/contact details, restricted attachments, report exports, timeline sensitive notes, and AI source context.
- Configure reference data: account statuses, stages, segments, industries, regions, opportunity types, stakeholder roles, signal types, escalation severities, governance types, content tags.
- Active reference data values must be available to authenticated feature screens through read-only APIs while admin mutation remains restricted.
- Configure scoring, signal, playbook, timeline event, retention, notification, SLA, and dashboard rules.
- Validate, version, test, publish, roll back where supported, and audit configuration changes.
- Configuration change records must capture module, entity, environment/status (`draft`, `tested`, `published`, `rolled_back`, `failed`), previous value, new value, validation result, actor, timestamp, source, and reason.
- Maintain audit logs for critical business and configuration actions.
- Audit logs must capture actor, timestamp, entity type, entity ID, action, previous value, new value, source, reason, and request metadata where captured.
- Maintain access logs for sensitive record and field retrieval where required by policy.
- Sensitive access logs must capture actor, entity type, entity ID, field key or policy category, access result, policy reason, account/engagement scope, source IP/session/request ID where captured, and timestamp.
- Manage retention policies for timeline entries, AI outputs, KYC snapshots, score snapshots, audit logs, attachments, and reports.
- Initial deployment is single-organization, but admin/security records that define configuration, permissions, access, audit, reference data, and retention must be tenant-ready through a tenant/configuration scope or equivalent partitioning strategy.

## Non-Functional Requirements

- RBAC must be enforced at API, query, and serialization layers.
- Protected records and fields must never be returned to unauthorized users.
- Audit logs must be append-only.
- Admin screens should use paginated lists and dense filters.

## Permissions & Authorization

- Admin with RBAC configure permission manages users, roles, permissions, reference data, access, and configuration.
- Super admin/setup owner remains protected and hidden where configured.
- Super admin/setup owner can only be managed through an explicit recovery/setup path; normal Admin listings must not expose destructive actions against that account.
- KAM Head may configure selected business rules only when the RBAC permission matrix grants the required module/action permission.
- Users can only see/administer scopes granted by role and tenant/account access.
- Field permission rules override broad module access for sensitive fields.
- Admin users are not automatically allowed to read all sensitive content; sensitive field access requires explicit role or field permission policy.
- Audit and sensitive access logs require `view` permission; exporting logs requires `export` permission and must be audited.
- Configuration, retention, and policy mutation require `configure` permission.

## Validation Rules

- User email must be valid and unique.
- Role slug must use snake_case.
- System roles cannot be deleted.
- Assigned roles cannot be deleted.
- At least one setup/super admin must remain active.
- Deactivating or deleting a user with primary account ownership, open assigned tasks, active escalations, or required approval responsibility must be blocked or require reassignment before completion.
- User deactivation requires a reason and must be audited.
- Account/engagement access level must be one of the enumerated values for that entity type.
- Account/engagement access grants must reference active users or active roles and existing accounts/engagements within the same tenant/configuration scope.
- Field permission must map to known entity/field.
- Field permission conflicts resolve from most specific to least specific: user + entity scope, user, role + entity scope, role, default sensitivity policy.
- Field permission rules must not grant access to a field that the user's module permission cannot access.
- Custom field module must map to a known PRD module slug.
- Custom field key must use snake_case and be unique within its module.
- Custom field label is required.
- Select custom fields require at least one unique option.
- Non-select custom fields cannot define select options.
- Custom field sort order must be non-negative.
- Reference data slug/name unique within taxonomy.
- In-use taxonomy item cannot be hard deleted.
- Required default taxonomy value cannot be deactivated without replacement.
- Configuration publish requires validation success.
- Configuration test mode must not affect authoritative production rules until published.
- Configuration rollback must preserve original version, rollback actor, timestamp, and reason where supported.
- Retention action requires reason and target entity type.

## Search Requirements

- Search users by name/email.
- Search roles by slug/name/description.
- Search access assignments by account, engagement, user, role.
- Search reference data by name/slug.
- Search custom fields by label, field key, module, and description.
- Search audit logs by entity ID/name and reason.
- Search access logs by actor, entity, field, account, and source IP/session where captured.
- Search configuration changes by module, actor, and entity.
- Search retention actions by actor, reason, policy name, and entity type.

## Filter Requirements

- Users: status, role, created date.
- Roles: system/custom, active state where supported.
- Access: account, engagement, user, role, access level.
- Reference data: taxonomy, active/inactive.
- Custom fields: module, field type, active/inactive status.
- Audit logs: actor, entity, action, source, date range, reason.
- Access logs: actor, entity, field, sensitivity level, date range, access result.
- Retention policies: entity type, action, active state.

## Sort Requirements

- Users: name, email, created date, updated date.
- Roles: name, updated date.
- Access assignments: account, user, role, updated date.
- Reference data: display order, name, updated date.
- Custom fields: display order, label, module, field type, updated date.
- Audit/configuration logs: newest first.
- Access logs: newest first.
- Retention policy/action logs: newest first.

## Pagination Requirements

- User, role, permission, access, custom field, reference data, audit log, configuration change, and retention policy lists are paginated.
- Access logs are paginated.

## API Requirements

- Existing: `/api/admin/users`
- Existing: `/api/admin/roles`
- Existing: `/api/admin/permissions`
- `GET /api/admin/custom-fields/modules`
- `GET /api/admin/custom-fields`
- `POST /api/admin/custom-fields`
- `GET /api/admin/custom-fields/{field_id}`
- `PATCH /api/admin/custom-fields/{field_id}`
- `DELETE /api/admin/custom-fields/{field_id}`
- `GET /api/admin/account-access`
- `POST /api/admin/account-access`
- `PATCH /api/admin/account-access/{access_id}`
- `DELETE /api/admin/account-access/{access_id}`
- `GET /api/admin/engagement-access`
- `POST /api/admin/engagement-access`
- `PATCH /api/admin/engagement-access/{access_id}`
- `DELETE /api/admin/engagement-access/{access_id}`
- `GET /api/admin/field-permissions`
- `POST /api/admin/field-permissions`
- `PATCH /api/admin/field-permissions/{permission_id}`
- `DELETE /api/admin/field-permissions/{permission_id}`
- `GET /api/admin/reference-data/{taxonomy}`
- `GET /api/reference-data/{taxonomy}`
- `POST /api/admin/reference-data/{taxonomy}`
- `PATCH /api/admin/reference-data/{taxonomy}/{item_id}`
- `DELETE /api/admin/reference-data/{taxonomy}/{item_id}`
- `GET /api/admin/audit-logs`
- `GET /api/admin/audit-logs/{log_id}`
- `GET /api/admin/audit-logs/export`
- `GET /api/admin/access-logs`
- `GET /api/admin/access-logs/{log_id}`
- `GET /api/admin/access-logs/export`
- `GET /api/admin/configuration-changes`
- `GET /api/admin/configuration-changes/{change_id}`
- `POST /api/admin/configuration-changes/{change_id}/validate`
- `POST /api/admin/configuration-changes/{change_id}/publish`
- `POST /api/admin/configuration-changes/{change_id}/rollback`
- `GET /api/admin/retention-policies`
- `POST /api/admin/retention-policies`
- `PATCH /api/admin/retention-policies/{policy_id}`
- `POST /api/admin/retention-policies/{policy_id}/simulate`
- `POST /api/admin/retention-policies/{policy_id}/run`
- `GET /api/admin/retention-actions`

## Database/Storage Requirements

- Reuse existing user, role, permission, role permission, custom field definition/value, platform setting, account ownership, timeline retention, and audit log tables where their current shape satisfies the requirement.
- Add or extend storage for account access assignments when current account ownership does not represent the full account access level model.
- Add engagement access assignment storage because engagement-specific grants are separate from account ownership.
- Add field permission rule storage with effect, scope, entity type, field key, sensitivity category, active state, reason, actor, and timestamps.
- Add reference data item storage with taxonomy, slug, name, description, display order, active state, protected/default flags, usage-safe deletion behavior, tenant/configuration scope, actor, and timestamps.
- Add sensitive access log storage.
- Add configuration change/version storage for publishable admin configuration records.
- Extend audit log storage where needed for PRD-required `source`, request metadata, tenant/configuration scope, and export traceability.
- Add user deactivation metadata if not already present: deactivated timestamp, actor, and reason.

## UI Requirements

- Separate Users Management and Roles Management screens.
- Role permission matrix with select-all/clear-all permission controls.
- Preserve current URL-backed tabbed Admin section navigation (`section` query parameter) as Admin grows; do not reintroduce a single long scroll-only admin page.
- Field Builder screen as a separate Admin tab with searchable/filterable/paginated custom field definitions, create/edit form, field-level validation errors, select options editor, visibility toggles, sensitive/required flags, and delete confirmation.
- Account/engagement access assignment screens.
- Field permission configuration screen.
- Reference data screen with taxonomy tabs.
- Configuration screens with version history, validation, test mode, publish, and rollback controls where supported.
- Audit log screen must be server-backed with filters, pagination, detail drawer, and export action.
- Sensitive access log screen must be server-backed with filters, pagination, detail drawer, and export action.
- Retention policy screen with simulation/test action.
- Confirmation dialogs for destructive actions.
- Admin UX should preserve the existing dense, tabbed design and responsive behavior used by Users, Roles, Field Builder, Retention, Integrations, and Settings panels.

## Loading States

- User/role/access list loading.
- Permission matrix loading.
- Field Builder list and save loading.
- Reference taxonomy loading.
- Configuration validation/publish loading.
- Audit log loading.
- Retention simulation loading.

## Empty States

- No users/roles/access assignments beyond defaults.
- No custom roles.
- No custom fields in selected filters/module.
- No reference data in selected taxonomy.
- No audit logs for selected filters.
- No retention policies.

## Error States

- Validation errors at matching fields.
- Duplicate email, duplicate role slug, duplicate custom field module/key, duplicate taxonomy item.
- Attempt to delete system or assigned role.
- Forbidden access/field permission.
- Invalid configuration publish.
- Unsafe retention action.

## Edge Cases

- Super admin hidden from normal Admin user/role listings.
- Permission changes take effect immediately.
- Inactive taxonomy values remain on historical records.
- Audit records cannot be edited.
- Retention cannot silently delete critical events.
- User deactivation must not orphan required ownership without policy handling.
- Inactive custom fields remain configured and auditable but should not render in module data-entry surfaces.
- Deleting a custom field with captured values requires a future data-retention policy decision.
- Cross-tenant or cross-configuration-scope references must be rejected even though MVP starts as a single organization.
- Permission/cache invalidation must prevent stale access after role, permission, account access, engagement access, or field permission changes.
- Exporting audit/access logs must create a separate audit entry without exposing protected field payloads to unauthorized viewers.
- Retention policies for audit logs must preserve traceability through archive/tombstone behavior rather than silent hard deletion.

## Missing Requirements

- Runtime rendering rules for custom field values across every module are not fully specified.
- Retention durations and critical entity definitions are not specified.
- Sensitive access log retention and viewer permissions are not specified.
- Exact recovery/setup path for managing the protected super admin account is not fully described.
- Full multi-tenant runtime behavior is not implemented in MVP, only storage/access isolation readiness.

## Ambiguous Requirements

- KAM Head configuration authority overlaps with Admin in several modules.
- KAM Head configuration boundaries are resolved through RBAC module/action grants rather than a separate hard-coded rule set.
- Whether field permissions should be centrally enforced for every existing serializer in Phase 2 or rolled into each module incrementally is not fully specified.

## Conflicting Requirements

- Super admin must be hidden from normal Admin listings but still be manageable for setup/recovery; management path needs definition.

## Unspecified Edge Cases

- Deactivating the last Admin besides super admin.
- Reassigning records from a deleted/deactivated user.
- Custom field value migration/export behavior when field type changes.
- Retention behavior when audit/access log records themselves match a policy.

## Audit/Logging Requirements

- Audit user create/update/delete/deactivate and role assignment changes.
- Audit role create/update/delete and permission changes.
- Audit account/engagement access and field permission changes.
- Audit custom field create/update/delete changes.
- Audit taxonomy changes.
- Audit configuration validation, publish, rollback if supported.
- Audit retention policy changes and simulations.
- Audit log and sensitive access log exports.
- Log denied sensitive access attempts where required by policy without leaking protected values.
- Log security-relevant admin failures such as invalid publish attempts, unsafe retention attempts, and forbidden access changes.

## Test Scenarios

- Create, update, deactivate, and delete managed user.
- Prevent deleting self/last required admin.
- Create custom role and assign permissions.
- Create, update, filter, paginate, and delete a custom field definition.
- Validate select field options and duplicate module/key handling.
- Prevent deleting system role and assigned role.
- Apply field permission and verify serialization excludes protected field.
- Configure taxonomy item and verify active values appear in forms.
- Prevent hard delete of in-use taxonomy item.
- Validate and publish configuration.
- Query audit logs by actor/entity/action.
- Query access logs by actor/entity/field/result.
- Export audit/access logs and verify the export is authorized and audited.
- Simulate retention policy and verify no critical silent deletion.
- Verify permission changes immediately affect API access.
- Verify user deactivation blocks or requires reassignment for required ownership and active work.
- Verify cross-scope access assignment references are rejected.

## Acceptance Criteria

- Admin can manage users, roles, access, reference data, configuration, audit, and retention through governed UI/API.
- Admin can create and manage module-scoped custom field definitions through Field Builder with validation, pagination, filters, delete confirmation, and audit logging.
- RBAC and field security are enforced before data leaves the backend.
- Configuration and security changes are validated, versioned where applicable, and auditable.

## Added From Technical Logic Document

- Admin configuration areas must include users, roles, account access, engagement access, access matrix ownership, reference data, scoring rules, signal rules, playbook rules, timeline event types, retention policies, notification/SLA rules, dashboard settings, integration settings, AI vocabulary, and searchable-field configuration.
- RBAC must be role-driven and permission-driven. KAM Head configuration boundaries are resolved by RBAC module/action grants rather than hard-coded KAM Head assumptions.
- Account and engagement access grants must be evaluated alongside module permissions. A user with module permission but no account access must not see account-scoped records.
- Field-level security must be enforced before data leaves the backend, including API responses, exports, reports, AI retrieval, timeline/handover citations, notifications, and dashboards.
- AI retrieval must never receive unauthorized fields or records. Admin AI vocabulary/searchable-field configuration must not override RBAC, field security, or account access.
- Audit logs must capture Actor, Timestamp, Entity, Previous value, New value, Source, Reason, request/correlation metadata where available, and tenant/configuration scope where applicable.
- Sensitive access logs must capture sensitive record/field reads where required by policy, including actor, entity, field/source, result, timestamp, and reason/request context without logging protected values.
- Configuration changes must support draft/test/publish/rollback or equivalent lifecycle where configuration impacts scoring, signals, playbooks, retention, notifications, SLA, integrations, AI retrieval, or reference data.
- Reference data must preserve inactive historical values. In-use values must not be silently hard-deleted.
- Retention policies must cover timeline entries, AI outputs, KYC snapshots, score snapshots, audit logs, access logs, attachments, reports, and integration logs where configured. Critical records require archive/tombstone behavior rather than silent deletion.
- User deactivation must block or require reassignment for primary AM ownership, open tasks, active escalations, active approvals, governance ownership, and required notification recipients.
- MVP remains single-organization at runtime, but storage/access design must be tenant-ready. Business entities and security/configuration records should support `tenant_id` or `organization_id`/configuration scope when future tenant isolation is enabled.
- Permission/cache invalidation must take effect immediately after role, permission, account access, engagement access, or field permission changes.
- Admin/security alert email configuration must be protected by RBAC and audited because it receives security and integration failure notifications.
