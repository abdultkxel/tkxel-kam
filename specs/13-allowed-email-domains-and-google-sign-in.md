# Feature Specification: Allowed Email Domains for User Creation, Login, and Google Sign-In

## 1. Feature Overview

Provide an Admin Settings control for configuring allowed email domains. The platform must use the configured domain allowlist when users log in with email/password, log in with Google Sign-In, are created by an admin, or have their email address updated by an admin.

Allowed domains are entered as comma-separated values, for example:

```text
tkxel.com, tkxel.io, camp1.tkxel.com
```

Only exact email-domain matches are allowed. Parent domains do not automatically allow subdomains.

### Resolved Product Decisions

- Google Sign-In is approved for this feature as an authentication provider capability even though the PRD approved-integration list is otherwise limited to Google Calendar, Fathom, CSAT, and AI/LLM Gateway.
- Google Sign-In must only authenticate existing active local users. It must not create or Just-In-Time provision local users.
- Active sessions must be invalidated immediately when a user's email domain becomes disallowed. Existing JWTs should fail on the next authenticated API request after the domain is removed.
- Only Admin and Super Admin users with Admin/RBAC configuration permission can configure allowed email domains.
- Default seeding must create the initial allowed domains: `tkxel.com`, `tkxel.io`, and `camp1.tkxel.com`.

## 2. Business Goal

Reduce unauthorized account access and administrative mistakes by ensuring that only users with approved organization-controlled email domains can exist as active platform users or authenticate into the KAM Intelligence Platform.

This supports enterprise SaaS security, customer data protection, identity governance, and Admin control over who can access strategic account information.

## 3. User Roles

- Super Admin
- Admin
- KAM Head / VP, who may authenticate but must not configure allowed email domains by default
- Account Manager / KAM
- Ops Lead
- Leadership Viewer / Executive
- Other platform roles that may authenticate but cannot configure settings
- Google identity provider user

## 4. Functional Requirements

- Admin users with the required configuration permission can view and update allowed email domains from Admin Settings.
- Allowed domains are stored as a normalized allowlist.
- Allowed domains are entered using one comma-separated input field.
- Domains must be trimmed and normalized to lowercase before storage.
- Empty comma-separated values must be ignored.
- Duplicate domains must be removed.
- Invalid domain formats must be rejected.
- Email domain comparison must be case-insensitive.
- Email/password login must fail when the user's email domain is not allowed.
- Google Sign-In must fail when the Google account email domain is not allowed.
- Google Sign-In must fail when the Google account belongs to an allowed domain but no existing active local user exists.
- Admin user creation must fail when the new user's email domain is not allowed.
- Admin user update must fail when the updated email domain is not allowed.
- Unauthorized Google users must be blocked before a local user account is created.
- Changes to allowed domains must affect all future login and user creation/update attempts.
- Existing users whose domains become disallowed must not be able to log in after the setting change.
- The setting must be audited when changed.
- The UI must show clear save success, validation error, and authorization error states.

## 5. Admin Settings Requirements

- Add an Admin Settings section named `Allowed Email Domains`.
- Show a single comma-separated text input or textarea.
- The field placeholder should use examples such as `tkxel.com, tkxel.io, camp1.tkxel.com`.
- Show helper text explaining that subdomains must be explicitly listed.
- On save, send the complete normalized set of domains to the backend.
- On successful save, show a success notification and render the normalized values.
- On validation failure, keep the user's entered value visible and show the invalid domains.
- Only authorized admin users can update allowed domains.
- Read-only or unauthorized users must not see an enabled save control.
- The settings page must support loading, empty, saving, success, validation error, and permission-denied states.
- The setting should be discoverable in Admin Settings rather than hidden in environment configuration.
- The save action must not silently drop invalid domains; invalid values should reject the whole save request.

## 6. Email Domain Validation Rules

