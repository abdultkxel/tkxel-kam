from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.config import get_settings
from app.services.kyc import KycService
from app.services.kyc_gateway import build_kyc_gateway_adapter

logger = logging.getLogger(__name__)


class KycWorkerService:
    """Local worker facade for queued AI KYC runs."""

    def __init__(self, db: Session) -> None:
        self.db = db
        self.settings = get_settings()

    def run_pending(self, *, limit: int | None = None) -> int:
        if self.settings.kyc_queue_backend != "local":
            logger.info("KYC worker skipped because KYC_QUEUE_BACKEND=%s", self.settings.kyc_queue_backend)
            return 0
        service = KycService(self.db, gateway=build_kyc_gateway_adapter())
        result = service.run_pending_jobs(None, limit=limit or self.settings.kyc_worker_batch_size)
        return result.processed_count
