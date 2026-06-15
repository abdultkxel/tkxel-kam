import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import (
    Account,
    AccountHealthRollup,
    AccountOwner,
    AccountOwnershipHistory,
    AccountPlan,
    AccountWhitespaceItem,
    DocumentExtraction,
    Engagement,
    EngagementHealthSnapshot,
    EngagementRenewalProfile,
    Escalation,
    EscalationUpdate,
    GovernanceActionItem,
    GovernanceDecision,
    GovernanceEvent,
    KycAgentRun,
    KycConfiguration,
    KycDraft,
    KycSnapshot,
    KycWorkstreamOutput,
    NotificationRecord,
    Opportunity,
    OpportunityActionItem,
    OpportunityDecision,
    OpportunityStageDefinition,
    OpportunityStageTransition,
    OpportunityType,
    PlaybookTemplate,
    PlaybookTemplateActivity,
    RetentionPlan,
    RetentionPlanAction,
    RetentionPlanMilestone,
    RetentionRecommendation,
    ScoringMetricDefinition,
    ScoringMetricVersion,
    ScoreSnapshot,
    ServiceCatalogItem,
    ServiceAdjacencyRule,
    ServiceGrowthBundle,
    ServiceGrowthBundleItem,
    ServiceGrowthRule,
    ServiceRecommendation,
    Signal,
    SourceCitation,
    SourceDocument,
    SourceDocumentChunk,
    SourceDocumentExtraction,
    SignalRule,
    Stakeholder,
    StakeholderCoverageGap,
    StakeholderInteraction,
    StakeholderGapRule,
    StakeholderRoleConfig,
    Task,
    TimelineEntry,
    TimelineEventTypeConfig,
    TimelineRetentionPolicy,
    User,
    utc_now,
)
from app.repositories.accounts import AccountRepository
from app.rbac import DEFAULT_ROLES
from app.security import hash_password
from app.services.email_domains import EmailDomainPolicyService
from app.services.alerts import AlertsService
from app.services.integrations import IntegrationService
from app.services.kyc import FIELD_CATALOG, WORKSTREAMS
from app.services.notifications import NotificationsService
from app.services.rbac import RbacService
from app.services.users import initials_for_name, normalize_email

DEFAULT_ROLE_USER_EMAIL_DOMAIN = "tkxel.com"
DEFAULT_ROLE_USER_NAMES = {
    "admin": "Admin",
    "kam_head": "KAM Head",
    "account_manager": "Account Manager",
    "leadership_viewer": "Leadership Executive",
}
FORECAST_DEMO_ACCOUNT_ID = "forecast-demo-account"
FORECAST_DEMO_ACCOUNT_OWNER_ID = "forecast-demo-account-owner"
FORECAST_DEMO_ENGAGEMENT_ID = "forecast-demo-active-sow"
FORECAST_DEMO_SCORE_ID = "forecast-demo-score"
FORECAST_DEMO_SIGNAL_ID = "forecast-demo-growth-signal"
FORECAST_DEMO_OPPORTUNITY_IDS = (
    "forecast-demo-analytics-expansion",
    "forecast-demo-automation-expansion",
    "forecast-demo-platform-expansion",
)
DEMO_PROJECT_SLUGS = ("cafe-zupas", "fintua", "canvs", "signals")
FIXED_TIMELINE_EVENT_TYPES: tuple[dict[str, Any], ...] = (
    {"slug": "manual_note", "name": "Manual note", "category": "manual", "module": "manual", "color_token": "surface-border", "display_order": 10},
    {"slug": "governance_event", "name": "Governance update", "category": "governance", "module": "governance", "color_token": "brand-blue-dark", "display_order": 20},
    {"slug": "escalation_event", "name": "Escalation update", "category": "escalation", "module": "escalation", "color_token": "brand-orange", "display_order": 30},
    {"slug": "opportunity_event", "name": "Opportunity update", "category": "opportunity", "module": "opportunity", "color_token": "brand-blue", "display_order": 40},
    {"slug": "client_education", "name": "Client education", "category": "education", "module": "education", "color_token": "rag-green", "display_order": 50},
)


DEMO_PROJECTS: tuple[dict[str, Any], ...] = (
    {
        "slug": "cafe-zupas",
        "account_number": 91001,
        "name": "Cafe Zupas",
        "project": "Guest Experience Modernization",
        "company_url": "https://www.cafezupas.com",
        "linkedin_url": "https://www.linkedin.com/company/cafe-zupas",
        "segment": "Growth",
        "region": "United States",
        "value": 420000,
        "health": 78,
        "risk": "warning",
        "stage": "Proposal Sent",
        "service_lines": ["Product Engineering", "QA Automation", "Cloud Integration"],
        "industry": "Fast casual restaurant operations and digital guest experience.",
        "summary": "Cafe Zupas demo account for restaurant digital ordering, loyalty, and store operations workflows.",
        "risk_note": "Menu/catalog integration and store rollout sequencing need governance attention.",
        "opportunity": "Mobile loyalty personalization expansion",
        "stakeholder": "Jordan Smith",
        "stakeholder_title": "VP Digital Guest Experience",
    },
    {
        "slug": "fintua",
        "account_number": 91002,
        "name": "Fintua",
        "project": "Fintech Platform Stabilization",
        "company_url": "https://fintua.example.com",
        "linkedin_url": "https://www.linkedin.com/company/fintua",
        "segment": "Strategic",
        "region": "North America",
        "value": 610000,
        "health": 71,
        "risk": "warning",
        "stage": "Qualified",
        "service_lines": ["Product Engineering", "Data Engineering", "Security & Compliance"],
        "industry": "Fintech payments and compliance workflow platform.",
        "summary": "Fintua demo account focused on payment workflow reliability, compliance evidence, and platform modernization.",
        "risk_note": "SOC2 evidence, payment reconciliation, and release controls require close follow-through.",
        "opportunity": "Compliance automation pod",
        "stakeholder": "Amelia Carter",
        "stakeholder_title": "Chief Product Officer",
    },
    {
        "slug": "canvs",
        "account_number": 91003,
        "name": "CANVS",
        "project": "Dedicated Team Delivery",
        "company_url": "https://canvs.example.com",
        "linkedin_url": "https://www.linkedin.com/company/canvs-demo",
        "segment": "Enterprise",
        "region": "US East",
        "value": 840000,
        "health": 86,
        "risk": "healthy",
        "stage": "Negotiation",
        "service_lines": ["Dedicated Team", "Product Engineering", "DevOps"],
        "industry": "Creative technology platform and enterprise collaboration tooling.",
        "summary": "CANVS demo account mirrors the narrative SOW style with dedicated engineering team delivery and quarterly governance.",
        "risk_note": "Hiring continuity, sprint acceptance, and product roadmap dependencies must stay visible.",
        "opportunity": "DevOps maturity expansion",
        "stakeholder": "Taylor Morgan",
        "stakeholder_title": "Head of Product",
    },
    {
        "slug": "signals",
        "account_number": 91004,
        "name": "Signals",
        "project": "Revenue Intelligence Workspace",
        "company_url": "https://signals.example.com",
        "linkedin_url": "https://www.linkedin.com/company/signals-demo",
        "segment": "Growth",
        "region": "Global",
        "value": 530000,
        "health": 64,
        "risk": "critical",
        "stage": "Identified",
        "service_lines": ["Data Engineering", "AI Assistance", "Analytics"],
        "industry": "Revenue intelligence, customer signals, and account analytics.",
        "summary": "Signals demo account for AI-assisted account intelligence, signal scoring, dashboards, and task automation.",
        "risk_note": "Model explainability, data freshness, and stakeholder alignment are active risks.",
        "opportunity": "AI insights and analytics acceleration",
        "stakeholder": "Riley Johnson",
        "stakeholder_title": "Chief Revenue Officer",
    },
)


def seed_default_data(db: Session) -> User:
    super_admin = seed_base_data(db)
    seed_approved_integrations(db, super_admin)
    seed_kyc_configuration(db)
    seed_opportunity_reference_data(db)
    seed_relationship_planning_reference_data(db)
    seed_scoring_signals_playbooks(db, super_admin)
    return super_admin


def seed_demo_project_data(db: Session, *, now: datetime | None = None) -> dict[str, Any]:
    """Seed realistic local/demo records for end-to-end project testing.

    The seed is intentionally idempotent and uses fixed record IDs so it can be
    rerun after a local reset without multiplying rows.
    """

    actor = seed_default_data(db)
    current = _aware(now or utc_now())
    account_manager = _seed_user_by_role(db, "account_manager")
    kam_head = _seed_user_by_role(db, "kam_head")
    delivery_lead = kam_head
    portfolio_reviewer = kam_head
    admin = _seed_user_by_role(db, "admin")
    account_repo = AccountRepository(db)
    opportunity_type = _seed_opportunity_type(db, actor)
    services = list(db.scalars(select(ServiceCatalogItem).where(ServiceCatalogItem.is_active.is_(True)).order_by(ServiceCatalogItem.display_order, ServiceCatalogItem.name)).all())

    results: list[dict[str, str]] = []
    for index, spec in enumerate(DEMO_PROJECTS):
        slug = str(spec["slug"])
        account_id = f"demo-project-{slug}"
        engagement_id = _demo_id(account_id, "engagement")
        document_id = _demo_id(account_id, "sow")
        source_route = f"/accounts/{account_id}?tab=kyc"
        start_date = current - timedelta(days=120 - index * 18)
        end_date = current + timedelta(days=210 + index * 35)
        renewal_date = end_date - timedelta(days=30)
        notice_deadline = end_date - timedelta(days=60)

        account = db.get(Account, account_id)
        if account is None:
            account = Account(id=account_id, name=str(spec["name"]), created_by_id=actor.id)
            db.add(account)
        account.account_number = int(spec["account_number"])
        account.name = str(spec["name"])
        account.project_name = str(spec["project"])
        account.company_url = str(spec["company_url"])
        account.linkedin_url = str(spec["linkedin_url"])
        account.segment = str(spec["segment"])
        account.region = str(spec["region"])
        account.lifecycle_status = "Active"
        account.risk_status = str(spec["risk"])
        account.commercial_value = float(spec["value"])
        account.currency = "USD"
        account.service_context = str(spec["summary"])
        account.commercial_summary = f"Demo SOW value is USD {int(spec['value']):,}; monthly delivery pod with executive governance."
        account.initial_notes = f"Demo data. {spec['risk_note']}"
        account.source_citation = f"{spec['name']} Demo SOW p1: local demo seed."
        account.health_overall = int(spec["health"])
        account.health_relationship = min(95, int(spec["health"]) + 4)
        account.health_usage = max(45, int(spec["health"]) - 2)
        account.health_delivery = max(45, int(spec["health"]) - (8 if spec["risk"] == "critical" else 1))
        account.health_commercial = min(92, int(spec["health"]) + 1)
        account.next_governance_at = current + timedelta(days=7 + index * 5)
        account.archived_at = None
        account_repo.assign_account_number(account)
        db.flush()

        _seed_account_owner(db, account, account_manager, actor, "primary_am", "Primary AM for demo project.")
        _seed_account_owner(db, account, delivery_lead, actor, "delivery_lead", "Delivery lead assigned for demo delivery governance.")

        engagement = _get_or_create(db, Engagement, engagement_id)
        engagement.account_id = account.id
        engagement.name = f"{spec['project']} SOW"
        engagement.description = f"Demo engagement for {spec['name']} covering {', '.join(spec['service_lines'])}."
        engagement.status = "active"
        engagement.owner_id = account_manager.id
        engagement.owner_name = account_manager.full_name
        engagement.ops_lead_id = delivery_lead.id
        engagement.ops_lead_name = delivery_lead.full_name
        engagement.service_lines = list(spec["service_lines"])
        engagement.source_links = [{"title": "Demo SOW", "url": source_route}]
        engagement.value = float(spec["value"])
        engagement.currency = "USD"
        engagement.delivery_status = "active" if spec["risk"] != "critical" else "watch"
        engagement.commercial_status = "healthy" if spec["risk"] == "healthy" else "watch"
        engagement.delivery_health = int(spec["health"])
        engagement.health_status = "green" if int(spec["health"]) >= 80 else "amber" if int(spec["health"]) >= 70 else "red"
        engagement.renewal_risk = "low" if spec["risk"] == "healthy" else "medium" if spec["risk"] == "warning" else "high"
        engagement.start_date = start_date
        engagement.end_date = end_date
        engagement.renewal_date = renewal_date
        engagement.notice_deadline = notice_deadline
        engagement.notice_period_days = 60
        engagement.auto_renewal = index % 2 == 0
        engagement.commercial_context = f"Commercial baseline from demo SOW. Renewal review begins {renewal_date.date().isoformat()}."
        engagement.resource_dependency = "Client product owner access, timely environment access, and monthly steering decisions."
        engagement.risks = [str(spec["risk_note"]), "Demo record for filters, dashboards, and account review."]
        engagement.source_citation = f"{spec['name']} Demo SOW p1: commercial scope and service lines."
        engagement.created_by_id = actor.id
        engagement.updated_by_id = actor.id
        engagement.archived_at = None
        db.flush()

        source_document = _seed_source_document(db, spec, account, engagement, actor, document_id, current)
        kyc_fields = _demo_kyc_fields(spec, source_document.id, source_route)
        kyc_description = _demo_kyc_description(spec)
        kyc_run = _seed_kyc_run(db, spec, account, source_document, account_manager, current, kyc_fields, kyc_description)
        kyc_draft, snapshot = _seed_kyc_records(db, spec, account, source_document, kyc_run, kam_head, kyc_fields, kyc_description, current)

        _seed_stakeholders(db, spec, account, engagement, account_manager, current)
        _seed_health_and_scores(db, spec, account, engagement, actor, current)
        _seed_signal(db, spec, account, engagement, account_manager, current)
        _seed_growth_and_retention(db, spec, account, engagement, account_manager, actor, opportunity_type, services, current)
        _seed_governance(db, spec, account, engagement, account_manager, delivery_lead, actor, current)
        _seed_escalation(db, spec, account, engagement, delivery_lead, actor, current)
        _seed_tasks(db, spec, account, engagement, account_manager, delivery_lead, actor, current)
        _seed_timeline(db, spec, account, engagement, actor, current)
        _seed_notifications(db, spec, account, engagement, kyc_draft, snapshot, account_manager, kam_head, delivery_lead, portfolio_reviewer, admin, current)
        results.append({"account_id": account.id, "account_name": account.name, "engagement_id": engagement.id})

    db.commit()
    return {"accounts": results, "count": len(results)}


