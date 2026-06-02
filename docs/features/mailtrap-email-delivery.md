# Mailtrap Email Delivery

## Scope

Enable local/dev SMTP delivery through Mailtrap for transactional and notification-driven emails.

## Events Covered

- Admin-created user welcome email.
- Password reset email with reset link.
- Password changed confirmation email.
- Notification emails when a user's trigger preference is `in_app_email`.
- SLA escalation email through the notification trigger catalog.
- Digest-ready emails for manual sends and scheduled digest delivery when email is selected.
- Report-ready emails for manual exports and scheduled report runs.

## Configuration

Configuration is environment-driven:

- `MAIL_ENABLED`
- `MAIL_MAILER`
- `MAIL_HOST`
- `MAIL_PORT`
- `MAIL_USERNAME`
- `MAIL_PASSWORD`
- `MAIL_ENCRYPTION`
- `MAIL_FROM_EMAIL`
- `MAIL_FROM_NAME`
- `MAIL_SEND_DURING_TESTS`
- `FRONTEND_APP_URL`

Mailtrap credentials are stored only in ignored local environment files. Tracked examples contain placeholders.

## Architecture

- `EmailDeliveryService` renders named templates and performs best-effort delivery.
- `SmtpEmailAdapter` sends through SMTP and supports TLS.
- Email delivery is skipped automatically during pytest unless `MAIL_SEND_DURING_TESTS=true`.
- Email failures are logged and stored in notification/report/digest delivery metadata where applicable, but do not block the primary business workflow.

## Security Notes

- Emails use minimal context and route users back into the platform for restricted details.
- Raw SMTP credentials, access tokens, and provider secrets are not logged.
- Notification source links are already rechecked/redacted at in-app read time.

## Tests

- Template rendering and SMTP adapter behavior are covered with fake adapters.
- Auth, user creation, notification, report, and digest hooks are covered through direct service tests and existing feature tests.
