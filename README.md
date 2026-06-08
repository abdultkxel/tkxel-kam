# KAM Intelligence Platform

## What is this repository for?

### Quick summary

This repository contains the KAM Intelligence Platform, an Enterprise SaaS / Customer Success application for strategic account management. It centralizes account workspaces, engagements, governance, stakeholder intelligence, renewals, escalations, notifications, dashboards, AI-assisted KYC, document intelligence, and integrations for Key Account Management teams.

### Version

```text
Application version: 1.0.0
Backend API version: 0.1.0
```

### Learn Markdown

This README is written in Markdown. Useful references:

```text
Markdown Guide: https://www.markdownguide.org/basic-syntax/
GitHub Markdown: https://docs.github.com/en/get-started/writing-on-github
```

## How do I get set up?

### Summary of set up

Use Docker Compose as the default local development workflow.

```bash
make dev-run
```

This builds and starts PostgreSQL, the FastAPI backend, the React/Vite frontend, and configured local services such as Ollama.

### Configuration

Local configuration is driven by environment variables from `.env`, `backend/.env`, `.env.example`, and Docker Compose defaults. Important configuration areas include:

```text
DATABASE_URL
JWT_SECRET_KEY
BACKEND_CORS_ORIGINS
FRONTEND_APP_URL
VITE_API_BASE_URL
GOOGLE_SIGN_IN_CLIENT_ID
VITE_GOOGLE_SIGN_IN_CLIENT_ID
MAIL_* / SMTP_*
FATHOM_*
TAVILY_*
AI_KYC_*
CONTENT_STORAGE_*
```

### Dependencies

Primary dependencies:

```text
Docker and Docker Compose
PostgreSQL 16
Python / FastAPI / SQLAlchemy backend dependencies from backend/requirements.txt
Node.js / React / Vite frontend dependencies from frontend/package.json
Optional local AI runtime through Ollama for Qwen-backed KYC flows
```

### Database configuration

Docker Compose starts PostgreSQL with:

```text
Database: kam_intelligence
User:     kam_app
Password: kam_app_password
Host:     db inside Docker
Port:     5432 inside Docker, 5433 on host by default
```

Run schema sync and base seed data with:

```bash
make migrate
make seed
```

### How to run tests

Run the full Docker-based test suite:

```bash
make test
```

Run targeted backend or frontend checks when working on a focused change:

```bash
docker compose exec -T backend pytest tests/test_account_workspace.py -q
docker compose exec -T frontend npm run typecheck
docker compose exec -T frontend npm test -- src/components/account/CreateAccountDialog.test.tsx
```

### Deployment instructions

Local/demo deployment uses Docker Compose:

```bash
make run
```

For office LAN QA sharing:

```bash
make qa-run
```

For production or pre-production, configure real environment variables, managed PostgreSQL/storage, mail provider settings, OAuth redirect URLs, integration credentials, worker settings, CORS origins, and secret keys before deployment.

## Contribution guidelines

### Writing tests

Add or update tests for every code change. Cover happy paths, validation failures, permission/RBAC boundaries, pagination/search/filter behavior where relevant, and meaningful regression cases.

### Code review

Review for scope control, architecture consistency, security, data persistence, API validation, frontend error handling, and test coverage. Keep routers thin, business logic in services, and persistence in repositories.

### Other guidelines

Follow the repository rules in `AGENTS.md`. Use Docker by default, keep changes focused, avoid unrelated refactors, preserve existing user changes, and run relevant checks before handoff.

## Who do I talk to?

### Repo owner or admin

Contact the project repository owner, platform admin, or Tkxel KAM platform administrator for access, environment setup, deployment, and production-readiness decisions.

### Other community or team contact

Contact the KAM product owner, solution architect, backend/frontend leads, or QA team for feature scope, demo flows, acceptance criteria, and testing coordination.

## Existing Project Documentation

Enterprise SaaS / Customer Success platform for strategic account management, governance, renewals, stakeholder intelligence, escalations, and AI-assisted account operations.

## Stack

```text
frontend/   React + Vite + TypeScript
backend/    FastAPI + SQLAlchemy + PostgreSQL
db/         PostgreSQL via Docker Compose
```

## Standard Workflow

Use Docker for all setup and day-to-day development.

```bash
make dev-run
```

This builds and runs PostgreSQL, FastAPI, and the React frontend with live reload.

## Make Commands

```text
make dev-run  # Build and run frontend, backend, and PostgreSQL with live reload
make build    # Build Docker images
make run      # Run all services in the background
make migrate  # Create/update database tables
make seed     # Seed default users/data
make test     # Run backend and frontend tests in Docker
make down     # Stop services
make logs     # Follow Docker logs
make clean    # Stop services and remove project volumes
```

## Service URLs

```text
Frontend: http://127.0.0.1:5173/
Login:    http://127.0.0.1:5173/login
Backend:  http://127.0.0.1:8001/
Health:   http://127.0.0.1:8001/health
Swagger:  http://127.0.0.1:8001/docs
OpenAPI:  http://127.0.0.1:8001/openapi.json
```

## Default Login

The seed command creates the hidden default super admin used for setup and platform ownership.

```text
Email: admin@tkxel.com
Password: Admin@12345
```

Default allowed email domains are seeded as:

```text
tkxel.com, tkxel.io, camp1.tkxel.com
```

Google Sign-In requires both `GOOGLE_SIGN_IN_CLIENT_ID` for the backend and `VITE_GOOGLE_SIGN_IN_CLIENT_ID` for the frontend.

