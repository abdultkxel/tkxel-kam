import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import SessionLocal, init_db
from app.exceptions import validation_exception_handler
from app.routers import (
    account_planning,
    accounts,
    admin,
    admin_security,
    ai,
    analytics,
    auth,
    content,
    csat,
    custom_fields,
    dashboards,
    engagements,
    escalations,
    governance,
    integrations,
    kyc,
    notifications,
    onboarding,
    opportunities,
    playbooks_tasks,
    retention,
    reports,
    scoring,
    service_catalog,
    signals,
    stakeholders,
    timeline,
    users,
)
from app.services.seed import seed_base_data
from app.services.notifications import NotificationsService
from app.services.reports import ReportsService
from app.services.timeline import TimelineService
from app.services.integrations import IntegrationService

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    with SessionLocal() as db:
        seed_base_data(db)
    retention_worker: asyncio.Task | None = None
    notifications_reporting_worker: asyncio.Task | None = None
    integrations_worker: asyncio.Task | None = None
    if settings.timeline_retention_worker_enabled:
        retention_worker = asyncio.create_task(timeline_retention_worker_loop())
    if settings.notifications_reporting_worker_enabled:
        notifications_reporting_worker = asyncio.create_task(notifications_reporting_worker_loop())
    if settings.integrations_worker_enabled:
        integrations_worker = asyncio.create_task(integrations_worker_loop())
    try:
        yield
    finally:
        if retention_worker:
            retention_worker.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await retention_worker
        if notifications_reporting_worker:
            notifications_reporting_worker.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await notifications_reporting_worker
        if integrations_worker:
            integrations_worker.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await integrations_worker


async def timeline_retention_worker_loop() -> None:
    await asyncio.sleep(settings.timeline_retention_worker_initial_delay_seconds)
    while True:
        try:
            with SessionLocal() as db:
                results = TimelineService(db).run_due_retention_policies()
                if results:
                    logger.info("Timeline retention worker completed %s policy run(s)", len(results))
        except Exception:
            logger.exception("Timeline retention worker failed")
        await asyncio.sleep(settings.timeline_retention_worker_interval_seconds)


async def notifications_reporting_worker_loop() -> None:
    await asyncio.sleep(settings.notifications_reporting_worker_initial_delay_seconds)
    while True:
        try:
            with SessionLocal() as db:
                sla_result = NotificationsService(db).evaluate_sla(None, mode="scheduled")
                digest_count = NotificationsService(db).run_due_digest_schedules()
                report_count = ReportsService(db).run_due_schedules()
                if sla_result.escalated_items or digest_count or report_count:
                    logger.info(
                        "Notifications/reporting worker completed sla=%s digest=%s report=%s",
                        sla_result.escalated_items,
                        digest_count,
                        report_count,
                    )
        except Exception:
            logger.exception("Notifications/reporting worker failed")
        await asyncio.sleep(settings.notifications_reporting_worker_interval_seconds)


async def integrations_worker_loop() -> None:
    await asyncio.sleep(settings.integrations_worker_initial_delay_seconds)
    while True:
        try:
            with SessionLocal() as db:
                synced = IntegrationService(db).scheduled_sync_due_connections()
                if synced:
                    logger.info("Integrations worker completed %s due sync(s)", synced)
        except Exception:
            logger.exception("Integrations worker failed")
        await asyncio.sleep(settings.integrations_worker_interval_seconds)


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
        "name": "Approved Integrations",
        "description": "Approved Google Calendar, Fathom, CSAT, and AI/LLM Gateway integration configuration, sync, review, and audit APIs.",
    },
    {
        "name": "Playbooks, Activities, Tasks, and Calendar",
        "description": "Configurable playbooks, execution-generated activities, task/evidence management, and unified calendar projections.",
    },
    {
        "name": "Stakeholder Relationships",
        "description": "Account and engagement stakeholder maps, relationship attributes, hierarchy, and stakeholder timeline events.",
    },
    {
        "name": "Growth & Opportunity Management",
        "description": "Opportunity CRUD, pipeline board/list tracking, stage movement, local action items, timeline history, and opportunity type taxonomy APIs.",
    },
    {
        "name": "Account Planning, Whitespace, and Service Catalog",
        "description": "Account plans, service catalog, adjacency rules, whitespace inputs, and adjacent-service recommendations.",
    },
    {
        "name": "Retention and Account Stability",
        "description": "Renewal intelligence, notice windows, retention plans, stabilization actions, and recommendation-to-task workflows.",
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
        "name": "KYC and AI Extraction",
        "description": "AI-assisted KYC drafts, review/approval, immutable snapshots, freshness, and agent workstream APIs.",
    },
    {
        "name": "Account History and Timeline",
        "description": "Source-linked account timeline, notes, comments, retention policies, handover summaries, and AI Timeline Search.",
    },
    {
        "name": "AI Assistance",
        "description": "Source-backed advisory KAM AI search, briefs, forecasts, handoff summaries, and stage predictions.",
    },
    {
        "name": "Field Builder Runtime",
        "description": "Runtime custom field definitions used by feature screens.",
    },
    {
        "name": "Notifications, SLA Escalation, and Executive Digests",
        "description": "Notification preferences, notification center, SLA escalation, scheduled executive digests, and delivery logs.",
    },
    {
        "name": "Dashboards and Reporting",
        "description": "AM Home, KAM Head Portfolio, Leadership dashboards, report builder, report exports, and report schedules.",
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
app.include_router(admin_security.router)
app.include_router(onboarding.router)
app.include_router(accounts.router)
app.include_router(engagements.router)
app.include_router(content.router)
app.include_router(custom_fields.router)
app.include_router(escalations.router)
app.include_router(governance.router)
app.include_router(integrations.router)
app.include_router(csat.router)
app.include_router(csat.integration_router)
app.include_router(playbooks_tasks.router)
app.include_router(stakeholders.router)
app.include_router(opportunities.router)
app.include_router(account_planning.router)
app.include_router(ai.router)
app.include_router(analytics.router)
app.include_router(service_catalog.router)
app.include_router(retention.router)
app.include_router(scoring.router)
app.include_router(signals.router)
app.include_router(kyc.config_router)
app.include_router(kyc.router)
app.include_router(timeline.router)
app.include_router(notifications.router)
app.include_router(dashboards.router)
app.include_router(reports.router)


@app.get(
    "/health",
    tags=["System"],
    summary="Health check",
    description="Returns a simple status payload used by local development and uptime checks.",
)
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "kam-backend"}
