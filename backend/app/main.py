from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import SessionLocal, init_db
from app.exceptions import validation_exception_handler
from app.routers import admin, auth, engagements, users
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
        "name": "Engagement/SOW",
        "description": "Engagement/SOW record management, Engagement 360, and engagement health rollup APIs.",
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
app.include_router(engagements.router)


@app.get(
    "/health",
    tags=["System"],
    summary="Health check",
    description="Returns a simple status payload used by local development and uptime checks.",
)
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "kam-backend"}