def _seed_user_by_role(db: Session, role: str) -> User:
    user = db.scalar(select(User).where(User.role == role, User.is_active.is_(True)).order_by(User.created_at.asc()))
    if user is None:
        raise RuntimeError(f"No active {role} user is available. Run base seed first.")
    return user


def _get_or_create(db: Session, model: type, record_id: str):
    record = db.get(model, record_id)
    if record is None:
        record = model(id=record_id)
        db.add(record)
    return record


def _demo_id(*parts: object) -> str:
    digest = hashlib.sha1(":".join(str(part) for part in parts).encode("utf-8")).hexdigest()
    return f"dp-{digest[:33]}"


def _seed_opportunity_type(db: Session, actor: User) -> OpportunityType:
    opportunity_type = db.scalar(select(OpportunityType).where(OpportunityType.slug == "expansion"))
    if opportunity_type is None:
        opportunity_type = OpportunityType(slug="expansion", name="Expansion", description="Demo expansion opportunity.", is_active=True, display_order=1, created_by_id=actor.id)
        db.add(opportunity_type)
        db.flush()
    return opportunity_type


def _seed_account_owner(db: Session, account: Account, user: User, actor: User, role: str, rationale: str) -> AccountOwner:
    owner_id = _demo_id(account.id, "owner", role)
    owner = _get_or_create(db, AccountOwner, owner_id)
    owner.account_id = account.id
    owner.user_id = user.id
    owner.user_name = user.full_name
    owner.user_email = user.email
    owner.ownership_role = role
    owner.is_primary = role == "primary_am"
    owner.is_active = True
    owner.rationale = rationale
    owner.created_by_id = actor.id
    owner.ended_at = None
    history = _get_or_create(db, AccountOwnershipHistory, _demo_id(owner_id, "history"))
    history.account_id = account.id
    history.owner_record_id = owner.id
    history.ownership_role = role
    history.previous_user_id = None
    history.previous_user_name = None
    history.new_user_id = user.id
    history.new_user_name = user.full_name
    history.actor_id = actor.id
    history.actor_name = actor.full_name
    history.rationale = rationale
    history.source = "demo_project_seed"
    return owner


def _seed_source_document(db: Session, spec: dict[str, Any], account: Account, engagement: Engagement, actor: User, document_id: str, current: datetime) -> SourceDocument:
    raw_text = (
        f"Statement of Work - {spec['name']}\n"
        f"Client: {spec['name']}\n"
        f"Project: {spec['project']}\n"
        f"Website: {spec['company_url']}\n"
        f"LinkedIn: {spec['linkedin_url']}\n"
        f"Industry: {spec['industry']}\n"
        f"Services: {', '.join(spec['service_lines'])}\n"
        f"Commercial value: USD {int(spec['value']):,}\n"
        f"Scope: {spec['summary']}\n"
        f"Risks: {spec['risk_note']}\n"
        "Governance: Monthly steering committee, weekly delivery review, and renewal readiness checkpoints.\n"
    )
    document = _get_or_create(db, SourceDocument, document_id)
    document.account_id = account.id
    document.engagement_id = engagement.id
    document.title = f"{spec['name']} Demo SOW"
    document.source_type = "sow"
    document.file_name = f"{spec['slug']}-demo-sow.txt"
    document.file_url = None
    document.link_url = str(spec["company_url"])
    document.storage_backend = "demo_seed"
    document.storage_path = None
    document.mime_type = "text/plain"
    document.size_bytes = len(raw_text.encode("utf-8"))
    document.checksum_sha256 = f"demo-{spec['slug']}-sow-checksum"
    document.extracted_text_checksum = f"demo-{spec['slug']}-text-checksum"
    document.extraction_started_at = current - timedelta(minutes=15)
    document.extraction_completed_at = current - timedelta(minutes=14)
    document.extraction_error = None
    document.ocr_status = "not_required"
    document.ocr_engine = None
    document.uploaded_by_id = actor.id
    document.uploaded_by_name = actor.full_name
    document.extraction_status = "completed"
    document.confidence = 88
    document.pages = 1
    document.is_sensitive = False
    extraction = _get_or_create(db, SourceDocumentExtraction, _demo_id(document_id, "extraction"))
    extraction.source_document_id = document.id
    extraction.status = "completed"
    extraction.extractor_name = "demo-project-seed"
    extraction.extractor_version = "v1"
    extraction.mime_type = "text/plain"
    extraction.page_count = 1
    extraction.raw_text = raw_text
    extraction.normalized_text = raw_text
    extraction.metadata_json = {"demo": True, "source": "seed-demo-projects"}
    extraction.error_message = None
    extraction.started_at = current - timedelta(minutes=15)
    extraction.completed_at = current - timedelta(minutes=14)
    page = _get_or_create(db, DocumentExtraction, _demo_id(document_id, "page", 1))
    page.document_id = document.id
    page.extraction_id = extraction.id
    page.raw_text = raw_text
    page.page_number = 1
    page.source_file = document.file_name or document.title
    page.checksum = f"demo-{spec['slug']}-page-1"
    page.extractor_name = "demo-project-seed"
    page.extractor_version = "v1"
    page.metadata_json = {"demo": True}
    chunk = _get_or_create(db, SourceDocumentChunk, _demo_id(document_id, "chunk", 1))
    chunk.source_document_id = document.id
    chunk.extraction_id = extraction.id
    chunk.account_id = account.id
    chunk.engagement_id = engagement.id
    chunk.chunk_index = 1
    chunk.chunk_text = raw_text
    chunk.chunk_hash = f"demo-{spec['slug']}-chunk-1"
    chunk.page_number = 1
    chunk.section_label = "Demo SOW summary"
    chunk.start_offset = 0
    chunk.end_offset = len(raw_text)
    chunk.token_count = max(20, len(raw_text.split()))
    chunk.sensitivity_level = "standard"
    chunk.source_type = "sow"
    chunk.trust_score = 88
    chunk.embedding_provider = "demo_seed"
    chunk.embedding_model = "deterministic-demo-vector"
    chunk.embedding_json = [0.11 + len(str(spec["slug"])) / 100, 0.23, 0.37]
    chunk.embedding_hash = f"demo-{spec['slug']}-embedding"
    chunk.metadata_json = {"demo": True, "account": spec["name"]}
    for field_key in ("account_name", "service_context", "commercial_value", "service_lines"):
        citation = _get_or_create(db, SourceCitation, _demo_id(document_id, "citation", field_key))
        citation.source_document_id = document.id
        citation.label = f"{spec['name']} Demo SOW p1"
        citation.page_number = 1
        citation.excerpt = raw_text[:450]
        citation.field_key = field_key
        citation.confidence = 88
    return document


def _workstream_title(workstream_key: str) -> str:
    return next(str(item["title"]) for item in WORKSTREAMS if item["key"] == workstream_key)


def _demo_kyc_fields(spec: dict[str, Any], source_document_id: str, source_route: str) -> list[dict[str, Any]]:
    values = {
        "industry_overview": spec["industry"],
        "market_trends": f"{spec['name']} operates in a market where digital experience, data quality, automation, and executive visibility are key growth levers.",
        "market_size_growth": "Use this demo field to validate market research editing, citations, and confidence display.",
        "business_drivers": f"Primary drivers are {spec['project']}, customer experience quality, delivery speed, governance reliability, and renewal readiness.",
        "competitors": "Competitive pressure is represented as a demo placeholder for reviewer enrichment.",
        "regulatory": "No production regulatory claim is made; use this demo field to test missing-evidence and reviewer-note workflows.",
        "company_snapshot": f"{spec['name']} - {spec['summary']}",
        "company_profile": f"{spec['name']} is seeded as a demo strategic account with website {spec['company_url']} and LinkedIn {spec['linkedin_url']}.",
        "strategy": f"Focus on {spec['project']} with measurable delivery, governance, and growth outcomes.",
        "company_history": "Demo history is intentionally concise; enrich through KYC web research during testing.",
        "core_offerings": f"Relevant offerings include {', '.join(spec['service_lines'])}.",
        "monetization_model": "Commercial relationship is modeled as a monthly delivery pod with renewal governance checkpoints.",
        "key_achievements": "Demo KYC has an approved v1 snapshot and a ready draft for versioning tests.",
        "clients_and_segments": f"Segment: {spec['segment']}; Region: {spec['region']}.",
        "digital_products": f"{spec['project']} depends on product engineering, platform reliability, and operational analytics.",
        "website_and_social": f"Website: {spec['company_url']}; LinkedIn: {spec['linkedin_url']}.",
        "stakeholder_map": f"Executive sponsor: {spec['stakeholder']} ({spec['stakeholder_title']}); Tkxel AM and Delivery Lead are seeded.",
        "technical_landscape": "Demo technical landscape includes APIs, data workflows, QA automation, cloud delivery, and reporting.",
        "client_stakeholders": f"{spec['stakeholder']} is seeded as the client-side executive stakeholder.",
        "tkxel_stakeholders": "Account Manager owns relationship cadence; Delivery Lead owns delivery health, escalations, governance actions, and tasks.",
        "project_charters": f"Demo SOW for {spec['project']} is stored as source context.",
        "engagement_models": "Dedicated delivery pod with weekly delivery review and monthly steering committee.",
        "obligations": "Track sprint commitments, release quality, governance actions, and renewal readiness.",
        "past_engagements": "Seeded data represents the first active engagement for this account.",
        "renewal_cycle": "Renewal readiness starts 60 days before SOW end date with portfolio approval review.",
        "payment_behaviour": "Demo sensitive field: payment behavior should be visible only to authorized roles.",
        "gross_margins": "Demo sensitive field: margin details are placeholders for RBAC testing.",
        "billing_models": "Monthly delivery pod billing with milestone/governance reporting.",
    }
    fields: list[dict[str, Any]] = []
    for item in FIELD_CATALOG:
        key = str(item["key"])
        confidence = 86 if key in {"company_snapshot", "service_context", "project_charters"} else 78
        fields.append(
            {
                "key": key,
                "label": item["label"],
                "workstream_key": item["workstream_key"],
                "workstream_title": _workstream_title(str(item["workstream_key"])),
                "value": values.get(key, f"{spec['name']} demo value for {item['label']}."),
                "confidence": confidence,
                "is_required": bool(item.get("required", True)),
                "is_sensitive": bool(item.get("sensitive", False)),
                "reviewed": False,
                "missing": False,
                "conflict": False,
                "previous_value": None,
                "citations": [
                    {
                        "source_document_id": source_document_id,
                        "label": f"{spec['name']} Demo SOW p1",
                        "page_number": 1,
                        "section_label": "Demo SOW summary",
                        "excerpt": f"{spec['summary']} Services: {', '.join(spec['service_lines'])}.",
                        "field_key": key,
                        "restricted": bool(item.get("sensitive", False)),
                        "confidence": confidence,
                        "source_route": source_route,
                    }
                ],
                "missing_evidence_note": "Seeded demo evidence. Replace with reviewed client/source evidence during real use.",
                "conflicts": [],
                "reviewer_notes": ["Demo KYC field for role, versioning, approval, and citation testing."],
                "suggested_follow_up_questions": [f"Confirm current {item['label']} with the client sponsor."],
            }
        )
    return fields


