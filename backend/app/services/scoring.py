import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Account,
    AccountHealthRollup,
    CsatScore,
    Engagement,
    EngagementHealthSnapshot,
    Escalation,
    KycSnapshot,
    ManualScoreSubmission,
    Opportunity,
    ScoreSnapshot,
    ScoringJob,
    ScoringMetricDefinition,
    ScoringMetricVersion,
    User,
)
from app.repositories.accounts import AccountRepository
from app.repositories.audit import AuditRepository
from app.repositories.engagements import EngagementRepository
from app.repositories.rbac import RbacRepository
from app.repositories.scoring import ScoringRepository
from app.repositories.timeline import TimelineRepository
from app.schemas import (
    ManualScoreSubmissionRequest,
    MetricValidationRead,
    ScoreRead,
    ScoreRecalculateRequest,
    ScoreSnapshotPageRead,
    ScoreSnapshotRead,
    ScoringJobCreateRequest,
    ScoringJobRead,
    ScoringMetricCreateRequest,
    ScoringMetricPageRead,
    ScoringMetricRead,
    ScoringMetricUpdateRequest,
    ScoringMetricVersionPageRead,
    ScoringMetricVersionRead,
)
from app.services.account_access import AccountAccessService
from app.services.audit import AuditService
from app.services.timeline import TimelineService
from app.services.user_management import page_count

logger = logging.getLogger(__name__)

SCORING_MODULE = "scoring_engine"
DEFAULT_METRIC_VERSION = "technical-logic-scoring-v1"
ACCOUNT_SCORING_CATEGORY_WEIGHTS = {
    "relationship_score": 20,
    "resource_score": 15,
    "service_line_score": 15,
    "contract_health_score": 20,
    "account_risk_score": 15,
    "csat_score": 15,
}

ACCOUNT_SCORING_METRIC_ALIASES = {
    "relationship_score": {"relationship_score"},
    "resource_score": {"resource_score", "resource_health"},
    "service_line_score": {"service_line_score", "service_lines_score"},
    "contract_health_score": {"contract_health_score", "contract_health"},
    "account_risk_score": {"account_risk_score", "risk_score"},
    "csat_score": {"csat_score", "customer_satisfaction"},
}

RELATIONSHIP_CRITERIA_WEIGHTS = {
    "relationship_ceo": 20,
    "relationship_kam": 30,
    "relationship_delivery": 25,
    "relationship_finance": 5,
    "relationship_in_person": 20,
}
RESOURCE_CRITERIA_WEIGHTS = {
    "resource_key_resources": 50,
    "resource_alignment": 25,
    "resource_backup": 25,
}
CONTRACT_CRITERIA_WEIGHTS = {
    "contract_length": 40,
    "contract_notice_period": 30,
    "contract_renewal_terms": 30,
}
ACCOUNT_RISK_CRITERIA_WEIGHTS = {
    "risk_competitors": 30,
    "risk_leadership_tenure": 15,
    "risk_funding_revenue": 15,
    "risk_payment_behavior": 15,
    "risk_roadmap_alignment": 20,
    "risk_geopolitical": 5,
}


def field_error(field: str, message: str, status_code: int = status.HTTP_422_UNPROCESSABLE_ENTITY) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"message": "Validation failed", "errors": [{"field": field, "message": message}]})


def clamp_percent(value: float | int) -> int:
    return max(0, min(100, int(round(float(value)))))


