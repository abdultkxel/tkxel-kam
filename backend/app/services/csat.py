from __future__ import annotations

from datetime import datetime, timedelta
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import CsatScore, ScoreSnapshot, User, utc_now
from app.repositories.accounts import AccountRepository
from app.repositories.audit import AuditRepository
from app.repositories.csat import CsatRepository
from app.repositories.rbac import RbacRepository
from app.repositories.timeline import TimelineRepository
from app.schemas import CSAT_CATEGORY_KEYS, CsatScoreCreateRequest, CsatScorePageRead, CsatScoreRead, CsatScoreUpdateRequest, IntegrationItemMapRequest
from app.services.account_access import AccountAccessService, GLOBAL_VIEW_ROLES
from app.services.audit import AuditService
from app.services.email_domains import field_validation_error
from app.services.timeline import TimelineService
from app.services.user_management import page_count

CSAT_MODULE = "scoring_engine"
CSAT_FRESHNESS_DAYS = 90
CSAT_CATEGORY_WEIGHTS = {
    "delivery_excellence": 30,
    "communication": 20,
    "proactiveness": 15,
    "trust": 20,
    "value_for_money": 15,
}


class CsatService:
    def __init__(self, db: Session, repository: CsatRepository | None = None) -> None:
        self.db = db
        self.repository = repository or CsatRepository(db)
        self.accounts = AccountRepository(db)
        self.access = AccountAccessService(self.accounts, RbacRepository(db))
        self.audit = AuditService(AuditRepository(db))
        self.timeline = TimelineService(TimelineRepository(db))

    def list_scores(
        self,
        current_user: User,
        *,
        account_id: str | None = None,
        engagement_id: str | None = None,
        search: str | None = None,
        score_min: int | None = None,
        score_max: int | None = None,
        source: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        sort: str = "source_recorded_at",
        direction: str = "desc",
        page: int = 1,
        page_size: int = 10,
    ) -> CsatScorePageRead:
        self.access.require_module_permission(current_user, CSAT_MODULE, "view")
        if account_id:
            account = self._account_or_404(account_id)
            self.access.require_account_view(current_user, account, module=CSAT_MODULE)
        elif current_user.role not in GLOBAL_VIEW_ROLES:
            allowed = self.accounts.list_account_ids_for_user(current_user.id)
            if not allowed:
                return CsatScorePageRead(items=[], total=0, page=page, page_size=page_size, pages=0)
            all_items, _ = self.repository.list_scores(
                engagement_id=engagement_id,
                search=search,
                score_min=score_min,
                score_max=score_max,
                source=source,
                date_from=date_from,
                date_to=date_to,
                sort=sort,
                direction=direction,
                page=1,
                page_size=500,
            )
            visible = [item for item in all_items if item.account_id in allowed]
            start = (page - 1) * page_size
            page_items = visible[start : start + page_size]
            return CsatScorePageRead(items=[CsatScoreRead.model_validate(item) for item in page_items], total=len(visible), page=page, page_size=page_size, pages=page_count(len(visible), page_size))
        items, total = self.repository.list_scores(
            account_id=account_id,
            engagement_id=engagement_id,
            search=search,
            score_min=score_min,
            score_max=score_max,
            source=source,
            date_from=date_from,
            date_to=date_to,
            sort=sort,
            direction=direction,
            page=page,
            page_size=page_size,
        )
        return CsatScorePageRead(items=[CsatScoreRead.model_validate(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def get_score(self, score_id: str, current_user: User) -> CsatScoreRead:
        score = self._score_or_404(score_id)
        account = self._account_or_404(score.account_id)
        self.access.require_account_view(current_user, account, module=CSAT_MODULE)
        return CsatScoreRead.model_validate(score)

    def create_score(self, payload: CsatScoreCreateRequest, current_user: User) -> CsatScoreRead:
        self.access.require_module_permission(current_user, CSAT_MODULE, "create")
        account = self._account_or_404(payload.account_id)
        self.access.require_account_update(current_user, account, module=CSAT_MODULE)
        self._validate_engagement(account, payload.engagement_id)
        source_id = payload.source_id or f"manual-{uuid4()}"
        if self.repository.get_by_source(payload.source_label, source_id):
            raise field_validation_error("source_id", "A CSAT score with this source already exists.")
        category_scores = self._resolve_category_scores(payload.category_scores_json, payload.score)
        category_weights = self._resolve_category_weights(payload.category_weights_json)
        weighted_score = self._weighted_category_score(category_scores, category_weights)
        normalized = self._normalized(weighted_score, 1, 5)
        previous = self._previous_score(account.id, payload.engagement_id)
        recorded_at = payload.source_recorded_at or utc_now()
        score = CsatScore(
            account_id=account.id,
            engagement_id=payload.engagement_id,
            customer_name=payload.customer_name,
            customer_email=str(payload.customer_email) if payload.customer_email else None,
            score=weighted_score,
            scale_min=1,
            scale_max=5,
            normalized_score=normalized,
            category_scores_json=category_scores,
            category_weights_json=category_weights,
            weighted_score=weighted_score,
            feedback=payload.feedback,
            source_label=payload.source_label,
            source_id=source_id,
            source_link=payload.source_link,
            source_recorded_at=recorded_at,
            freshness_status=self._freshness(recorded_at),
            score_impact_json=self._score_impact(normalized),
            trend_json=self._trend(previous, normalized),
            created_by_id=current_user.id,
            created_by_name=current_user.full_name,
            updated_by_id=current_user.id,
        )
        self.repository.save_score(score)
        self._attach_timeline_and_snapshot(score, current_user)
        self.audit.log(module=CSAT_MODULE, action="create_csat_score", entity_type="csat_score", entity_id=score.id, actor=current_user, after_value=CsatScoreRead.model_validate(score).model_dump(mode="json"))
        self.repository.commit()
        return CsatScoreRead.model_validate(score)

    def update_score(self, score_id: str, payload: CsatScoreUpdateRequest, current_user: User) -> CsatScoreRead:
        score = self._score_or_404(score_id)
        account = self._account_or_404(score.account_id)
        self.access.require_account_update(current_user, account, module=CSAT_MODULE)
        before = CsatScoreRead.model_validate(score).model_dump(mode="json")
        updates = payload.model_dump(exclude_unset=True)
        target_category_scores = updates.get("category_scores_json", score.category_scores_json or {})
        target_score = updates.get("score", score.score)
        target_category_scores = self._resolve_category_scores(target_category_scores, target_score)
        target_category_weights = self._resolve_category_weights(updates.get("category_weights_json", score.category_weights_json or {}))
        weighted_score = self._weighted_category_score(target_category_scores, target_category_weights)
        if "engagement_id" in updates:
            self._validate_engagement(account, updates["engagement_id"])
        if "source_id" in updates or "source_label" in updates:
            next_source_label = updates.get("source_label", score.source_label)
            next_source_id = updates.get("source_id", score.source_id)
            existing = self.repository.get_by_source(next_source_label, next_source_id)
            if existing and existing.id != score.id:
                raise field_validation_error("source_id", "A CSAT score with this source already exists.")
        for field, value in updates.items():
            if field == "customer_email" and value is not None:
                value = str(value)
            setattr(score, field, value)
        score.category_scores_json = target_category_scores
        score.category_weights_json = target_category_weights
        score.weighted_score = weighted_score
        score.score = weighted_score
        score.scale_min = 1
        score.scale_max = 5
        score.normalized_score = self._normalized(weighted_score, 1, 5)
        score.freshness_status = self._freshness(score.source_recorded_at)
        score.score_impact_json = self._score_impact(score.normalized_score)
        score.trend_json = self._trend(self._previous_score(score.account_id, score.engagement_id, exclude_id=score.id), score.normalized_score)
        score.updated_by_id = current_user.id
        self._attach_timeline_and_snapshot(score, current_user)
        self.audit.log(module=CSAT_MODULE, action="update_csat_score", entity_type="csat_score", entity_id=score.id, actor=current_user, before_value=before, after_value=CsatScoreRead.model_validate(score).model_dump(mode="json"))
        self.repository.commit()
        return CsatScoreRead.model_validate(score)

    def map_score(self, score_id: str, payload: IntegrationItemMapRequest, current_user: User) -> CsatScoreRead:
        score = self._score_or_404(score_id)
        current_account = self._account_or_404(score.account_id)
        target_account = self._account_or_404(payload.account_id)
        self.access.require_account_update(current_user, current_account, module=CSAT_MODULE)
        self.access.require_account_update(current_user, target_account, module=CSAT_MODULE)
        self._validate_engagement(target_account, payload.engagement_id)
        before = CsatScoreRead.model_validate(score).model_dump(mode="json")
        score.account_id = target_account.id
        score.engagement_id = payload.engagement_id
        score.trend_json = self._trend(self._previous_score(score.account_id, score.engagement_id, exclude_id=score.id), score.normalized_score)
        score.updated_by_id = current_user.id
        self._attach_timeline_and_snapshot(score, current_user)
        self.audit.log(
            module=CSAT_MODULE,
            action="map_csat_score",
            entity_type="csat_score",
            entity_id=score.id,
            actor=current_user,
            before_value=before,
            after_value={**CsatScoreRead.model_validate(score).model_dump(mode="json"), "mapping_target_event_type": payload.target_event_type},
        )
        self.repository.commit()
        return CsatScoreRead.model_validate(score)

    def _attach_timeline_and_snapshot(self, score: CsatScore, actor: User) -> None:
        account = self._account_or_404(score.account_id)
        timeline = self.timeline.add_account_event(
            account_id=account.id,
            engagement_id=score.engagement_id,
            event_type="score_change",
            module="scoring",
            title=f"CSAT score recorded: {score.weighted_score:g}/5",
            description=score.feedback or f"Weighted CSAT score {score.weighted_score:g}/5 captured from {score.source_label}.",
            actor=actor,
            source_record_id=score.id,
            source_record_type="csat_score",
            source_record_route=f"/health-scores?csat={score.id}",
            metadata={"source_label": score.source_label, "source_id": score.source_id, "normalized_score": score.normalized_score, "weighted_score": score.weighted_score, "category_scores": score.category_scores_json},
            idempotency_key=f"csat:{score.id}:{score.normalized_score}:{score.updated_at.isoformat() if score.updated_at else utc_now().isoformat()}",
        )
        score.timeline_entry_id = timeline.id
        snapshot = ScoreSnapshot(
            account_id=score.account_id,
            engagement_id=score.engagement_id,
            scope="engagement" if score.engagement_id else "account",
            overall=score.normalized_score,
            rag_status=self._rag(score.normalized_score),
            drivers=[
                {
                    "metric": "csat",
                    "score": score.normalized_score,
                    "raw_score": score.weighted_score,
                    "scale": "1-5",
                    "source": score.source_label,
                    "category_scores": score.category_scores_json,
                    "category_weights": score.category_weights_json,
                }
            ],
            reason_codes=["manual_csat_score"],
            metric_version="csat-manual-v1",
            freshness_status=score.freshness_status,
            is_dirty=False,
            trend=int(score.trend_json.get("delta", 0)),
            status="complete",
            source_context={"csat_score_id": score.id, "source_label": score.source_label, "source_id": score.source_id, "category_scores": score.category_scores_json, "category_weights": score.category_weights_json, "weighted_score": score.weighted_score},
            calculated_by_id=actor.id,
            calculated_by_name=actor.full_name,
        )
        self.db.add(snapshot)
        self.db.flush()
        score.scoring_snapshot_id = snapshot.id

    def _previous_score(self, account_id: str, engagement_id: str | None, exclude_id: str | None = None) -> CsatScore | None:
        items, _ = self.repository.list_scores(account_id=account_id, engagement_id=engagement_id, page=1, page_size=10)
        for item in items:
            if item.id != exclude_id:
                return item
        return None

    def _score_or_404(self, score_id: str) -> CsatScore:
        score = self.repository.get_score(score_id)
        if score is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CSAT score was not found")
        return score

    def _account_or_404(self, account_id: str):
        account = self.accounts.get_by_id(account_id)
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account was not found")
        return account

    @staticmethod
    def _validate_engagement(account, engagement_id: str | None) -> None:
        if engagement_id and not any(engagement.id == engagement_id for engagement in account.engagements):
            raise field_validation_error("engagement_id", "Engagement does not belong to the selected account.")

    @staticmethod
    def _normalized(score: float, scale_min: int, scale_max: int) -> int:
        if scale_min >= scale_max:
            raise field_validation_error("scale_min", "CSAT score scale minimum must be less than maximum.")
        return max(0, min(100, round(((score - scale_min) / (scale_max - scale_min)) * 100)))

    @staticmethod
    def _resolve_category_scores(category_scores: dict | None, legacy_score: float | None) -> dict[str, float]:
        if category_scores:
            return {key: round(float(category_scores[key]), 2) for key in CSAT_CATEGORY_KEYS}
        if legacy_score is None:
            raise field_validation_error("category_scores_json", "CSAT category scores are required.")
        legacy = round(float(legacy_score), 2)
        if legacy < 1 or legacy > 5:
            raise field_validation_error("score", "Legacy CSAT score must be between 1 and 5.")
        return {key: legacy for key in CSAT_CATEGORY_KEYS}

    @staticmethod
    def _resolve_category_weights(category_weights: dict | None) -> dict[str, float]:
        weights = dict(CSAT_CATEGORY_WEIGHTS)
        if category_weights:
            weights.update({key: float(value) for key, value in category_weights.items() if key in CSAT_CATEGORY_KEYS})
        total = sum(weights.values())
        if total <= 0:
            raise field_validation_error("category_weights_json", "CSAT category weights must total more than zero.")
        return {key: round((float(weights[key]) / total) * 100, 2) for key in CSAT_CATEGORY_KEYS}

    @staticmethod
    def _weighted_category_score(category_scores: dict[str, float], category_weights: dict[str, float]) -> float:
        weighted = sum(float(category_scores[key]) * (float(category_weights[key]) / 100) for key in CSAT_CATEGORY_KEYS)
        return round(weighted, 2)

    @staticmethod
    def _freshness(recorded_at: datetime) -> str:
        return "stale" if recorded_at < utc_now() - timedelta(days=CSAT_FRESHNESS_DAYS) else "fresh"

    @staticmethod
    def _rag(normalized: int) -> str:
        if normalized >= 75:
            return "green"
        if normalized >= 50:
            return "amber"
        return "red"

    @staticmethod
    def _score_impact(normalized: int) -> dict:
        return {"normalized_score": normalized, "rag_status": CsatService._rag(normalized), "metric": "csat"}

    @staticmethod
    def _trend(previous: CsatScore | None, normalized: int) -> dict:
        if previous is None:
            return {"direction": "flat", "delta": 0, "previous_score": None}
        delta = normalized - previous.normalized_score
        direction = "up" if delta > 0 else "down" if delta < 0 else "flat"
        return {"direction": direction, "delta": delta, "previous_score": previous.normalized_score}