def _demo_kyc_description(spec: dict[str, Any]) -> str:
    return (
        f"<h3>{spec['name']} KYC Demo Brief</h3>"
        f"<p><strong>Project:</strong> {spec['project']}</p>"
        f"<p>{spec['summary']}</p>"
        f"<p><strong>Service lines:</strong> {', '.join(spec['service_lines'])}</p>"
        f"<p><strong>Risk focus:</strong> {spec['risk_note']}</p>"
    )


def _seed_kyc_run(
    db: Session,
    spec: dict[str, Any],
    account: Account,
    source_document: SourceDocument,
    actor: User,
    current: datetime,
    fields: list[dict[str, Any]],
    detailed_description: str,
) -> KycAgentRun:
    run = _get_or_create(db, KycAgentRun, f"{account.id}-kyc-run")
    run.account_id = account.id
    run.status = "complete"
    run.trigger_source = "demo_project_seed"
    run.previous_run_id = None
    run.source_document_ids = [source_document.id]
    run.research_sources = ["documents", "engagements", "timeline", "demo_seed"]
    run.triggered_by_id = actor.id
    run.triggered_by_name = actor.full_name
    run.error_message = None
    run.queued_at = current - timedelta(minutes=10)
    run.retry_count = 0
    run.max_retries = 0
    run.next_retry_at = None
    run.retrieval_summary_json = {"source_documents": 1, "chunks": 1, "demo": True}
    run.provider_json = {"provider": "demo_seed", "model": "static-demo-kyc"}
    run.usage_json = {"tokens": 0, "external_calls": 0}
    run.cost_json = {"amount": 0, "currency": "USD"}
    run.detailed_description = detailed_description
    run.provider_response_id = f"demo-{spec['slug']}"
    run.model_name = "demo-seed"
    run.started_at = current - timedelta(minutes=9)
    run.completed_at = current - timedelta(minutes=8)
    for workstream in WORKSTREAMS:
        key = str(workstream["key"])
        workstream_fields = {field["key"]: {"value": field["value"], "confidence": field["confidence"], "citations": field["citations"], "missing_evidence_note": field["missing_evidence_note"]} for field in fields if field["workstream_key"] == key}
        output = _get_or_create(db, KycWorkstreamOutput, _demo_id(run.id, "workstream", key))
        output.run_id = run.id
        output.account_id = account.id
        output.workstream_key = key
        output.title = str(workstream["title"])
        output.status = "complete"
        output.sort_order = int(workstream["sort_order"])
        output.output_json = workstream_fields
        output.citations_json = [citation for field in fields if field["workstream_key"] == key for citation in field["citations"]]
        output.missing_fields = []
        output.confidence = round(sum(int(item["confidence"]) for item in workstream_fields.values()) / max(len(workstream_fields), 1))
        output.reviewer_notes_json = ["Seeded KYC workstream output for demo testing."]
        output.follow_up_questions_json = [f"Validate {workstream['title']} with account owner."]
        output.retrieved_chunk_ids = [f"{source_document.id}-chunk-1"]
        output.provider_response_id = f"demo-{spec['slug']}-{key}"
        output.error_message = None
        output.started_at = run.started_at
        output.completed_at = run.completed_at
    return run


def _seed_kyc_records(
    db: Session,
    spec: dict[str, Any],
    account: Account,
    source_document: SourceDocument,
    run: KycAgentRun,
    approver: User,
    fields: list[dict[str, Any]],
    detailed_description: str,
    current: datetime,
) -> tuple[KycDraft, KycSnapshot]:
    citations = [citation for field in fields for citation in field["citations"]]
    confidence = round(sum(int(field["confidence"]) for field in fields) / len(fields))
    draft = _get_or_create(db, KycDraft, _demo_id(account.id, "kyc-draft"))
    draft.account_id = account.id
    draft.status = "ready_for_review"
    draft.trigger_source = "demo_project_seed"
    draft.agent_run_id = run.id
    snapshot_id = _demo_id(account.id, "kyc-snapshot", 1)
    draft.previous_snapshot_id = None
    draft.source_document_ids = [source_document.id]
    draft.research_sources = ["documents", "engagements", "timeline", "demo_seed"]
    draft.fields_json = fields
    draft.citations_json = citations
    draft.missing_fields = []
    draft.conflicts = []
    draft.difference_summary = ["Demo draft is ready for review and can be approved or edited."]
    draft.source_context = {"demo": True, "account": spec["name"], "source_document_ids": [source_document.id]}
    draft.detailed_description = detailed_description
    draft.confidence = confidence
    draft.completeness = 100
    draft.source_coverage = 100
    draft.freshness_status = "fresh"
    draft.low_confidence_acknowledged = True
    draft.conflicts_acknowledged = True
    draft.review_notes = "Seeded demo draft for KYC testing."
    draft.created_by_id = approver.id
    draft.created_by_name = approver.full_name
    draft.approved_snapshot_id = None
    db.flush()
    snapshot = _get_or_create(db, KycSnapshot, snapshot_id)
    snapshot.account_id = account.id
    snapshot.version = 1
    snapshot.source_draft_id = draft.id
    snapshot.extraction_run_id = run.id
    snapshot.approved_by_id = approver.id
    snapshot.approved_by_name = approver.full_name
    snapshot.approved_at = current - timedelta(days=2)
    snapshot.fields_json = fields
    snapshot.citations_json = citations
    snapshot.source_context = draft.source_context
    snapshot.detailed_description = detailed_description
    snapshot.source_document_ids = [source_document.id]
    snapshot.research_sources = draft.research_sources
    snapshot.confidence = confidence
    snapshot.completeness = 100
    snapshot.source_coverage = 100
    snapshot.freshness_status = "fresh"
    snapshot.missing_fields = []
    snapshot.conflicts = []
    snapshot.change_summary = ["Initial approved demo KYC snapshot."]
    db.flush()
    draft.previous_snapshot_id = snapshot.id
    draft.approved_snapshot_id = snapshot.id
    return draft, snapshot


def _seed_stakeholders(db: Session, spec: dict[str, Any], account: Account, engagement: Engagement, actor: User, current: datetime) -> None:
    stakeholder = _get_or_create(db, Stakeholder, _demo_id(account.id, "stakeholder", "executive"))
    stakeholder.account_id = account.id
    stakeholder.engagement_id = engagement.id
    stakeholder.reports_to_stakeholder_id = None
    stakeholder.name = str(spec["stakeholder"])
    stakeholder.title = str(spec["stakeholder_title"])
    stakeholder.company = str(spec["name"])
    stakeholder.email = f"{spec['slug'].replace('-', '.')}@example.com"
    stakeholder.phone = None
    stakeholder.linkedin_url = str(spec["linkedin_url"])
    stakeholder.role = "executive_sponsor"
    stakeholder.influence = "high"
    stakeholder.relationship_strength = "warm" if spec["risk"] != "critical" else "developing"
    stakeholder.sentiment = "positive" if spec["risk"] == "healthy" else "neutral"
    stakeholder.political_risk = "low" if spec["risk"] == "healthy" else "medium"
    stakeholder.status = "active"
    stakeholder.notes = f"Demo stakeholder seeded for {spec['name']} relationship mapping."
    stakeholder.last_interaction_at = current - timedelta(days=5)
    stakeholder.is_sensitive = False
    stakeholder.created_by_id = actor.id
    stakeholder.updated_by_id = actor.id

    interaction = _get_or_create(db, StakeholderInteraction, _demo_id(account.id, "stakeholder-interaction"))
    interaction.stakeholder_id = stakeholder.id
    interaction.account_id = account.id
    interaction.engagement_id = engagement.id
    interaction.interaction_type = "governance"
    interaction.subject = f"{spec['name']} demo executive check-in"
    interaction.description = f"Reviewed {spec['project']} delivery health, risks, and next governance actions."
    interaction.channel = "meeting"
    interaction.sentiment = stakeholder.sentiment
    interaction.relationship_strength = stakeholder.relationship_strength
    interaction.political_risk = stakeholder.political_risk
    interaction.outcome = "Action items agreed for demo testing."
    interaction.next_action = "Confirm next executive checkpoint."
    interaction.interaction_at = current - timedelta(days=5)
    interaction.is_sensitive = False
    interaction.metadata_json = {"demo": True}
    interaction.created_by_id = actor.id
    interaction.created_by_name = actor.full_name

    gap = _get_or_create(db, StakeholderCoverageGap, _demo_id(account.id, "stakeholder-gap"))
    gap.account_id = account.id
    gap.rule_key = "economic_buyer_coverage"
    gap.severity = "medium" if spec["risk"] != "critical" else "high"
    gap.title = "Confirm economic buyer coverage"
    gap.description = "Seeded demo gap to test stakeholder coverage filters and follow-up actions."
    gap.evidence = {"stakeholder": stakeholder.name, "demo": True}
    gap.status = "open"


def _seed_health_and_scores(db: Session, spec: dict[str, Any], account: Account, engagement: Engagement, actor: User, current: datetime) -> None:
    score = _get_or_create(db, ScoreSnapshot, _demo_id(account.id, "score"))
    score.account_id = account.id
    score.engagement_id = engagement.id
    score.scope = "account"
    score.overall = int(spec["health"])
    score.rag_status = "green" if int(spec["health"]) >= 80 else "amber" if int(spec["health"]) >= 70 else "red"
    score.drivers = ["delivery_health", "relationship_coverage", "renewal_readiness"]
    score.reason_codes = [str(spec["risk_note"])]
    score.metric_version = "demo-score-v1"
    score.freshness_status = "fresh"
    score.is_dirty = False
    score.trend = 4 if spec["risk"] == "healthy" else -3 if spec["risk"] == "critical" else 1
    score.status = "complete"
    score.source_context = {"source": "demo_project_seed"}
    score.calculated_by_id = actor.id
    score.calculated_by_name = actor.full_name
    score.calculated_at = current - timedelta(days=1)

    health = _get_or_create(db, EngagementHealthSnapshot, _demo_id(engagement.id, "health"))
    health.engagement_id = engagement.id
    health.account_id = account.id
    health.overall = int(spec["health"])
    health.rag_status = score.rag_status
    health.drivers = [{"name": "Delivery health", "score": engagement.delivery_health}, {"name": "Risk", "detail": spec["risk_note"]}]
    health.freshness_status = "fresh"
    health.is_dirty = False
    health.contribution = 1.0
    health.metric_version = "engagement-v1"
    health.created_by_id = actor.id
    health.created_by_name = actor.full_name

    rollup = _get_or_create(db, AccountHealthRollup, _demo_id(account.id, "rollup"))
    rollup.account_id = account.id
    rollup.overall = int(spec["health"])
    rollup.rag_status = score.rag_status
    rollup.contributions = [{"engagement_id": engagement.id, "name": engagement.name, "overall": int(spec["health"])}]
    rollup.metric_version = "account-rollup-v1"