- Parse input by splitting on commas.
- Trim leading and trailing whitespace around each domain.
- Ignore empty values after trimming.
- Normalize each accepted domain to lowercase.
- Remove duplicates after lowercase normalization.
- Reject domains containing spaces.
- Reject values containing `@`.
- Reject values containing URL schemes such as `http://` or `https://`.
- Reject values containing paths, query strings, fragments, ports, wildcards, or protocols.
- Reject wildcard domains such as `*.tkxel.com`.
- Reject domains with leading, trailing, or consecutive dots.
- Reject labels that start or end with a hyphen.
- Reject domains without at least one dot, unless product explicitly approves single-label internal domains.
- Reject labels longer than 63 characters.
- Reject domains longer than 253 characters.
- Allow ASCII letters, digits, and hyphens in labels.
- Internationalized domains are out of MVP scope unless explicitly converted to punycode before validation.
- Email domain extraction must use the domain after the final `@` in a syntactically valid email address.
- Email domain comparison must be case-insensitive.
- Subdomains must be exact matches only.
- If `tkxel.com` is allowed, `user@tkxel.com` is allowed.
- If only `tkxel.com` is allowed, `user@camp1.tkxel.com` is not allowed.
- `user@camp1.tkxel.com` is allowed only when `camp1.tkxel.com` is configured.

## 7. User Creation Rules

- Admin-created users must be validated against the allowed email domains before persistence.
- User creation must fail if the email domain is not allowed.
- Validation must run before password hashing, invitation generation, welcome email creation, or audit entries that imply creation succeeded.
- Existing duplicate-email validation must still run.
- Email normalization rules for users must remain consistent with the existing authentication system.
- The API must return a field-level error for `email` when the domain is not allowed.
- The Admin UI must show the error near the email field or in a clear form-level error area.
- Admins must not be able to bypass the domain check by assigning a privileged role.
- Bulk or CSV user creation, if introduced later, must apply the same rule per row.

## 8. User Update Rules

- Admin user update must validate the new email domain when the email address changes.
- User update must fail if the updated email domain is not allowed.
- User update should not fail due to domain allowlist when no email change is requested.
- Updating non-email fields such as role, name, title, phone, or active status should continue to work for existing users even if their current domain is now disallowed.
- If a disallowed existing user is reactivated, the platform should either block reactivation or require changing the email to an allowed domain in the same request.
- Email uniqueness validation must still run.
- The API must return a field-level error for `email` when the domain is not allowed.
- Audit logs should record failed email-change attempts without storing secrets.

## 9. Login Rules

- Email/password login must validate the submitted email domain before issuing an access token.
- Login must fail if the user's email domain is not allowed, even if credentials are otherwise valid.
- Existing users whose domains become disallowed must not be able to log in.
- The login error should be clear enough for the user to understand the restriction, for example: `This email domain is not allowed. Contact your administrator.`
- The platform must not issue access tokens, refresh tokens, reset tokens, or session records when login is blocked by domain policy.
- Login attempts blocked by domain policy should be logged for security audit/rate-limit analysis.
- Existing inactive-user and invalid-password rules must continue to apply.
- Domain validation should not reveal whether a disallowed email belongs to an existing local user.

## 10. Google Sign-In Rules

- Google Sign-In must validate the Google account email domain before creating or linking a local user.
- Google Sign-In must only proceed when Google confirms the email is verified.
- Unauthorized Google users must be blocked before creating a local user account.
- Google Sign-In must not rely only on Google's hosted-domain hint/claim; it must validate the actual verified email address returned by Google.
- Google email comparison must be case-insensitive.
- Google accounts using plus addressing remain subject to the same domain extraction rule.
- Google Sign-In must fail if the verified Google email domain is not configured in allowed domains.
- If the local user already exists but the domain is no longer allowed, Google Sign-In must fail.
- Just-In-Time user provisioning is not allowed for this feature. If it is added later, product approval is required and domain validation must run before provisioning.
- If no active local user exists for the verified Google email, Google Sign-In must fail without creating a local user.
- Failed Google Sign-In due to domain policy should show a clear user-facing error and write a security audit event.

## 11. API Requirements

- `GET /api/admin/settings/allowed-email-domains`
  - Returns the normalized allowed domain list and metadata such as last updated actor/timestamp.
  - Requires admin settings view/configure permission.
- `PATCH /api/admin/settings/allowed-email-domains`
  - Accepts the comma-separated input value or an array of domains, depending on existing Admin Settings API conventions.
  - Normalizes, validates, deduplicates, stores, audits, and returns the saved normalized list.
  - Requires admin settings configure permission.
