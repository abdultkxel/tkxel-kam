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
        self.integration_credential_encryption_key = os.getenv("INTEGRATION_CREDENTIAL_ENCRYPTION_KEY", "")
        self.jwt_algorithm = os.getenv("JWT_ALGORITHM", "HS256")
        self.access_token_expire_minutes = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
        self.reset_token_expire_minutes = int(os.getenv("RESET_TOKEN_EXPIRE_MINUTES", "30"))
        self.super_admin_email = os.getenv("SUPER_ADMIN_EMAIL", "admin@tkxel.com")
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
        self.google_calendar_redirect_uri = os.getenv("GOOGLE_CALENDAR_REDIRECT_URI", "http://127.0.0.1:8001/api/admin/integrations/google-calendar/oauth-callback")
        self.google_calendar_default_calendar_id = os.getenv("GOOGLE_CALENDAR_DEFAULT_CALENDAR_ID", "primary")
        self.google_sign_in_client_id = os.getenv("GOOGLE_SIGN_IN_CLIENT_ID", "")
        self.allowed_email_domains = os.getenv("ALLOWED_EMAIL_DOMAINS", "tkxel.com,tkxel.io,camp1.tkxel.com,camp1.tkxel.io")
        self.frontend_app_url = os.getenv("FRONTEND_APP_URL", os.getenv("VITE_API_BASE_URL", "http://127.0.0.1:5173")).rstrip("/")
        self.mail_mailer = os.getenv("MAIL_MAILER", os.getenv("SMTP_MAILER", "smtp")).lower()
        self.mail_host = os.getenv("MAIL_HOST", os.getenv("SMTP_HOST", ""))
        self.mail_port = int(os.getenv("MAIL_PORT", os.getenv("SMTP_PORT", "587")))
        self.mail_username = os.getenv("MAIL_USERNAME", os.getenv("SMTP_USERNAME", ""))
        self.mail_password = os.getenv("MAIL_PASSWORD", os.getenv("SMTP_PASSWORD", ""))
        self.mail_encryption = os.getenv("MAIL_ENCRYPTION", os.getenv("SMTP_ENCRYPTION", "tls")).lower()
        self.mail_from_email = os.getenv("MAIL_FROM_EMAIL", os.getenv("SMTP_FROM_EMAIL", self.super_admin_email))
        self.mail_from_name = os.getenv("MAIL_FROM_NAME", os.getenv("SMTP_FROM_NAME", "KAM Intelligence Platform"))
        self.mail_enabled = os.getenv("MAIL_ENABLED", "false").lower() == "true"
        self.mail_send_during_tests = os.getenv("MAIL_SEND_DURING_TESTS", "false").lower() == "true"
        self.fathom_api_key = os.getenv("FATHOM_API_KEY", "")
        self.fathom_base_url = os.getenv("FATHOM_BASE_URL", "https://api.fathom.ai")
        self.fathom_recordings_path = os.getenv("FATHOM_RECORDINGS_PATH", "/external/v1/meetings/")
        self.fathom_webhook_secret = os.getenv("FATHOM_WEBHOOK_SECRET", "")
        self.timeline_retention_worker_enabled = os.getenv("TIMELINE_RETENTION_WORKER_ENABLED", "true").lower() == "true"
        self.timeline_retention_worker_initial_delay_seconds = int(os.getenv("TIMELINE_RETENTION_WORKER_INITIAL_DELAY_SECONDS", "60"))
        self.timeline_retention_worker_interval_seconds = int(os.getenv("TIMELINE_RETENTION_WORKER_INTERVAL_SECONDS", "86400"))
        self.notifications_reporting_worker_enabled = os.getenv("NOTIFICATIONS_REPORTING_WORKER_ENABLED", "true").lower() == "true"
        self.notifications_reporting_worker_initial_delay_seconds = int(os.getenv("NOTIFICATIONS_REPORTING_WORKER_INITIAL_DELAY_SECONDS", "30"))
        self.notifications_reporting_worker_interval_seconds = int(os.getenv("NOTIFICATIONS_REPORTING_WORKER_INTERVAL_SECONDS", "300"))
        self.integrations_worker_enabled = os.getenv("INTEGRATIONS_WORKER_ENABLED", "true").lower() == "true"
        self.integrations_worker_initial_delay_seconds = int(os.getenv("INTEGRATIONS_WORKER_INITIAL_DELAY_SECONDS", "45"))
        self.integrations_worker_interval_seconds = int(os.getenv("INTEGRATIONS_WORKER_INTERVAL_SECONDS", "300"))


@lru_cache
def get_settings() -> Settings:
    return Settings()