def _seed_signal(db: Session, spec: dict[str, Any], account: Account, engagement: Engagement, owner: User, current: datetime) -> None:
    rule = db.scalar(select(SignalRule).order_by(SignalRule.created_at.asc()))
    signal = _get_or_create(db, Signal, _demo_id(account.id, "signal"))
    signal.account_id = account.id
    signal.engagement_id = engagement.id
    signal.rule_id = rule.id if rule else None
    signal.signal_type = "renewal_risk" if spec["risk"] != "healthy" else "growth_opportunity"
    signal.severity = "critical" if spec["risk"] == "critical" else "warning" if spec["risk"] == "warning" else "info"
    signal.status = "new"
    signal.owner_id = owner.id
    signal.owner_name = owner.full_name
    signal.title = f"{spec['name']} demo attention signal"
    signal.detail = f"{spec['risk_note']} Growth candidate: {spec['opportunity']}."
    signal.reason_codes = ["demo_project_seed", str(spec["risk"])]
    signal.evidence_json = [{"label": "Demo SOW", "value": spec["project"]}, {"label": "Health", "value": spec["health"]}]
    signal.citations_json = [{"label": f"{spec['name']} Demo SOW p1", "excerpt": spec["summary"], "confidence": 82}]
    signal.source_record_type = "engagement"
    signal.source_record_id = engagement.id
    signal.source_record_route = f"/accounts/{account.id}?tab=health"
    signal.confidence = 82
    signal.condition_key = f"demo_project_seed:{spec['slug']}"
    signal.due_at = current + timedelta(days=4)
    signal.resolved_at = None
    signal.dismissed_at = None


def _seed_growth_and_retention(
    db: Session,
    spec: dict[str, Any],
    account: Account,
    engagement: Engagement,
    owner: User,
    actor: User,
    opportunity_type: OpportunityType,
    services: list[ServiceCatalogItem],
    current: datetime,
) -> None:
    plan = _get_or_create(db, AccountPlan, _demo_id(account.id, "plan"))
    plan.account_id = account.id
    plan.retention_focus = f"Protect renewal by addressing: {spec['risk_note']}"
    plan.growth_focus = f"Expand through {spec['opportunity']}."
    plan.risks = [spec["risk_note"]]
    plan.opportunities = str(spec["opportunity"])
    plan.commitments = ["Monthly governance review", "KYC refresh before renewal", "Delivery action review"]
    plan.service_gaps = ["Validate adjacent service whitespace"]
    plan.review_cadence = "monthly"
    plan.next_review_at = current + timedelta(days=21)
    plan.status = "active"
    plan.created_by_id = actor.id
    plan.created_by_name = actor.full_name
    plan.updated_by_id = actor.id
    plan.updated_by_name = actor.full_name

    opportunity = _get_or_create(db, Opportunity, _demo_id(account.id, "opportunity"))
    opportunity.account_id = account.id
    opportunity.engagement_id = engagement.id
    opportunity.type_id = opportunity_type.id
    opportunity.owner_id = owner.id
    opportunity.owner_name = owner.full_name
    opportunity.owner_email = owner.email
    opportunity.name = str(spec["opportunity"])
    opportunity.service_line = str(spec["service_lines"][0])
    opportunity.value = round(float(spec["value"]) * 0.28, 2)
    opportunity.currency = "USD"
    opportunity.stage = str(spec["stage"])
    opportunity.next_step = "Validate whitespace with stakeholder and prepare next-step plan."
    opportunity.target_date = current + timedelta(days=35)
    opportunity.source_context = "demo_project_seed"
    opportunity.source_record_id = engagement.id
    opportunity.source_record_type = "engagement"
    opportunity.source_record_route = f"/accounts/{account.id}?tab=opportunities"
    opportunity.outcome_reason = None
    opportunity.archived_at = None
    opportunity.created_by_id = actor.id
    opportunity.created_by_name = actor.full_name
    opportunity.updated_by_id = actor.id
    opportunity.updated_by_name = actor.full_name

    decision = _get_or_create(db, OpportunityDecision, _demo_id(opportunity.id, "decision"))
    decision.opportunity_id = opportunity.id
    decision.decision_text = "Proceed with discovery validation for seeded demo opportunity."
    decision.owner_id = owner.id
    decision.owner_name = owner.full_name
    decision.created_by_id = actor.id
    decision.created_by_name = actor.full_name

    action_item = _get_or_create(db, OpportunityActionItem, _demo_id(opportunity.id, "action"))
    action_item.opportunity_id = opportunity.id
    action_item.title = "Prepare expansion validation brief"
    action_item.owner_id = owner.id
    action_item.owner_name = owner.full_name
    action_item.owner_email = owner.email
    action_item.due_at = current + timedelta(days=10)
    action_item.status = "open"
    action_item.priority = "medium"
    action_item.notes = "Seeded opportunity action for demo testing."
    action_item.created_by_id = actor.id
    action_item.created_by_name = actor.full_name

    if services:
        target = services[min(1, len(services) - 1)]
        whitespace = _get_or_create(db, AccountWhitespaceItem, _demo_id(account.id, "whitespace"))
        whitespace.account_id = account.id
        whitespace.engagement_id = engagement.id
        whitespace.service_id = target.id
        whitespace.service_name_snapshot = target.name
        whitespace.coverage_status = "potential"
        whitespace.notes = f"Whitespace candidate for {spec['name']} demo growth review."
        whitespace.source = "demo_project_seed"
        whitespace.created_by_id = actor.id
        whitespace.updated_by_id = actor.id
        recommendation = _get_or_create(db, ServiceRecommendation, _demo_id(account.id, "service-recommendation"))
        recommendation.account_id = account.id
        recommendation.source_service_id = services[0].id
        recommendation.target_service_id = target.id
        recommendation.relevance_score = 82
        recommendation.rationale = f"{target.name} is a plausible adjacent service for {spec['project']}."
        recommendation.status = "recommended"
        recommendation.source_context = "demo_project_seed"
        recommendation.created_opportunity_id = opportunity.id

    renewal = _get_or_create(db, EngagementRenewalProfile, _demo_id(engagement.id, "renewal"))
    renewal.account_id = account.id
    renewal.engagement_id = engagement.id
    renewal.renewal_readiness = "ready" if spec["risk"] == "healthy" else "watch"
    renewal.renewal_risk = engagement.renewal_risk
    renewal.confidence = 80
    renewal.commercial_exposure = float(spec["value"])
    renewal.commercial_exposure_currency = "USD"
    renewal.owner_id = owner.id
    renewal.owner_name = owner.full_name
    renewal.source_type = "demo_project_seed"
    renewal.source_citation = f"{spec['name']} demo SOW renewal terms."
    renewal.created_by_id = actor.id
    renewal.updated_by_id = actor.id

    retention = _get_or_create(db, RetentionPlan, _demo_id(account.id, "retention"))
    retention.account_id = account.id
    retention.engagement_id = engagement.id
    retention.plan_type = "retention"
    retention.status = "active"
    retention.title = f"{spec['name']} renewal protection plan"
    retention.summary = f"Protect renewal by resolving {spec['risk_note']}"
    retention.owner_id = owner.id
    retention.owner_name = owner.full_name
    retention.owner_email = owner.email
    retention.renewal_milestone_at = engagement.renewal_date
    retention.success_criteria = ["Executive sponsor confirms value", "Delivery risks reviewed", "Renewal path documented"]
    retention.source_context = "demo_project_seed"
    retention.created_by_id = actor.id
    retention.created_by_name = actor.full_name
    retention.updated_by_id = actor.id
    retention.updated_by_name = actor.full_name
    milestone = _get_or_create(db, RetentionPlanMilestone, _demo_id(retention.id, "milestone"))
    milestone.retention_plan_id = retention.id
    milestone.title = "Renewal readiness checkpoint"
    milestone.due_at = current + timedelta(days=30)
    milestone.status = "open"
    action = _get_or_create(db, RetentionPlanAction, _demo_id(retention.id, "action"))
    action.retention_plan_id = retention.id
    action.milestone_id = milestone.id
    action.account_id = account.id
    action.engagement_id = engagement.id
    action.title = "Validate renewal blockers"
    action.owner_id = owner.id
    action.owner_name = owner.full_name
    action.owner_email = owner.email
    action.due_at = current + timedelta(days=12)
    action.status = "open"
    action.priority = "high" if spec["risk"] == "critical" else "medium"
    action.success_criteria = ["Blockers documented", "Owner assigned", "KAM Head visibility confirmed"]
    action.created_by_id = actor.id
    action.created_by_name = actor.full_name
    recommendation = _get_or_create(db, RetentionRecommendation, _demo_id(account.id, "retention-recommendation"))
    recommendation.account_id = account.id
    recommendation.engagement_id = engagement.id
    recommendation.title = "Review renewal risk"
    recommendation.rationale = str(spec["risk_note"])
    recommendation.severity = "high" if spec["risk"] == "critical" else "medium"
    recommendation.recommended_action = "Schedule portfolio approval review and align next governance checkpoint."
    recommendation.source_context = "demo_project_seed"
    recommendation.status = "recommended"


def _seed_governance(db: Session, spec: dict[str, Any], account: Account, engagement: Engagement, owner: User, delivery_lead: User, actor: User, current: datetime) -> GovernanceEvent:
    event = _get_or_create(db, GovernanceEvent, _demo_id(account.id, "governance"))
    event.account_id = account.id
    event.engagement_id = engagement.id
    event.owner_id = owner.id
    event.owner_name = owner.full_name
    event.governance_type = "Monthly Steering Committee"
    event.source = "manual"
    event.external_provider = None
    event.external_event_id = None
    event.deduplication_key = f"demo-project-governance:{account.id}"
    event.mapping_confidence = 100
    event.review_required = False
    event.scheduled_at = current + timedelta(days=7)
    event.end_at = current + timedelta(days=7, hours=1)
    event.status = "scheduled"
    event.agenda = f"Review {spec['project']} delivery health, KYC updates, risks, and expansion path."
    event.notes = "Seeded governance event for dashboard/calendar testing."
    event.attendees = [owner.email, delivery_lead.email, f"{spec['slug'].replace('-', '.')}@example.com"]
    event.created_by_id = actor.id
    event.created_by_name = actor.full_name
    event.completed_at = None
    decision = _get_or_create(db, GovernanceDecision, _demo_id(event.id, "decision"))
    decision.governance_event_id = event.id
    decision.decision_text = "Keep monthly governance cadence active for demo account."
    decision.owner_id = owner.id
    decision.owner_name = owner.full_name
    action = _get_or_create(db, GovernanceActionItem, _demo_id(event.id, "action"))
    action.governance_event_id = event.id
    action.title = "Share governance pre-read"
    action.owner_id = delivery_lead.id
    action.owner_name = delivery_lead.full_name
    action.owner_email = delivery_lead.email
    action.due_at = current + timedelta(days=3)
    action.status = "open"
    action.priority = "medium"
    return event


