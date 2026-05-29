from functools import lru_cache
from pathlib import Path
import os

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BASE_DIR / ".env", override=True)


class Settings:
    def __init__(self) -> None:
        self.database_url = os.getenv(
            "DATABASE_URL",
            "postgresql+psycopg://kam_app:kam_app_password@127.0.0.1:5432/kam_intelligence",
        )
        self.jwt_secret_key = os.getenv("JWT_SECRET_KEY", "replace-this-local-development-secret")
        self.jwt_algorithm = os.getenv("JWT_ALGORITHM", "HS256")
        self.access_token_expire_minutes = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
        self.reset_token_expire_minutes = int(os.getenv("RESET_TOKEN_EXPIRE_MINUTES", "30"))
        self.super_admin_email = os.getenv("SUPER_ADMIN_EMAIL", "admin@tkxelkam.com")
        self.super_admin_password = os.getenv("SUPER_ADMIN_PASSWORD", "Admin@12345")
        self.super_admin_full_name = os.getenv("SUPER_ADMIN_FULL_NAME", "KAM Super Admin")
        self.super_admin_title = os.getenv("SUPER_ADMIN_TITLE", "Platform Owner")
        self.cors_origins = [
            origin.strip()
            for origin in os.getenv("BACKEND_CORS_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173").split(",")
            if origin.strip()
        ]
        self.expose_reset_tokens = os.getenv("EXPOSE_RESET_TOKENS", "false").lower() == "true"


@lru_cache
def get_settings() -> Settings:
    return Settings()