class ScoringService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = ScoringRepository(db)
        self.accounts = AccountRepository(db)
        self.engagements = EngagementRepository(db)
        self.access = AccountAccessService(self.accounts, RbacRepository(db))
        self.audit = AuditService(AuditRepository(db))
        self.timeline = TimelineService(TimelineRepository(db))

    def list_metrics(
        self,
        current_user: User,
        *,
        search: str | None = None,
        scope: str | None = None,
        status_filter: str | None = None,
        active_state: str = "active",
        sort: str = "updated_at",
        direction: str = "desc",
        page: int = 1,
        page_size: int = 10,
    ) -> ScoringMetricPageRead:
        self.access.require_module_permission(current_user, SCORING_MODULE, "view")
        items, total = self.repository.list_metrics(
            search=search,
            scope=scope,
            status_filter=status_filter,
            active_state=active_state,
            sort=sort,
            direction=direction,
            page=page,
            page_size=page_size,
        )
        return ScoringMetricPageRead(items=items, total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def create_metric(self, payload: ScoringMetricCreateRequest, current_user: User) -> ScoringMetricRead:
        self.access.require_module_permission(current_user, SCORING_MODULE, "configure")
        if self.repository.get_metric_by_slug(payload.slug):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Metric slug already exists")
        validation = self.validate_metric_payload(payload.model_dump())
        if not validation.valid:
            raise field_error("formula", "; ".join(validation.errors))
        metric = ScoringMetricDefinition(
            slug=payload.slug,
            name=payload.name,
            description=payload.description,
            scope=payload.scope,
            weight=payload.weight,
            thresholds=payload.thresholds,
            formula=payload.formula,
            freshness_rule=payload.freshness_rule,
            owner_role=payload.owner_role,
            source=payload.source,
            effective_date=payload.effective_date,
            status=payload.status,
            is_active=payload.is_active,
            created_by_id=current_user.id,
            updated_by_id=current_user.id,
        )
        self.repository.save_metric(metric)
        self.audit.log(module=SCORING_MODULE, action="create", entity_type="scoring_metric", entity_id=metric.id, actor=current_user, after_value=self._metric_snapshot(metric))
        self.repository.commit()
        return ScoringMetricRead.model_validate(metric)

    def update_metric(self, metric_id: str, payload: ScoringMetricUpdateRequest, current_user: User) -> ScoringMetricRead:
        self.access.require_module_permission(current_user, SCORING_MODULE, "configure")
        metric = self._get_metric_or_404(metric_id)
        before = self._metric_snapshot(metric)
        updates = payload.model_dump(exclude_unset=True)
        for field, value in updates.items():
            setattr(metric, field, value)
        metric.updated_by_id = current_user.id
        validation = self.validate_metric_payload(self._metric_snapshot(metric))
        if not validation.valid:
            raise field_error("formula", "; ".join(validation.errors))
        self.audit.log(module=SCORING_MODULE, action="update", entity_type="scoring_metric", entity_id=metric.id, actor=current_user, before_value=before, after_value=self._metric_snapshot(metric))
        self.repository.commit()
        return ScoringMetricRead.model_validate(metric)

    def validate_metric(self, metric_id: str, current_user: User) -> MetricValidationRead:
        self.access.require_module_permission(current_user, SCORING_MODULE, "view")
        metric = self._get_metric_or_404(metric_id)
        return self.validate_metric_payload(self._metric_snapshot(metric))

    def validate_metric_payload(self, payload: dict[str, Any]) -> MetricValidationRead:
        errors: list[str] = []
        warnings: list[str] = []
        thresholds = payload.get("thresholds") or {}
        formula = payload.get("formula") or {}
        weight = payload.get("weight", 0)
        if weight < 0 or weight > 100:
            errors.append("Metric weight must be between 0 and 100.")
        if thresholds:
            try:
                red_max = int(thresholds.get("red_max", 59))
                amber_min = int(thresholds.get("amber_min", 60))
                green_min = int(thresholds.get("green_min", 75))
            except (TypeError, ValueError):
                errors.append("Threshold values must be numeric.")
            else:
                if not (0 <= red_max < amber_min < green_min <= 100):
                    errors.append("Thresholds must follow red_max < amber_min < green_min within 0-100.")
        else:
            warnings.append("No thresholds configured; default red/amber/green thresholds will be used.")

        unsafe_tokens = ("__", "import", "eval", "exec", "subprocess", "os.", "sys.", "open(")
        formula_text = str(formula)
        if any(token in formula_text for token in unsafe_tokens):
            errors.append("Formula contains unsupported or unsafe tokens.")
        allowed_ops = {"weighted_average", "average", "avg", "sum", "min", "max", "subtract", "add", "+", "-", "*", "/", "clamp", "coalesce", "field", "constant"}
        for op in self._formula_ops(formula):
            if op not in allowed_ops:
                errors.append(f"Formula operation '{op}' is not supported.")
        return MetricValidationRead(valid=not errors, errors=errors, warnings=warnings)

    def publish_metric(self, metric_id: str, current_user: User) -> ScoringMetricVersionRead:
        self.access.require_module_permission(current_user, SCORING_MODULE, "configure")
        metric = self._get_metric_or_404(metric_id)
        validation = self.validate_metric_payload(self._metric_snapshot(metric))
        if not validation.valid:
            raise field_error("formula", "; ".join(validation.errors))
        before = self._metric_snapshot(metric)
        metric.current_version += 1
        metric.status = "published"
        metric.updated_by_id = current_user.id
        version = ScoringMetricVersion(
            metric_id=metric.id,
            version=metric.current_version,
            config_json=self._metric_snapshot(metric),
            published_by_id=current_user.id,
            published_by_name=current_user.full_name,
        )
        self.repository.add_metric_version(version)
        self.audit.log(module=SCORING_MODULE, action="publish", entity_type="scoring_metric", entity_id=metric.id, actor=current_user, before_value=before, after_value=self._metric_snapshot(metric))
        self.repository.commit()
        return ScoringMetricVersionRead.model_validate(version)

    def list_metric_versions(self, metric_id: str, current_user: User, page: int = 1, page_size: int = 10) -> ScoringMetricVersionPageRead:
        self.access.require_module_permission(current_user, SCORING_MODULE, "view")
        self._get_metric_or_404(metric_id)
        items, total = self.repository.list_metric_versions(metric_id, page, page_size)
        return ScoringMetricVersionPageRead(items=[ScoringMetricVersionRead.model_validate(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def get_account_score(self, account_id: str, current_user: User) -> ScoreRead:
        account = self._get_account_or_404(account_id)
        self.access.require_account_view(current_user, account, module=SCORING_MODULE)
        latest = self.repository.latest_score_snapshot(account_id=account.id, scope="account")
        return self._score_read_from_snapshot_or_account(account, latest)

    def recalculate_account_score(self, account_id: str, payload: ScoreRecalculateRequest, current_user: User) -> ScoreRead:
        account = self._get_account_or_404(account_id)
        self.access.require_account_update(current_user, account, module=SCORING_MODULE)
        job = self._start_job("manual", "account", payload.trigger_source, current_user, account_id=account.id)
        try:
            manual_submission = self._create_manual_submission(account.id, None, "account", payload.manual_submission, current_user)
            snapshot = self._calculate_account_snapshot(account, current_user, job=job, manual_submission=manual_submission)
            job.status = "complete"
            job.completed_at = datetime.now(timezone.utc)
            job.result_json = {"snapshot_id": snapshot.id, "overall": snapshot.overall, "rag_status": snapshot.rag_status}
            self.audit.log(module=SCORING_MODULE, action="recalculate", entity_type="account_score", entity_id=snapshot.id, actor=current_user, after_value=self._score_snapshot(snapshot))
            self.timeline.add_account_event(
                account_id=account.id,
                title="Account score recalculated",
                description=f"{account.name} health score recalculated to {snapshot.overall} ({snapshot.rag_status}).",
                actor=current_user,
                event_type="score_recalculated",
                module=SCORING_MODULE,
                source_record_id=snapshot.id,
                source_record_type="score_snapshot",
                source_record_route=f"/accounts/{account.id}?tab=health",
                after_value=self._score_snapshot(snapshot),
            )
            if payload.include_signal_evaluation:
                from app.services.signals import SignalsService

                SignalsService(self.db).evaluate(current_user, account_id=account.id, trigger_source="score_recalculation", commit=False)
            self.repository.commit()
            self._evaluate_alerts_for_account(account.id)
            return self._score_read_from_snapshot_or_account(account, snapshot)
        except Exception as exc:
            logger.exception("Account score recalculation failed for account %s", account.id)
            job.status = "failed"
            job.error_message = str(exc)
            job.completed_at = datetime.now(timezone.utc)
            self.repository.commit()
            if isinstance(exc, HTTPException):
                raise
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Score recalculation failed") from exc

    def list_account_snapshots(
        self,
        account_id: str,
        current_user: User,
        *,
        scope: str | None = None,
        engagement_id: str | None = None,
        rag_status: str | None = None,
        status_filter: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        sort: str = "calculated_at",
        direction: str = "desc",
        page: int = 1,
        page_size: int = 10,
    ) -> ScoreSnapshotPageRead:
        account = self._get_account_or_404(account_id)
        self.access.require_account_view(current_user, account, module=SCORING_MODULE)
        items, total = self.repository.list_score_snapshots(
            account_id=account.id,
            scope=scope,
            engagement_id=engagement_id,
            rag_status=rag_status,
            status_filter=status_filter,
            date_from=date_from,
            date_to=date_to,
            sort=sort,
            direction=direction,
            page=page,
            page_size=page_size,
        )
        return ScoreSnapshotPageRead(items=items, total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def get_engagement_score(self, engagement_id: str, current_user: User) -> ScoreRead:
        engagement = self._get_engagement_or_404(engagement_id)
        account = self._get_account_or_404(engagement.account_id)
        self.access.require_account_view(current_user, account, module=SCORING_MODULE)
        latest = self.repository.latest_score_snapshot(account_id=account.id, engagement_id=engagement.id, scope="engagement")
        return self._score_read_from_snapshot_or_engagement(account, engagement, latest)

    def recalculate_engagement_score(self, engagement_id: str, payload: ScoreRecalculateRequest, current_user: User) -> ScoreRead:
        engagement = self._get_engagement_or_404(engagement_id)
        account = self._get_account_or_404(engagement.account_id)
        self.access.require_account_update(current_user, account, module=SCORING_MODULE)
        job = self._start_job("manual", "engagement", payload.trigger_source, current_user, account_id=account.id, engagement_id=engagement.id)
        try:
            manual_submission = self._create_manual_submission(account.id, engagement.id, "engagement", payload.manual_submission, current_user)
            snapshot = self._calculate_engagement_snapshot(account, engagement, current_user, job=job, manual_submission=manual_submission)
            job.status = "complete"
            job.completed_at = datetime.now(timezone.utc)
            job.result_json = {"snapshot_id": snapshot.id, "overall": snapshot.overall, "rag_status": snapshot.rag_status}
            self.audit.log(module=SCORING_MODULE, action="recalculate", entity_type="engagement_score", entity_id=snapshot.id, actor=current_user, after_value=self._score_snapshot(snapshot))
            self.timeline.add_engagement_event(
                account_id=account.id,
                engagement_id=engagement.id,
                event_type="score_recalculated",
                title="Engagement score recalculated",
                description=f"{engagement.name} score recalculated to {snapshot.overall} ({snapshot.rag_status}).",
                actor=current_user,
                source_record_id=snapshot.id,
                source_record_type="score_snapshot",
                source_record_route=f"/accounts/{account.id}/engagements/{engagement.id}",
                new_value=self._score_snapshot(snapshot),
            )
            if payload.include_signal_evaluation:
                from app.services.signals import SignalsService

                SignalsService(self.db).evaluate(current_user, account_id=account.id, engagement_id=engagement.id, trigger_source="score_recalculation", commit=False)
            self.repository.commit()
            return self._score_read_from_snapshot_or_engagement(account, engagement, snapshot)
        except Exception as exc:
            logger.exception("Engagement score recalculation failed for engagement %s", engagement.id)
            job.status = "failed"
            job.error_message = str(exc)
            job.completed_at = datetime.now(timezone.utc)
            self.repository.commit()
            if isinstance(exc, HTTPException):
                raise
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Engagement score recalculation failed") from exc

    def create_job(self, payload: ScoringJobCreateRequest, current_user: User) -> ScoringJobRead:
        self.access.require_module_permission(current_user, SCORING_MODULE, "update")
        job = self._start_job(payload.job_type, payload.scope, payload.trigger_source, current_user, account_id=payload.account_id, engagement_id=payload.engagement_id)
        try:
            if payload.scope == "account":
                if not payload.account_id:
                    raise field_error("account_id", "Account ID is required for account scoring jobs.")
                account = self._get_account_or_404(payload.account_id)
                self.access.require_account_update(current_user, account, module=SCORING_MODULE)
                snapshot = self._calculate_account_snapshot(account, current_user, job=job)
                job.result_json = {"snapshot_id": snapshot.id, "overall": snapshot.overall, "rag_status": snapshot.rag_status}
            elif payload.scope == "engagement":
                if not payload.engagement_id:
                    raise field_error("engagement_id", "Engagement ID is required for engagement scoring jobs.")
                engagement = self._get_engagement_or_404(payload.engagement_id)
                account = self._get_account_or_404(engagement.account_id)
                self.access.require_account_update(current_user, account, module=SCORING_MODULE)
                snapshot = self._calculate_engagement_snapshot(account, engagement, current_user, job=job)
                job.result_json = {"snapshot_id": snapshot.id, "overall": snapshot.overall, "rag_status": snapshot.rag_status}
            else:
                if not self.access.can_view_portfolio(current_user):
                    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Portfolio scoring jobs require portfolio access")
                account_ids = list(self.db.scalars(select(Account.id).where(Account.archived_at.is_(None))))
                completed = 0
                for account_id in account_ids:
                    account = self._get_account_or_404(account_id)
                    self._calculate_account_snapshot(account, current_user, job=job)
                    completed += 1
                job.result_json = {"accounts_scored": completed}
            job.status = "complete"
            job.completed_at = datetime.now(timezone.utc)
        except Exception as exc:
            logger.exception("Scoring job failed: %s", job.id)
            job.status = "failed"
            job.error_message = str(exc)
            job.completed_at = datetime.now(timezone.utc)
            self.repository.commit()
            if isinstance(exc, HTTPException):
                raise
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Scoring job failed") from exc
        self.repository.commit()
        return ScoringJobRead.model_validate(job)

    def _calculate_account_snapshot(
        self,
        account: Account,
        current_user: User,
        *,
        job: ScoringJob | None = None,
        manual_submission: ManualScoreSubmission | None = None,
    ) -> ScoreSnapshot:
        previous = self.repository.latest_score_snapshot(account_id=account.id, scope="account")
        active_engagements, _ = self.engagements.list_for_account(account_id=account.id, status_filter="active", page=1, page_size=1000)
        open_escalations = self._open_escalation_count(account.id)
        open_opportunities = self._open_opportunity_count(account.id)
        stale_kyc = self._is_kyc_stale(account.id)
        manual_values = manual_submission.values_json if manual_submission else {}
        metric_definitions = self._published_metrics("account")
        category_scores = self._technical_account_category_scores(account, active_engagements, manual_values, open_escalations, open_opportunities)
        drivers = self._technical_account_drivers(category_scores, metric_definitions)
        thresholds = self._thresholds_from_metrics(metric_definitions)
        kyc_penalty = 10 if stale_kyc else 0
        overall = clamp_percent(self._weighted_overall(drivers) - kyc_penalty)
        rag_status = self._rag_status(overall, thresholds)
        reason_codes = self._reason_codes(drivers, thresholds=thresholds, stale_kyc=stale_kyc, open_escalations=open_escalations)
        missing_categories = [key for key, item in category_scores.items() if item.get("missing")]
        for key in missing_categories:
            reason_codes.append({"code": f"{key}_missing", "label": f"{category_scores[key]['label']} source data is missing"})
        trend = overall - previous.overall if previous else 0
        snapshot = ScoreSnapshot(
            account_id=account.id,
            job_id=job.id if job else None,
            scope="account",
            overall=overall,
            rag_status=rag_status,
            drivers=drivers,
            reason_codes=reason_codes,
            metric_version=self._current_metric_version("account"),
            freshness_status="stale" if stale_kyc else "fresh",
            is_dirty=False,
            trend=trend,
            status="complete",
            source_context={
                "sources": ["technical_module_logic", "account_records", "engagements", "kyc_snapshots", "opportunities", "escalations", "csat_scores"],
                "engagement_count": len(active_engagements),
                "open_escalations": open_escalations,
                "open_opportunities": open_opportunities,
                "technical_logic_category_scores": category_scores,
                "delivery_score_active": False,
                "manual_submission_id": manual_submission.id if manual_submission else None,
                "published_metrics": [{"id": metric.id, "slug": metric.slug, "version": metric.current_version} for metric in metric_definitions],
            },
            calculated_by_id=current_user.id,
            calculated_by_name=current_user.full_name,
        )
        self.repository.add_score_snapshot(snapshot)
        account.health_overall = overall
        account.health_relationship = clamp_percent(category_scores["relationship_score"]["normalized_score"])
        account.health_usage = clamp_percent(category_scores["service_line_score"]["normalized_score"])
        account.health_delivery = clamp_percent(category_scores["resource_score"]["normalized_score"])
        account.health_commercial = clamp_percent((category_scores["contract_health_score"]["normalized_score"] + category_scores["account_risk_score"]["normalized_score"]) / 2)
        account.risk_status = self._legacy_risk_status(rag_status)
        self.db.add(
            AccountHealthRollup(
                account_id=account.id,
                overall=overall,
                rag_status=rag_status,
                contributions=[
                    {
                        "engagement_id": item.id,
                        "name": item.name,
                        "delivery_score_active": False,
                        "legacy_delivery_health": item.delivery_health,
                    }
                    for item in active_engagements
                ],
                metric_version=snapshot.metric_version,
            )
        )
        return snapshot

    def _calculate_engagement_snapshot(
        self,
        account: Account,
        engagement: Engagement,
        current_user: User,
        *,
        job: ScoringJob | None = None,
        manual_submission: ManualScoreSubmission | None = None,
    ) -> ScoreSnapshot:
        previous = self.repository.latest_score_snapshot(account_id=account.id, engagement_id=engagement.id, scope="engagement")
        score = engagement.delivery_health
        manual_values = manual_submission.values_json if manual_submission else {}
        if "delivery" in manual_values:
            score = self._manual_percent(manual_values["delivery"], "delivery")
        renewal_status = engagement.renewal_status
        penalty = 0
        if renewal_status in {"expired", "renewal_due", "notice_due"}:
            penalty = 8
        if engagement.delivery_status in {"blocked", "at_risk"}:
            penalty += 8
        metric_definitions = self._published_metrics("engagement")
        thresholds = self._thresholds_from_metrics(metric_definitions)
        drivers = self._drivers_from_metrics(
            metric_definitions,
            {
                "delivery_health": score,
                "delivery": score,
                "renewal_timing": 100 - penalty,
                "renewal_penalty": penalty,
                "adjusted_delivery_health": score - penalty,
            },
            default_drivers=[
                {"key": "delivery", "label": "Delivery health", "score": score, "weight": 70},
                {"key": "renewal", "label": "Renewal timing", "score": 100 - penalty, "weight": 30, "status": renewal_status},
            ],
        )
        overall = clamp_percent(self._weighted_overall(drivers) - penalty)
        rag_status = self._rag_status(overall, thresholds)
        reason_codes = self._reason_codes(drivers, thresholds=thresholds, stale_kyc=False, open_escalations=0)
        if renewal_status in {"expired", "renewal_due", "notice_due"}:
            reason_codes.append({"code": f"renewal_{renewal_status}", "label": "Renewal timing requires attention"})
        snapshot = ScoreSnapshot(
            account_id=account.id,
            engagement_id=engagement.id,
            job_id=job.id if job else None,
            scope="engagement",
            overall=overall,
            rag_status=rag_status,
            drivers=drivers,
            reason_codes=reason_codes,
            metric_version=self._current_metric_version("engagement"),
            freshness_status="fresh",
            is_dirty=False,
            trend=overall - previous.overall if previous else 0,
            status="complete",
            source_context={
                "sources": ["engagement_record"],
                "manual_submission_id": manual_submission.id if manual_submission else None,
                "published_metrics": [{"id": metric.id, "slug": metric.slug, "version": metric.current_version} for metric in metric_definitions],
            },
            calculated_by_id=current_user.id,
            calculated_by_name=current_user.full_name,
        )
        self.repository.add_score_snapshot(snapshot)
        engagement.delivery_health = overall
        engagement.health_status = self._engagement_health_status(rag_status)
        self.engagements.add_health_snapshot(
            EngagementHealthSnapshot(
                engagement_id=engagement.id,
                account_id=account.id,
                overall=overall,
                rag_status=rag_status,
                drivers=drivers,
                freshness_status="fresh",
                is_dirty=False,
                contribution=round(overall / 100, 2),
                metric_version=snapshot.metric_version,
                created_by_id=current_user.id,
                created_by_name=current_user.full_name,
            )
        )
        return snapshot

    def _technical_account_category_scores(
        self,
        account: Account,
        engagements: list[Engagement],
        manual_values: dict[str, Any],
        open_escalations: int,
        open_opportunities: int,
    ) -> dict[str, dict[str, Any]]:
        relationship_criteria = self._weighted_manual_criteria(manual_values, RELATIONSHIP_CRITERIA_WEIGHTS, 1, 3)
        relationship = self._manual_scaled_value(manual_values, ["relationship_score", "relationship"], 1, 3)
        if relationship is None:
            relationship = relationship_criteria[0] if relationship_criteria else self._percent_to_scale(account.health_relationship, 1, 3)

        resource_criteria = self._weighted_manual_criteria(manual_values, RESOURCE_CRITERIA_WEIGHTS, 1, 3)
        resource = self._manual_scaled_value(manual_values, ["resource_score", "resource", "delivery"], 1, 3)
        if resource is None:
            legacy_delivery = self._average([item.delivery_health for item in engagements]) if engagements else account.health_delivery
            resource = resource_criteria[0] if resource_criteria else self._percent_to_scale(legacy_delivery, 1, 3)

        service_line = self._manual_scaled_value(manual_values, ["service_line_score", "service_lines_score", "usage"], 1, 3)
        if service_line is None:
            service_line = self._service_line_score(manual_values, engagements, account)

        contract_criteria = self._weighted_manual_criteria(manual_values, CONTRACT_CRITERIA_WEIGHTS, 1, 3)
        contract_health = self._manual_scaled_value(manual_values, ["contract_health_score", "contract_score"], 1, 3)
        contract_missing = not engagements
        if contract_health is None:
            contract_health = contract_criteria[0] if contract_criteria else self._contract_health_score(engagements) if engagements else self._percent_to_scale(account.health_commercial, 1, 3)

        account_risk_criteria = self._weighted_manual_criteria(manual_values, ACCOUNT_RISK_CRITERIA_WEIGHTS, 1, 3)
        account_risk = self._manual_scaled_value(manual_values, ["account_risk_score", "risk_score", "commercial"], 1, 3)
        if account_risk is None:
            account_risk = account_risk_criteria[0] if account_risk_criteria else self._account_risk_score(account, open_escalations, open_opportunities)

        latest_csat = self._latest_csat_score(account.id)
        csat_missing = latest_csat is None
        csat = self._manual_scaled_value(manual_values, ["csat_score"], 1, 5)
        if csat is None:
            csat = float(latest_csat.weighted_score or latest_csat.score) if latest_csat else 3.0

        return {
            "relationship_score": self._category("Relationship Score", relationship, "1-3", 1, 3, {"source": "technical_logic_relationship_criteria" if relationship_criteria else "manual_or_account_health", "criteria": relationship_criteria[1] if relationship_criteria else []}),
            "resource_score": self._category("Resource Score", resource, "1-3", 1, 3, {"source": "technical_logic_resource_criteria" if resource_criteria else "manual_or_legacy_delivery", "criteria": resource_criteria[1] if resource_criteria else []}),
            "service_line_score": self._category("Service Line Score", service_line, "1-3", 1, 3, {"source": "manual_service_line_statuses" if manual_values.get("service_line_statuses") else "manual_or_engagement_service_lines"}),
            "contract_health_score": self._category("Contract Health Score", contract_health, "1-3", 1, 3, {"source": "technical_logic_contract_criteria" if contract_criteria else "manual_or_engagement_terms", "missing": contract_missing, "criteria": contract_criteria[1] if contract_criteria else []}),
            "account_risk_score": self._category("Account Risk Score", account_risk, "1-3", 1, 3, {"source": "technical_logic_risk_criteria" if account_risk_criteria else "manual_or_risk_signals", "open_escalations": open_escalations, "open_opportunities": open_opportunities, "criteria": account_risk_criteria[1] if account_risk_criteria else []}),
            "csat_score": self._category("CSAT Score", csat, "1-5", 1, 5, {"source": "manual_or_latest_csat", "missing": csat_missing, "csat_score_id": latest_csat.id if latest_csat else None}),
        }

    def _technical_account_drivers(self, category_scores: dict[str, dict[str, Any]], metrics: list[ScoringMetricDefinition] | None = None) -> list[dict[str, Any]]:
        drivers: list[dict[str, Any]] = []
        category_weights = self._category_weights(metrics or [])
        for key, item in category_scores.items():
            weight = category_weights[key]
            normalized = clamp_percent(item["normalized_score"])
            drivers.append(
                {
                    "key": key,
                    "label": item["label"],
                    "score": normalized,
                    "raw_score": item["raw_score"],
                    "scale": item["scale"],
                    "weight": weight,
                    "weighted_score": round(normalized * (weight / 100), 2),
                    "rag_status": self._rag_status(normalized, {"red_max": 49, "amber_min": 50, "green_min": 75}),
                    "source": item.get("source"),
                    "missing": bool(item.get("missing")),
                }
            )
        return self._normalize_driver_weights(drivers)

    def _category_weights(self, metrics: list[ScoringMetricDefinition]) -> dict[str, int]:
        weights = dict(ACCOUNT_SCORING_CATEGORY_WEIGHTS)
        for category_key, aliases in ACCOUNT_SCORING_METRIC_ALIASES.items():
            matched = [metric for metric in metrics if metric.slug in aliases]
            if matched:
                weights[category_key] = max(0, int(matched[-1].weight))
        return weights

    def _category(self, label: str, raw_score: float, scale: str, scale_min: int, scale_max: int, context: dict[str, Any]) -> dict[str, Any]:
        raw = round(max(scale_min, min(scale_max, float(raw_score))), 2)
        return {
            "label": label,
            "raw_score": raw,
            "scale": scale,
            "normalized_score": self._scale_to_percent(raw, scale_min, scale_max),
            **context,
        }

    def _contract_health_score(self, engagements: list[Engagement]) -> float:
        scores: list[float] = []
        now = datetime.now(timezone.utc)
        for engagement in engagements:
            length_score = 2.0
            if engagement.start_date and engagement.end_date:
                start = self._aware_datetime(engagement.start_date)
                end = self._aware_datetime(engagement.end_date)
                months = max((end - start).days / 30.44, 0)
                length_score = 3.0 if months >= 12 else 2.0 if months >= 6 else 1.0
            notice_score = 3.0 if engagement.auto_renewal else 2.0
            if engagement.notice_period_days is not None:
                notice_score = 3.0 if engagement.notice_period_days >= 60 else 2.0 if engagement.notice_period_days >= 30 else 1.0
            renewal_score = 2.0
            if engagement.end_date:
                days_to_end = (self._aware_datetime(engagement.end_date) - now).days
                renewal_score = 3.0 if days_to_end > 90 else 2.0 if days_to_end > 30 else 1.0
            scores.append(self._average([length_score, notice_score, renewal_score]))
        return self._average(scores) if scores else 2.0

    def _account_risk_score(self, account: Account, open_escalations: int, open_opportunities: int) -> float:
        risk_status_score = 3.0 if account.risk_status == "healthy" else 2.0 if account.risk_status == "warning" else 1.0
        commercial_score = self._percent_to_scale(account.health_commercial, 1, 3)
        raw = self._average([risk_status_score, commercial_score])
        if open_escalations >= 3:
            raw = min(raw, 1.0)
        elif open_escalations:
            raw = min(raw, 2.0)
        if open_opportunities:
            raw = min(3.0, raw + min(open_opportunities * 0.1, 0.3))
        return raw

    def _service_line_score(self, manual_values: dict[str, Any], engagements: list[Engagement], account: Account) -> float:
        statuses = manual_values.get("service_line_statuses")
        if isinstance(statuses, dict):
            evaluated = []
            for service_line, value in statuses.items():
                normalized = str(value).strip().lower()
                if normalized in {"yes", "true", "active", "covered", "1"}:
                    evaluated.append({"service_line": service_line, "status": "yes", "score": 3.0})
                elif normalized in {"no", "false", "missing", "0"}:
                    evaluated.append({"service_line": service_line, "status": "no", "score": 1.0})
                elif normalized in {"na", "n/a", "not_applicable", "not applicable"}:
                    continue
            if evaluated:
                return self._average([item["score"] for item in evaluated])
        service_lines = {str(line).strip().lower() for engagement in engagements for line in (engagement.service_lines or []) if str(line).strip()}
        if service_lines:
            return 3 if len(service_lines) >= 3 else 2.5 if len(service_lines) == 2 else 2
        return self._percent_to_scale(account.health_usage, 1, 3)

    def _weighted_manual_criteria(self, values: dict[str, Any], criteria_weights: dict[str, int], scale_min: int, scale_max: int) -> tuple[float, list[dict[str, Any]]] | None:
        weighted: list[tuple[float, int]] = []
        criteria: list[dict[str, Any]] = []
        for key, weight in criteria_weights.items():
            if key not in values:
                continue
            score = self._criterion_score(values[key], scale_min, scale_max)
            if score is None:
                continue
            weighted.append((score, weight))
            criteria.append({"key": key, "score": score, "weight": weight})
        total_weight = sum(weight for _, weight in weighted)
        if total_weight <= 0:
            return None
        score = round(sum(score * weight for score, weight in weighted) / total_weight, 2)
        return score, criteria

    def _criterion_score(self, value: Any, scale_min: int, scale_max: int) -> float | None:
        numeric = self._numeric_value(value)
        if numeric is not None:
            if numeric > scale_max and scale_max <= 5:
                return self._percent_to_scale(numeric, scale_min, scale_max)
            return max(scale_min, min(scale_max, numeric))
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"yes", "true", "strong", "high", "green", "covered", "healthy"}:
                return float(scale_max)
            if normalized in {"partial", "medium", "amber", "watch", "warning"}:
                return round((scale_min + scale_max) / 2, 2)
            if normalized in {"no", "false", "weak", "low", "red", "missing", "critical"}:
                return float(scale_min)
            if normalized in {"na", "n/a", "not_applicable", "not applicable"}:
                return None
        return None

    def _latest_csat_score(self, account_id: str) -> CsatScore | None:
        return self.db.scalar(
            select(CsatScore)
            .where(CsatScore.account_id == account_id)
            .order_by(CsatScore.source_recorded_at.desc(), CsatScore.created_at.desc())
            .limit(1)
        )

    def _manual_scaled_value(self, values: dict[str, Any], keys: list[str], scale_min: int, scale_max: int) -> float | None:
        for key in keys:
            if key not in values:
                continue
            value = self._numeric_value(values[key])
            if value is None:
                continue
            if value > scale_max and scale_max <= 5:
                return self._percent_to_scale(value, scale_min, scale_max)
            return max(scale_min, min(scale_max, value))
        return None

    def _manual_subscores(self, values: dict[str, Any], keys: list[str], scale_min: int, scale_max: int) -> list[float]:
        scores: list[float] = []
        for key in keys:
            value = self._manual_scaled_value(values, [key], scale_min, scale_max)
            if value is not None:
                scores.append(value)
        return scores

    @staticmethod
    def _numeric_value(value: Any) -> float | None:
        if isinstance(value, dict):
            value = value.get("value", value.get("score"))
        if isinstance(value, bool):
            return 3.0 if value else 1.0
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str) and value.strip():
            try:
                return float(value.strip())
            except ValueError:
                return None
        return None

    @staticmethod
    def _percent_to_scale(value: float | int, scale_min: int, scale_max: int) -> float:
        percent = max(0, min(100, float(value)))
        return round(scale_min + (percent / 100) * (scale_max - scale_min), 2)

    @staticmethod
    def _scale_to_percent(value: float, scale_min: int, scale_max: int) -> int:
        if scale_max <= scale_min:
            return 0
        return clamp_percent(((value - scale_min) / (scale_max - scale_min)) * 100)

    @staticmethod
    def _average(values: list[float | int]) -> float:
        numeric = [float(value) for value in values]
        return round(sum(numeric) / len(numeric), 2) if numeric else 0.0

    def _create_manual_submission(
        self,
        account_id: str,
        engagement_id: str | None,
        scope: str,
        payload: ManualScoreSubmissionRequest | None,
        current_user: User,
    ) -> ManualScoreSubmission | None:
        if payload is None:
            return None
        for key, value in payload.values.items():
            self._validate_manual_submission_value(value, key)
        submission = ManualScoreSubmission(
            account_id=account_id,
            engagement_id=engagement_id,
            scope=scope,
            calculator_id=payload.calculator_id,
            values_json=payload.values,
            evidence_json=payload.evidence,
            validation_status="validated",
            submitted_by_id=current_user.id,
            submitted_by_name=current_user.full_name,
        )
        self.repository.add_manual_submission(submission)
        return submission

    def _validate_manual_submission_value(self, value: Any, field: str) -> None:
        numeric = self._numeric_value(value)
        if numeric is None:
            return
        if numeric < 0 or numeric > 100:
            raise field_error(field, f"{field} score must be from 0 to 100.")

    def _start_job(self, job_type: str, scope: str, trigger_source: str, current_user: User, *, account_id: str | None = None, engagement_id: str | None = None) -> ScoringJob:
        job = ScoringJob(
            job_type=job_type,
            scope=scope,
            account_id=account_id,
            engagement_id=engagement_id,
            status="running",
            trigger_source=trigger_source,
            created_by_id=current_user.id,
            created_by_name=current_user.full_name,
            started_at=datetime.now(timezone.utc),
        )
        self.repository.add_job(job)
        return job

    def _open_escalation_count(self, account_id: str) -> int:
        return self.db.scalar(select(func.count(Escalation.id)).where(Escalation.account_id == account_id, Escalation.status.notin_(("resolved", "closed", "cancelled")))) or 0

    def _open_opportunity_count(self, account_id: str) -> int:
        return self.db.scalar(select(func.count(Opportunity.id)).where(Opportunity.account_id == account_id, Opportunity.archived_at.is_(None), Opportunity.stage.notin_(("Won", "Lost")))) or 0

    def _is_kyc_stale(self, account_id: str) -> bool:
        latest = self.db.scalar(select(KycSnapshot).where(KycSnapshot.account_id == account_id).order_by(KycSnapshot.approved_at.desc()).limit(1))
        if latest is None:
            return True
        if latest.freshness_status != "fresh":
            return True
        threshold = datetime.now(timezone.utc) - timedelta(days=90)
        approved_at = latest.approved_at
        if approved_at.tzinfo is None:
            approved_at = approved_at.replace(tzinfo=timezone.utc)
        return approved_at < threshold

    def _published_metrics(self, scope: str) -> list[ScoringMetricDefinition]:
        now = datetime.now(timezone.utc)
        metrics = list(
            self.db.scalars(
                select(ScoringMetricDefinition)
                .where(ScoringMetricDefinition.scope == scope, ScoringMetricDefinition.status == "published", ScoringMetricDefinition.is_active.is_(True))
                .order_by(ScoringMetricDefinition.name)
            )
        )
        return [metric for metric in metrics if metric.effective_date is None or self._aware_datetime(metric.effective_date) <= now]

    def _drivers_from_metrics(self, metrics: list[ScoringMetricDefinition], score_inputs: dict[str, Any], *, default_drivers: list[dict[str, Any]]) -> list[dict[str, Any]]:
        drivers: list[dict[str, Any]] = []
        for metric in metrics:
            value = self._evaluate_formula(metric.formula, score_inputs)
            if value is None:
                continue
            drivers.append(
                {
                    "key": metric.slug,
                    "label": metric.name,
                    "score": clamp_percent(value),
                    "weight": max(metric.weight, 0),
                    "metric_id": metric.id,
                    "metric_version": metric.current_version,
                    "source": metric.source,
                }
            )
        return self._normalize_driver_weights(drivers or default_drivers)

    def _normalize_driver_weights(self, drivers: list[dict[str, Any]]) -> list[dict[str, Any]]:
        total_weight = sum(float(driver.get("weight") or 0) for driver in drivers)
        if total_weight <= 0:
            total_weight = len(drivers) or 1
            for driver in drivers:
                driver["weight"] = 1
        normalized: list[dict[str, Any]] = []
        for driver in drivers:
            item = dict(driver)
            item["score"] = clamp_percent(item.get("score", 0))
            item["weight"] = round((float(item.get("weight") or 0) / total_weight) * 100, 2)
            normalized.append(item)
        return normalized

    def _weighted_overall(self, drivers: list[dict[str, Any]]) -> float:
        if not drivers:
            return 0
        return sum(float(driver.get("score") or 0) * (float(driver.get("weight") or 0) / 100) for driver in drivers)

    def _evaluate_formula(self, formula: Any, inputs: dict[str, Any]) -> float | None:
        if formula is None:
            return None
        if isinstance(formula, (int, float)):
            return float(formula)
        if isinstance(formula, str):
            value = inputs.get(formula)
            return float(value) if isinstance(value, (int, float)) else None
        if not isinstance(formula, dict):
            return None
        op = formula.get("op")
        if op == "field":
            value = inputs.get(str(formula.get("field", "")))
            return float(value) if isinstance(value, (int, float)) else None
        if op == "constant":
            value = formula.get("value")
            return float(value) if isinstance(value, (int, float)) else None
        if op == "coalesce":
            for value in self._formula_values(formula, inputs):
                if value is not None:
                    return value
            return None
        if op == "clamp":
            value = self._evaluate_formula(formula.get("value"), inputs)
            if value is None:
                values = self._formula_values(formula, inputs)
                value = values[0] if values else None
            if value is None:
                return None
            minimum = float(formula.get("min", 0))
            maximum = float(formula.get("max", 100))
            return max(minimum, min(maximum, value))
        if op == "weighted_average":
            weighted = []
            for item in formula.get("items", formula.get("values", [])):
                if not isinstance(item, dict):
                    continue
                value_formula = item.get("value", item.get("formula"))
                if value_formula is None:
                    value_formula = {key: value for key, value in item.items() if key != "weight"}
                value = self._evaluate_formula(value_formula, inputs)
                weight = item.get("weight", 1)
                if value is not None and isinstance(weight, (int, float)) and weight > 0:
                    weighted.append((value, float(weight)))
            total_weight = sum(weight for _, weight in weighted)
            if total_weight <= 0:
                return None
            return sum(value * weight for value, weight in weighted) / total_weight

        values = [value for value in self._formula_values(formula, inputs) if value is not None]
        if not values:
            return None
        if op in {"add", "+", "sum"}:
            return sum(values)
        if op in {"subtract", "-"}:
            return values[0] - sum(values[1:])
        if op == "*":
            result = 1.0
            for value in values:
                result *= value
            return result
        if op == "/":
            result = values[0]
            for value in values[1:]:
                if value == 0:
                    return None
                result /= value
            return result
        if op in {"average", "avg"}:
            return sum(values) / len(values)
        if op == "min":
            return min(values)
        if op == "max":
            return max(values)
        return None

    def _formula_values(self, formula: dict[str, Any], inputs: dict[str, Any]) -> list[float | None]:
        values = formula.get("values", formula.get("items", []))
        if not isinstance(values, list):
            values = [values]
        return [self._evaluate_formula(value, inputs) for value in values]

    def _thresholds_from_metrics(self, metrics: list[ScoringMetricDefinition]) -> dict[str, int]:
        defaults = {"red_max": 59, "amber_min": 60, "green_min": 75}
        for metric in metrics:
            thresholds = metric.thresholds or {}
            try:
                red_max = int(thresholds.get("red_max", defaults["red_max"]))
                amber_min = int(thresholds.get("amber_min", defaults["amber_min"]))
                green_min = int(thresholds.get("green_min", defaults["green_min"]))
            except (TypeError, ValueError):
                continue
            if 0 <= red_max < amber_min < green_min <= 100:
                return {"red_max": red_max, "amber_min": amber_min, "green_min": green_min}
        return defaults

    def _aware_datetime(self, value: datetime) -> datetime:
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)

    def _current_metric_version(self, scope: str) -> str:
        metric = self.db.scalar(
            select(ScoringMetricDefinition)
            .where(ScoringMetricDefinition.scope == scope, ScoringMetricDefinition.status == "published", ScoringMetricDefinition.is_active.is_(True))
            .order_by(ScoringMetricDefinition.current_version.desc())
            .limit(1)
        )
        if metric is None or metric.current_version <= 0:
            return DEFAULT_METRIC_VERSION
        return f"{scope}-scoring-v{metric.current_version}"

    def _rag_status(self, score: int, thresholds: dict[str, int] | None = None) -> str:
        thresholds = thresholds or {"red_max": 59, "amber_min": 60, "green_min": 75}
        if score >= int(thresholds.get("green_min", 75)):
            return "green"
        if score >= int(thresholds.get("amber_min", 60)):
            return "amber"
        return "red"

    def _legacy_risk_status(self, rag_status: str) -> str:
        return {"green": "healthy", "amber": "warning", "red": "critical"}.get(rag_status, "warning")

    def _engagement_health_status(self, rag_status: str) -> str:
        return {"green": "green", "amber": "amber", "red": "red"}.get(rag_status, "unknown")

    def _reason_codes(self, drivers: list[dict], *, thresholds: dict[str, int] | None = None, stale_kyc: bool, open_escalations: int) -> list[dict]:
        thresholds = thresholds or {"red_max": 59, "amber_min": 60, "green_min": 75}
        red_max = int(thresholds.get("red_max", 59))
        green_min = int(thresholds.get("green_min", 75))
        codes = []
        for driver in drivers:
            if int(driver.get("score", 0)) <= red_max:
                codes.append({"code": f"weak_{driver['key']}", "label": f"{driver['label']} is below red threshold"})
            elif int(driver.get("score", 0)) < green_min:
                codes.append({"code": f"watch_{driver['key']}", "label": f"{driver['label']} is in amber range"})
        if stale_kyc:
            codes.append({"code": "stale_kyc", "label": "Approved KYC snapshot is missing or stale"})
        if open_escalations:
            codes.append({"code": "open_escalations", "label": f"{open_escalations} open escalation(s)"})
        return codes

    def _manual_percent(self, value: Any, field: str) -> int:
        try:
            number = int(value)
        except (TypeError, ValueError) as exc:
            raise field_error(field, f"{field} score must be a number from 0 to 100.") from exc
        if number < 0 or number > 100:
            raise field_error(field, f"{field} score must be from 0 to 100.")
        return number

    def _score_read_from_snapshot_or_account(self, account: Account, snapshot: ScoreSnapshot | None) -> ScoreRead:
        if snapshot is not None:
            return ScoreRead(
                account_id=account.id,
                scope="account",
                overall=snapshot.overall,
                rag_status=snapshot.rag_status,
                drivers=snapshot.drivers,
                reason_codes=snapshot.reason_codes,
                metric_version=snapshot.metric_version,
                freshness_status=snapshot.freshness_status,
                is_dirty=snapshot.is_dirty,
                trend=snapshot.trend,
                status=snapshot.status,
                latest_snapshot=ScoreSnapshotRead.model_validate(snapshot),
            )
        return ScoreRead(
            account_id=account.id,
            scope="account",
            overall=account.health_overall,
            rag_status={"healthy": "green", "warning": "amber", "critical": "red"}.get(account.risk_status, "unknown"),
            drivers=[],
            reason_codes=[{"code": "no_scoring_snapshot", "label": "No scoring snapshot has been calculated yet"}],
            metric_version=DEFAULT_METRIC_VERSION,
            freshness_status="stale",
            is_dirty=True,
            trend=0,
            status="incomplete",
            latest_snapshot=None,
        )

    def _score_read_from_snapshot_or_engagement(self, account: Account, engagement: Engagement, snapshot: ScoreSnapshot | None) -> ScoreRead:
        if snapshot is not None:
            return ScoreRead(
                account_id=account.id,
                engagement_id=engagement.id,
                scope="engagement",
                overall=snapshot.overall,
                rag_status=snapshot.rag_status,
                drivers=snapshot.drivers,
                reason_codes=snapshot.reason_codes,
                metric_version=snapshot.metric_version,
                freshness_status=snapshot.freshness_status,
                is_dirty=snapshot.is_dirty,
                trend=snapshot.trend,
                status=snapshot.status,
                latest_snapshot=ScoreSnapshotRead.model_validate(snapshot),
            )
        return ScoreRead(
            account_id=account.id,
            engagement_id=engagement.id,
            scope="engagement",
            overall=engagement.delivery_health,
            rag_status=self._rag_status(engagement.delivery_health),
            drivers=[],
            reason_codes=[{"code": "no_scoring_snapshot", "label": "No scoring snapshot has been calculated yet"}],
            metric_version=DEFAULT_METRIC_VERSION,
            freshness_status="stale",
            is_dirty=True,
            trend=0,
            status="incomplete",
            latest_snapshot=None,
        )

    def _metric_snapshot(self, metric: ScoringMetricDefinition) -> dict:
        return {
            "id": metric.id,
            "slug": metric.slug,
            "name": metric.name,
            "description": metric.description,
            "scope": metric.scope,
            "weight": metric.weight,
            "thresholds": metric.thresholds,
            "formula": metric.formula,
            "freshness_rule": metric.freshness_rule,
            "owner_role": metric.owner_role,
            "source": metric.source,
            "effective_date": metric.effective_date.isoformat() if metric.effective_date else None,
            "status": metric.status,
            "is_active": metric.is_active,
            "current_version": metric.current_version,
        }

    def _score_snapshot(self, snapshot: ScoreSnapshot) -> dict:
        return {
            "id": snapshot.id,
            "account_id": snapshot.account_id,
            "engagement_id": snapshot.engagement_id,
            "scope": snapshot.scope,
            "overall": snapshot.overall,
            "rag_status": snapshot.rag_status,
            "drivers": snapshot.drivers,
            "reason_codes": snapshot.reason_codes,
            "metric_version": snapshot.metric_version,
            "freshness_status": snapshot.freshness_status,
            "trend": snapshot.trend,
        }

    def _evaluate_alerts_for_account(self, account_id: str) -> None:
        from app.services.alerts import AlertsService

        AlertsService(self.db).evaluate_for_account(account_id)

    def _formula_ops(self, formula: Any) -> set[str]:
        ops: set[str] = set()
        if isinstance(formula, dict):
            op = formula.get("op")
            if isinstance(op, str):
                ops.add(op)
            for value in formula.values():
                ops.update(self._formula_ops(value))
        if isinstance(formula, list):
            for value in formula:
                ops.update(self._formula_ops(value))
        return ops

    def _get_metric_or_404(self, metric_id: str) -> ScoringMetricDefinition:
        metric = self.repository.get_metric(metric_id)
        if metric is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Metric was not found")
        return metric

    def _get_account_or_404(self, account_id: str) -> Account:
        account = self.accounts.get_by_id(account_id)
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account was not found")
        return account

    def _get_engagement_or_404(self, engagement_id: str) -> Engagement:
        engagement = self.engagements.get_by_id(engagement_id)
        if engagement is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Engagement was not found")
        return engagement
