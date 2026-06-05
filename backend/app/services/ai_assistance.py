import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Account, AiGatewayRun, GovernanceEvent, KycSnapshot, Opportunity, PlatformSetting, ScoreSnapshot, Signal, TimelineEntry, User, utc_now
from app.repositories.accounts import AccountRepository
from app.repositories.audit import AuditRepository
from app.repositories.rbac import RbacRepository
from app.repositories.timeline import TimelineRepository
from app.schemas import (
    AiAccountBriefResponse,
    AiBriefFeedbackRequest,
    AiBriefPageRead,
    AiAssistanceSearchRequest,
    AiAssistanceSearchResponse,
    AiAssistanceSourceRead,
    AiForecastRequest,
    AiForecastResponse,
    AiHandoffRequest,
    AiHandoffResponse,
    AiQueryHistoryPageRead,
    AiQueryHistoryRead,
    AiSearchFieldsRead,
    AiSearchFieldsUpdateRequest,
    AiStagePredictionResponse,
    AiStageChangeRead,
    AiTimelineNoteRequest,
    AiVocabularyTermRead,
    AiVocabularyTermRequest,
)
from app.services.account_access import AccountAccessService, GLOBAL_VIEW_ROLES
from app.services.audit import AuditService
from app.services.forecasting import ForecastingService
from app.services.notifications import NotificationsService
from app.services.timeline import TimelineService
from app.services.user_management import page_count

logger = logging.getLogger(__name__)

AI_MODULE = "ai_assistance_search"
AI_DISCLAIMER = "AI-assisted output is advisory and based only on source records you are authorized to view."
AI_VOCABULARY_SETTING = "ai_vocabulary_terms"
AI_SEARCH_FIELDS_SETTING = "ai_search_fields"


