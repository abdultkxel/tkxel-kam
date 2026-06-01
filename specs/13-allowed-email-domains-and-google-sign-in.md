# Feature Specification: Allowed Email Domains And Google Sign-In

## Feature Overview

Provide Admin Settings for allowed email-domain validation and add Google Sign-In for existing active platform users. The domain policy protects user creation, user email validation, and Google authentication by allowing only Tkxel-owned email domains.

## Business Goal

Ensure only authorized Tkxel-domain users can be created or authenticate through Google Sign-In, while keeping access governed through existing Admin/RBAC controls and preserving auditability for configuration changes.

## User Roles

- Admin
- Super Admin / setup owner
- Platform
- Existing authenticated users
- Existing active users signing in with Google

## User Stories Covered

- Admin Settings - Allowed email domains
- Existing-user-only Google Sign-In
- Related to Story 21.1 - User, role, access, and restricted permissions management
- Related to Story 21.3 - Configuration, audit logs, and retention policies
- Related to Story 24.1 - Platform reliability, observability, and accessibility

## Functional Requirements

- Add an allowed email-domain configuration under the existing Admin panel `settings` section.
- Provide a comma-separated text input or textarea where Admin can enter parent domains such as `tkxel.com, tkxel.io`.
- Default allowed parent domains are `tkxel.com` and `tkxel.io`.
- Accept configured domains with or without a leading `@`.
- Normalize configured domains by trimming whitespace, lowercasing values, removing leading `@`, and removing duplicates.
- Support parent-domain matching so `tkxel.com` allows `tkxel.com`, `corp.tkxel.com`, `camp.tkxel.com`, and `camp1.tkxel.com`.
- Support parent-domain matching so `tkxel.io` allows `tkxel.io` and any subdomain ending in `.tkxel.io`.
- Validate Admin-created user emails against the active domain policy during user creation.
- Validate any future editable user email fields against the active domain policy.
- Add Google Sign-In to the login screen.
- Google Sign-In is existing-users-only.
- Google Sign-In must not auto-create users.
- Google Sign-In succeeds only when the Google account email matches an existing active platform user.
- Google Sign-In succeeds only when the verified Google email matches the active allowed-domain policy.
- Google Sign-In returns the same bearer JWT response shape as password login.
- Password login remains available.
- Store every domain settings update as governed admin configuration.

## Source Traceability

- `requirements/KAM_USER_STORIES.md` requires valid unique Admin user emails, Admin-managed security/RBAC configuration, auditable configuration changes, and verified email for email-channel behavior.
- `specs/10-admin-security-rbac-and-audit.md` requires Admin/RBAC configuration permission, field-level validation, governed configuration changes, and audit logs.
- `specs/12-platform-readiness-reliability-and-scope-guardrails.md` requires least-privilege access, accessibility, auditability, and platform reliability.
- Google Sign-In is an authentication feature and is separate from the approved Google Calendar integration adapter in `specs/09-approved-integrations.md`.
- The local PRD PDF could not be reliably text-extracted in this environment; this spec is reconciled against the PRD-derived user stories and existing feature specs.

## Existing Frontend Design Alignment

- The current Login screen supports password sign-in, field-level backend errors, and a protected-route redirect after successful authentication.
- The current Admin page uses URL-backed section tabs with an existing `settings` section that contains notification delivery settings.
- The allowed-domain UI must be added inside the existing Admin `settings` section and must not introduce a new top-level route.
- The current frontend service layer uses `apiRequest`, typed service functions, toast feedback, field-level errors, and loading/error states; this feature should follow those patterns.
- The current backend uses FastAPI routers, SQLAlchemy models, repository/service layers, Pydantic schemas, seeded RBAC permissions, and audit logging for governed changes; this feature should follow those patterns.

## Non-Functional Requirements

- Backend validation is authoritative; frontend validation is only a convenience.
- Domain checks are case-insensitive.
- Google ID token verification must not trust frontend-only claims.
- Domain validation must add negligible latency to ordinary form submissions.
- Admin Settings and Login UI must remain accessible, keyboard usable, and responsive across desktop, laptop, and tablet breakpoints.
- Google Sign-In failure must be explicit without revealing whether an unrelated Google account exists in the system.

## Permissions & Authorization

- Admin with `admin_audit_security_rbac` configure permission can view and update allowed email-domain settings.
- Super Admin / setup owner can recover or update settings where the normal Admin path is unavailable.
- Non-Admin users cannot read or update the configured domain policy.
- Google Sign-In is public as an authentication endpoint but only issues tokens for existing active authorized users.
- Google Sign-In does not change RBAC permissions; the existing user role and permissions are used after login.

