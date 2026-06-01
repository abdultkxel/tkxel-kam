# Contributing

This project is developed with a feature-first workflow. Keep work easy to review, easy to test, and easy to continue by another developer.

## Standard Setup

Use Docker for day-to-day development:

```bash
make dev-run
```

Useful commands:

```bash
make test
make migrate
make seed
make logs
make down
```

Local fallback is supported when needed:

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

```bash
cd frontend
npm run dev -- --port 5173
```

## Feature Development Rules

- Add or update unit tests for each development change.
- Add or update Swagger API documentation for each API development.
- Use snake_case for database table names and column names.
- Do not use the HTML `required` attribute on input fields.
- Display proper backend error messages beside the matching frontend fields.
- Add backend validation classes/schemas and meaningful validation error messages.
- Use repositories and services for backend persistence and business logic.
- Use helpers where they reduce duplication or clarify domain behavior.
- Use design patterns where needed, but keep implementation practical.
- Avoid nested loops and deeply nested conditions; extract smaller functions or domain services.
- Follow SOLID principles.
- Follow configured linters, formatters, and typechecks.

## Feature Context

Every feature must have a feature context file under:

```text
docs/features/
```

Each feature file must be linked from:

```text
docs/features/README.md
```

Use the feature template:

```text
docs/features/_feature-template.md
```

Feature files should document:

- Goal and scope.
- Related PRD requirement IDs, if applicable.
- Backend/API changes.
- Frontend changes.
- Database changes.
- Validation and error handling.
- Tests added or updated.
- Open questions and follow-ups.

## API Development

For every API change:

- Keep routers thin.
- Put business logic in services.
- Put database operations in repositories.
- Add Swagger summaries and descriptions.
- Document response descriptions and error responses.
- Add or update tests.
- Confirm validation errors are meaningful and field-specific where possible.

## Frontend Development

For every form change:

- Avoid `required`.
- Show backend field errors using the existing form error pattern.
- Keep validation language user-friendly.
- Keep UI consistent with the current design system.

## Pull Request Expectations

Before requesting review:

- Run relevant backend tests.
- Run relevant frontend tests.
- Run lint/typecheck commands if available.
- Update the feature context file.
- Check `git status` for unrelated changes.
- Document anything not tested.
