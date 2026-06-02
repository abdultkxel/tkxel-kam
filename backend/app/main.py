from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import SessionLocal, init_db
from app.exceptions import validation_exception_handler
from app.routers import accounts, admin, auth, content, custom_fields, engagements, escalations, governance, kyc, onboarding, opportunities, scoring, signals, tasks, users
from app.services.seed import seed_default_data


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    with SessionLocal() as db:
        seed_default_data(db)
    yield


settings = get_settings()

openapi_tags = [
    {
        "name": "System",
        "description": "Operational API checks for service uptime and platform readiness.",
    },
    {
        "name": "Authentication",
        "description": "Login, logout, password reset, password change, and current-session APIs.",
    },
    {
        "name": "Users & Profile",
        "description": "Authenticated user profile read and update APIs.",
    },
    {
        "name": "Admin RBAC",
        "description": "PRD-backed user management, roles, and module permission administration APIs.",
    },
    {
        "name": "Account Onboarding",
        "description": "Charter/SOW-led draft intake, review, approval, rejection, and link-to-existing workflows.",
    },
    {
        "name": "Account Workspace",
        "description": "Account portfolio, Account Overview, ownership, lifecycle status, attachments, and account-level engagement APIs.",
    },
    {
        "name": "Engagement 360",
        "description": "Engagement/SOW detail, updates, archival, health snapshots, and recalculation APIs.",
    },
    {
        "name": "Client Education Content",
        "description": "Client education catalog, recommendations, sent-content history, and content upload APIs.",
    },
    {
        "name": "Escalation Management",
        "description": "Manual escalation lifecycle, updates, closure, RCA, notifications, and SLA metadata APIs.",
    },
    {
        "name": "Governance Reviews",
        "description": "Governance calendar, recurrence, agenda drafts, decisions, actions, AI brief, and integration sync APIs.",
    },
    {
        "name": "Growth & Opportunity Management",
        "description": "Opportunity CRUD, pipeline board/list tracking, stage movement, local action items, timeline history, and opportunity type taxonomy APIs.",
    },
    {
        "name": "Scoring Engine",
        "description": "Configurable metric definitions, formula validation, score jobs, account/engagement score snapshots, and health recalculation APIs.",
    },
    {
        "name": "Signals and Attention Center",
        "description": "Deterministic signal evaluation, evidence, lifecycle status updates, advisory explanations, recommendations, and attention-center APIs.",
    },
    {
        "name": "Playbooks, Tasks, and Calendar",
        "description": "Playbook templates, explicit execution, generated/manual tasks, task evidence, lifecycle tracking, and unified calendar APIs.",
    },
    {
        "name": "KYC and AI Extraction",
        "description": "AI-assisted KYC drafts, review/approval, immutable snapshots, freshness, and agent workstream APIs.",
    },
    {
        "name": "Field Builder Runtime",
        "description": "Runtime custom field definitions used by feature screens.",
    },
]

app = FastAPI(
    title="KAM Intelligence Platform API",
    summary="Backend API for the KAM Intelligence Platform.",
    description="Provides account-management platform APIs, starting with PostgreSQL-backed user authentication.",
    version="0.1.0",
    lifespan=lifespan,
    openapi_tags=openapi_tags,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(RequestValidationError, validation_exception_handler)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(admin.router)
app.include_router(onboarding.router)
app.include_router(accounts.router)
app.include_router(engagements.router)
app.include_router(content.router)
app.include_router(custom_fields.router)
app.include_router(escalations.router)
app.include_router(governance.router)
app.include_router(opportunities.router)
app.include_router(scoring.router)
app.include_router(signals.router)
app.include_router(tasks.router)
app.include_router(kyc.config_router)
app.include_router(kyc.router)


@app.get(
    "/health",
    tags=["System"],
    summary="Health check",
    description="Returns a simple status payload used by local development and uptime checks.",
)
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "kam-backend"}
