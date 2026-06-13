# Admin Field Builder Runtime Modules

## Summary

Implemented on 2026-06-13.

Field Builder now exposes only modules whose custom fields are currently rendered by a frontend form and persisted by backend services. This keeps Admin users from creating field definitions for modules where a new record would not show or save those values.

Account-level configuration is represented by a single `accounts` module. Older account-intake aliases (`account_onboarding_workspace`, `account_overview`, and `onboarding`) are no longer offered for new Field Builder definitions because they all rendered into the same create-account form.

Playbook template fields and task fields are represented separately. The older combined `playbooks_tasks_calendar` module is no longer offered for new Field Builder definitions because it caused one field definition to render on both the Playbook and Task forms.

## Supported Modules

- `accounts`
- `client_education_content`
- `escalation_management`
- `governance_reviews`
- `playbooks`
- `tasks`
- `opportunities`

## Behavior

- `GET /api/admin/custom-fields/modules` returns only the supported runtime module list.
- `POST /api/admin/custom-fields` rejects unsupported module slugs with a field-level validation error.
- `PATCH /api/admin/custom-fields/{field_id}` rejects attempts to move a definition to an unsupported module.
- Existing definition listing remains unchanged so already-created definitions can still be reviewed and deleted.
- Existing account fields under the legacy account-intake modules are still read by account creation for backwards compatibility.
- Existing definitions under the legacy `playbooks_tasks_calendar` module are not rendered by new Playbook or Task forms; Admin users can review and delete them from the Field Builder listing.
- Runtime custom fields continue to use owning feature permissions rather than Field Builder configuration permissions.
- Field display order is backend-managed/defaulted; the Admin Field Builder form no longer exposes a manual order input.
- Report-oriented sensitive classification is no longer exposed in the Admin Field Builder form or listing metrics.
- Field visibility is no longer configurable in the Admin Field Builder form; active runtime fields are shown wherever that module renders custom fields.

## Runtime Surfaces

- Account onboarding/account creation fetches account custom fields through `GET /api/accounts/custom-fields`; new fields should be configured with module `accounts`.
- Account overview display, content, escalations, governance, playbooks, tasks, and opportunities fetch module fields through `GET /api/custom-fields?module=...`.
- Escalation fields are wired to the Escalations page create form and card display.
- Playbook template fields use module `playbooks`.
- Task fields use module `tasks`.
- Opportunity creation fields use module `opportunities`.
- Submitted values are stored in `custom_field_values` through the existing `CustomFieldService` save/replace paths.
- Saved custom field values now have read-only display surfaces in the owning module UI: account overview, content list, escalation cards, governance register/detail/account governance, playbook template cards, task Kanban/list cards, and opportunity detail.

## Tests

- Updated backend RBAC coverage for the consolidated account module catalog, unsupported legacy account/playbook-task module validation, runtime visibility for `escalation_management`, and split `playbooks`/`tasks`/`opportunities` modules.
- Updated frontend Field Builder and account creation coverage to use `accounts` for account-level custom fields.
- Updated frontend Field Builder coverage to assert the manual order, sensitive, and visibility inputs are hidden and create payloads omit `sort_order`, `is_sensitive`, `show_in_list`, and `show_in_detail`.
- Updated backend Playbook/Task and Opportunity coverage for separate custom-field persistence.
- Updated backend Account coverage to assert approved account custom values are returned by the account read API.
- Updated frontend Content, Escalation, Account Overview, Playbook, Task, Governance, and Opportunity coverage for saved custom-field value display.
