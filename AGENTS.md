# KAM Intelligence Platform Development Rules

These rules apply to all AI-assisted and manual development in this repository.

## Core Workflow

- Use Docker as the default development workflow unless a task explicitly needs local execution.
- Keep changes scoped to the requested feature, bug fix, or refactor.
- Do not include unrelated formatting, rewrites, or cleanup in feature branches.
- Follow test-driven development: define or update the expected test coverage before or alongside implementation, then make the feature pass those tests.
- Add or update unit tests for every development change.
- Run the relevant test and lint/typecheck commands before handing off work.
- If a check cannot be run, document the reason clearly.

## Feature Context Files

- Every feature must have a dedicated markdown file under `docs/features/`.
- Link every feature file from `docs/features/README.md`.
- Keep feature files current as scope, decisions, API contracts, data models, risks, and test notes change.
- Prefer one feature file per deliverable or workflow so context stays focused.
- Use `docs/features/_feature-template.md` when starting a new feature.

## Backend Rules

- Implement business logic with service classes.
- Use repository classes for database access and persistence.
- Keep FastAPI routers thin: request/response wiring, dependency injection, and route metadata only.
- Add or update Swagger/OpenAPI documentation for every API development.
- Add meaningful summaries, descriptions, response descriptions, and error responses to new API routes.
- Use backend validation classes/schemas for request validation.
- Return meaningful validation errors that can be displayed next to matching frontend fields.
- Use snake_case for database table names and column names.
- Use helpers for reusable validation, formatting, mapping, and calculation logic.
- Avoid deeply nested loops and conditions; extract helpers, services, strategies, or small functions instead.
- Follow SOLID principles, with special care for single responsibility and dependency inversion.

## Frontend Rules

- Do not use the HTML `required` attribute for form validation.
- Display proper error messages from the backend beside the matching input fields.
- Keep frontend validation aligned with backend validation, but treat backend validation as authoritative.
- Use existing UI components, stores, hooks, and services before adding new patterns.
- Avoid direct API calls outside the frontend service/API layer.
- Keep feature UI consistent with the existing Tkxel KAM design system.

## Architecture Rules

- Use repositories and services where business logic or persistence is involved.
- Use helpers only when they remove duplication or clarify domain behavior.
- Prefer small composable units over large functions with many branches.
- Avoid over-engineering, but apply design patterns where they simplify real complexity.
- Keep domain rules close to the domain service that owns them.

## Quality Rules

- Follow configured linters and formatters.
- Do not silence lint/type errors without a documented reason.
- Do not merge code with known code smells unless the tradeoff is documented in the feature file.
- Tests should cover happy paths, validation failures, permission/role boundaries, and meaningful regressions.
- For API changes, include backend tests and frontend error-display coverage where relevant.

## Handoff Checklist

- Feature markdown file created or updated.
- Tests added or updated.
- Swagger/OpenAPI docs added or updated for API work.
- Backend validation messages are meaningful.
- Frontend displays backend validation errors at field level.
- Linters/typechecks/tests were run or skipped with a documented reason.
- No unrelated files or refactors are included.