def _seed_escalation(db: Session, spec: dict[str, Any], account: Account, engagement: Engagement, owner: User, actor: User, current: datetime) -> None:
    escalation = _get_or_create(db, Escalation, _demo_id(account.id, "escalation"))
    escalation.account_id = account.id
    escalation.engagement_id = engagement.id
    escalation.summary = f"{spec['name']} demo delivery risk"
    escalation.impact = str(spec["risk_note"])
    escalation.severity = "critical" if spec["risk"] == "critical" else "medium"
    escalation.priority = "high" if spec["risk"] != "healthy" else "medium"
    escalation.status = "open" if spec["risk"] != "healthy" else "monitoring"
    escalation.owner_id = owner.id
    escalation.owner_name = owner.full_name
    escalation.sla_due_at = current + timedelta(days=2)
    escalation.watchlist = spec["risk"] != "healthy"
    escalation.mitigation = "Track in governance, assign owner, and confirm recovery action."
    escalation.recovery_actions = "Seeded recovery action for demo escalation workflow."
    escalation.communication_cadence = "twice_weekly" if spec["risk"] == "critical" else "weekly"
    escalation.created_by_id = actor.id
    escalation.created_by_name = actor.full_name
    update = _get_or_create(db, EscalationUpdate, _demo_id(escalation.id, "update"))
    update.escalation_id = escalation.id
    update.update_type = "operations_update"
    update.body = "Demo escalation created for testing filters, SLA, notifications, and timeline."
    update.actor_id = actor.id
    update.actor_name = actor.full_name
    update.metadata_json = {"demo": True}


def _seed_tasks(db: Session, spec: dict[str, Any], account: Account, engagement: Engagement, owner: User, delivery_lead: User, actor: User, current: datetime) -> None:
    task_specs = (
        ("kyc-review", "Review seeded KYC draft", owner, "high", current + timedelta(days=2)),
        ("governance-prep", "Prepare governance pre-read", delivery_lead, "medium", current + timedelta(days=5)),
        ("renewal-risk", "Validate renewal blockers", owner, "high" if spec["risk"] == "critical" else "medium", current + timedelta(days=9)),
    )
    for key, title, task_owner, priority, due_at in task_specs:
        task = _get_or_create(db, Task, _demo_id(account.id, "task", key))
        task.account_id = account.id
        task.engagement_id = engagement.id
        task.playbook_execution_id = None
        task.template_activity_id = None
        task.source_type = "demo_project_seed"
        task.source_record_id = account.id
        task.source_metric = key
        task.title = f"{spec['name']}: {title}"
        task.description = f"Seeded task for {spec['project']} demo workflow."
        task.owner_id = task_owner.id
        task.owner_name = task_owner.full_name
        task.due_at = due_at
        task.status = "open"
        task.priority = priority
        task.notes = "Created by seed-demo-projects."
        task.success_criteria = ["Owner reviews item", "Outcome captured in timeline"]
        task.requires_evidence = key == "renewal-risk"
        task.created_by_id = actor.id
        task.updated_by_id = actor.id


def _seed_timeline(db: Session, spec: dict[str, Any], account: Account, engagement: Engagement, actor: User, current: datetime) -> None:
    entries = (
        ("created", "Account seeded", "Demo account, engagement, KYC, and support records were seeded.", current - timedelta(days=3)),
        ("kyc", "KYC draft prepared", "Demo KYC fields and approved snapshot are available for review.", current - timedelta(days=2)),
        ("governance", "Governance cadence scheduled", "Monthly steering committee is scheduled and visible in governance/calendar widgets.", current - timedelta(days=1)),
    )
    for key, title, description, event_at in entries:
        entry = _get_or_create(db, TimelineEntry, _demo_id(account.id, "timeline", key))
        entry.account_id = account.id
        entry.engagement_id = engagement.id
        entry.event_type = key
        entry.module = "demo_project_seed"
        entry.title = f"{spec['name']}: {title}"
        entry.description = description
        entry.performed_by = actor.id
        entry.performed_by_name = actor.full_name
        entry.source_record_id = account.id
        entry.source_record_type = "account"
        entry.source_record_route = f"/accounts/{account.id}?tab=timeline"
        entry.before_value = None
        entry.after_value = {"demo": True, "account": spec["name"]}
        entry.is_sensitive = False
        entry.is_system_generated = True
        entry.is_immutable = True
        entry.metadata_json = {"demo": True}
        entry.event_at = event_at
        entry.sensitivity_level = "standard"
        entry.tags = ["demo", str(spec["slug"])]
        entry.mentions = []
        entry.attachments = []
        entry.status = "active"
        entry.source_hash = f"demo-project:{account.id}:{key}"
        entry.idempotency_key = f"demo-project:{account.id}:{key}"


def _seed_notifications(
    db: Session,
    spec: dict[str, Any],
    account: Account,
    engagement: Engagement,
    kyc_draft: KycDraft,
    snapshot: KycSnapshot,
    account_manager: User,
    kam_head: User,
    delivery_lead: User,
    leadership: User,
    admin: User,
    current: datetime,
) -> None:
    notifications = (
        (account_manager, "task_assigned", "KYC review task assigned", f"Review KYC and account plan for {spec['name']}.", "high", kyc_draft.id, "kyc_draft", f"/accounts/{account.id}?tab=kyc"),
        (kam_head, "kyc_ready_for_review", "KYC draft ready for approval", f"{spec['name']} has a seeded KYC draft and approved v1 snapshot.", "high", kyc_draft.id, "kyc_draft", f"/accounts/{account.id}?tab=kyc"),
        (delivery_lead, "governance_action_due", "Governance action due", f"Prepare delivery update for {spec['name']} governance review.", "medium", engagement.id, "engagement", f"/accounts/{account.id}?tab=governance"),
        (leadership, "portfolio_risk_update", "Portfolio account available", f"{spec['name']} is available for strategic dashboard and risk review.", "medium", account.id, "account", f"/accounts/{account.id}"),
        (admin, "demo_seed_complete", "Demo account seeded", f"{spec['name']} demo data is ready for testing.", "low", snapshot.id, "kyc_snapshot", f"/accounts/{account.id}?tab=kyc"),
    )
    for recipient, trigger, title, body, priority, source_id, source_type, route in notifications:
        record = _get_or_create(db, NotificationRecord, _demo_id(account.id, "notification", recipient.id, trigger))
        record.recipient_user_id = recipient.id
        record.recipient_name = recipient.full_name
        record.recipient_email = recipient.email
        record.trigger = trigger
        record.workflow = "demo_project_seed"
        record.title = f"{spec['name']}: {title}"
        record.body = body
        record.account_id = account.id
        record.account_name_snapshot = account.name
        record.source_record_type = source_type
        record.source_record_id = source_id
        record.source_record_route = route
        record.priority = priority
        record.action_label = "Open"
        record.channel = "in_app"
        record.delivery_status = "delivered"
        record.delivery_metadata_json = {"demo": True}
        record.deduplication_key = f"demo-project:{account.id}:{recipient.id}:{trigger}"
        record.email_queued = False
        record.retry_count = 0
        record.error_message = None
        record.read_at = None
        record.archived_at = None
        record.delivered_at = current


def seed_base_data(db: Session) -> User:
    RbacService(db).seed_defaults()
    super_admin = seed_super_admin(db)
    seed_allowed_email_domains(db, super_admin)
    if get_settings().seed_default_role_users:
        seed_default_role_users(db)
    seed_notifications_dashboards_reporting(db, super_admin)
    seed_timeline_reference_data(db, super_admin)
    return super_admin