- `POST /api/admin/users`
  - Must enforce allowed domain validation for `email`.
- `PATCH /api/admin/users/{user_id}`
  - Must enforce allowed domain validation when `email` is changed.
- `POST /api/auth/login`
  - Must enforce allowed domain validation before token issuance.
- `POST /api/auth/google`
  - Must enforce allowed domain validation before local user lookup/provisioning/token issuance.
- API responses must include meaningful validation errors for Admin workflows.
- Public authentication responses must be clear but avoid exposing unnecessary account-existence details.
- OpenAPI documentation must describe the Admin Settings endpoint and affected authentication/user-management behavior.

## 12. Database/Storage Requirements

- Store allowed domains in persistent backend storage, not only frontend state.
- Recommended storage options:
  - A platform settings table with key `allowed_email_domains` and JSON array value.
  - Or a dedicated `allowed_email_domains` table with normalized domain rows.
- The stored value must be normalized lowercase domains without duplicates.
- Store `created_at`, `updated_at`, and `updated_by_id` metadata where supported by the settings model.
- Audit every setting update with before/after domain lists and actor metadata.
- Do not store invalid, duplicate, blank, or mixed-case domain values.
- The domain allowlist must be read by authentication, Google Sign-In, user creation, and user update flows from a shared backend service/helper.
- Changes should take effect without requiring application restart.
- If configuration caching is used, it must have safe invalidation or a short TTL.
- Migration/seed behavior must avoid accidental admin lockout.

## 13. UI Requirements

- Admin Settings must include an `Allowed Email Domains` section.
- The section must provide one comma-separated input field.
- The field must support examples like `tkxel.com, tkxel.io, camp1.tkxel.com`.
- Show normalized saved domains after save.
- Show validation errors for invalid domains.
- Show save success notification.
- Show save loading state.
- Show permission-denied state for unauthorized users.
- Show empty/default state when no domains are configured.
- User creation and update forms must display domain validation errors clearly.
- Login and Google Sign-In must show clear domain-policy errors.
- UI copy must explain that subdomains are not inherited from parent domains.
- The UI must be responsive and usable on standard Admin Settings desktop and tablet layouts.

## 14. Validation/Error Messages

Recommended error messages:

- Admin Settings invalid domain: `Invalid email domain: {domain}. Enter domains like tkxel.com or camp1.tkxel.com.`
- Admin Settings duplicate domain normalization notice: `Duplicate domains were removed.`
- Admin Settings empty input when empty lists are not allowed: `At least one allowed email domain is required.`
- User creation/update disallowed domain: `Email domain is not allowed. Use an approved company email domain.`
- Email/password login blocked: `This email domain is not allowed. Contact your administrator.`
- Google Sign-In blocked: `Google Sign-In is not allowed for this email domain. Contact your administrator.`
- Unauthorized settings update: `You do not have permission to update allowed email domains.`

Validation behavior:

- Admin Settings validation errors should identify which domain values are invalid.
- User creation/update validation should return a field-level `email` error.
- Authentication errors should not disclose whether the email exists in the system.
- Error messages must not reveal sensitive user metadata or role information.

## 15. Security Requirements

- Only authorized admin users can update allowed domains.
- Allowed domain checks must run on the backend and must not rely only on frontend validation.
- Google Sign-In must validate the verified email address, not only a provider hint.
- Unauthorized Google users must be blocked before local user creation.
- Domain comparison must be exact and case-insensitive.
- Subdomain inheritance is not allowed.
- Existing users with now-disallowed domains must be blocked from future login.
- Existing active sessions for users with now-disallowed domains must be invalidated immediately by applying the domain policy to authenticated API requests.
- Domain policy failures must not issue tokens.
- Setting changes must be audited.
- Failed login and Google Sign-In attempts due to domain policy should be logged with safe metadata.
- Do not store Google tokens or identity payloads in domain-policy audit logs.
- Prevent admin lockout through seed/default/break-glass policy.
- The first super admin bootstrap path must be explicitly handled so a new deployment can configure allowed domains safely.
- Rate limiting and brute-force protections should continue to apply to blocked login attempts.
- The allowlist must not be exposed to unauthenticated users.

