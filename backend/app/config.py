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
        self.content_storage_max_file_mb = int(os.getenv("CONTENT_STORAGE_MAX_FILE_MB", "25"))
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
        self.ai_kyc_provider = os.getenv("AI_KYC_PROVIDER", "deterministic_local").strip().lower()
        self.ai_kyc_api_key = os.getenv("AI_KYC_API_KEY", "")
        self.ai_kyc_base_url = os.getenv("AI_KYC_BASE_URL", "").strip()
        self.ai_kyc_model = os.getenv("AI_KYC_MODEL", "gpt-5-mini")
        self.ai_kyc_organization = os.getenv("AI_KYC_ORGANIZATION", "").strip()
        self.ai_kyc_project = os.getenv("AI_KYC_PROJECT", "").strip()
        self.ai_kyc_timeout_seconds = int(os.getenv("AI_KYC_TIMEOUT_SECONDS", "45"))
        self.ai_kyc_max_retries = int(os.getenv("AI_KYC_MAX_RETRIES", "2"))
        self.ai_kyc_retry_backoff_seconds = float(os.getenv("AI_KYC_RETRY_BACKOFF_SECONDS", "1.5"))
        self.ai_kyc_max_input_tokens = int(os.getenv("AI_KYC_MAX_INPUT_TOKENS", "35000"))
        self.ai_kyc_max_output_tokens = int(os.getenv("AI_KYC_MAX_OUTPUT_TOKENS", "8000"))
        self.ai_kyc_temperature = float(os.getenv("AI_KYC_TEMPERATURE", "0.2"))
        self.ai_kyc_detail_level = os.getenv("AI_KYC_DETAIL_LEVEL", "compact").strip().lower()
        self.ai_kyc_ollama_context_tokens = int(os.getenv("AI_KYC_OLLAMA_CONTEXT_TOKENS", "2048"))
        self.ai_kyc_web_research_enabled = os.getenv("AI_KYC_WEB_RESEARCH_ENABLED", "false").lower() == "true"
        self.ai_kyc_web_research_provider = os.getenv("AI_KYC_WEB_RESEARCH_PROVIDER", "openai").strip().lower()
        self.ai_kyc_web_research_api_key = os.getenv("AI_KYC_WEB_RESEARCH_API_KEY", os.getenv("OPENAI_API_KEY", "")).strip()
        self.ai_kyc_web_research_model = os.getenv("AI_KYC_WEB_RESEARCH_MODEL", "gpt-4o-mini").strip()
        self.ai_kyc_web_research_context_size = os.getenv("AI_KYC_WEB_RESEARCH_CONTEXT_SIZE", "high").strip().lower()
        self.ai_kyc_web_research_max_sources = int(os.getenv("AI_KYC_WEB_RESEARCH_MAX_SOURCES", "12"))
        self.ai_kyc_web_research_timeout_seconds = int(os.getenv("AI_KYC_WEB_RESEARCH_TIMEOUT_SECONDS", "90"))
        self.tavily_api_key = os.getenv("TAVILY_API_KEY", "").strip()
        self.tavily_base_url = os.getenv("TAVILY_BASE_URL", "https://api.tavily.com").strip()
        self.tavily_search_endpoint = os.getenv("TAVILY_SEARCH_ENDPOINT", "/search").strip()
        self.tavily_extract_endpoint = os.getenv("TAVILY_EXTRACT_ENDPOINT", "/extract").strip()
        self.tavily_timeout_seconds = int(os.getenv("TAVILY_TIMEOUT_SECONDS", "45"))
        self.tavily_max_retries = int(os.getenv("TAVILY_MAX_RETRIES", "2"))
        self.tavily_retry_backoff_seconds = float(os.getenv("TAVILY_RETRY_BACKOFF_SECONDS", "1.5"))
        self.tavily_max_results = int(os.getenv("TAVILY_MAX_RESULTS", "8"))
        self.tavily_search_depth = os.getenv("TAVILY_SEARCH_DEPTH", "advanced").strip().lower()
        self.tavily_include_answer = os.getenv("TAVILY_INCLUDE_ANSWER", "false").lower() == "true"
        self.tavily_include_raw_content = os.getenv("TAVILY_INCLUDE_RAW_CONTENT", "true").lower() == "true"
        self.tavily_include_images = os.getenv("TAVILY_INCLUDE_IMAGES", "false").lower() == "true"
        self.tavily_include_domains = os.getenv("TAVILY_INCLUDE_DOMAINS", "").strip()
        self.tavily_exclude_domains = os.getenv("TAVILY_EXCLUDE_DOMAINS", "linkedin.com,facebook.com,instagram.com,x.com,twitter.com").strip()
        self.tavily_extract_enabled = os.getenv("TAVILY_EXTRACT_ENABLED", "false").lower() == "true"
        self.tavily_extract_depth = os.getenv("TAVILY_EXTRACT_DEPTH", "basic").strip().lower()
        self.tavily_extract_format = os.getenv("TAVILY_EXTRACT_FORMAT", "markdown").strip().lower()
        self.tavily_daily_credit_limit = int(os.getenv("TAVILY_DAILY_CREDIT_LIMIT", "100"))
        self.tavily_per_run_credit_limit = int(os.getenv("TAVILY_PER_RUN_CREDIT_LIMIT", "10"))
        self.ai_kyc_research_summarizer_provider = os.getenv("AI_KYC_RESEARCH_SUMMARIZER_PROVIDER", "ollama").strip().lower()
        self.ai_kyc_research_summarizer_model = os.getenv("AI_KYC_RESEARCH_SUMMARIZER_MODEL", self.ai_kyc_model).strip() or self.ai_kyc_model
        self.ai_kyc_research_summarizer_base_url = os.getenv("AI_KYC_RESEARCH_SUMMARIZER_BASE_URL", self.ai_kyc_base_url or "http://ollama:11434/v1").strip()
        self.ai_kyc_research_summarizer_timeout_seconds = int(os.getenv("AI_KYC_RESEARCH_SUMMARIZER_TIMEOUT_SECONDS", "900"))
        self.ai_kyc_research_summarizer_max_input_tokens = int(os.getenv("AI_KYC_RESEARCH_SUMMARIZER_MAX_INPUT_TOKENS", "12000"))
        self.ai_kyc_research_summarizer_max_output_tokens = int(os.getenv("AI_KYC_RESEARCH_SUMMARIZER_MAX_OUTPUT_TOKENS", "2500"))
        self.ai_kyc_research_summarizer_temperature = float(os.getenv("AI_KYC_RESEARCH_SUMMARIZER_TEMPERATURE", "0.1"))
        self.ai_kyc_verbose_logging = os.getenv("AI_KYC_VERBOSE_LOGGING", "false").lower() == "true"
        self.ai_kyc_verbose_log_max_chars = int(os.getenv("AI_KYC_VERBOSE_LOG_MAX_CHARS", "60000"))
        self.ai_kyc_max_cost_per_run_usd = float(os.getenv("AI_KYC_MAX_COST_PER_RUN_USD", "0.25"))
        self.ai_kyc_daily_budget_usd = float(os.getenv("AI_KYC_DAILY_BUDGET_USD", "5"))
        self.ai_kyc_monthly_budget_usd = float(os.getenv("AI_KYC_MONTHLY_BUDGET_USD", "25"))
        self.ai_kyc_estimated_input_cost_per_1k_usd = float(os.getenv("AI_KYC_ESTIMATED_INPUT_COST_PER_1K_USD", "0"))
        self.ai_kyc_estimated_output_cost_per_1k_usd = float(os.getenv("AI_KYC_ESTIMATED_OUTPUT_COST_PER_1K_USD", "0"))
        self.ai_kyc_retrieval_top_k = int(os.getenv("AI_KYC_RETRIEVAL_TOP_K", "30"))
        self.ai_kyc_chunk_size_tokens = int(os.getenv("AI_KYC_CHUNK_SIZE_TOKENS", "650"))
        self.ai_kyc_chunk_overlap_tokens = int(os.getenv("AI_KYC_CHUNK_OVERLAP_TOKENS", "90"))
        self.ai_kyc_use_embeddings = os.getenv("AI_KYC_USE_EMBEDDINGS", "true").lower() == "true"
        self.ai_kyc_embedding_provider = os.getenv("AI_KYC_EMBEDDING_PROVIDER", "local_hash").strip().lower()
        self.ai_kyc_embedding_model = os.getenv("AI_KYC_EMBEDDING_MODEL", "local_hash")
        self.ai_kyc_embedding_dimensions = int(os.getenv("AI_KYC_EMBEDDING_DIMENSIONS", "384"))
        self.kyc_document_extraction_enabled = os.getenv("KYC_DOCUMENT_EXTRACTION_ENABLED", "true").lower() == "true"
        self.kyc_document_extraction_max_file_mb = int(os.getenv("KYC_DOCUMENT_EXTRACTION_MAX_FILE_MB", "25"))
        self.kyc_ocr_enabled = os.getenv("KYC_OCR_ENABLED", "true").lower() == "true"
        self.kyc_ocr_engine = os.getenv("KYC_OCR_ENGINE", "tesseract").strip().lower()
        self.kyc_ocr_min_text_chars = int(os.getenv("KYC_OCR_MIN_TEXT_CHARS", "80"))
        self.kyc_queue_backend = os.getenv("KYC_QUEUE_BACKEND", "local").strip().lower()
        self.kyc_worker_enabled = os.getenv("KYC_WORKER_ENABLED", "false").lower() == "true"
        self.kyc_worker_initial_delay_seconds = int(os.getenv("KYC_WORKER_INITIAL_DELAY_SECONDS", "5"))
        self.kyc_worker_interval_seconds = int(os.getenv("KYC_WORKER_INTERVAL_SECONDS", "5"))
        self.kyc_worker_batch_size = int(os.getenv("KYC_WORKER_BATCH_SIZE", "1"))
        self.sow_ai_extraction_enabled = os.getenv("SOW_AI_EXTRACTION_ENABLED", "true").lower() == "true"
        self.sow_ai_extraction_model = os.getenv("SOW_AI_EXTRACTION_MODEL", self.ai_kyc_model).strip() or self.ai_kyc_model
        self.sow_ai_extraction_timeout_seconds = int(os.getenv("SOW_AI_EXTRACTION_TIMEOUT_SECONDS", "180"))
        self.sow_ai_extraction_max_output_tokens = int(os.getenv("SOW_AI_EXTRACTION_MAX_OUTPUT_TOKENS", "600"))


@lru_cache
def get_settings() -> Settings:
    return Settings()