def seed_forecast_demo_data(db: Session, *, now: datetime | None = None) -> dict[str, Any]:
    actor = seed_base_data(db)
    seed_opportunity_reference_data(db)
    owner = db.scalar(select(User).where(User.email == normalize_email("account.manager.user@tkxel.com")))
    if owner is None:
        owner = db.scalar(select(User).where(User.role == "account_manager").order_by(User.created_at.asc()))
    if owner is None:
        raise RuntimeError("No account_manager user is available for forecast demo ownership.")

    current = _aware(now or utc_now())
    window_start = _first_day_next_month(current)
    contract_start = _add_months(window_start, -1)
    contract_end = _add_months(window_start, 6) - timedelta(days=1)
    account = db.get(Account, FORECAST_DEMO_ACCOUNT_ID)
    if account is None:
        account = Account(id=FORECAST_DEMO_ACCOUNT_ID, name="Forecast Demo Account", created_by_id=actor.id)
        db.add(account)
    account.name = "Forecast Demo Account"
    account.project_name = "Demo Forecast Workspace"
    account.company_url = "https://example.com/forecast-demo"
    account.segment = "Growth"
    account.region = "US"
    account.lifecycle_status = "Active"
    account.risk_status = "healthy"
    account.commercial_value = 240000
    account.currency = "USD"
    account.service_context = "Demo source-backed account used only for local forecast chart QA."
    account.commercial_summary = "Demo account with active SOW baseline and staged expansion opportunities."
    account.initial_notes = "Seeded by the opt-in forecast demo command. Safe to remove with clear-forecast-demo."
    account.source_citation = "Forecast demo seed data."
    account.health_overall = 82
    account.health_relationship = 80
    account.health_usage = 84
    account.health_delivery = 81
    account.health_commercial = 85
    account.next_governance_at = window_start + timedelta(days=21)
    account.archived_at = None

    owner_record = db.get(AccountOwner, FORECAST_DEMO_ACCOUNT_OWNER_ID)
    if owner_record is None:
        owner_record = AccountOwner(id=FORECAST_DEMO_ACCOUNT_OWNER_ID, account_id=account.id, user_name=owner.full_name, ownership_role="primary_am")
        db.add(owner_record)
    owner_record.account_id = account.id
    owner_record.user_id = owner.id
    owner_record.user_name = owner.full_name
    owner_record.user_email = owner.email
    owner_record.ownership_role = "primary_am"
    owner_record.is_primary = True
    owner_record.is_active = True
    owner_record.rationale = "Opt-in demo owner for source-backed forecast chart validation."
    owner_record.created_by_id = actor.id
    owner_record.ended_at = None

    engagement = db.get(Engagement, FORECAST_DEMO_ENGAGEMENT_ID)
    if engagement is None:
        engagement = Engagement(
            id=FORECAST_DEMO_ENGAGEMENT_ID,
            account_id=account.id,
            name="Forecast Demo Active SOW",
            owner_name=owner.full_name,
            start_date=contract_start,
            created_by_id=actor.id,
        )
        db.add(engagement)
    engagement.account_id = account.id
    engagement.name = "Forecast Demo Active SOW"
    engagement.description = "Demo active SOW used to produce a visible six-month dashboard forecast."
    engagement.status = "active"
    engagement.owner_id = owner.id
    engagement.owner_name = owner.full_name
    engagement.service_lines = ["Engineering", "Data Analytics"]
    engagement.source_links = [{"title": "Forecast demo seed", "url": f"/accounts/{account.id}?tab=engagement"}]
    engagement.value = 240000
    engagement.currency = "USD"
    engagement.delivery_status = "active"
    engagement.commercial_status = "healthy"
    engagement.delivery_health = 82
    engagement.health_status = "green"
    engagement.renewal_risk = "low"
    engagement.start_date = contract_start
    engagement.end_date = contract_end
    engagement.renewal_date = contract_end
    engagement.notice_deadline = contract_end - timedelta(days=45)
    engagement.notice_period_days = 45
    engagement.auto_renewal = False
    engagement.commercial_context = "Demo baseline contract for dashboard forecast visualization."
    engagement.resource_dependency = "Demo staffed team is stable."
    engagement.risks = []
    engagement.source_citation = "Forecast demo active SOW."
    engagement.updated_by_id = actor.id
    engagement.archived_at = None

    opportunity_type = db.scalar(select(OpportunityType).where(OpportunityType.slug == "expansion"))
    if opportunity_type is None:
        opportunity_type = OpportunityType(slug="expansion", name="Expansion", description="Expansion opportunity.", is_active=True, created_by_id=actor.id)
        db.add(opportunity_type)
        db.flush()

    opportunity_specs = (
        (FORECAST_DEMO_OPPORTUNITY_IDS[0], "Forecast Demo Analytics Expansion", "Data Analytics", 90000, "Qualified", _add_months(window_start, 1) + timedelta(days=14)),
        (FORECAST_DEMO_OPPORTUNITY_IDS[1], "Forecast Demo QA Automation Expansion", "Automation & QA", 75000, "Proposal Sent", _add_months(window_start, 2) + timedelta(days=10)),
        (FORECAST_DEMO_OPPORTUNITY_IDS[2], "Forecast Demo Platform Pods Expansion", "Product Engineering", 110000, "Negotiation", _add_months(window_start, 4) + timedelta(days=8)),
    )
    for opportunity_id, name, service_line, value, stage, target_date in opportunity_specs:
        opportunity = db.get(Opportunity, opportunity_id)
        if opportunity is None:
            opportunity = Opportunity(
                id=opportunity_id,
                account_id=account.id,
                type_id=opportunity_type.id,
                owner_name=owner.full_name,
                name=name,
                service_line=service_line,
                next_step="Review demo expansion plan.",
                target_date=target_date,
                created_by_id=actor.id,
                created_by_name=actor.full_name,
            )
            db.add(opportunity)
        opportunity.account_id = account.id
        opportunity.engagement_id = engagement.id
        opportunity.type_id = opportunity_type.id
        opportunity.owner_id = owner.id
        opportunity.owner_name = owner.full_name
        opportunity.owner_email = owner.email
        opportunity.name = name
        opportunity.service_line = service_line
        opportunity.value = value
        opportunity.currency = "USD"
        opportunity.stage = stage
        opportunity.next_step = "Review demo expansion plan and validate next milestone."
        opportunity.target_date = target_date
        opportunity.source_context = "forecast_demo_seed"
        opportunity.source_record_id = engagement.id
        opportunity.source_record_type = "engagement"
        opportunity.source_record_route = f"/accounts/{account.id}?tab=opportunities"
        opportunity.outcome_reason = None
        opportunity.archived_at = None
        opportunity.archived_by_id = None
        opportunity.archived_by_name = None
        opportunity.archive_reason = None
        opportunity.updated_by_id = actor.id
        opportunity.updated_by_name = actor.full_name

    score = db.get(ScoreSnapshot, FORECAST_DEMO_SCORE_ID)
    if score is None:
        score = ScoreSnapshot(id=FORECAST_DEMO_SCORE_ID, account_id=account.id, overall=84, rag_status="green")
        db.add(score)
    score.account_id = account.id
    score.engagement_id = None
    score.scope = "account"
    score.overall = 84
    score.rag_status = "green"
    score.drivers = ["Demo account health is green across relationship, delivery, usage, and commercial posture."]
    score.reason_codes = [{"code": "forecast_demo_health", "label": "Demo healthy account"}]
    score.metric_version = "forecast-demo-v1"
    score.freshness_status = "fresh"
    score.is_dirty = False
    score.trend = 6
    score.status = "complete"
    score.source_context = {"source": "forecast_demo_seed"}
    score.calculated_by_id = actor.id
    score.calculated_by_name = actor.full_name
    score.calculated_at = current

    signal = db.get(Signal, FORECAST_DEMO_SIGNAL_ID)
    if signal is None:
        signal = Signal(
            id=FORECAST_DEMO_SIGNAL_ID,
            account_id=account.id,
            signal_type="growth_signal",
            severity="info",
            title="Forecast demo growth signal",
            detail="Client budget, funding, hiring, and new-region launch signals support expansion.",
        )
        db.add(signal)
    signal.account_id = account.id
    signal.engagement_id = engagement.id
    signal.rule_id = None
    signal.signal_type = "growth_signal"
    signal.severity = "info"
    signal.status = "new"
    signal.owner_id = owner.id
    signal.owner_name = owner.full_name
    signal.title = "Forecast demo growth signal"
    signal.detail = "Client budget, funding, hiring, and new-region launch signals support expansion."
    signal.reason_codes = [{"code": "growth_expansion", "label": "Demo expansion signal"}]
    signal.evidence_json = [{"label": "Demo source", "excerpt": "Budget and hiring increased for platform expansion."}]
    signal.citations_json = [{"label": "Forecast demo seed", "source_type": "demo"}]
    signal.source_record_type = "demo_seed"
    signal.source_record_id = account.id
    signal.source_record_route = f"/accounts/{account.id}"
    signal.confidence = 90
    signal.condition_key = "forecast-demo-growth-signal"
    signal.due_at = window_start + timedelta(days=7)
    signal.resolved_at = None
    signal.dismissed_at = None
    signal.updated_at = current

    db.commit()
    return {
        "account_id": account.id,
        "account_name": account.name,
        "owner_email": owner.email,
        "engagement_id": engagement.id,
        "opportunities": len(opportunity_specs),
    }


def clear_forecast_demo_data(db: Session) -> int:
    account = db.get(Account, FORECAST_DEMO_ACCOUNT_ID)
    if account is None:
        return 0
    db.delete(account)
    db.commit()
    return 1


def seed_allowed_email_domains(db: Session, super_admin: User) -> None:
    settings = get_settings()
    EmailDomainPolicyService(db).seed_allowed_domains(settings.allowed_email_domains, actor=super_admin)


def seed_approved_integrations(db: Session, super_admin: User) -> None:
    IntegrationService(db).seed_defaults(super_admin)


def seed_notifications_dashboards_reporting(db: Session, super_admin: User) -> None:
    NotificationsService(db).seed_defaults(super_admin)
    AlertsService(db).seed_default_rules(super_admin)


def seed_kyc_configuration(db: Session) -> KycConfiguration:
    from app.services.kyc import DEFAULT_RESEARCH_SOURCES, FIELD_CATALOG, FRESHNESS_THRESHOLD_DAYS, LOW_CONFIDENCE_THRESHOLD

    existing = db.scalar(select(KycConfiguration).where(KycConfiguration.name == "default"))
    required_field_keys = [field["key"] for field in FIELD_CATALOG if field.get("required", True)]
    if existing:
        existing.required_field_keys = required_field_keys
        if not existing.freshness_threshold_days or existing.freshness_threshold_days == 180:
            existing.freshness_threshold_days = FRESHNESS_THRESHOLD_DAYS
        existing.low_confidence_threshold = existing.low_confidence_threshold or LOW_CONFIDENCE_THRESHOLD
        existing.research_sources = existing.research_sources or list(DEFAULT_RESEARCH_SOURCES)
        db.commit()
        db.refresh(existing)
        return existing

    configuration = KycConfiguration(
        name="default",
        required_field_keys=required_field_keys,
        freshness_threshold_days=FRESHNESS_THRESHOLD_DAYS,
        low_confidence_threshold=LOW_CONFIDENCE_THRESHOLD,
        research_sources=list(DEFAULT_RESEARCH_SOURCES),
    )
    db.add(configuration)
    db.commit()
    db.refresh(configuration)
    return configuration