## Validation Rules

- Domain entries are split by comma.
- Each entry is trimmed, lowercased, and has one optional leading `@` removed.
- Empty entries caused by repeated commas are ignored.
- Duplicate domains are removed after normalization.
- Each configured domain must be a valid parent domain with at least one dot and no spaces.
- Domains must not include a protocol, path, query string, wildcard, or full email address.
- `tkxel.com`, `@tkxel.com`, `tkxel.io`, and `@tkxel.io` are valid.
- `https://tkxel.com`, `user@tkxel.com`, `*.tkxel.com`, and `tkxel` are invalid.
- Email validation extracts the substring after the final `@`.
- An email domain is allowed when it exactly equals an allowed parent domain or ends with `.` plus an allowed parent domain.
- `user@tkxel.com`, `user@corp.tkxel.com`, `user@camp.tkxel.com`, `user@camp1.tkxel.com`, and `user@tkxel.io` are valid with the default policy.
- `user@not-tkxel.com`, `user@tkxel.com.evil.com`, and `user@fake-tkxel.io` are invalid.
- If the allowlist is inactive or empty, normal email format validation still applies but domain restriction does not.
- Admin user creation with a disallowed email domain returns a field-level validation error on `email`.
- Google Sign-In requires a verified Google email.
- Google Sign-In rejects missing, invalid, expired, wrong-audience, or unverified Google credentials.
- Google Sign-In rejects valid Google accounts that do not map to an existing active platform user.
- Save requests with invalid domain entries return field-level validation errors for the domain input.
- Save requests may include an optional reason for audit context.

## Search Requirements

- No dedicated search is required for the allowed email-domain settings panel.
- Audit logs should remain searchable by actor, entity, action, source, date range, and reason through existing Admin audit requirements.

## Filter Requirements

- No dedicated filters are required for the allowed email-domain settings panel.
- Audit logs for settings changes use existing audit log filters.

## Sort Requirements

- Normalized allowed domains display alphabetically unless the UI intentionally preserves raw input order for editing.
- Audit logs for settings changes use existing newest-first sorting.

## Pagination Requirements

- The settings panel is a single configuration record and does not require pagination.
- Audit log pagination follows existing Admin audit requirements.

## API Requirements

- `GET /api/admin/settings/email-domains`
- `PATCH /api/admin/settings/email-domains`
- `POST /api/auth/google`

Email-domain settings response shape:

- `allowed_domains`
- `raw_input`
- `active`
- `updated_by`
- `updated_at`

Email-domain patch request shape:

- `raw_input`
- `active`
- `reason`

Google Sign-In request shape:

- `credential`

Google Sign-In response shape:

- Same as `POST /api/auth/login`: `access_token`, `token_type`, and `user`.

API behavior:

- `GET /api/admin/settings/email-domains` returns the current normalized domains, raw input, active state, and last update metadata.
- `PATCH /api/admin/settings/email-domains` validates, normalizes, persists, and returns the updated configuration.
- `PATCH /api/admin/settings/email-domains` writes an audit log with previous domains, new domains, previous active state, new active state, actor, timestamp, and reason where provided.
- `POST /api/auth/google` verifies the Google credential server-side, applies domain policy, locates an existing active user by normalized email, and returns a platform JWT.
- `POST /api/auth/google` never provisions a user.

## UI Requirements

- Add the allowed email-domain control to the existing Admin panel `settings` section.
- Keep existing notification settings in the same Admin Settings section.
- Show a labeled comma-separated textarea/input for allowed parent domains.
- Show an active/inactive toggle for enforcement.
- Show normalized parent-domain chips or preview below the input.
- Explain through concise helper text that `tkxel.com` also allows subdomains such as `corp.tkxel.com`.
- Show save and reset/cancel controls.
- Show field-level validation errors below the domain input.
- Show last updated metadata when available.
- Add a Google Sign-In button to the existing Login screen.
- Keep password sign-in visible and usable.
- Hide or disable Google Sign-In when the Google client ID is not configured.
- Show a clear login error when Google Sign-In fails.
- Do not add a new top-level route.
- Use existing Admin card, input, button, toast, and field-error patterns.

## Loading States

- Settings loading state while the current domain configuration is fetched.
- Save loading state while the configuration update is in progress.
- Google Sign-In loading state while the credential is exchanged for a platform session.

## Empty States

- Empty domain input means unrestricted email-domain validation.
- When no domains are configured, show an empty preview state indicating no domain restriction is active.
- If Google client ID is missing, show password login normally and omit or disable Google Sign-In.

