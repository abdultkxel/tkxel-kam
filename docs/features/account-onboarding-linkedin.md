# Account Onboarding LinkedIn URL

## Summary

Account onboarding now captures a company LinkedIn profile URL. The manual create-account onboarding form requires the field before creating a draft, and the backend stores the value on both onboarding drafts and approved accounts.

## Scope

- In scope:
  - Required LinkedIn URL input in the create-account onboarding dialog.
  - `linkedin_url` API field on onboarding drafts and accounts.
  - LinkedIn URL validation for submitted draft payloads.
  - Draft review display of the LinkedIn URL.
- Out of scope:
  - LinkedIn API integration or scraping.
  - Backfilling LinkedIn URLs for existing accounts.
  - Making CSV import require LinkedIn.

## Requirement Links

- PRD IDs: None provided.
- Tickets: None provided.
- Related docs:
  - `docs/features/ai-kyc-pipeline-phase-1-to-4.md`

## User Flow

Users open Create Account, enter account, project, company URL, LinkedIn URL, and AM details, then create an onboarding draft. Missing or non-LinkedIn URLs show inline form errors. On approval, the LinkedIn URL is copied to the official account record.

## Backend Plan

- Routers: Existing onboarding/account routes only.
- Services: `OnboardingService` persists and copies `linkedin_url`; `AccountService` returns it.
- Repositories: Existing account/onboarding repositories.
- Schemas/validation: `OnboardingDraftCreateRequest`, `OnboardingDraftUpdateRequest`, `OnboardingDraftRead`, `AccountRead`.
- Helpers: `validate_linkedin_url`.

## API Documentation

- Swagger summary/description updates: No new routes.
- Response descriptions: Existing response models now include `linkedin_url`.
- Error responses: Invalid LinkedIn URLs return standard FastAPI 422 validation errors.

## Database Plan

- Tables:
  - `accounts`
  - `onboarding_drafts`
- Columns:
  - `linkedin_url VARCHAR(500)`
- Migrations:
  - `backend/migrations/20260605_account_linkedin_url.sql`
- Snake_case schema check:
  - Uses `linkedin_url`.

## Frontend Plan

- Pages/components:
  - `frontend/src/components/account/CreateAccountDialog.tsx`
  - `frontend/src/pages/Onboarding.tsx`
- Stores/hooks/services:
  - `frontend/src/services/accountWorkspace.ts`
  - `frontend/src/types/account.ts`
- Form behavior:
  - LinkedIn URL is required in the manual onboarding dialog.
  - URL accepts `linkedin.com` and subdomains such as `www.linkedin.com`.
- Backend error display:
  - Backend `linkedin_url` field errors map to the LinkedIn input.

## Validation And Errors

- Backend validation classes/schemas:
  - Pydantic validators on onboarding draft create/update requests.
- Field-level error messages:
  - Frontend: `LinkedIn URL is required`, `Enter a valid LinkedIn URL`.
  - Backend: `LinkedIn URL must be a linkedin.com URL.`
- Frontend display behavior:
  - Inline error beneath the LinkedIn input.

## Tests

- Backend unit/API tests:
  - `backend/tests/test_account_workspace.py`
- Frontend unit/component tests:
  - `frontend/src/components/account/CreateAccountDialog.test.tsx`
- Edge cases:
  - Missing LinkedIn URL blocks form submission.
  - Non-LinkedIn URL blocks form submission.
  - Backend rejects invalid LinkedIn URLs.
  - Approved accounts retain the draft LinkedIn URL.

## Linting And Quality

- Lint/typecheck commands:
  - `docker compose run --rm --no-deps backend pytest tests/test_account_workspace.py -q`
  - `docker compose run --rm --no-deps frontend npm test -- CreateAccountDialog.test.tsx`
  - `docker compose run --rm --no-deps frontend npm run typecheck`
- Known code smells or tradeoffs:
  - CSV import keeps LinkedIn optional to avoid breaking existing import templates.

## Open Questions

- None.

## Handoff Notes

- Setup notes: Run the new SQL migration in environments with existing databases.
- Manual verification: Create Account should block until a LinkedIn URL is provided and should show it on the onboarding review page.
- Follow-ups: Consider adding LinkedIn to CSV import templates if operations wants it collected there too.
