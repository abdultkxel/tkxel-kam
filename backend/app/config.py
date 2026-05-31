from functools import lru_cache
from pathlib import Path
import os

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BASE_DIR / ".env")


class Settings:
    def __init__(self) -> None:
        self.database_url = os.getenv(
            "DATABASE_URL",
            "postgresql+psycopg://kam_app:kam_app_password@127.0.0.1:5433/kam_intelligence",
        )
        self.jwt_secret_key = os.getenv("JWT_SECRET_KEY", "replace-this-local-development-secret")
        self.jwt_algorithm = os.getenv("JWT_ALGORITHM", "HS256")
        self.access_token_expire_minutes = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
        self.reset_token_expire_minutes = int(os.getenv("RESET_TOKEN_EXPIRE_MINUTES", "30"))
        self.super_admin_email = os.getenv("SUPER_ADMIN_EMAIL", "admin@tkxelkam.com")
        self.super_admin_password = os.getenv("SUPER_ADMIN_PASSWORD", "Admin@12345")
        self.super_admin_full_name = os.getenv("SUPER_ADMIN_FULL_NAME", "KAM Super Admin")
        self.super_admin_title = os.getenv("SUPER_ADMIN_TITLE", "Platform Owner")
        self.seed_user_password = os.getenv("SEED_USER_PASSWORD", "User@12345")
        self.cors_origins = [
            origin.strip()
            for origin in os.getenv("BACKEND_CORS_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173").split(",")
            if origin.strip()
        ]
        self.expose_reset_tokens = os.getenv("EXPOSE_RESET_TOKENS", "false").lower() == "true"
        self.content_storage_backend = os.getenv("CONTENT_STORAGE_BACKEND", "local").lower()
        self.local_content_storage_dir = os.getenv("LOCAL_CONTENT_STORAGE_DIR", str(BASE_DIR / "storage" / "content"))
        self.s3_bucket_name = os.getenv("S3_BUCKET_NAME", "")
        self.s3_region = os.getenv("S3_REGION", "")
        self.google_calendar_client_id = os.getenv("GOOGLE_CALENDAR_CLIENT_ID", "")
        self.google_calendar_client_secret = os.getenv("GOOGLE_CALENDAR_CLIENT_SECRET", "")
        self.google_calendar_redirect_uri = os.getenv("GOOGLE_CALENDAR_REDIRECT_URI", "http://127.0.0.1:8002/api/admin/integrations/google-calendar/oauth-callback")
        self.google_calendar_default_calendar_id = os.getenv("GOOGLE_CALENDAR_DEFAULT_CALENDAR_ID", "primary")
        self.fathom_api_key = os.getenv("FATHOM_API_KEY", "")
        self.fathom_base_url = os.getenv("FATHOM_BASE_URL", "https://api.fathom.video")
        self.fathom_recordings_path = os.getenv("FATHOM_RECORDINGS_PATH", "/recordings")
        self.fathom_webhook_secret = os.getenv("FATHOM_WEBHOOK_SECRET", "")


@lru_cache
def get_settings() -> Settings:
    return Settings()