## Error States

- Invalid domain entry with field-level message.
- Forbidden access for non-Admin users.
- Failed settings load with retry.
- Failed save with retry and preserved unsaved input.
- Admin user creation failure when email domain is outside the active allowlist.
- Google credential verification failure.
- Google email not verified.
- Google email domain outside active allowlist.
- Google email does not match an existing active platform user.

## Edge Cases

- Repeated commas and whitespace-only entries are ignored.
- Duplicate domains are collapsed after normalization.
- Mixed-case entries normalize to lowercase.
- Leading `@` is accepted but not stored in normalized domains.
- Full email addresses are rejected as domain settings entries.
- Parent-domain matching must not allow lookalike suffixes such as `fake-tkxel.com`.
- Existing users with now-disallowed domains remain historically valid but cannot use Google Sign-In unless their email passes the current active policy.
- Existing users with disallowed domains may still use password login unless product policy later says password login should also be blocked by domain policy.
- Empty allowlist never blocks system recovery or normal email format validation.
- Seeded/system super-admin recovery behavior cannot be accidentally locked out by a misconfigured allowlist.

## Missing Requirements

- Exact Google Workspace OAuth app ownership, consent mode, and production client ID provisioning are environment-specific.
- Whether password login should also reject existing users whose email is later disallowed is not specified.
- Whether existing disallowed users should be flagged after domain restrictions change is not specified.
- Whether a reason is required for every settings change or optional is not specified.

## Ambiguous Requirements

- Domain policy currently applies to Admin-created users and Google Sign-In. It does not govern external customer recipient emails unless explicitly extended later.
- Internationalized domain name and punycode behavior is not specified and should remain unsupported for MVP unless required.

## Conflicting Requirements

- None identified.

## Unspecified Edge Cases

- Temporary emergency bypass behavior during incident response.
- Multiple Google accounts using aliases for the same mailbox.
- Google hosted-domain claim behavior when users sign in with subdomains.
- Whether to display warning badges for existing users whose domains no longer match policy.

## Audit/Logging Requirements

- Audit every allowed email-domain settings update.
- Audit log must include actor, timestamp, entity, previous normalized domains, new normalized domains, previous active state, new active state, source, and reason where provided.
- Log Google Sign-In failures at authentication log level without exposing credential contents.
- Do not store Google ID tokens.
- Settings audit entries should appear in the existing Admin audit log.

## Test Scenarios

- Load email-domain settings as Admin.
- Block email-domain settings access for non-Admin user.
- Save `tkxel.com, tkxel.io, @TKXEL.com` and verify normalized domains are `tkxel.com` and `tkxel.io`.
- Save input with duplicates and repeated commas and verify duplicates/empty entries are removed.
- Reject invalid entries such as `https://tkxel.com`, `user@tkxel.com`, `*.tkxel.com`, and `tkxel`.
- Create Admin user with `user@tkxel.com`.
- Create Admin user with `user@corp.tkxel.com`.
- Create Admin user with `user@camp1.tkxel.com`.
- Create Admin user with `user@tkxel.io`.
- Reject Admin user creation with `user@example.com`.
- Reject Admin user creation with `user@tkxel.com.evil.com`.
- Save an empty input and verify email domain restriction is disabled while normal email validation remains active.
- Verify audit log is written after updating domain settings.
- Render Login with password sign-in and Google Sign-In when Google client ID exists.
- Hide or disable Google Sign-In when Google client ID is missing.
- Google Sign-In succeeds for existing active user with verified `@tkxel.com` or allowed subdomain email.
- Google Sign-In rejects a valid Google account when no active user exists.
- Google Sign-In rejects unverified Google email.
- Google Sign-In rejects disallowed domain.
- Google Sign-In does not create any new user.
- Frontend shows loading, empty, validation error, failed save, successful save, Google loading, and Google failure states.

## Acceptance Criteria

- Admin can configure allowed parent domains from the existing Admin Settings section.
- Default parent domains are `tkxel.com` and `tkxel.io`.
- Domain input accepts comma-separated entries and stores a normalized deduplicated allowlist.
- Active non-empty allowlist is enforced during Admin user creation.
- Parent-domain matching allows subdomains of configured parent domains.
- Disallowed domains return clear field-level validation errors.
- Non-Admin users cannot view or update the setting.
- Every configuration change is auditable.
- Login supports password sign-in and Google Sign-In.
- Google Sign-In is existing-users-only and never provisions users.
- Google Sign-In succeeds only for verified Google emails matching an existing active platform user and the active domain policy.