class AiAssistanceService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.accounts = AccountRepository(db)
        self.timeline = TimelineRepository(db)
        self.access = AccountAccessService(self.accounts, RbacRepository(db))
        self.audit = AuditService(AuditRepository(db))
        self.timeline_service = TimelineService(TimelineRepository(db))
        self.notifications = NotificationsService(db)
        self.forecasting = ForecastingService(db)

    def search(self, payload: AiAssistanceSearchRequest, current_user: User) -> AiAssistanceSearchResponse:
        self.access.require_module_permission(current_user, AI_MODULE, "view")
        accounts = self._accounts_for_scope(current_user, payload.account_id)
        query = payload.query.strip()
        sources = self._search_sources(accounts, query, payload.scopes, payload.limit)
        answer = self._search_answer(query, sources, len(accounts))
        response_payload = {
            "query": query,
            "answer": answer,
            "query_intent": self._intent(query),
            "confidence": "high" if len(sources) >= 5 else "medium" if sources else "low",
            "source_entries": [item.model_dump(mode="json") for item in sources],
        }
        run_id = self._log_ai_run(
            "kam_ai_search",
            current_user,
            account_id=payload.account_id,
            prompt={"query": query, "scopes": payload.scopes, "document_search": payload.document_search, "limit": payload.limit},
            source_context=[{"type": item.source_type, "id": item.id, "account_id": item.account_id} for item in sources],
            response=response_payload,
            usage={"query": query, "scope_count": len(payload.scopes), "source_count": len(sources), "answer": answer, "confidence": response_payload["confidence"]},
        )
        self.audit.log(module=AI_MODULE, action="search", entity_type="ai_assistance", entity_id=run_id or "advisory", actor=current_user, after_value={"query": query, "source_count": len(sources)})
        self.db.commit()
        return AiAssistanceSearchResponse(
            query=query,
            answer=answer,
            query_intent=response_payload["query_intent"],
            confidence=response_payload["confidence"],
            disclaimer=AI_DISCLAIMER,
            source_entries=sources,
            document_results=[],
            run_id=run_id,
        )

    def account_brief(self, account_id: str, current_user: User) -> AiAccountBriefResponse:
        account = self._require_account_view(account_id, current_user)
        latest_score = self._latest_score(account.id)
        latest_kyc = self._latest_kyc(account.id)
        signals = self._active_signals(account.id, limit=5)
        opportunities = self._open_opportunities(account.id, limit=5)
        governance = self._upcoming_governance(account.id, limit=3)
        highlights = [
            f"Lifecycle: {account.lifecycle_status}",
            f"Commercial value: {float(account.commercial_value)} {account.currency}",
            f"Open opportunities: {len(opportunities)}",
        ]
        if latest_score:
            highlights.append(f"Latest score: {latest_score.overall} ({latest_score.rag_status})")
        if latest_kyc:
            highlights.append(f"KYC v{latest_kyc.version} approved on {latest_kyc.approved_at.date().isoformat()}")
        risks = [signal.title for signal in signals]
        next_actions = [f"Review {signal.signal_type}: {signal.title}" for signal in signals[:3]]
        if governance:
            next_actions.append(f"Prepare for {governance[0].governance_type} on {governance[0].scheduled_at.date().isoformat()}")
        citations = self._citations(account, latest_score=latest_score, latest_kyc=latest_kyc, signals=signals, opportunities=opportunities, governance=governance)
        response = AiAccountBriefResponse(
            account_id=account.id,
            title=f"{account.name} account brief",
            summary=f"{account.name} is currently {account.lifecycle_status} with {account.risk_status} risk status. The brief is assembled from score, KYC, signal, opportunity, and governance records.",
            highlights=highlights,
            risks=risks,
            next_actions=next_actions,
            citations=citations,
            confidence="high" if latest_score and latest_kyc else "medium" if citations else "low",
            disclaimer=AI_DISCLAIMER,
        )
        run_id = self._log_ai_run("account_brief", current_user, account_id=account.id, source_context=citations, response=response.model_dump(mode="json"), affected_records=[{"type": "account", "id": account.id}])
        response.run_id = run_id
        self.audit.log(module=AI_MODULE, action="account_brief", entity_type="account", entity_id=account.id, actor=current_user, after_value={"run_id": run_id, "advisory_only": True})
        self.db.commit()
        return response

    def stage_prediction(self, account_id: str, current_user: User) -> AiStagePredictionResponse:
        account = self._require_account_view(account_id, current_user)
        latest_score = self._latest_score(account.id)
        signals = self._active_signals(account.id, limit=10)
        opportunities = self._open_opportunities(account.id, limit=10)
        governance = self._upcoming_governance(account.id, limit=3)
        predicted = account.lifecycle_status
        factors: list[dict[str, Any]] = []
        if latest_score and latest_score.rag_status == "red":
            predicted = "At Risk"
            factors.append({"type": "score", "label": "Latest score is red", "score": latest_score.overall})
        if any(signal.severity == "critical" for signal in signals):
            predicted = "At Risk"
            factors.append({"type": "signal", "label": "Critical active signal", "count": sum(1 for signal in signals if signal.severity == "critical")})
        if opportunities and predicted != "At Risk":
            total_pipeline = sum(float(item.value or 0) for item in opportunities)
            if total_pipeline >= float(account.commercial_value or 0) * 0.2:
                predicted = "Expansion Focus"
                factors.append({"type": "opportunity", "label": "Expansion pipeline is material", "pipeline": total_pipeline})
        if account.lifecycle_status == "Onboarding" and self._latest_kyc(account.id) and predicted != "At Risk":
            predicted = "Active"
            factors.append({"type": "kyc", "label": "Approved KYC exists for onboarding account"})
        if governance:
            factors.append({"type": "governance", "label": "Upcoming governance exists", "next": governance[0].scheduled_at.isoformat()})
        citations = self._citations(account, latest_score=latest_score, signals=signals, opportunities=opportunities, governance=governance)
        response = AiStagePredictionResponse(
            account_id=account.id,
            current_stage=account.lifecycle_status,
            predicted_stage=predicted,
            confidence=85 if factors else 55,
            factors=factors,
            recommended_actions=self._stage_actions(predicted),
            citations=citations,
            disclaimer=AI_DISCLAIMER,
        )
        run_id = self._log_ai_run("stage_prediction", current_user, account_id=account.id, source_context=citations, response=response.model_dump(mode="json"), affected_records=[{"type": "account", "id": account.id}])
        response.run_id = run_id
        self.audit.log(module=AI_MODULE, action="stage_prediction", entity_type="account", entity_id=account.id, actor=current_user, after_value={"predicted_stage": predicted, "advisory_only": True})
        self.db.commit()
        return response

    def forecast(self, payload: AiForecastRequest, current_user: User) -> AiForecastResponse:
        self.access.require_module_permission(current_user, AI_MODULE, "view")
        accounts = self._accounts_for_scope(current_user, payload.account_id)
        response = self.forecasting.generate(accounts, months=payload.months)
        run_id = self._log_ai_run("portfolio_forecast", current_user, account_id=payload.account_id, source_context=response.citations, prompt=payload.model_dump(mode="json"), response=response.model_dump(mode="json"), usage={"months": payload.months, "account_count": len(accounts)})
        response.run_id = run_id
        self.audit.log(module=AI_MODULE, action="forecast", entity_type="ai_assistance", entity_id=run_id or "advisory", actor=current_user, after_value={"months": payload.months, "account_count": len(accounts)})
        self.db.commit()
        return response

    def handoff(self, account_id: str, payload: AiHandoffRequest, current_user: User) -> AiHandoffResponse:
        account = self._require_account_view(account_id, current_user)
        latest_score = self._latest_score(account.id)
        latest_kyc = self._latest_kyc(account.id)
        signals = self._active_signals(account.id, limit=10)
        opportunities = self._open_opportunities(account.id, limit=10)
        governance = self._upcoming_governance(account.id, limit=5)
        sections = {
            "Account context": [f"{account.name} is {account.lifecycle_status}.", f"Risk status is {account.risk_status}."],
            "Health and risks": [f"Latest score is {latest_score.overall} ({latest_score.rag_status})."] if latest_score else ["No score snapshot is available."],
            "Open attention": [signal.title for signal in signals] or ["No active signals found."],
            "Growth and renewal": [f"{item.name}: {item.stage}" for item in opportunities] or ["No open opportunities found."],
            "Governance": [f"{item.governance_type} on {item.scheduled_at.date().isoformat()}" for item in governance] or ["No upcoming governance found."],
            "KYC": [f"KYC v{latest_kyc.version} approved on {latest_kyc.approved_at.date().isoformat()}."] if latest_kyc else ["No approved KYC snapshot found."],
        }
        if payload.focus:
            sections["Requested focus"] = [payload.focus]
        citations = self._citations(account, latest_score=latest_score, latest_kyc=latest_kyc, signals=signals, opportunities=opportunities, governance=governance)
        response = AiHandoffResponse(account_id=account.id, title=f"{account.name} handoff brief", sections=sections, citations=citations, disclaimer=AI_DISCLAIMER)
        run_id = self._log_ai_run("handoff_brief", current_user, account_id=account.id, source_context=citations, prompt=payload.model_dump(mode="json"), response=response.model_dump(mode="json"), affected_records=[{"type": "account", "id": account.id}])
        response.run_id = run_id
        self.audit.log(module=AI_MODULE, action="handoff", entity_type="account", entity_id=account.id, actor=current_user, after_value={"run_id": run_id, "advisory_only": True})
        self.db.commit()
        return response

    def query_history(self, current_user: User, *, search: str | None = None, account_id: str | None = None, page: int = 1, page_size: int = 25) -> AiQueryHistoryPageRead:
        self.access.require_module_permission(current_user, AI_MODULE, "view")
        conditions = [AiGatewayRun.actor_id == current_user.id, AiGatewayRun.request_type.in_(["kam_ai_search", "account_brief", "stage_prediction", "portfolio_forecast", "handoff_brief"])]
        if account_id:
            self._require_account_view(account_id, current_user)
            conditions.append(AiGatewayRun.account_id == account_id)
        if search and search.strip():
            term = search.strip().lower()
            all_runs = list(self.db.scalars(select(AiGatewayRun).where(*conditions).order_by(AiGatewayRun.created_at.desc()).limit(500)))
            filtered = [run for run in all_runs if term in str(run.prompt_json).lower() or term in str(run.response_json).lower() or term in str(run.usage_json).lower()]
            total = len(filtered)
            items = filtered[(page - 1) * page_size : page * page_size]
        else:
            total = self.db.scalar(select(func.count(AiGatewayRun.id)).where(*conditions)) or 0
            items = list(self.db.scalars(select(AiGatewayRun).where(*conditions).order_by(AiGatewayRun.created_at.desc()).offset((page - 1) * page_size).limit(page_size)))
        return AiQueryHistoryPageRead(items=[self._history_read(run) for run in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def rerun_query(self, history_id: str, current_user: User) -> AiAssistanceSearchResponse:
        run = self._ai_run_or_404(history_id, current_user)
        query = run.prompt_json.get("query") or run.usage_json.get("query")
        if not query:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only search history with a stored query can be rerun")
        payload = AiAssistanceSearchRequest(
            query=query,
            account_id=run.account_id,
            scopes=run.prompt_json.get("scopes") or ["timeline", "opportunities", "governance", "kyc", "signals"],
            document_search=bool(run.prompt_json.get("document_search", False)),
            limit=int(run.prompt_json.get("limit") or 10),
        )
        return self.search(payload, current_user)

    def list_accounts(self, current_user: User) -> list[dict[str, Any]]:
        self.access.require_module_permission(current_user, AI_MODULE, "view")
        return [
            {
                "id": account.id,
                "name": account.name,
                "segment": account.segment,
                "region": account.region,
                "lifecycle_status": account.lifecycle_status,
                "risk_status": account.risk_status,
                "health_overall": account.health_overall,
            }
            for account in self._accounts_for_scope(current_user, None)
        ]

    def list_vocabulary(self, current_user: User) -> list[AiVocabularyTermRead]:
        self.access.require_module_permission(current_user, AI_MODULE, "configure")
        return [AiVocabularyTermRead(**item) for item in self._setting_list(AI_VOCABULARY_SETTING)]

    def create_vocabulary_term(self, payload: AiVocabularyTermRequest, current_user: User) -> AiVocabularyTermRead:
        self.access.require_module_permission(current_user, AI_MODULE, "configure")
        items = self._setting_list(AI_VOCABULARY_SETTING)
        term_id = f"term-{int(datetime.now(timezone.utc).timestamp() * 1000)}"
        record = {**payload.model_dump(), "id": term_id, "updated_at": utc_now().isoformat()}
        items.append(record)
        self._set_setting_list(AI_VOCABULARY_SETTING, items, current_user)
        self.audit.log(module=AI_MODULE, action="create_vocabulary_term", entity_type="ai_vocabulary", entity_id=term_id, actor=current_user, after_value=record)
        self.db.commit()
        return AiVocabularyTermRead(**record)

    def update_vocabulary_term(self, term_id: str, payload: AiVocabularyTermRequest, current_user: User) -> AiVocabularyTermRead:
        self.access.require_module_permission(current_user, AI_MODULE, "configure")
        items = self._setting_list(AI_VOCABULARY_SETTING)
        index = next((i for i, item in enumerate(items) if item.get("id") == term_id), None)
        if index is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AI vocabulary term was not found")
        before = dict(items[index])
        items[index] = {**items[index], **payload.model_dump(), "updated_at": utc_now().isoformat()}
        self._set_setting_list(AI_VOCABULARY_SETTING, items, current_user)
        self.audit.log(module=AI_MODULE, action="update_vocabulary_term", entity_type="ai_vocabulary", entity_id=term_id, actor=current_user, before_value=before, after_value=items[index])
        self.db.commit()
        return AiVocabularyTermRead(**items[index])

    def get_search_fields(self, current_user: User) -> AiSearchFieldsRead:
        self.access.require_module_permission(current_user, AI_MODULE, "configure")
        setting = self.db.scalar(select(PlatformSetting).where(PlatformSetting.key == AI_SEARCH_FIELDS_SETTING))
        value = setting.value_json if setting and isinstance(setting.value_json, dict) else {}
        return AiSearchFieldsRead(fields=value.get("fields") or ["timeline", "opportunities", "governance", "kyc", "signals"], updated_at=setting.updated_at if setting else None)

    def update_search_fields(self, payload: AiSearchFieldsUpdateRequest, current_user: User) -> AiSearchFieldsRead:
        self.access.require_module_permission(current_user, AI_MODULE, "configure")
        setting = self.db.scalar(select(PlatformSetting).where(PlatformSetting.key == AI_SEARCH_FIELDS_SETTING))
        if setting is None:
            setting = PlatformSetting(key=AI_SEARCH_FIELDS_SETTING, value_json={}, updated_by_id=current_user.id)
            self.db.add(setting)
        before = setting.value_json if isinstance(setting.value_json, dict) else {}
        setting.value_json = {"fields": payload.fields}
        setting.updated_by_id = current_user.id
        self.audit.log(module=AI_MODULE, action="update_search_fields", entity_type="platform_setting", entity_id=setting.id, actor=current_user, before_value=before, after_value=setting.value_json)
        self.db.commit()
        return AiSearchFieldsRead(fields=payload.fields, updated_at=setting.updated_at)

    def account_brief_history(self, account_id: str, current_user: User, *, page: int = 1, page_size: int = 10) -> AiBriefPageRead:
        self._require_account_view(account_id, current_user)
        conditions = [AiGatewayRun.account_id == account_id, AiGatewayRun.request_type == "account_brief"]
        total = self.db.scalar(select(func.count(AiGatewayRun.id)).where(*conditions)) or 0
        runs = list(self.db.scalars(select(AiGatewayRun).where(*conditions).order_by(AiGatewayRun.created_at.desc()).offset((page - 1) * page_size).limit(page_size)))
        items = []
        for run in runs:
            if run.response_json:
                payload = dict(run.response_json)
                payload["run_id"] = run.id
                items.append(AiAccountBriefResponse(**payload))
        return AiBriefPageRead(items=items, total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def refresh_brief(self, brief_id: str, current_user: User) -> AiAccountBriefResponse:
        run = self._ai_run_or_404(brief_id, current_user)
        if not run.account_id or run.request_type != "account_brief":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only account brief runs can be refreshed")
        return self.account_brief(run.account_id, current_user)

    def record_brief_feedback(self, brief_id: str, payload: AiBriefFeedbackRequest, current_user: User) -> AiGatewayRun:
        run = self._ai_run_or_404(brief_id, current_user)
        before = dict(run.feedback_json or {})
        run.feedback_json = {"rating": payload.rating, "comment": payload.comment, "submitted_by_id": current_user.id, "submitted_by_name": current_user.full_name, "submitted_at": utc_now().isoformat()}
        self.audit.log(module=AI_MODULE, action="brief_feedback", entity_type="ai_gateway_run", entity_id=run.id, actor=current_user, before_value=before, after_value=run.feedback_json)
        self.db.commit()
        return run

    def create_brief_timeline_note(self, brief_id: str, payload: AiTimelineNoteRequest, current_user: User) -> dict[str, str]:
        run = self._ai_run_or_404(brief_id, current_user)
        if not run.account_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="AI run is not linked to an account")
        account = self._require_account_view(run.account_id, current_user)
        self.access.require_account_update(current_user, account, module="account_overview")
        response = run.response_json or {}
        title = payload.title or response.get("title") or "AI brief note"
        description = payload.description or response.get("summary") or response.get("answer") or "AI-assisted note created from a reviewed brief."
        entry = self.timeline_service.add_account_event(
            account_id=account.id,
            title=title,
            description=description,
            actor=current_user,
            event_type="ai_event",
            module="ai",
            source_record_id=run.id,
            source_record_type="ai_gateway_run",
            source_record_route=f"/accounts/{account.id}",
            metadata={"created_from_ai_brief": True},
        )
        self.audit.log(module=AI_MODULE, action="brief_timeline_note", entity_type="timeline_entry", entity_id=entry.id, actor=current_user, after_value={"run_id": run.id, "account_id": account.id})
        self.db.commit()
        return {"timeline_entry_id": entry.id}

    def apply_stage_prediction(self, account_id: str, current_user: User) -> AiStageChangeRead:
        account = self._require_account_view(account_id, current_user)
        self.access.require_account_update(current_user, account, module="account_overview")
        prediction = self.stage_prediction(account_id, current_user)
        previous = account.lifecycle_status
        if prediction.predicted_stage == previous:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Predicted stage is already the current account stage")
        account.lifecycle_status = prediction.predicted_stage
        entry = self.timeline_service.add_account_event(
            account_id=account.id,
            title="AI-assisted account stage change confirmed",
            description=f"{current_user.full_name} confirmed AI recommendation to move stage from {previous} to {prediction.predicted_stage}.",
            actor=current_user,
            event_type="stage_change",
            module="stage",
            source_record_id=prediction.run_id,
            source_record_type="ai_gateway_run",
            source_record_route=f"/accounts/{account.id}",
            before_value={"lifecycle_status": previous},
            after_value={"lifecycle_status": prediction.predicted_stage, "confidence": prediction.confidence},
        )
        self.audit.log(module=AI_MODULE, action="stage_change_from_prediction", entity_type="account", entity_id=account.id, actor=current_user, before_value={"lifecycle_status": previous}, after_value={"lifecycle_status": prediction.predicted_stage, "prediction_run_id": prediction.run_id})
        self._notify_stage_change(account, previous, prediction.predicted_stage, current_user, entry.id)
        self.db.commit()
        return AiStageChangeRead(account_id=account.id, previous_stage=previous, new_stage=prediction.predicted_stage, prediction_run_id=prediction.run_id, timeline_entry_id=entry.id, changed_at=utc_now())

    def _accounts_for_scope(self, current_user: User, account_id: str | None) -> list[Account]:
        if account_id:
            return [self._require_account_view(account_id, current_user)]
        if current_user.role in GLOBAL_VIEW_ROLES:
            return list(self.db.scalars(select(Account).where(Account.archived_at.is_(None)).order_by(Account.name)))
        account_ids = self.accounts.list_account_ids_for_user(current_user.id)
        if not account_ids:
            return []
        return list(self.db.scalars(select(Account).where(Account.id.in_(account_ids), Account.archived_at.is_(None)).order_by(Account.name)))

    def _require_account_view(self, account_id: str, current_user: User) -> Account:
        account = self.accounts.get_by_id(account_id)
        if account is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account was not found")
        self.access.require_account_view(current_user, account, module=AI_MODULE)
        return account

    def _search_sources(self, accounts: list[Account], query: str, scopes: list[str], limit: int) -> list[AiAssistanceSourceRead]:
        results: list[AiAssistanceSourceRead] = []
        normalized_scopes = {scope.lower() for scope in scopes}
        include_timeline = bool(normalized_scopes.intersection({"timeline", "notes", "governance", "kyc", "signals", "all"}))
        for account in accounts:
            if include_timeline:
                entries, _ = self.timeline.list_for_account(account.id, search=query, include_sensitive=False, include_restricted=False, page=1, page_size=limit)
                if not entries:
                    entries, _ = self.timeline.list_for_account(account.id, include_sensitive=False, include_restricted=False, page=1, page_size=min(limit, 5))
                results.extend(self._timeline_source(account, entry, query) for entry in entries)
            if "opportunities" in normalized_scopes or "all" in normalized_scopes:
                results.extend(self._opportunity_source(account, item, query) for item in self._open_opportunities(account.id, limit=limit))
        return sorted(results, key=lambda item: (item.relevance, item.event_at or datetime.min.replace(tzinfo=timezone.utc)), reverse=True)[:limit]

    def _timeline_source(self, account: Account, entry: TimelineEntry, query: str) -> AiAssistanceSourceRead:
        text = f"{entry.title} {entry.description}".lower()
        relevance = 2.0 if query.lower() in text else 1.0
        return AiAssistanceSourceRead(
            id=entry.id,
            account_id=account.id,
            account_name=account.name,
            source_type=entry.source_record_type or entry.event_type,
            title=entry.title,
            excerpt=entry.description[:280],
            source_route=entry.source_record_route,
            event_at=entry.event_at or entry.created_at,
            relevance=relevance,
        )

    def _opportunity_source(self, account: Account, opportunity: Opportunity, query: str) -> AiAssistanceSourceRead:
        text = f"{opportunity.name} {opportunity.next_step} {opportunity.stage}".lower()
        relevance = 2.0 if query.lower() in text else 1.0
        return AiAssistanceSourceRead(
            id=opportunity.id,
            account_id=account.id,
            account_name=account.name,
            source_type="opportunity",
            title=opportunity.name,
            excerpt=f"{opportunity.stage} opportunity for {opportunity.service_line}; next step: {opportunity.next_step}",
            source_route="/opportunities",
            event_at=opportunity.updated_at,
            relevance=relevance,
        )

    def _search_answer(self, query: str, sources: list[AiAssistanceSourceRead], account_count: int) -> str:
        if not sources:
            return "I could not find enough authorized source records to answer that with confidence."
        top = "; ".join(f"{source.account_name}: {source.title}" for source in sources[:4])
        return f"Across {account_count} authorized account(s), I found {len(sources)} relevant source record(s) for '{query}'. Top sources: {top}."

    def _intent(self, query: str) -> str:
        normalized = query.lower()
        if "forecast" in normalized:
            return "forecast"
        if "handoff" in normalized:
            return "handoff"
        if "risk" in normalized or "health" in normalized:
            return "risk_health"
        if "renewal" in normalized:
            return "renewal"
        if "opportun" in normalized or "growth" in normalized:
            return "growth"
        return "assigned_book_search"

    def _latest_score(self, account_id: str) -> ScoreSnapshot | None:
        return self.db.scalar(select(ScoreSnapshot).where(ScoreSnapshot.account_id == account_id, ScoreSnapshot.scope == "account").order_by(ScoreSnapshot.calculated_at.desc()).limit(1))

    def _latest_kyc(self, account_id: str) -> KycSnapshot | None:
        return self.db.scalar(select(KycSnapshot).where(KycSnapshot.account_id == account_id).order_by(KycSnapshot.version.desc()).limit(1))

    def _active_signals(self, account_id: str, *, limit: int) -> list[Signal]:
        return list(
            self.db.scalars(
                select(Signal)
                .where(Signal.account_id == account_id, Signal.status.in_(("new", "reviewed", "accepted", "converted")))
                .order_by(Signal.severity.desc(), Signal.due_at.asc(), Signal.created_at.desc())
                .limit(limit)
            )
        )

    def _open_opportunities(self, account_id: str, *, limit: int) -> list[Opportunity]:
        return list(
            self.db.scalars(
                select(Opportunity)
                .where(Opportunity.account_id == account_id, Opportunity.archived_at.is_(None), Opportunity.stage.notin_(("Won", "Lost")))
                .order_by(Opportunity.updated_at.desc())
                .limit(limit)
            )
        )

    def _upcoming_governance(self, account_id: str, *, limit: int) -> list[GovernanceEvent]:
        return list(
            self.db.scalars(
                select(GovernanceEvent)
                .where(GovernanceEvent.account_id == account_id, GovernanceEvent.status.notin_(("completed", "cancelled")), GovernanceEvent.scheduled_at >= datetime.now(timezone.utc) - timedelta(days=1))
                .order_by(GovernanceEvent.scheduled_at.asc())
                .limit(limit)
            )
        )

    def _citations(
        self,
        account: Account,
        *,
        latest_score: ScoreSnapshot | None = None,
        latest_kyc: KycSnapshot | None = None,
        signals: list[Signal] | None = None,
        opportunities: list[Opportunity] | None = None,
        governance: list[GovernanceEvent] | None = None,
    ) -> list[dict[str, Any]]:
        citations = [{"type": "account", "id": account.id, "label": account.name}]
        if latest_score:
            citations.append({"type": "score_snapshot", "id": latest_score.id, "label": f"Score {latest_score.overall}"})
        if latest_kyc:
            citations.append({"type": "kyc_snapshot", "id": latest_kyc.id, "label": f"KYC v{latest_kyc.version}"})
        citations.extend({"type": "signal", "id": item.id, "label": item.title} for item in (signals or [])[:10])
        citations.extend({"type": "opportunity", "id": item.id, "label": item.name} for item in (opportunities or [])[:10])
        citations.extend({"type": "governance_event", "id": item.id, "label": item.governance_type} for item in (governance or [])[:10])
        return citations

    def _stage_actions(self, predicted: str) -> list[str]:
        if predicted == "At Risk":
            return ["Review active critical signals.", "Create or update recovery tasks.", "Schedule sponsor alignment."]
        if predicted == "Expansion Focus":
            return ["Review open opportunities.", "Confirm decision owners.", "Update growth plan next steps."]
        if predicted == "Active":
            return ["Confirm KYC completeness.", "Activate reviewed engagement records.", "Schedule first governance cadence."]
        return ["Review evidence before any stage change."]

    def _log_ai_run(
        self,
        request_type: str,
        actor: User,
        *,
        account_id: str | None = None,
        source_context: list[dict[str, Any]] | None = None,
        prompt: dict[str, Any] | None = None,
        response: dict[str, Any] | None = None,
        feedback: dict[str, Any] | None = None,
        usage: dict[str, Any] | None = None,
        affected_records: list[dict[str, Any]] | None = None,
    ) -> str | None:
        try:
            from app.services.integrations import IntegrationService

            run = IntegrationService(self.db).log_ai_gateway_run(
                request_type=request_type,
                status_value="complete",
                actor=actor,
                account_id=account_id,
                permission_scope={"module": AI_MODULE, "actor_role": actor.role, "account_id": account_id},
                source_context=source_context or [],
                response_labels=["AI-assisted", "Advisory"],
                prompt=prompt or {},
                response=response or {},
                feedback=feedback or {},
                usage=usage or {},
                affected_records=affected_records or [],
                commit=False,
            )
            return run.id
        except Exception:
            logger.exception("Failed to write AI Gateway run for %s", request_type)
            return None

    def _history_read(self, run: AiGatewayRun) -> AiQueryHistoryRead:
        response = run.response_json if isinstance(run.response_json, dict) else {}
        prompt = run.prompt_json if isinstance(run.prompt_json, dict) else {}
        usage = run.usage_json if isinstance(run.usage_json, dict) else {}
        account_name = None
        if run.account_id:
            account = self.accounts.get_by_id(run.account_id)
            account_name = account.name if account else None
        return AiQueryHistoryRead(
            id=run.id,
            run_id=run.id,
            request_type=run.request_type,
            query=prompt.get("query") or usage.get("query"),
            answer=response.get("answer") or response.get("summary"),
            account_id=run.account_id,
            account_name=account_name,
            confidence=response.get("confidence") or usage.get("confidence"),
            status=run.status,
            created_at=run.created_at,
            source_count=len(run.source_context_json or []),
        )

    def _ai_run_or_404(self, run_id: str, current_user: User) -> AiGatewayRun:
        run = self.db.get(AiGatewayRun, run_id)
        if run is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AI run was not found")
        if run.account_id:
            self._require_account_view(run.account_id, current_user)
        elif current_user.role not in GLOBAL_VIEW_ROLES and run.actor_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this AI run")
        return run

    def _setting_list(self, key: str) -> list[dict[str, Any]]:
        setting = self.db.scalar(select(PlatformSetting).where(PlatformSetting.key == key))
        value = setting.value_json if setting else []
        return [dict(item) for item in value] if isinstance(value, list) else []

    def _set_setting_list(self, key: str, value: list[dict[str, Any]], current_user: User) -> PlatformSetting:
        setting = self.db.scalar(select(PlatformSetting).where(PlatformSetting.key == key))
        if setting is None:
            setting = PlatformSetting(key=key, value_json=[], updated_by_id=current_user.id)
            self.db.add(setting)
        setting.value_json = value
        setting.updated_by_id = current_user.id
        self.db.flush()
        return setting

    def _notify_stage_change(self, account: Account, previous: str, new_stage: str, actor: User, timeline_entry_id: str) -> None:
        recipients: list[User] = []
        for owner in account.owners:
            if not owner.is_active or not owner.user:
                continue
            if owner.user.id not in {recipient.id for recipient in recipients}:
                recipients.append(owner.user)
        if not recipients and actor.id:
            recipients.append(actor)
        for recipient in recipients:
            try:
                self.notifications.queue_notification(
                    recipient=recipient,
                    trigger="ai_stage_change_confirmed",
                    title=f"{account.name} stage changed to {new_stage}",
                    body=f"{actor.full_name} confirmed an AI-assisted stage change from {previous} to {new_stage}.",
                    account=account,
                    source_record_type="timeline_entry",
                    source_record_id=timeline_entry_id,
                    source_record_route=f"/accounts/{account.id}",
                    priority="medium",
                    deduplication_key=f"ai-stage-change:{timeline_entry_id}:{recipient.id}",
                )
            except Exception:
                logger.exception("Failed to queue AI stage-change notification for user %s", recipient.id)