## Database

Docker Compose starts PostgreSQL 16 with:

```text
Database: kam_intelligence
User:     kam_app
Password: kam_app_password
Host:     db inside Docker
Port:     5432 inside Docker
```

The database is published to host port `5433` by default to avoid conflicts with any local PostgreSQL already using `5432`.

```bash
POSTGRES_HOST_PORT=5432 make dev-run
```

Use that override only when host port `5432` is free.

If local frontend or backend ports are already busy, run Docker on alternate host ports:

```bash
BACKEND_HOST_PORT=8002 FRONTEND_HOST_PORT=5174 VITE_API_BASE_URL=http://127.0.0.1:8002 make run
```

## Migrations And Seed Data

```bash
make migrate
make seed
```

`make migrate` creates/updates tables from SQLAlchemy metadata.
`make seed` creates required default data, including the hidden super admin user, PRD roles, one visible user for every non-super-admin seeded role, and the module/action permission catalog.

Default seeded roles from `requirements/KAM PRD.pdf`:

```text
super_admin
admin
account_manager
ops_lead
kam_head
leadership_viewer
content_specialist
commercial_stakeholder
delivery_stakeholder
```

`super_admin` is kept out of Admin user/role listings and assignment dropdowns. Seeded visible role users use this pattern:

```text
admin.user@tkxel.com
account.manager.user@tkxel.com
ops.lead.user@tkxel.com
kam.head.user@tkxel.com
leadership.viewer.user@tkxel.com
content.specialist.user@tkxel.com
commercial.stakeholder.user@tkxel.com
delivery.stakeholder.user@tkxel.com
Password: User@12345
```

## Authentication Features

Implemented authentication includes:

```text
Login
Logout
Forgot password
Reset password
Change password
Profile read/update
JWT bearer authentication
Field-level backend validation messages
Swagger documentation for each API
```

Frontend forms display backend validation errors directly below the matching field.

## User Management And RBAC

The Admin screen includes PRD-backed user and role permission management:

```text
Tabbed Admin sections instead of a long scrollable settings page
Create users
Edit users
Delete users with confirmation
Search users by email or name
Filter users by status and role
Paginate users with selectable page sizes
Assign roles
Activate/deactivate users
Create custom roles
Edit roles
Delete custom roles with confirmation
Search roles by slug, name, or description
Filter roles by system/custom type
Paginate roles with selectable page sizes
Grant or revoke module/action permissions
Select all permissions or clear all permissions in one click
Refresh seeded access data
```

Backend APIs:

```text
GET    /api/admin/users
POST   /api/admin/users
GET    /api/admin/users/{user_id}
PATCH  /api/admin/users/{user_id}
DELETE /api/admin/users/{user_id}
GET    /api/admin/roles
POST   /api/admin/roles
GET    /api/admin/roles/{role_slug}
PATCH  /api/admin/roles/{role_slug}
DELETE /api/admin/roles/{role_slug}
GET    /api/admin/permissions
PUT    /api/admin/roles/{role_slug}/permissions
```

RBAC data is implemented with repository and service layers:

```text
backend/app/repositories/rbac.py
backend/app/repositories/users.py
backend/app/services/rbac.py
backend/app/services/user_management.py
```

## API Documentation

Swagger is generated by FastAPI and available at:

```text
http://127.0.0.1:8001/docs
```

Every API development should include:

```text
Swagger summary
Swagger description
Response descriptions
Validation error responses where applicable
Unit tests
```

## Testing

Run all tests in Docker:

```bash
make test
```

Current test coverage includes:

```text
Backend auth/profile flows
Backend validation error messages
Backend Swagger/OpenAPI assertions
Backend snake_case database schema assertions
Backend seeded PRD roles and permissions
Backend user management and RBAC permission APIs
Backend user and role search/filter/pagination APIs
Backend admin authorization and forbidden access checks
Backend user and role delete protections
Frontend login flow
Frontend reset password flow
Frontend profile/password flow
Frontend field-level validation error rendering
Frontend Admin tabs, user/role filters, pagination, CRUD validation/deletion, and role permission CRUD
```

## Project Rules

Keep these rules for future development:

```text
Use Docker as the standard setup path.
Add or update unit tests for each development.
Add or update Swagger API documentation for each API development.
Use snake_case for database table and column names.
Add backend validation classes and meaningful validation error messages.
Display backend validation errors at the matching frontend form fields.
Use service/repository patterns where business logic is needed.
Avoid deeply nested loops and conditions; prefer small helpers/services.
```

## Useful Commands

Start everything in foreground:

```bash
make dev-run
```

Start everything in background:

```bash
make run
```

View logs:

```bash
make logs
```

Stop services:

```bash
make down
```

Reset Docker volumes:

```bash
make clean
```

## Local Non-Docker Fallback

Docker is the standard workflow. If you need to debug outside Docker, use:

Backend:

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

Frontend:

```bash
cd frontend
npm run dev -- --port 5173
```

Local fallback environment examples:

Backend:

```bash
cp backend/.env.example backend/.env
```

Frontend:

```bash
cp frontend/.env.example frontend/.env
```

## Repository Structure

```text
.
├── Makefile
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── app/
│   ├── tests/
│   ├── requirements.txt
│   └── requirements-dev.txt
└── frontend/
    ├── Dockerfile
    ├── src/
    ├── package.json
    └── package-lock.json
```