## 16. Edge Cases

- Uppercase configured domain, such as `TKXEL.COM`, is stored as `tkxel.com`.
- Uppercase email domain, such as `USER@TKXEL.COM`, matches `tkxel.com`.
- Input with whitespace, such as ` tkxel.com , tkxel.io `, stores `tkxel.com` and `tkxel.io`.
- Empty values, such as `tkxel.com,, tkxel.io,`, are ignored.
- Duplicate values, such as `tkxel.com, TKXEL.com`, store one `tkxel.com`.
- Parent domain does not allow subdomain.
- Subdomain does not allow parent domain.
- Invalid values such as `@tkxel.com`, `http://tkxel.com`, `tkxel`, `*.tkxel.com`, `tkxel..com`, `tkxel.com/path`, and `tkxel.com:443` are rejected.
- Existing active sessions for users whose domains become disallowed must fail on the next authenticated API request.
- Password reset requests for disallowed domains should not issue reset tokens.
- Invitation or onboarding emails for disallowed domains should not be sent.
- If the allowed domain list is empty, the platform must follow the configured default-state policy and avoid accidental lockout.
- If an admin removes the domain used by their own account, future login for that admin should be blocked unless a break-glass account or recovery process exists.
- If Google returns an unverified email, Google Sign-In must fail before domain validation success can be considered.
- If an email address is malformed, normal email validation should fail before domain allowlist checks.

## 17. Empty/Default State

- Admin Settings should show a clear empty state when no allowed domains are configured.
- Production deployments must seed `tkxel.com`, `tkxel.io`, and `camp1.tkxel.com` as the initial allowed domains unless deployment configuration explicitly overrides them.
- If no allowed domains are configured after bootstrap, the recommended secure behavior is fail closed for normal login, Google Sign-In, user creation, and user email updates.
- A controlled bootstrap or break-glass super admin path may be allowed only for initial setup/recovery and must be documented, audited, and restricted.
- The UI should warn admins before saving an empty list if empty lists are permitted.
- Changes to the list should apply immediately to future login and user-management attempts.

## 18. Test Scenarios

- Admin can save `tkxel.com, tkxel.io, camp1.tkxel.com` and reload the normalized list.
- Domains are trimmed and lowercased.
- Empty comma-separated values are ignored.
- Duplicate domains are removed.
- Invalid domain formats are rejected.
- `user@tkxel.com` is allowed when `tkxel.com` is configured.
- `USER@TKXEL.COM` is allowed when `tkxel.com` is configured.
- `user@camp1.tkxel.com` is rejected when only `tkxel.com` is configured.
- `user@camp1.tkxel.com` is allowed when `camp1.tkxel.com` is configured.
- Admin user creation succeeds for an allowed domain.
- Admin user creation fails for a disallowed domain.
- Admin user email update succeeds for an allowed domain.
- Admin user email update fails for a disallowed domain.
- Admin user update for non-email fields succeeds even when current domain is now disallowed, unless reactivation policy blocks it.
- Email/password login succeeds for an allowed domain with valid credentials.
- Email/password login fails for a disallowed domain even with valid credentials.
- Existing user with now-disallowed domain cannot log in.
- Password reset token is not issued for a disallowed domain.
- Google Sign-In succeeds for an allowed verified Google email.
- Google Sign-In fails for a disallowed verified Google email.
- Google Sign-In fails for an unverified Google email.
- Google Sign-In does not create a local user for a disallowed domain.
- Unauthorized users cannot view or update allowed domain settings.
- Authorized admin sees save success after updating domains.
- Admin Settings displays validation errors for invalid values.
- Domain setting changes are audited with before/after values.
- Public login errors do not expose whether a disallowed email exists.
- Empty/default state follows the selected fail-closed or bootstrap policy.

## 19. Acceptance Criteria