def seed_super_admin(db: Session) -> User:
    settings = get_settings()
    email = normalize_email(settings.super_admin_email)
    existing_user = db.scalar(select(User).where(User.email == email))
    if existing_user:
        changed = False
        if not existing_user.primary_google_calendar_id:
            existing_user.primary_google_calendar_id = existing_user.email
            changed = True
        if existing_user.role != "super_admin":
            existing_user.role = "super_admin"
            changed = True
        if changed:
            db.commit()
        return existing_user

    user = User(
        email=email,
        primary_google_calendar_id=email,
        hashed_password=hash_password(settings.super_admin_password),
        full_name=settings.super_admin_full_name,
        role="super_admin",
        title=settings.super_admin_title,
        avatar_initials=initials_for_name(settings.super_admin_full_name),
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def seed_default_role_users(db: Session) -> list[User]:
    settings = get_settings()
    seeded_users: list[User] = []
    for role in DEFAULT_ROLES:
        if role.slug == "super_admin":
            continue
        email = normalize_email(f"{role.slug.replace('_', '.')}.user@{DEFAULT_ROLE_USER_EMAIL_DOMAIN}")
        full_name = DEFAULT_ROLE_USER_NAMES.get(role.slug, role.name.replace(" / ", " ").replace("/", " "))
        existing_user = db.scalar(select(User).where(User.email == email))
        if existing_user:
            existing_user.full_name = full_name
            existing_user.role = role.slug
            existing_user.title = role.name
            existing_user.avatar_initials = initials_for_name(full_name)
            existing_user.is_active = True
            if not existing_user.primary_google_calendar_id:
                existing_user.primary_google_calendar_id = existing_user.email
            seeded_users.append(existing_user)
            continue

        user = User(
            email=email,
            primary_google_calendar_id=email,
            hashed_password=hash_password(settings.seed_user_password),
            full_name=full_name,
            role=role.slug,
            title=role.name,
            avatar_initials=initials_for_name(full_name),
            is_active=True,
        )
        db.add(user)
        seeded_users.append(user)

    db.commit()
    for user in seeded_users:
        db.refresh(user)
    return seeded_users


def seed_opportunity_reference_data(db: Session) -> None:
    stages = (
        ("identified", "Identified", False, False),
        ("qualified", "Qualified", False, False),
        ("proposal_sent", "Proposal Sent", False, False),
        ("negotiation", "Negotiation", False, False),
        ("won", "Won", True, True),
        ("lost", "Lost", True, True),
    )
    for index, (slug, name, is_terminal, requires_outcome_reason) in enumerate(stages, start=1):
        existing_stage = db.scalar(select(OpportunityStageDefinition).where(OpportunityStageDefinition.slug == slug))
        if existing_stage:
            existing_stage.name = name
            existing_stage.is_terminal = is_terminal
            existing_stage.requires_outcome_reason = requires_outcome_reason
            existing_stage.is_active = True
            existing_stage.display_order = index
            continue
        db.add(OpportunityStageDefinition(slug=slug, name=name, is_terminal=is_terminal, requires_outcome_reason=requires_outcome_reason, display_order=index))

    types = (
        ("cross_sell", "Cross-sell", "Adjacent service or new service line opportunity."),
        ("upsell", "Upsell", "Expansion inside an existing service, scope, or commercial footprint."),
        ("renewal", "Renewal", "Commercial renewal opportunity tied to active SOW or notice window."),
        ("expansion", "Expansion", "New scope, team, region, or service-line expansion."),
        ("rescue_recovery", "Rescue/Recovery", "Recovery, stabilization, or retention rescue opportunity."),
        ("other", "Other", "Other growth, retention, or commercial opportunity."),
        ("analytics", "Analytics", "Data, reporting, BI, or decision intelligence opportunity."),
        ("automation", "Automation", "Workflow, operations, QA, or delivery automation opportunity."),
        ("retention_recovery", "Retention Recovery", "Opportunity tied to retention, recovery, or renewal stabilization."),
        ("advisory", "Advisory", "Consulting, assessment, or roadmap advisory opportunity."),
    )
    for index, (slug, name, description) in enumerate(types, start=1):
        existing_type = db.scalar(select(OpportunityType).where(OpportunityType.slug == slug))
        if existing_type:
            existing_type.name = name
            existing_type.description = description
            existing_type.is_active = True
            existing_type.display_order = index
            continue
        db.add(OpportunityType(slug=slug, name=name, description=description, display_order=index))

    transitions = (
        ("Identified", "Qualified", False),
        ("Qualified", "Identified", False),
        ("Identified", "Won", True),
        ("Identified", "Lost", True),
        ("Qualified", "Proposal Sent", False),
        ("Proposal Sent", "Qualified", False),
        ("Proposal Sent", "Negotiation", False),
        ("Negotiation", "Proposal Sent", False),
        ("Negotiation", "Won", True),
        ("Negotiation", "Lost", True),
        ("Proposal Sent", "Lost", True),
        ("Qualified", "Lost", True),
    )
    for from_stage, to_stage, requires_reason in transitions:
        existing = db.scalar(
            select(OpportunityStageTransition).where(
                OpportunityStageTransition.from_stage == from_stage,
                OpportunityStageTransition.to_stage == to_stage,
            )
        )
        if existing:
            existing.is_active = True
            existing.requires_reason = requires_reason
            continue
        db.add(OpportunityStageTransition(from_stage=from_stage, to_stage=to_stage, is_active=True, requires_reason=requires_reason))

    db.commit()


def seed_relationship_planning_reference_data(db: Session) -> None:
    role_specs = (
        ("executive_sponsor", "Executive Sponsor", "Senior sponsor with executive influence."),
        ("economic_buyer", "Economic Buyer", "Client stakeholder with budget or procurement influence."),
        ("technical_decision_maker", "Technical Decision Maker", "Technical approver or architecture decision maker."),
        ("operational_poc", "Operational POC", "Day-to-day client operating contact."),
        ("commercial_owner", "Commercial Owner", "Commercial, procurement, or contract owner."),
        ("influencer", "Influencer", "Influencer, champion, or internal advocate."),
    )
    for index, (slug, name, description) in enumerate(role_specs, start=1):
        role = db.scalar(select(StakeholderRoleConfig).where(StakeholderRoleConfig.slug == slug))
        if role is None:
            db.add(StakeholderRoleConfig(slug=slug, name=name, description=description, is_active=True, display_order=index))
            continue
        role.name = name
        role.description = description
        role.is_active = True
        role.display_order = index

    gap_rules = (
        (
            "no_active_executive_sponsor",
            "No active executive sponsor",
            "The account does not have an active stakeholder with the executive sponsor role.",
            "critical",
            {"type": "missing_role", "role": "executive_sponsor"},
        ),
        (
            "no_commercial_owner_or_economic_buyer",
            "No active commercial owner or economic buyer",
            "The account does not have active commercial ownership coverage through a commercial owner or economic buyer.",
            "critical",
            {"type": "missing_any_role", "roles": ["commercial_owner", "economic_buyer"]},
        ),
        (
            "only_one_active_stakeholder",
            "Only one active stakeholder",
            "The account has a single active stakeholder, which creates relationship concentration risk.",
            "warning",
            {"type": "max_active_stakeholders", "count": 1},
        ),
        (
            "no_high_or_critical_influence_stakeholder",
            "No high or critical influence stakeholder",
            "The account does not have an active stakeholder marked with high or critical influence.",
            "warning",
            {"type": "missing_any_influence", "influences": ["high", "critical"]},
        ),
        (
            "active_high_political_risk_stakeholder",
            "Active stakeholder has high political risk",
            "One or more active stakeholders are marked with high political risk.",
            "critical",
            {"type": "political_risk_present", "risk": "high"},
        ),
        (
            "no_recent_stakeholder_interaction",
            "No stakeholder interaction in the last 90 days",
            "No interaction has been logged for an active stakeholder within the last 90 days.",
            "warning",
            {"type": "stale_interaction", "days": 90},
        ),
    )
    for index, (rule_key, title, description, severity, condition) in enumerate(gap_rules, start=1):
        rule = db.scalar(select(StakeholderGapRule).where(StakeholderGapRule.rule_key == rule_key))
        if rule is None:
            db.add(StakeholderGapRule(rule_key=rule_key, title=title, description=description, severity=severity, condition_json=condition, is_active=True, display_order=index))
            continue
        rule.title = title
        rule.description = description
        rule.severity = severity
        rule.condition_json = condition
        rule.is_active = True
        rule.display_order = index

    _seed_service_growth_reference_data(db)
    db.commit()


def _seed_service_growth_reference_data(db: Session) -> None:
    service_specs = (
        ("product_engineering", "Product Engineering", "Engineering", ["web", "mobile", "platform"], "Custom software, product squads, and platform feature delivery."),
        ("cloud_devops", "Cloud & DevOps", "Engineering", ["cloud", "sre", "infra"], "Cloud infrastructure, release automation, reliability, and operational maturity."),
        ("data_analytics", "Data Analytics", "Data", ["bi", "warehouse", "analytics"], "Data warehouse, dashboarding, analytics enablement, and reporting foundations."),
        ("automation_qa", "Automation & QA", "Quality", ["qa", "automation", "testing"], "Quality engineering, automated regression coverage, and testing acceleration."),
        ("customer_success_ops", "Customer Success Ops", "Customer", ["retention", "ops", "enablement"], "Retention operations, success workflows, enablement, and customer health execution."),
    )
    services_by_slug: dict[str, ServiceCatalogItem] = {}
    for display_order, (slug, name, category, tags, description) in enumerate(service_specs, start=1):
        service = db.scalar(select(ServiceCatalogItem).where(ServiceCatalogItem.slug == slug))
        if service is None:
            service = ServiceCatalogItem(slug=slug)
            db.add(service)
        service.name = name
        service.category = category
        service.description = description
        service.tags = list(tags)
        service.is_active = True
        service.display_order = display_order
        services_by_slug[slug] = service

    db.flush()

    adjacency_specs = (
        ("product_engineering", "automation_qa", 82, "{source_service} accounts often benefit from test automation and quality enablement."),
        ("product_engineering", "cloud_devops", 78, "Product delivery maturity usually exposes cloud, release, and reliability opportunities."),
        ("cloud_devops", "data_analytics", 72, "Cloud modernization creates the foundation for stronger data pipelines and analytics."),
        ("data_analytics", "automation_qa", 68, "Analytics-heavy accounts often need automated validation for data quality and reporting."),
        ("customer_success_ops", "data_analytics", 70, "Customer success operations benefit from dashboards, health metrics, and retention analytics."),
    )
    for source_slug, target_slug, score, rationale in adjacency_specs:
        source = services_by_slug[source_slug]
        target = services_by_slug[target_slug]
        adjacency = db.scalar(
            select(ServiceAdjacencyRule).where(
                ServiceAdjacencyRule.source_service_id == source.id,
                ServiceAdjacencyRule.target_service_id == target.id,
            )
        )
        if adjacency is None:
            adjacency = ServiceAdjacencyRule(source_service_id=source.id, target_service_id=target.id)
            db.add(adjacency)
        adjacency.relevance_score = score
        adjacency.rationale = rationale
        adjacency.is_active = True

    bundle_specs = (
        (
            "engineering_growth",
            "Engineering Growth",
            "Product delivery expansion package covering engineering, quality, and cloud maturity.",
            ("product_engineering", "automation_qa", "cloud_devops"),
        ),
        (
            "data_growth",
            "Data Growth",
            "Data and customer operations package for account intelligence and retention insight.",
            ("data_analytics", "customer_success_ops"),
        ),
    )
    bundles_by_slug: dict[str, ServiceGrowthBundle] = {}
    for display_order, (slug, name, description, service_slugs) in enumerate(bundle_specs, start=1):
        bundle = db.scalar(select(ServiceGrowthBundle).where(ServiceGrowthBundle.slug == slug))
        if bundle is None:
            bundle = ServiceGrowthBundle(slug=slug)
            db.add(bundle)
        bundle.name = name
        bundle.description = description
        bundle.is_active = True
        bundle.display_order = display_order
        db.flush()
        bundle.items.clear()
        db.flush()
        for service_slug in service_slugs:
            bundle.items.append(ServiceGrowthBundleItem(service_id=services_by_slug[service_slug].id))
        bundles_by_slug[slug] = bundle

    db.flush()

    rule_specs = (
        (
            "category",
            "Engineering",
            "category",
            "Quality",
            78,
            20,
            "{account_name} already has {source_service}; {target_service} can reduce delivery risk through stronger quality coverage.",
        ),
        (
            "tag",
            "cloud",
            "category",
            "Data",
            72,
            15,
            "{account_name} has cloud maturity signals from {source_service}; {target_service} can convert platform work into reporting insight.",
        ),
        (
            "bundle",
            "engineering_growth",
            "service",
            "data_analytics",
            70,
            10,
            "{account_name} has engineering-growth coverage through {source_service}; {target_service} can expose account and product insights.",
        ),
    )
    for source_type, source_value, target_type, target_value, base_score, priority, rationale in rule_specs:
        normalized_source = bundles_by_slug[source_value].id if source_type == "bundle" else services_by_slug[source_value].id if source_type == "service" else source_value
        normalized_target = bundles_by_slug[target_value].id if target_type == "bundle" else services_by_slug[target_value].id if target_type == "service" else target_value
        growth_rule = db.scalar(
            select(ServiceGrowthRule).where(
                ServiceGrowthRule.source_selector_type == source_type,
                ServiceGrowthRule.source_selector_value == normalized_source,
                ServiceGrowthRule.target_selector_type == target_type,
                ServiceGrowthRule.target_selector_value == normalized_target,
            )
        )
        if growth_rule is None:
            growth_rule = ServiceGrowthRule(
                source_selector_type=source_type,
                source_selector_value=normalized_source,
                target_selector_type=target_type,
                target_selector_value=normalized_target,
            )
            db.add(growth_rule)
        growth_rule.base_fit_score = base_score
        growth_rule.priority = priority
        growth_rule.rationale_template = rationale
        growth_rule.is_active = True


def seed_timeline_reference_data(db: Session, actor: User) -> None:
    for spec in FIXED_TIMELINE_EVENT_TYPES:
        event_type = db.scalar(select(TimelineEventTypeConfig).where(TimelineEventTypeConfig.slug == spec["slug"]))
        if event_type is None:
            event_type = TimelineEventTypeConfig(
                slug=spec["slug"],
                created_by_id=actor.id,
            )
            db.add(event_type)
        event_type.name = spec["name"]
        event_type.category = spec["category"]
        event_type.module = spec["module"]
        event_type.color_token = spec["color_token"]
        event_type.display_order = spec["display_order"]
        event_type.default_visibility = "public"
        event_type.is_active = True
        event_type.is_critical = False
        event_type.critical_rule_json = {}
        event_type.updated_by_id = actor.id

    policy = db.scalar(select(TimelineRetentionPolicy).where(TimelineRetentionPolicy.name == "Default timeline archive"))
    next_run_at = utc_now() + timedelta(days=1)
    if policy is None:
        db.add(
            TimelineRetentionPolicy(
                name="Default timeline archive",
                entity_type="timeline_entry",
                action="archive",
                duration_days=1095,
                reason_template="Default 36-month timeline retention policy.",
                critical_behavior="tombstone",
                schedule_enabled=False,
                schedule_interval_hours=24,
                next_run_at=next_run_at,
                is_active=True,
                created_by_id=actor.id,
                updated_by_id=actor.id,
            )
        )

    db.commit()


def seed_scoring_signals_playbooks(db: Session, super_admin: User) -> None:
    metric_specs = (
        (
            "relationship_health",
            "Relationship Health",
            "Account-level relationship quality, stakeholder depth, and sponsor coverage.",
            "account",
            25,
            {"red_max": 59, "amber_min": 60, "green_min": 75},
            {"op": "field", "field": "health_relationship"},
        ),
        (
            "usage_adoption_health",
            "Usage and Adoption Health",
            "Account-level usage/adoption and value realization signal.",
            "account",
            25,
            {"red_max": 59, "amber_min": 60, "green_min": 75},
            {"op": "field", "field": "health_usage"},
        ),
        (
            "delivery_health",
            "Delivery Health",
            "Account and engagement delivery quality, risk, and execution confidence.",
            "account",
            25,
            {"red_max": 59, "amber_min": 60, "green_min": 75},
            {"op": "field", "field": "health_delivery"},
        ),
        (
            "commercial_health",
            "Commercial Health",
            "Commercial stability, expansion opportunity, renewal outlook, and escalation drag.",
            "account",
            25,
            {"red_max": 59, "amber_min": 60, "green_min": 75},
            {"op": "field", "field": "health_commercial"},
        ),
        (
            "engagement_delivery_health",
            "Engagement Delivery Health",
            "Engagement-level delivery and renewal-readiness score.",
            "engagement",
            100,
            {"red_max": 59, "amber_min": 60, "green_min": 75},
            {"op": "field", "field": "delivery_health"},
        ),
    )
    for slug, name, description, scope, weight, thresholds, formula in metric_specs:
        metric = db.scalar(select(ScoringMetricDefinition).where(ScoringMetricDefinition.slug == slug))
        if metric is None:
            metric = ScoringMetricDefinition(
                slug=slug,
                name=name,
                description=description,
                scope=scope,
                weight=weight,
                thresholds=thresholds,
                formula=formula,
                freshness_rule={"stale_after_days": 30},
                owner_role="kam_head",
                source="seed",
                status="published",
                is_active=True,
                current_version=1,
                created_by_id=super_admin.id,
                updated_by_id=super_admin.id,
            )
            db.add(metric)
            db.flush()
            db.add(ScoringMetricVersion(metric_id=metric.id, version=1, config_json=_metric_config(metric), published_by_id=super_admin.id, published_by_name=super_admin.full_name))
            continue
        metric.name = name
        metric.description = description
        metric.scope = scope
        metric.weight = weight
        metric.thresholds = thresholds
        metric.formula = formula
        metric.freshness_rule = metric.freshness_rule or {"stale_after_days": 30}
        metric.status = "published"
        metric.is_active = True
        metric.updated_by_id = super_admin.id
        if metric.current_version <= 0:
            metric.current_version = 1
            db.add(ScoringMetricVersion(metric_id=metric.id, version=1, config_json=_metric_config(metric), published_by_id=super_admin.id, published_by_name=super_admin.full_name))

    rule_specs = (
        ("sow_expiry", "SOW Expiry Window", "sow_expiry", "warning", {"date_field": "engagement.end_date", "days_before": 45}),
        ("renewal_date", "Renewal Date Approaching", "renewal_date", "warning", {"date_field": "engagement.renewal_date", "days_before": 45}),
        ("notice_window", "Notice Window", "notice_window", "warning", {"date_field": "engagement.notice_deadline", "days_before": 30}),
        ("stale_kyc", "Stale KYC", "stale_kyc", "warning", {"freshness_days": 90}),
        ("weak_metric", "Weak Health Metric", "weak_metric", "warning", {"rag_status": ["red", "amber"]}),
        ("red_account_health", "Red Account Health", "red_account_health", "critical", {"rag_status": ["red"]}),
        ("stakeholder_gap", "Stakeholder Gap", "stakeholder_gap", "critical", {"missing": "primary_am"}),
        ("escalation_sla", "Escalation SLA Attention", "escalation_sla", "critical", {"status": "open_or_overdue"}),
        ("csat_low", "Low CSAT", "csat_low", "warning", {"weighted_score_max": 3.0, "category_score_max": 2.5}),
        ("csat_decline", "CSAT Decline", "csat_decline", "warning", {"decline_points_min": 0.5}),
        ("opportunity_stalled", "Opportunity Stalled", "opportunity_stalled", "warning", {"stale_after_days": 30}),
        ("governance_overdue", "Governance Overdue", "governance_overdue", "critical", {"scheduled_before": "now", "status_not_in": ["completed", "cancelled"]}),
        ("score_dimension_drop", "Score Dimension Drop", "score_dimension_drop", "warning", {"drop_points_min": 10}),
        ("payment_risk", "Payment or Commercial Risk", "payment_risk", "warning", {"keywords": ["late payment", "payment overdue", "overdue invoice", "invoice dispute", "budget cut"]}),
    )
    for slug, name, signal_type, severity, condition in rule_specs:
        rule = db.scalar(select(SignalRule).where(SignalRule.slug == slug))
        if rule is None:
            db.add(
                SignalRule(
                    slug=slug,
                    name=name,
                    signal_type=signal_type,
                    description=f"Seeded deterministic rule for {name.lower()}.",
                    severity=severity,
                    condition_json=condition,
                    owner_rule_json={"default": "primary_am"},
                    sla_rule_json={"due_in_days": 3 if severity == "critical" else 7},
                    is_active=True,
                    current_version=1,
                    created_by_id=super_admin.id,
                    updated_by_id=super_admin.id,
                )
            )
            continue
        rule.name = name
        rule.signal_type = signal_type
        rule.severity = severity
        rule.condition_json = condition
        rule.is_active = True
        rule.updated_by_id = super_admin.id

    playbook_specs = (
        (
            "renewal_rescue",
            "Renewal Rescue",
            "Stabilize an upcoming renewal or notice window before commercial risk escalates.",
            ["notice_window", "renewal_date", "sow_expiry"],
            ["renewal", "commercial"],
            [
                {"title": "Confirm renewal owner and decision process", "description": "Identify client approver, procurement path, and internal commercial owner.", "priority": "high", "due_offset_days": 2},
                {"title": "Prepare renewal risk brief", "description": "Summarize blockers, value delivered, open asks, and next-best offer.", "priority": "high", "due_offset_days": 4},
                {"title": "Schedule renewal alignment meeting", "description": "Book a client-facing renewal discussion and attach agenda.", "priority": "medium", "due_offset_days": 7},
            ],
        ),
        (
            "health_recovery",
            "Health Recovery",
            "Address weak health metrics or escalation drag with an owner-backed recovery plan.",
            ["weak_metric", "escalation_sla", "stale_kyc"],
            ["relationship", "usage", "delivery", "commercial", "stale_kyc"],
            [
                {"title": "Review score drivers and evidence", "description": "Validate weak metrics, evidence, and recent account activity.", "priority": "high", "due_offset_days": 1},
                {"title": "Create recovery action plan", "description": "Document actions, owners, due dates, and success criteria.", "priority": "high", "due_offset_days": 3},
                {"title": "Update executive sponsor narrative", "description": "Prepare concise health-recovery update for leadership visibility.", "priority": "medium", "due_offset_days": 7},
            ],
        ),
        (
            "customer_sentiment_recovery",
            "Customer Sentiment Recovery",
            "Respond to CSAT decline, low category scores, or commercial sentiment risks.",
            ["csat_low", "csat_decline", "payment_risk", "score_dimension_drop", "red_account_health"],
            ["csat", "relationship", "commercial"],
            [
                {"title": "Review CSAT and account evidence", "description": "Validate score categories, trend, client feedback, and source citations.", "priority": "high", "due_offset_days": 1},
                {"title": "Prepare sentiment recovery action plan", "description": "Create owner-backed recovery actions for weak categories and commercial blockers.", "priority": "high", "due_offset_days": 3},
                {"title": "Schedule client follow-up", "description": "Confirm next client touchpoint to address satisfaction concerns.", "priority": "medium", "due_offset_days": 7},
            ],
        ),
        (
            "portfolio_motion_refresh",
            "Portfolio Motion Refresh",
            "Restart stalled opportunities and overdue governance motions.",
            ["opportunity_stalled", "governance_overdue"],
            ["growth", "governance"],
            [
                {"title": "Confirm stale motion owner", "description": "Validate opportunity or governance owner, blocker, and next step.", "priority": "high", "due_offset_days": 1},
                {"title": "Update next action and timeline", "description": "Refresh client/internal next action, target date, and expected outcome.", "priority": "medium", "due_offset_days": 3},
            ],
        ),
        (
            "stakeholder_map_refresh",
            "Stakeholder Map Refresh",
            "Repair missing ownership or stakeholder coverage gaps.",
            ["stakeholder_gap"],
            ["stakeholder", "relationship"],
            [
                {"title": "Assign or confirm primary account owner", "description": "Confirm the accountable AM and supporting owner matrix.", "priority": "critical", "due_offset_days": 1},
                {"title": "Refresh stakeholder map", "description": "Capture sponsor, champion, economic buyer, and detractor coverage.", "priority": "high", "due_offset_days": 5},
            ],
        ),
    )
    for _slug, name, objective, signal_types, weak_metrics, activities in playbook_specs:
        template = db.scalar(select(PlaybookTemplate).where(PlaybookTemplate.slug == _slug))
        if template is None:
            template = db.scalar(select(PlaybookTemplate).where(PlaybookTemplate.name == name))
        if template is None:
            template = PlaybookTemplate(
                slug=_slug,
                name=name,
                objective=objective,
                description=f"Seeded playbook for {name.lower()} signals.",
                signal_types=signal_types,
                weak_metrics=weak_metrics,
                activities_json=activities,
                default_owner_rule="account_primary_am",
                due_date_rule={"basis": "execution_date", "offset_days": 7},
                success_criteria=["Tasks completed with evidence", "Signal resolved or accepted with recovery plan"],
                skip_rules=["Duplicate task already open", "Signal dismissed with reason"],
                status="active",
                current_version=1,
                version=1,
                is_active=True,
                created_by_id=super_admin.id,
                updated_by_id=super_admin.id,
            )
            template.activities = _seed_playbook_activities(activities)
            db.add(template)
            continue
        template.name = name
        template.slug = template.slug or _slug
        template.objective = objective
        template.description = f"Seeded playbook for {name.lower()} signals."
        template.signal_types = signal_types
        template.weak_metrics = weak_metrics
        template.activities_json = activities
        template.default_owner_rule = "account_primary_am"
        template.due_date_rule = {"basis": "execution_date", "offset_days": 7}
        template.success_criteria = ["Tasks completed with evidence", "Signal resolved or accepted with recovery plan"]
        template.skip_rules = ["Duplicate task already open", "Signal dismissed with reason"]
        template.is_active = True
        template.status = "active"
        template.current_version = max(template.current_version or 0, template.version or 1)
        template.updated_by_id = super_admin.id
        template.activities.clear()
        db.flush()
        template.activities.extend(_seed_playbook_activities(activities))

    db.commit()


def _metric_config(metric: ScoringMetricDefinition) -> dict:
    return {
        "slug": metric.slug,
        "name": metric.name,
        "scope": metric.scope,
        "weight": metric.weight,
        "thresholds": metric.thresholds,
        "formula": metric.formula,
        "freshness_rule": metric.freshness_rule,
    }


def _playbook_config(template: PlaybookTemplate) -> dict:
    return {
        "name": template.name,
        "objective": template.objective,
        "signal_types": template.signal_types,
        "weak_metrics": template.weak_metrics,
        "default_owner_rule": template.default_owner_rule,
        "due_date_rule": template.due_date_rule,
        "success_criteria": template.success_criteria,
        "skip_rules": template.skip_rules,
        "activities": [
            {
                "title": activity.title,
                "description": activity.description,
                "priority": activity.priority,
                "due_offset_days": activity.due_offset_days,
            }
            for activity in template.activities
        ],
    }


def _seed_playbook_activities(activities: list[dict]) -> list[PlaybookTemplateActivity]:
    seeded: list[PlaybookTemplateActivity] = []
    for index, activity in enumerate(activities):
        priority = "urgent" if activity.get("priority") == "critical" else activity.get("priority", "medium")
        seeded.append(
            PlaybookTemplateActivity(
                title=activity["title"],
                description=activity.get("description"),
                owner_rule="account_primary_am",
                due_offset_days=activity.get("due_offset_days", 7),
                priority=priority,
                success_criteria=["Evidence captured"],
                skip_allowed=True,
                requires_evidence=index == 0,
                sort_order=index,
            )
        )
    return seeded


def _aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _first_day_next_month(value: datetime) -> datetime:
    month = value.month + 1
    year = value.year
    if month == 13:
        month = 1
        year += 1
    return datetime(year, month, 1, tzinfo=timezone.utc)


def _add_months(value: datetime, months: int) -> datetime:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    return datetime(year, month, 1, tzinfo=timezone.utc)
