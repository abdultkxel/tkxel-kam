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

## Functional Requirements

- Manage users, roles, role inheritance, account access, engagement access, matrix ownership, and restricted permissions.
- Manage role permission matrix by module/action.
- Manage product custom field definitions by PRD module, including field key, label, type, options, required/sensitive flags, active state, visibility, and display order.
- Support field-level security for protected commercial, executive, escalation, legal, stakeholder, attachment, report, timeline, and AI context data.
- Configure reference data: account statuses, stages, segments, industries, regions, opportunity types, stakeholder roles, signal types, escalation severities, governance types, content tags.
- Configure scoring, signal, playbook, timeline event, retention, notification, SLA, and dashboard rules.
- Validate, version, test, publish, roll back where supported, and audit configuration changes.
- Maintain audit logs for critical business and configuration actions.
- Maintain access logs for sensitive record and field retrieval where required by policy.
- Manage retention policies for timeline entries, AI outputs, KYC snapshots, score snapshots, audit logs, attachments, and reports.

## Non-Functional Requirements

- RBAC must be enforced at API, query, and serialization layers.
- Protected records and fields must never be returned to unauthorized users.
- Audit logs must be append-only.
- Admin screens should use paginated lists and dense filters.

## Permissions & Authorization

- Admin with RBAC configure permission manages users, roles, permissions, reference data, access, and configuration.
- Super admin/setup owner remains protected and hidden where configured.
- KAM Head may configure selected business rules where policy allows.
- Users can only see/administer scopes granted by role and tenant/account access.
- Field permission rules override broad module access for sensitive fields.

## Validation Rules

- User email must be valid and unique.
- Role slug must use snake_case.
- System roles cannot be deleted.
- Assigned roles cannot be deleted.
- At least one setup/super admin must remain active.
- Field permission must map to known entity/field.
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
- `POST /api/admin/reference-data/{taxonomy}`
- `PATCH /api/admin/reference-data/{taxonomy}/{item_id}`
- `DELETE /api/admin/reference-data/{taxonomy}/{item_id}`
- `GET /api/admin/audit-logs`
- `GET /api/admin/access-logs`
- `GET /api/admin/configuration-changes`
- `GET /api/admin/retention-policies`
- `POST /api/admin/retention-policies`
- `PATCH /api/admin/retention-policies/{policy_id}`
- `POST /api/admin/retention-policies/{policy_id}/simulate`

## UI Requirements

- Separate Users Management and Roles Management screens.
- Role permission matrix with select-all/clear-all permission controls.
- Preserve current URL-backed tabbed Admin section navigation (`section` query parameter) as Admin grows; do not reintroduce a single long scroll-only admin page.
- Field Builder screen as a separate Admin tab with searchable/filterable/paginated custom field definitions, create/edit form, field-level validation errors, select options editor, visibility toggles, sensitive/required flags, and delete confirmation.
- Account/engagement access assignment screens.
- Field permission configuration screen.
- Reference data screen with taxonomy tabs.
- Configuration screens with version history, validation, test mode, publish, and rollback controls where supported.
- Audit log screen with filters and detail drawer.
- Sensitive access log screen with filters and detail drawer.
- Retention policy screen with simulation/test action.
- Confirmation dialogs for destructive actions.

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

## Missing Requirements

- Role inheritance model is named but not specified.
- Exact field permission catalog is not defined.
- Runtime rendering rules for custom field values across every module are not fully specified.
- Access levels for account/engagement access are not enumerated.
- Retention durations and critical entity definitions are not specified.
- Sensitive access log retention and viewer permissions are not specified.
- Super admin lifecycle policy is not fully described.

## Ambiguous Requirements

- KAM Head configuration authority overlaps with Admin in several modules.
- Whether role inheritance is MVP or future is unclear.
- Whether Admin can see all sensitive content by default is not specified.

## Conflicting Requirements

- Super admin must be hidden from normal Admin listings but still be manageable for setup/recovery; management path needs definition.

## Unspecified Edge Cases

- Deactivating the last Admin besides super admin.
- Reassigning records from a deleted/deactivated user.
- Permission cache invalidation.
- Field permission conflicts between role, account access, and sensitivity flag.
- Custom field value migration/export behavior when field type changes.

## Audit/Logging Requirements

- Audit user create/update/delete/deactivate and role assignment changes.
- Audit role create/update/delete and permission changes.
- Audit account/engagement access and field permission changes.
- Audit custom field create/update/delete changes.
- Audit taxonomy changes.
- Audit configuration validation, publish, rollback if supported.
- Audit retention policy changes and simulations.

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
- Simulate retention policy and verify no critical silent deletion.

## Acceptance Criteria

- Admin can manage users, roles, access, reference data, configuration, audit, and retention through governed UI/API.
- Admin can create and manage module-scoped custom field definitions through Field Builder with validation, pagination, filters, delete confirmation, and audit logging.
- RBAC and field security are enforced before data leaves the backend.
- Configuration and security changes are validated, versioned where applicable, and auditable.