- Authorized admins can configure allowed email domains from Admin Settings using a comma-separated input.
- Domains are normalized to lowercase, trimmed, deduplicated, and persisted.
- Invalid domain formats are rejected with clear validation messages.
- Email domain matching is case-insensitive and exact.
- Subdomains are allowed only when explicitly configured.
- Admin user creation fails for disallowed email domains.
- Admin user email updates fail for disallowed email domains.
- Email/password login fails for disallowed email domains.
- Google Sign-In fails for disallowed email domains.
- Unauthorized Google users are blocked before local user account creation.
- Existing users with now-disallowed domains cannot log in.
- Only authorized admin users can update allowed domains.
- Setting changes affect future login and user creation/update attempts without application restart.
- Admin Settings shows loading, success, validation error, permission error, and empty/default states.
- Automated tests cover allowed/disallowed domains, uppercase emails, whitespace, duplicates, invalid domains, subdomains, login, Google Sign-In, user creation, and user update.

## 20. Implementation Notes

- Implement a shared backend domain-policy service/helper used by auth, Google Sign-In, user creation, and user update flows.
- Do not duplicate allowlist parsing logic across routers/services.
- Keep frontend validation as a convenience only; backend validation is authoritative.
- Store normalized domains only.
- Consider a `PlatformSetting` key/value model if one already exists; otherwise create a dedicated settings model.
- Add audit events for allowed-domain updates and domain-policy authentication blocks.
- Google Sign-In must validate provider token signature, issuer, audience, expiry, and verified email before trusting identity data.
- The backend should validate the actual Google `email` claim, not only `hd`.
- If an auth token refresh endpoint exists, decide whether domain policy applies during refresh.
- If sessions are long-lived, consider revoking active sessions for users whose domains become disallowed.
- If the app has invitations, password reset, CSV user import, SCIM, or future SSO flows, all user-intake/authentication paths must call the same domain-policy service.
- Seed/deployment configuration should define the initial allowed domains or a documented bootstrap path.
- OpenAPI docs should show request/response examples and validation errors for the settings API.

## 21. Requirements Coverage Checklist

- [ ] Admin Settings section exists for allowed email domains.
- [ ] Domains are accepted as comma-separated values.
- [ ] Domains are trimmed.
- [ ] Domains are normalized to lowercase.
- [ ] Empty values are ignored.
- [ ] Duplicate domains are removed.
- [ ] Invalid domain formats are rejected.
- [ ] Email domain comparison is case-insensitive.
- [ ] Subdomains require explicit configuration.
- [ ] User creation fails for disallowed domains.
- [ ] User update fails when changing email to a disallowed domain.
- [ ] Email/password login fails for disallowed domains.
- [ ] Google Sign-In fails for disallowed domains.
- [ ] Unauthorized Google users are blocked before local account creation.
- [ ] Existing users with now-disallowed domains cannot log in.
- [ ] Only authorized admins can update allowed domains.
- [ ] Settings changes are audited.
- [ ] Settings changes affect future login and user-management attempts.
- [ ] Admin Settings shows save success and validation errors.
- [ ] Login and Google Sign-In show clear user-facing errors.
- [ ] Empty/default state and bootstrap/lockout policy are implemented.
- [ ] Tests cover allowed domains.
- [ ] Tests cover disallowed domains.
- [ ] Tests cover uppercase emails/domains.
- [ ] Tests cover whitespace handling.
- [ ] Tests cover duplicates.
- [ ] Tests cover invalid domains.
- [ ] Tests cover subdomain exact matching.
- [ ] Tests cover email/password login.
- [ ] Tests cover Google Sign-In.
- [ ] Tests cover admin user creation.
- [ ] Tests cover admin user update.
- [ ] Tests cover unauthorized settings updates.
- [ ] Tests cover audit logging.

## Self-Review Additions

The specification was reviewed once after drafting. Additional requirements added during review:

- Bootstrap and admin-lockout handling for empty/default state.
- Password reset and invitation blocking for disallowed domains.
- Requirement to validate Google `email_verified` and the actual email claim, not only hosted-domain hints.
- Audit logging for settings changes and domain-policy authentication blocks.
- Guidance for active sessions/token refresh when domains are removed.
- Shared backend domain-policy service to avoid inconsistent validation across auth and admin flows.
- Explicit rejection of wildcards, URL-like values, ports, paths, consecutive dots, and invalid hyphen placement.
