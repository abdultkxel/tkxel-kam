import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Account,
    AccountHealthRollup,
    Engagement,
    EngagementHealthSnapshot,
    Escalation,
    KycSnapshot,
    ManualScoreSubmission,
    MetricSnapshot,
    Opportunity,
    ScoreSnapshot,
    ScoringJob,
    ScoringMetricDefinition,
    ScoringMetricVersion,
    ServiceCatalogItem,
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
from app.services.account_access import AccountAccessService, GLOBAL_VIEW_ROLES
from app.services.audit import AuditService
from app.services.timeline import TimelineService
from app.services.user_management import page_count

logger = logging.getLogger(__name__)

SCORING_MODULE = "scoring_engine"
DEFAULT_METRIC_VERSION = "scoring-v1"

DEFAULT_ACCOUNT_THRESHOLDS = {"red_max": 59, "amber_min": 60, "green_min": 75}
RAW_RAG_THRESHOLDS = {"red_max": 49, "amber_min": 50, "green_min": 67}

ACCOUNT_HEALTH_CATEGORY_SPECS: dict[str, dict[str, Any]] = {
    "relationship_health": {
        "key": "relationship",
        "label": "Relationship Health",
        "scale": 3,
        "fallback": "health_relationship",
        "criteria": [
            {"key": "ceo", "label": "CEO Engagement", "weight": 20, "aliases": ["relationship.ceo"]},
            {"key": "kam", "label": "KAM Engagement", "weight": 30, "aliases": ["relationship.kam"]},
            {"key": "delivery", "label": "Delivery Leadership", "weight": 25, "aliases": ["relationship.delivery", "relationship.delivery_leadership"]},
            {"key": "finance", "label": "Finance Connection", "weight": 5, "aliases": ["relationship.finance"]},
            {"key": "inperson", "label": "In-Person Meeting", "weight": 20, "aliases": ["relationship.inperson", "relationship.in_person_meeting"]},
        ],
    },
    "resource_health": {
        "key": "resource",
        "label": "Resource Health",
        "scale": 3,
        "fallback": "health_delivery",
        "criteria": [
            {"key": "keyres", "label": "Number of Key Resources", "weight": 50, "aliases": ["resource.keyres", "resource.key_resources"]},
            {"key": "alignment", "label": "Key Resource Alignment", "weight": 25, "aliases": ["resource.alignment"]},
            {"key": "backup", "label": "Backup", "weight": 25, "aliases": ["resource.backup"]},
        ],
    },
    "service_line_health": {
        "key": "service_line",
        "label": "Service Line Score",
        "scale": 100,
        "formula_type": "ratio",
        "fallback": "health_usage",
        "criteria": [],
    },
    "contract_health": {
        "key": "contract",
        "label": "Contract Health",
        "scale": 3,
        "fallback": "health_commercial",
        "formula_type": "average",
        "criteria": [
            {"key": "length", "label": "Contract Length", "weight": 1, "aliases": ["contract.length"]},
            {"key": "notice", "label": "Notice Period", "weight": 1, "aliases": ["contract.notice"]},
            {"key": "renewal", "label": "Renewal Terms", "weight": 1, "aliases": ["contract.renewal"]},
        ],
    },
    "account_risk_health": {
        "key": "account_risk",
        "label": "Account Risk Score",
        "scale": 3,
        "fallback": "risk_status",
        "criteria": [
            {"key": "competitors", "label": "Competitors", "weight": 30, "aliases": ["account_risk.competitors", "risk.competitors"]},
            {"key": "leadership_tenure", "label": "Current Leadership Tenure", "weight": 15, "aliases": ["account_risk.leadership_tenure", "risk.leadership_tenure"]},
            {"key": "funding_revenue", "label": "Funding and Revenue Changes", "weight": 15, "aliases": ["account_risk.funding_revenue", "risk.funding_revenue"]},
            {"key": "payment_behavior", "label": "Payment Behavior", "weight": 15, "aliases": ["account_risk.payment_behavior", "risk.payment_behavior"]},
            {"key": "roadmap_alignment", "label": "Roadmap Alignment", "weight": 20, "aliases": ["account_risk.roadmap_alignment", "risk.roadmap_alignment"]},
            {"key": "geopolitical", "label": "Geopolitical Situation", "weight": 5, "aliases": ["account_risk.geopolitical", "risk.geopolitical"]},
        ],
    },
    "csat_health": {
        "key": "csat",
        "label": "CSAT Score",
        "scale": 5,
        "fallback": "health_usage",
        "criteria": [
            {"key": "delivery_ex", "label": "Delivery Excellence", "weight": 30, "aliases": ["csat.delivery_ex", "csat.delivery_excellence"]},
            {"key": "communication", "label": "Communication", "weight": 20, "aliases": ["csat.communication"]},
            {"key": "proactiveness", "label": "Proactiveness", "weight": 15, "aliases": ["csat.proactiveness"]},
            {"key": "trust", "label": "Trust", "weight": 20, "aliases": ["csat.trust"]},
            {"key": "value", "label": "Value for Money", "weight": 15, "aliases": ["csat.value", "csat.value_for_money"]},
        ],
    },
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
        source: str | None = None,
        owner_role: str | None = None,
        effective_from: datetime | None = None,
        effective_to: datetime | None = None,
        sort: str = "updated_at",
        direction: str = "desc",
        page: int = 1,
        page_size: int = 10,
    ) -> ScoringMetricPageRead:
        self.access.require_module_permission(current_user, SCORING_MODULE, "view")
        if not self.access.rbac.role_has_permission(current_user.role, SCORING_MODULE, "configure"):
            items = self._published_metric_views(
                search=search,
                scope=scope,
                source=source,
                owner_role=owner_role,
                effective_from=effective_from,
                effective_to=effective_to,
                sort=sort,
                direction=direction,
            )
            total = len(items)
            page_items = items[(page - 1) * page_size : page * page_size]
            return ScoringMetricPageRead(items=page_items, total=total, page=page, page_size=page_size, pages=page_count(total, page_size))
        items, total = self.repository.list_metrics(
            search=search,
            scope=scope,
            status_filter=status_filter,
            active_state=active_state,
            source=source,
            owner_role=owner_role,
            effective_from=effective_from,
            effective_to=effective_to,
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

    def _published_metric_views(
        self,
        *,
        search: str | None,
        scope: str | None,
        source: str | None,
        owner_role: str | None,
        effective_from: datetime | None,
        effective_to: datetime | None,
        sort: str,
        direction: str,
    ) -> list[ScoringMetricDefinition]:
        items = self._published_metrics(scope)
        if search and search.strip():
            term = search.strip().lower()
            items = [
                metric
                for metric in items
                if term in metric.name.lower()
                or term in metric.slug.lower()
                or (metric.description is not None and term in metric.description.lower())
            ]
        if source:
            items = [metric for metric in items if metric.source == source]
        if owner_role:
            items = [metric for metric in items if metric.owner_role == owner_role]
        effective_from_value = self._aware_datetime(effective_from) if effective_from else None
        effective_to_value = self._aware_datetime(effective_to) if effective_to else None
        if effective_from_value:
            items = [metric for metric in items if metric.effective_date is not None and self._aware_datetime(metric.effective_date) >= effective_from_value]
        if effective_to_value:
            items = [metric for metric in items if metric.effective_date is not None and self._aware_datetime(metric.effective_date) <= effective_to_value]

        def sort_value(metric: ScoringMetricDefinition) -> Any:
            value = {
                "name": metric.name,
                "scope": metric.scope,
                "status": metric.status,
                "weight": metric.weight,
                "effective_date": metric.effective_date,
                "updated_at": metric.updated_at,
                "created_at": metric.created_at,
            }.get(sort, metric.updated_at)
            if value is None:
                return datetime.min.replace(tzinfo=timezone.utc)
            if isinstance(value, datetime):
                return self._aware_datetime(value)
            return value

        return sorted(items, key=sort_value, reverse=direction == "desc")

    def update_metric(self, metric_id: str, payload: ScoringMetricUpdateRequest, current_user: User) -> ScoringMetricRead:
        self.access.require_module_permission(current_user, SCORING_MODULE, "configure")
        metric = self._get_metric_or_404(metric_id)
        before = self._metric_snapshot(metric)
        updates = payload.model_dump(exclude_unset=True)
        was_published = metric.status == "published" and metric.current_version > 0
        config_fields = {"name", "description", "scope", "weight", "thresholds", "formula", "freshness_rule", "owner_role", "source", "effective_date"}
        for field, value in updates.items():
            setattr(metric, field, value)
        if was_published and "status" not in updates and any(field in config_fields for field in updates):
            metric.status = "draft"
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
        if not isinstance(weight, (int, float)):
            errors.append("Metric weight must be numeric.")
        elif weight < 0 or weight > 100:
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
        allowed_ops = {
            "weighted_sum",
            "weighted_average",
            "average",
            "ratio",
            "composite_weighted_sum",
            "field",
            "constant",
        }
        for op in self._formula_ops(formula):
            if op not in allowed_ops:
                errors.append(f"Formula operation '{op}' is not supported.")
        self._validate_formula_shape(payload.get("slug"), formula, errors)
        self._validate_metric_dependencies(payload.get("slug"), formula, errors)
        freshness_rule = payload.get("freshness_rule") or {}
        if freshness_rule:
            stale_after_days = freshness_rule.get("stale_after_days")
            if stale_after_days is not None:
                try:
                    stale_number = int(stale_after_days)
                except (TypeError, ValueError):
                    errors.append("Freshness stale_after_days must be numeric.")
                else:
                    if stale_number <= 0 or stale_number > 3650:
                        errors.append("Freshness stale_after_days must be between 1 and 3650.")
        effective_date = payload.get("effective_date")
        if isinstance(effective_date, str):
            try:
                datetime.fromisoformat(effective_date.replace("Z", "+00:00"))
            except ValueError:
                errors.append("Effective date must be a valid ISO date/time.")
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
            return self._score_read_from_snapshot_or_account(account, snapshot)
        except Exception as exc:
            logger.exception("Account score recalculation failed for account %s", account.id)
            job.status = "failed"
            job.error_message = str(exc)
            job.completed_at = datetime.now(timezone.utc)
            self.repository.commit()
            if isinstance(exc, HTTPException):
                raise
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={"message": "Score recalculation failed", "job_id": job.id}) from exc

    def list_account_snapshots(
        self,
        account_id: str,
        current_user: User,
        *,
        scope: str | None = None,
        engagement_id: str | None = None,
        rag_status: str | None = None,
        status_filter: str | None = None,
        metric_slug: str | None = None,
        category: str | None = None,
        dirty: bool | None = None,
        freshness_status: str | None = None,
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
            metric_slug=metric_slug,
            category=category,
            dirty=dirty,
            freshness_status=freshness_status,
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
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={"message": "Engagement score recalculation failed", "job_id": job.id}) from exc

    def create_job(self, payload: ScoringJobCreateRequest, current_user: User) -> ScoringJobRead:
        self.access.require_module_permission(current_user, SCORING_MODULE, "configure")
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
                if current_user.role not in GLOBAL_VIEW_ROLES:
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
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={"message": "Scoring job failed", "job_id": job.id}) from exc
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
        active_engagements, _ = self.engagements.list_for_account(account_id=account.id, page=1, page_size=1000)
        open_escalations = self._open_escalation_count(account.id)
        open_opportunities = self._open_opportunity_count(account.id)
        stale_kyc = self._is_kyc_stale(account.id)
        manual_values = manual_submission.values_json if manual_submission else {}

        score_inputs: dict[str, Any] = {
            "health_relationship": account.health_relationship,
            "relationship": account.health_relationship,
            "health_usage": account.health_usage,
            "usage": account.health_usage,
            "usage_adoption": account.health_usage,
            "health_delivery": account.health_delivery,
            "delivery": account.health_delivery,
            "health_commercial": account.health_commercial,
            "commercial": account.health_commercial,
            "open_escalations": open_escalations,
            "open_opportunities": open_opportunities,
            "stale_kyc": 1 if stale_kyc else 0,
        }
        metric_definitions = self._published_metrics("account")
        category_metrics = [metric for metric in metric_definitions if metric.slug in ACCOUNT_HEALTH_CATEGORY_SPECS]
        if not category_metrics:
            return self._missing_metric_config_snapshot(account, current_user, previous=previous, job=job, scope="account")

        drivers: list[dict[str, Any]] = []
        metric_lines: list[dict[str, Any]] = []
        dirty_fields: list[str] = []
        for metric in category_metrics:
            result = self._account_category_result(metric, account, active_engagements, manual_values)
            drivers.append(result["driver"])
            metric_lines.extend(result["lines"])
            dirty_fields.extend(result["dirty_fields"])
            key = result["driver"]["key"]
            score_inputs[key] = result["driver"]["score"]
            score_inputs[metric.slug] = result["driver"]["score"]

        custom_metrics = [metric for metric in metric_definitions if metric.slug not in ACCOUNT_HEALTH_CATEGORY_SPECS]
        if custom_metrics:
            drivers.extend(self._drivers_from_metrics(custom_metrics, score_inputs, default_drivers=[]))
        drivers = self._normalize_driver_weights(drivers)
        thresholds = DEFAULT_ACCOUNT_THRESHOLDS
        overall = clamp_percent(self._weighted_overall(drivers))
        rag_status = self._rag_status(overall, thresholds)
        reason_codes = self._reason_codes(drivers, thresholds=thresholds, stale_kyc=stale_kyc, open_escalations=open_escalations)
        reason_codes.extend(self._criterion_reason_codes(metric_lines))
        for field in sorted(set(dirty_fields)):
            reason_codes.append({"code": f"missing_input_{field}", "label": f"{field.replace('_', ' ').replace('.', ' ')} is using fallback evidence"})
        trend = overall - previous.overall if previous else 0
        status_value = "incomplete" if dirty_fields else "complete"
        snapshot = ScoreSnapshot(
            account_id=account.id,
            job_id=job.id if job else None,
            scope="account",
            overall=overall,
            rag_status=rag_status,
            drivers=drivers,
            reason_codes=reason_codes,
            metric_version=self._current_metric_version("account"),
            freshness_status="stale" if stale_kyc or dirty_fields else "fresh",
            is_dirty=bool(dirty_fields),
            trend=trend,
            status=status_value,
            source_context={
                "sources": ["account_health_fields", "health_tab_inputs", "engagements", "service_catalog", "kyc_snapshots", "opportunities", "escalations"],
                "engagement_count": len(active_engagements),
                "open_escalations": open_escalations,
                "open_opportunities": open_opportunities,
                "dirty_fields": sorted(set(dirty_fields)),
                "manual_submission_id": manual_submission.id if manual_submission else None,
                "normalized_snapshot_storage": True,
                "category_framework": "account-health-pdf-v1",
                "published_metrics": [{"id": metric.id, "slug": metric.slug, "version": metric.current_version} for metric in metric_definitions],
            },
            calculated_by_id=current_user.id,
            calculated_by_name=current_user.full_name,
        )
        self.repository.add_score_snapshot(snapshot)
        line_models = [self._metric_snapshot_line(snapshot, line) for line in metric_lines]
        snapshot.metric_snapshots = line_models
        self.repository.add_metric_snapshots(line_models)
        score_by_key = {driver["key"]: clamp_percent(driver.get("score", 0)) for driver in drivers}
        account.health_overall = overall
        account.health_relationship = score_by_key.get("relationship", account.health_relationship)
        account.health_usage = score_by_key.get("csat", score_by_key.get("service_line", account.health_usage))
        account.health_delivery = score_by_key.get("resource", account.health_delivery)
        account.health_commercial = score_by_key.get("contract", account.health_commercial)
        account.risk_status = self._legacy_risk_status(rag_status)
        self.db.add(
            AccountHealthRollup(
                account_id=account.id,
                overall=overall,
                rag_status=rag_status,
                contributions=[
                    {"category": driver["key"], "name": driver["label"], "score": driver["score"], "weight": driver["weight"]}
                    for driver in drivers
                ],
                metric_version=snapshot.metric_version,
            )
        )
        return snapshot

    def _fallback_account_category_metrics(self) -> list[ScoringMetricDefinition]:
        weights = {
            "relationship_health": 17,
            "resource_health": 17,
            "service_line_health": 16,
            "contract_health": 17,
            "account_risk_health": 17,
            "csat_health": 16,
        }
        return [
            ScoringMetricDefinition(
                slug=slug,
                name=str(spec["label"]),
                description="Fallback account health category metric.",
                scope="account",
                weight=weights.get(slug, 1),
                thresholds=DEFAULT_ACCOUNT_THRESHOLDS,
                formula={"op": "weighted_sum", "scale": spec["scale"], "items": spec.get("criteria", [])},
                freshness_rule={"stale_after_days": 30},
                owner_role="kam_head",
                source="fallback",
                status="published",
                is_active=True,
                current_version=0,
            )
            for slug, spec in ACCOUNT_HEALTH_CATEGORY_SPECS.items()
        ]

    def _missing_metric_config_snapshot(
        self,
        account: Account,
        current_user: User,
        *,
        previous: ScoreSnapshot | None,
        job: ScoringJob | None,
        scope: str,
        engagement: Engagement | None = None,
    ) -> ScoreSnapshot:
        overall = engagement.delivery_health if engagement else account.health_overall
        rag_status = self._rag_status(overall)
        reason_codes = [
            {
                "code": "metric_config_missing",
                "label": f"No active published {scope} scoring metric configuration is available.",
            }
        ]
        snapshot = ScoreSnapshot(
            account_id=account.id,
            engagement_id=engagement.id if engagement else None,
            job_id=job.id if job else None,
            scope=scope,
            overall=overall,
            rag_status=rag_status,
            drivers=[],
            reason_codes=reason_codes,
            metric_version=DEFAULT_METRIC_VERSION,
            freshness_status="stale",
            is_dirty=True,
            trend=overall - previous.overall if previous else 0,
            status="incomplete",
            source_context={
                "sources": [],
                "missing_configuration": True,
                "message": "Score recalculation requires at least one active published metric.",
            },
            calculated_by_id=current_user.id,
            calculated_by_name=current_user.full_name,
        )
        self.repository.add_score_snapshot(snapshot)
        logger.warning("Created incomplete %s score snapshot for %s because no active published metrics exist", scope, account.id)
        return snapshot

    def _account_category_result(
        self,
        metric: ScoringMetricDefinition,
        account: Account,
        active_engagements: list[Engagement],
        manual_values: dict[str, Any],
    ) -> dict[str, Any]:
        spec = ACCOUNT_HEALTH_CATEGORY_SPECS[metric.slug]
        if spec.get("formula_type") == "ratio":
            return self._service_line_category_result(metric, spec, account, active_engagements, manual_values)

        category_key = str(spec["key"])
        scale = float(spec["scale"])
        criteria = self._criteria_for_metric(metric, spec)
        thresholds = metric.thresholds or DEFAULT_ACCOUNT_THRESHOLDS
        fallback_raw, fallback_source = self._category_fallback_raw(spec, account, active_engagements)
        dirty_fields: list[str] = []
        criterion_lines: list[dict[str, Any]] = []

        category_manual = self._category_manual_value(category_key, scale, manual_values)
        has_detailed_manual = any(any(alias in manual_values for alias in criterion.get("aliases", [])) for criterion in criteria)
        if category_manual is not None and not has_detailed_manual:
            raw_score, source = category_manual
            normalized_score = clamp_percent((raw_score / scale) * 100)
            status_value = self._rag_status(normalized_score, thresholds)
            return {
                "driver": {
                    "key": category_key,
                    "label": metric.name or spec["label"],
                    "score": normalized_score,
                    "raw_score": round(raw_score, 2),
                    "raw_scale": scale,
                    "weight": max(metric.weight, 0),
                    "metric_id": metric.id,
                    "metric_slug": metric.slug,
                    "metric_version": metric.current_version,
                    "source": source,
                    "status": status_value,
                },
                "lines": [
                    self._metric_line_payload(
                        metric,
                        category=category_key,
                        criterion_key=None,
                        raw_score=raw_score,
                        raw_scale=scale,
                        normalized_score=normalized_score,
                        weight=metric.weight,
                        weighted_score=normalized_score * max(metric.weight, 0) / 100,
                        status_value=status_value,
                        evidence=[{"type": "manual_score", "label": metric.name, "value": raw_score}],
                        source_context={"source": source, "category_input": True},
                    )
                ],
                "dirty_fields": [],
            }

        weighted_raw = 0.0
        total_weight = 0.0
        for criterion in criteria:
            criterion_key = str(criterion["key"])
            weight = float(criterion.get("weight", 1))
            value, source = self._manual_raw_value(manual_values, criterion.get("aliases", []), scale)
            if value is None and category_key == "contract":
                value, source = self._derived_contract_value(criterion_key, active_engagements)
            if value is None:
                value = fallback_raw
                source = fallback_source
                dirty_fields.append(f"{category_key}.{criterion_key}")
            raw_value = max(0.0, min(scale, float(value)))
            weighted_raw += raw_value * weight
            total_weight += weight
            normalized_value = clamp_percent((raw_value / scale) * 100)
            criterion_lines.append(
                self._metric_line_payload(
                    metric,
                    category=category_key,
                    criterion_key=criterion_key,
                    raw_score=raw_value,
                    raw_scale=scale,
                    normalized_score=normalized_value,
                    weight=weight,
                    weighted_score=normalized_value * weight / max(sum(float(item.get("weight", 1)) for item in criteria), 1),
                    status_value=self._rag_status(normalized_value, thresholds),
                    evidence=[{"type": source, "label": criterion.get("label", criterion_key), "value": raw_value}],
                    source_context={"source": source, "criterion_label": criterion.get("label"), "aliases": criterion.get("aliases", [])},
                )
            )

        raw_score = weighted_raw / total_weight if total_weight > 0 else fallback_raw
        normalized_score = clamp_percent((raw_score / scale) * 100)
        status_value = self._rag_status(normalized_score, thresholds)
        category_line = self._metric_line_payload(
            metric,
            category=category_key,
            criterion_key=None,
            raw_score=raw_score,
            raw_scale=scale,
            normalized_score=normalized_score,
            weight=metric.weight,
            weighted_score=normalized_score * max(metric.weight, 0) / 100,
            status_value=status_value,
            evidence=[{"type": "calculation", "label": metric.name, "value": normalized_score}],
            source_context={"formula": metric.formula, "source": "criterion_rollup", "dirty_fields": dirty_fields},
        )
        return {
            "driver": {
                "key": category_key,
                "label": metric.name or spec["label"],
                "score": normalized_score,
                "raw_score": round(raw_score, 2),
                "raw_scale": scale,
                "weight": max(metric.weight, 0),
                "metric_id": metric.id,
                "metric_slug": metric.slug,
                "metric_version": metric.current_version,
                "source": "health_tab_inputs" if not dirty_fields else "hybrid_fallback",
                "status": status_value,
            },
            "lines": [category_line, *criterion_lines],
            "dirty_fields": dirty_fields,
        }

    def _service_line_category_result(
        self,
        metric: ScoringMetricDefinition,
        spec: dict[str, Any],
        account: Account,
        active_engagements: list[Engagement],
        manual_values: dict[str, Any],
    ) -> dict[str, Any]:
        category_key = str(spec["key"])
        thresholds = metric.thresholds or DEFAULT_ACCOUNT_THRESHOLDS
        selected = self._number_from_values(manual_values, ["service_line.selected_count", "service_line.yes_count"])
        total = self._number_from_values(manual_values, ["service_line.total_count", "service_line.denominator"])
        coverage = self._number_from_values(manual_values, ["service_line.coverage", "service_line.score"])
        source = "manual_score"
        dirty_fields: list[str] = []
        if selected is not None and total and total > 0:
            normalized_score = clamp_percent((selected / total) * 100)
        elif coverage is not None:
            normalized_score = clamp_percent(coverage)
            selected = None
            total = None
        else:
            service_lines = {
                str(service_line)
                for engagement in active_engagements
                for service_line in (engagement.service_lines or [])
                if str(service_line).strip()
            }
            catalog_total = self._service_catalog_count()
            if service_lines and catalog_total > 0:
                selected = len(service_lines)
                total = catalog_total
                normalized_score = clamp_percent((selected / total) * 100)
                source = "engagement_service_lines"
            else:
                normalized_score = account.health_usage
                source = "legacy_fallback"
                dirty_fields.append("service_line.coverage")
        status_value = self._rag_status(normalized_score, thresholds)
        raw_score = float(normalized_score)
        line = self._metric_line_payload(
            metric,
            category=category_key,
            criterion_key="coverage",
            raw_score=raw_score,
            raw_scale=100,
            normalized_score=normalized_score,
            weight=metric.weight,
            weighted_score=normalized_score * max(metric.weight, 0) / 100,
            status_value=status_value,
            evidence=[{"type": source, "label": "Service line coverage", "value": normalized_score, "selected": selected, "total": total}],
            source_context={"formula": "COUNT(Yes) / (COUNT(Yes) + COUNT(No)) * 100", "source": source},
        )
        return {
            "driver": {
                "key": category_key,
                "label": metric.name or spec["label"],
                "score": normalized_score,
                "raw_score": raw_score,
                "raw_scale": 100,
                "weight": max(metric.weight, 0),
                "metric_id": metric.id,
                "metric_slug": metric.slug,
                "metric_version": metric.current_version,
                "source": source,
                "status": status_value,
            },
            "lines": [line],
            "dirty_fields": dirty_fields,
        }

    def _criteria_for_metric(self, metric: ScoringMetricDefinition, spec: dict[str, Any]) -> list[dict[str, Any]]:
        formula = metric.formula or {}
        items = formula.get("items") or formula.get("values")
        if isinstance(items, list) and items:
            criteria: list[dict[str, Any]] = []
            for item in items:
                if not isinstance(item, dict):
                    continue
                field_name = str(item.get("field") or item.get("key") or item.get("name") or "")
                if not field_name:
                    value_formula = item.get("value") or item.get("formula") or {}
                    if isinstance(value_formula, dict):
                        field_name = str(value_formula.get("field") or "")
                key = field_name.split(".")[-1] if "." in field_name else field_name
                if not key:
                    key = str(item.get("criterion_key") or item.get("label") or "criterion").lower().replace(" ", "_")
                criteria.append(
                    {
                        "key": key,
                        "label": item.get("label") or key.replace("_", " ").title(),
                        "weight": item.get("weight", 1),
                        "aliases": [field_name] if field_name else [f"{spec['key']}.{key}"],
                    }
                )
            if criteria:
                return criteria
        return list(spec.get("criteria", []))

    def _metric_line_payload(
        self,
        metric: ScoringMetricDefinition,
        *,
        category: str,
        criterion_key: str | None,
        raw_score: float | None,
        raw_scale: float | None,
        normalized_score: int | None,
        weight: float,
        weighted_score: float,
        status_value: str,
        evidence: list[dict[str, Any]],
        source_context: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            "metric_id": metric.id,
            "metric_slug": metric.slug,
            "metric_name": metric.name,
            "category": category,
            "criterion_key": criterion_key,
            "raw_score": raw_score,
            "raw_scale": raw_scale,
            "normalized_score": normalized_score,
            "weight": weight,
            "weighted_score": round(weighted_score, 4),
            "status": status_value,
            "freshness_status": "fresh" if source_context.get("source") != "legacy_fallback" else "stale",
            "evidence_json": evidence,
            "source_context": source_context,
        }

    def _metric_snapshot_line(self, snapshot: ScoreSnapshot, payload: dict[str, Any]) -> MetricSnapshot:
        return MetricSnapshot(
            score_snapshot_id=snapshot.id,
            metric_id=payload.get("metric_id"),
            metric_slug=payload["metric_slug"],
            metric_name=payload["metric_name"],
            category=payload["category"],
            criterion_key=payload.get("criterion_key"),
            raw_score=payload.get("raw_score"),
            raw_scale=payload.get("raw_scale"),
            normalized_score=payload.get("normalized_score"),
            weight=float(payload.get("weight") or 0),
            weighted_score=float(payload.get("weighted_score") or 0),
            status=payload.get("status", "complete"),
            freshness_status=payload.get("freshness_status", "fresh"),
            evidence_json=payload.get("evidence_json") or [],
            source_context=payload.get("source_context") or {},
        )

    def _category_fallback_raw(self, spec: dict[str, Any], account: Account, active_engagements: list[Engagement]) -> tuple[float, str]:
        scale = float(spec["scale"])
        fallback = spec.get("fallback")
        if fallback == "risk_status":
            return {"healthy": 3.0, "warning": 2.0, "critical": 1.0}.get(account.risk_status, 2.0), "legacy_fallback"
        if fallback == "health_relationship":
            return (account.health_relationship / 100) * scale, "legacy_fallback"
        if fallback == "health_usage":
            return (account.health_usage / 100) * scale, "legacy_fallback"
        if fallback == "health_delivery":
            delivery_scores = [item.delivery_health for item in active_engagements]
            percent = clamp_percent(sum(delivery_scores) / len(delivery_scores)) if delivery_scores else account.health_delivery
            return (percent / 100) * scale, "legacy_fallback"
        if fallback == "health_commercial":
            return (account.health_commercial / 100) * scale, "legacy_fallback"
        return scale, "legacy_fallback"

    def _category_manual_value(self, category_key: str, scale: float, manual_values: dict[str, Any]) -> tuple[float, str] | None:
        aliases = {
            "relationship": ["relationship"],
            "resource": ["resource", "delivery"],
            "contract": ["contract", "commercial"],
            "csat": ["csat", "usage"],
            "account_risk": ["account_risk", "risk"],
            "service_line": ["service_line"],
        }.get(category_key, [category_key])
        value = self._number_from_values(manual_values, aliases)
        if value is None:
            return None
        raw = (value / 100) * scale if value > scale else value
        return max(0.0, min(scale, raw)), "manual_score"

    def _manual_raw_value(self, manual_values: dict[str, Any], aliases: list[str], scale: float) -> tuple[float | None, str]:
        value = self._number_from_values(manual_values, aliases)
        if value is None:
            return None, ""
        raw = (value / 100) * scale if value > scale else value
        return max(0.0, min(scale, raw)), "manual_score"

    def _number_from_values(self, values: dict[str, Any], aliases: list[str]) -> float | None:
        for alias in aliases:
            value = values.get(alias)
            if isinstance(value, (int, float)):
                return float(value)
            if isinstance(value, str):
                try:
                    return float(value)
                except ValueError:
                    continue
        return None

    def _derived_contract_value(self, criterion_key: str, active_engagements: list[Engagement]) -> tuple[float | None, str]:
        now = datetime.now(timezone.utc)
        if criterion_key == "length":
            end_dates = [item.end_date if item.end_date.tzinfo else item.end_date.replace(tzinfo=timezone.utc) for item in active_engagements if item.end_date]
            if not end_dates:
                return None, ""
            months = max((end_at.date() - now.date()).days for end_at in end_dates) / 30
            if months > 24:
                return 3.0, "engagement_contract_dates"
            if months >= 12:
                return 2.0, "engagement_contract_dates"
            return 1.0, "engagement_contract_dates"
        if criterion_key == "notice":
            notice_dates = [item.notice_deadline if item.notice_deadline.tzinfo else item.notice_deadline.replace(tzinfo=timezone.utc) for item in active_engagements if item.notice_deadline]
            if not notice_dates:
                return None, ""
            days = max((notice_at.date() - now.date()).days for notice_at in notice_dates)
            if days > 90:
                return 3.0, "engagement_notice_deadline"
            if days >= 30:
                return 2.0, "engagement_notice_deadline"
            return 1.0, "engagement_notice_deadline"
        if criterion_key == "renewal":
            if any(item.auto_renewal for item in active_engagements):
                return 2.0, "engagement_renewal_terms"
            if active_engagements:
                return 0.0, "engagement_renewal_terms"
        return None, ""

    def _service_catalog_count(self) -> int:
        return self.db.scalar(select(func.count(ServiceCatalogItem.id)).where(ServiceCatalogItem.is_active.is_(True))) or 50

    def _criterion_reason_codes(self, metric_lines: list[dict[str, Any]]) -> list[dict[str, str]]:
        codes: list[dict[str, str]] = []
        for line in metric_lines:
            criterion_key = line.get("criterion_key")
            if not criterion_key:
                continue
            category = str(line.get("category", "metric"))
            raw = line.get("raw_score")
            normalized = line.get("normalized_score")
            if raw == 0:
                codes.append({"code": f"zero_{category}_{criterion_key}", "label": f"{line['metric_name']} {criterion_key.replace('_', ' ')} is zero"})
            elif category == "csat" and isinstance(raw, (int, float)) and raw <= 2:
                codes.append({"code": f"low_csat_{criterion_key}", "label": f"CSAT {criterion_key.replace('_', ' ')} is low"})
            elif isinstance(normalized, int) and normalized < 50:
                codes.append({"code": f"weak_{category}_{criterion_key}", "label": f"{line['metric_name']} {criterion_key.replace('_', ' ')} is weak"})
        return codes

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
        if not metric_definitions:
            snapshot = self._missing_metric_config_snapshot(account, current_user, previous=previous, job=job, scope="engagement", engagement=engagement)
            return snapshot
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
            self._validate_manual_score_input(scope, key, value)
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

    def _validate_manual_score_input(self, scope: str, key: str, value: Any) -> None:
        if scope == "engagement":
            if key not in {"delivery", "delivery_health", "renewal_timing"}:
                raise field_error(key, f"{key} is not a supported engagement scoring input.")
            self._manual_percent(value, key)
            return
        supported_ranges = self._account_manual_input_ranges()
        if key not in supported_ranges:
            raise field_error(key, f"{key} is not a supported account health scoring input.")
        maximum = supported_ranges[key]
        try:
            number = float(value)
        except (TypeError, ValueError) as exc:
            raise field_error(key, f"{key} score must be numeric.") from exc
        if number < 0 or number > maximum:
            label = "100" if maximum == 100 else f"{maximum:g} or an equivalent 0-100 percentage"
            raise field_error(key, f"{key} score must be between 0 and {label}.")

    def _account_manual_input_ranges(self) -> dict[str, float]:
        ranges: dict[str, float] = {}
        for spec in ACCOUNT_HEALTH_CATEGORY_SPECS.values():
            category = str(spec["key"])
            scale = float(spec["scale"])
            ranges[category] = 100
            fallback = spec.get("fallback")
            if isinstance(fallback, str):
                ranges[fallback] = 100
            for criterion in spec.get("criteria", []):
                for alias in criterion.get("aliases", []):
                    ranges[str(alias)] = max(scale, 100)
        ranges.update(
            {
                "usage": 100,
                "delivery": 100,
                "commercial": 100,
                "risk": 100,
                "service_line.selected_count": 1000,
                "service_line.yes_count": 1000,
                "service_line.total_count": 1000,
                "service_line.denominator": 1000,
                "service_line.coverage": 100,
                "service_line.score": 100,
            }
        )
        return ranges

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
        threshold = datetime.now(timezone.utc) - timedelta(days=180)
        approved_at = latest.approved_at
        if approved_at.tzinfo is None:
            approved_at = approved_at.replace(tzinfo=timezone.utc)
        return approved_at < threshold

    def _published_metrics(self, scope: str | None) -> list[ScoringMetricDefinition]:
        now = datetime.now(timezone.utc)
        conditions = [
            ScoringMetricDefinition.is_active.is_(True),
            ScoringMetricDefinition.status != "inactive",
            ScoringMetricDefinition.current_version > 0,
        ]
        if scope:
            conditions.append(ScoringMetricDefinition.scope == scope)
        metrics = list(
            self.db.scalars(
                select(ScoringMetricDefinition)
                .where(*conditions)
                .order_by(ScoringMetricDefinition.name)
            )
        )
        published_metrics: list[ScoringMetricDefinition] = []
        for metric in metrics:
            version = self.db.scalar(
                select(ScoringMetricVersion)
                .where(ScoringMetricVersion.metric_id == metric.id, ScoringMetricVersion.version == metric.current_version)
                .limit(1)
            )
            if version is None:
                if metric.status != "published":
                    continue
                published_metric = metric
            else:
                published_metric = self._metric_from_published_version(metric, version)
            if published_metric.effective_date is None or self._aware_datetime(published_metric.effective_date) <= now:
                published_metrics.append(published_metric)
        return published_metrics

    def _metric_from_published_version(self, metric: ScoringMetricDefinition, version: ScoringMetricVersion) -> ScoringMetricDefinition:
        config = dict(version.config_json or {})
        effective_date = config.get("effective_date")
        if isinstance(effective_date, str):
            try:
                effective_date = datetime.fromisoformat(effective_date.replace("Z", "+00:00"))
            except ValueError:
                effective_date = metric.effective_date
        elif not isinstance(effective_date, datetime):
            effective_date = metric.effective_date
        return ScoringMetricDefinition(
            id=metric.id,
            slug=str(config.get("slug") or metric.slug),
            name=str(config.get("name") or metric.name),
            description=config.get("description", metric.description),
            scope=str(config.get("scope") or metric.scope),
            weight=int(config.get("weight", metric.weight) or 0),
            thresholds=config.get("thresholds") or metric.thresholds or {},
            formula=config.get("formula") or metric.formula or {},
            freshness_rule=config.get("freshness_rule") or metric.freshness_rule or {},
            owner_role=config.get("owner_role", metric.owner_role),
            source=str(config.get("source") or metric.source),
            effective_date=effective_date,
            status="published",
            is_active=metric.is_active,
            current_version=version.version,
            created_by_id=metric.created_by_id,
            updated_by_id=metric.updated_by_id,
            created_at=metric.created_at,
            updated_at=version.published_at,
        )

    def _drivers_from_metrics(self, metrics: list[ScoringMetricDefinition], score_inputs: dict[str, Any], *, default_drivers: list[dict[str, Any]]) -> list[dict[str, Any]]:
        drivers: list[dict[str, Any]] = []
        pending = list(metrics)
        while pending:
            progressed = False
            next_pending: list[ScoringMetricDefinition] = []
            for metric in pending:
                value = self._evaluate_formula(metric.formula, score_inputs)
                if value is None:
                    next_pending.append(metric)
                    continue
                score = clamp_percent(value)
                score_inputs[metric.slug] = score
                drivers.append(
                    {
                        "key": metric.slug,
                        "label": metric.name,
                        "score": score,
                        "weight": max(metric.weight, 0),
                        "metric_id": metric.id,
                        "metric_version": metric.current_version,
                        "source": metric.source,
                    }
                )
                progressed = True
            if not progressed:
                break
            pending = next_pending
        for metric in pending:
            logger.warning("Skipping metric %s because formula inputs were unavailable", metric.slug)
        return self._normalize_driver_weights(drivers or default_drivers)

    def _driver_from_metric(self, metric: ScoringMetricDefinition, score_inputs: dict[str, Any]) -> dict[str, Any] | None:
            value = self._evaluate_formula(metric.formula, score_inputs)
            if value is None:
                return None
            return {
                "key": metric.slug,
                "label": metric.name,
                "score": clamp_percent(value),
                "weight": max(metric.weight, 0),
                "metric_id": metric.id,
                "metric_version": metric.current_version,
                "source": metric.source,
            }

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
        metric_reference = formula.get("metric_slug") or formula.get("metric")
        if isinstance(metric_reference, str) and metric_reference:
            value = inputs.get(metric_reference)
            return float(value) if isinstance(value, (int, float)) else None
        if op == "field":
            value = inputs.get(str(formula.get("field", "")))
            return float(value) if isinstance(value, (int, float)) else None
        if op == "constant":
            value = formula.get("value")
            return float(value) if isinstance(value, (int, float)) else None
        if op in {"weighted_average", "weighted_sum", "composite_weighted_sum"}:
            weighted = []
            for item in formula.get("items", formula.get("values", [])):
                if not isinstance(item, dict):
                    continue
                value_formula = item.get("value", item.get("formula"))
                if value_formula is None and item.get("field"):
                    value_formula = {"op": "field", "field": item.get("field")}
                if value_formula is None:
                    value_formula = {key: value for key, value in item.items() if key != "weight"}
                value = self._evaluate_formula(value_formula, inputs)
                weight = item.get("weight", 1)
                if value is not None and isinstance(weight, (int, float)) and weight > 0:
                    weighted.append((value, float(weight)))
            total_weight = sum(weight for _, weight in weighted)
            if total_weight <= 0:
                return None
            value = sum(value * weight for value, weight in weighted) / total_weight
            scale = formula.get("scale")
            if isinstance(scale, (int, float)) and scale > 0:
                return (value / float(scale)) * 100
            return value
        if op == "ratio":
            numerator = self._evaluate_formula(formula.get("numerator"), inputs)
            denominator = self._evaluate_formula(formula.get("denominator"), inputs)
            if denominator in (None, 0):
                return None
            multiplier = float(formula.get("multiplier", 100))
            return (float(numerator or 0) / float(denominator)) * multiplier

        values = [value for value in self._formula_values(formula, inputs) if value is not None]
        if values and op == "average":
            value = sum(values) / len(values)
            scale = formula.get("scale")
            if isinstance(scale, (int, float)) and scale > 0:
                return (value / float(scale)) * 100
            return value
        return None

    def _formula_values(self, formula: dict[str, Any], inputs: dict[str, Any]) -> list[float | None]:
        values = formula.get("values", formula.get("items", []))
        if not isinstance(values, list):
            values = [values]
        return [self._evaluate_formula(value, inputs) for value in values]

    def _validate_formula_shape(self, slug: str | None, formula: Any, errors: list[str]) -> None:
        if not isinstance(formula, dict) or not formula:
            return
        op = formula.get("op")
        if op in {"weighted_sum", "weighted_average", "composite_weighted_sum"}:
            items = formula.get("items") or formula.get("values")
            if not isinstance(items, list) or not items:
                errors.append("Weighted formulas require at least one item.")
                return
            total_weight = 0.0
            for index, item in enumerate(items):
                if not isinstance(item, dict):
                    errors.append(f"Weighted formula item {index + 1} must be an object.")
                    continue
                weight = item.get("weight")
                if not isinstance(weight, (int, float)):
                    errors.append(f"Weighted formula item {index + 1} is missing a numeric weight.")
                elif weight < 0:
                    errors.append(f"Weighted formula item {index + 1} weight cannot be negative.")
                else:
                    total_weight += float(weight)
                metric_slug = item.get("metric_slug") or item.get("metric")
                if slug and metric_slug == slug:
                    errors.append("Metric formula cannot depend on itself.")
            if total_weight <= 0:
                errors.append("Weighted formulas require a positive total weight.")
        if op == "ratio":
            if not formula.get("numerator") or not formula.get("denominator"):
                errors.append("Ratio formulas require numerator and denominator definitions.")
        for value in formula.values():
            if isinstance(value, dict):
                self._validate_formula_shape(slug, value, errors)
            elif isinstance(value, list):
                for item in value:
                    self._validate_formula_shape(slug, item, errors)

    def _validate_metric_dependencies(self, slug: str | None, formula: Any, errors: list[str]) -> None:
        references = self._formula_metric_references(formula)
        if not references:
            return
        for reference in sorted(references):
            if slug and reference == slug:
                errors.append("Metric formula cannot depend on itself.")
                continue
            metric = self.repository.get_metric_by_slug(reference)
            if metric is None:
                errors.append(f"Referenced metric '{reference}' does not exist.")
                continue
            if not metric.is_active or metric.status == "inactive":
                errors.append(f"Referenced metric '{reference}' is inactive and cannot be selected.")
            elif metric.status != "published" and metric.current_version <= 0:
                errors.append(f"Referenced metric '{reference}' must be published before it can be selected.")
        if slug and self._has_dependency_path(references, slug, seen=set()):
            errors.append("Metric formula contains a circular metric dependency.")

    def _formula_metric_references(self, formula: Any) -> set[str]:
        references: set[str] = set()
        if isinstance(formula, dict):
            for key in ("metric_slug", "metric"):
                value = formula.get(key)
                if isinstance(value, str) and value.strip():
                    references.add(value.strip())
            for value in formula.values():
                references.update(self._formula_metric_references(value))
        elif isinstance(formula, list):
            for item in formula:
                references.update(self._formula_metric_references(item))
        return references

    def _has_dependency_path(self, references: set[str], target_slug: str, *, seen: set[str]) -> bool:
        for reference in references:
            if reference == target_slug:
                return True
            if reference in seen:
                continue
            seen.add(reference)
            metric = self.repository.get_metric_by_slug(reference)
            if metric is None:
                continue
            if self._has_dependency_path(self._formula_metric_references(metric.formula), target_slug, seen=seen):
                return True
        return False

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
        versions = [metric.current_version for metric in self._published_metrics(scope) if metric.current_version > 0]
        if not versions:
            return DEFAULT_METRIC_VERSION
        return f"{scope}-scoring-v{max(versions)}"

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
        if not self._published_metrics("account"):
            return ScoreRead(
                account_id=account.id,
                scope="account",
                overall=account.health_overall,
                rag_status={"healthy": "green", "warning": "amber", "critical": "red"}.get(account.risk_status, "unknown"),
                drivers=[],
                reason_codes=[{"code": "metric_config_missing", "label": "No active published account scoring metric configuration is available."}],
                metric_version=DEFAULT_METRIC_VERSION,
                freshness_status="stale",
                is_dirty=True,
                trend=0,
                status="incomplete",
                latest_snapshot=None,
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
        if not self._published_metrics("engagement"):
            return ScoreRead(
                account_id=account.id,
                engagement_id=engagement.id,
                scope="engagement",
                overall=engagement.delivery_health,
                rag_status=self._rag_status(engagement.delivery_health),
                drivers=[],
                reason_codes=[{"code": "metric_config_missing", "label": "No active published engagement scoring metric configuration is available."}],
                metric_version=DEFAULT_METRIC_VERSION,
                freshness_status="stale",
                is_dirty=True,
                trend=0,
                status="incomplete",
                latest_snapshot=None,
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
