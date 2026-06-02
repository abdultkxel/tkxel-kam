from __future__ import annotations

import json
import os
from datetime import timedelta
from typing import Any

from sqlalchemy import func, inspect, select, text
from sqlalchemy.orm import Session

from app.models import (
    AccessLog,
    Account,
    AccountHealthRollup,
    AccountOwner,
    AccountOwnershipHistory,
    AccountPlan,
    AccountPlanAction,
    AccountPlanVersion,
    AccountWhitespaceItem,
    AiGatewayRun,
    AuditLog,
    ContentItem,
    CsatScore,
    DigestRun,
    DigestSchedule,
    Engagement,
    EngagementHealthSnapshot,
    EngagementRenewalProfile,
    Escalation,
    EscalationNotification,
    EscalationUpdate,
    FathomTaskSuggestion,
    GovernanceActionItem,
    GovernanceDecision,
    GovernanceEvent,
    GovernanceSourceCitation,
    HandoverShare,
    HandoverSummary,
    IntegrationImportedItem,
    IntegrationMappingRule,
    IntegrationSyncLog,
    IntegrationSyncRun,
    KycAgentRun,
    KycDraft,
    KycSnapshot,
    KycWorkstreamOutput,
    ManualScoreSubmission,
    NotificationRecord,
    OnboardingDraft,
    OnboardingDraftEngagement,
    Opportunity,
    OpportunityActionItem,
    OpportunityDecision,
    OpportunityStageHistory,
    OpportunityType,
    PlaybookExecution,
    PlaybookTemplate,
    ReportDefinition,
    ReportRun,
    ReportSchedule,
    RetentionPlan,
    RetentionPlanAction,
    RetentionPlanMilestone,
    RetentionRecommendation,
    ScheduledWorkerRun,
    ScoreSnapshot,
    ScoringJob,
    ServiceCatalogItem,
    ServiceRecommendation,
    SentContentRecord,
    Signal,
    SignalEvent,
    SignalRule,
    SourceCitation,
    SourceDocument,
    Stakeholder,
    StakeholderCoverageGap,
    StakeholderInteraction,
    Task,
    TaskEvidence,
    TimelineAiSearchAudit,
    TimelineComment,
    TimelineEntry,
    User,
    utc_now,
)
from app.security import hash_password
from app.services.kyc import FIELD_CATALOG, WORKSTREAMS
from app.services.seed import seed_default_data
from app.services.users import initials_for_name, normalize_email

DEMO_PASSWORD = "Demo@12345"
DEMO_SOURCE = "demo_seed"
DEMO_TAG = "demo-data"


def seed_demo_data(db: Session) -> dict[str, int]:
    """Seed local/demo data without sending email or calling external APIs."""
    _assert_demo_seed_allowed(db)
    seed_default_data(db)

    users = _seed_demo_users(db)
    db.flush()

    accounts = _seed_accounts(db, users)
    db.flush()

    engagements = _seed_engagements(db, users, accounts)
    db.flush()

    source_documents = _seed_source_documents(db, users, accounts, engagements)
    db.flush()
    _seed_onboarding_drafts(db, users, accounts)
    db.flush()
    _seed_stakeholders(db, users, accounts, engagements)
    db.flush()
    _seed_account_plans(db, users, accounts)
    db.flush()
    _seed_opportunities(db, users, accounts, engagements)
    db.flush()
    _seed_scoring(db, users, accounts, engagements)
    db.flush()
    _seed_kyc(db, users, accounts, source_documents)
    db.flush()
    _seed_signals_playbooks_tasks(db, users, accounts, engagements)
    db.flush()
    _seed_content_escalations_governance(db, users, accounts, engagements)
    db.flush()
    _seed_timeline_handover(db, users, accounts, engagements)
    db.flush()
    _seed_notifications_reporting(db, users, accounts)
    db.flush()
    _seed_integrations_ai_csat(db, users, accounts, engagements)
    db.flush()
    _seed_admin_audit(db, users, accounts)

    db.commit()
    return _demo_counts(db)


def _assert_demo_seed_allowed(db: Session) -> None:
    env_value = (
        os.getenv("APP_ENV")
        or os.getenv("ENVIRONMENT")
        or os.getenv("KAM_ENV")
        or os.getenv("NODE_ENV")
        or ""
    ).strip().lower()
    if env_value in {"prod", "production"}:
        raise RuntimeError("Demo seeding is disabled in production environments.")

    bind = db.get_bind()
    url = getattr(bind, "url", None)
    if url is None:
        return
    backend = url.get_backend_name()
    if backend == "sqlite":
        return
    host = (url.host or "").lower()
    database = (url.database or "").lower()
    if host in {"localhost", "127.0.0.1", "db"} and "kam" in database:
        return
    if os.getenv("KAM_ALLOW_DEMO_SEED_NONLOCAL", "").strip().lower() == "true":
        return
    raise RuntimeError(
        "Demo seeding is only allowed against local demo databases. "
        "Set KAM_ALLOW_DEMO_SEED_NONLOCAL=true only for an explicitly approved non-production sandbox."
    )


def _seed_demo_users(db: Session) -> dict[str, User]:
    specs = (
        ("admin", "demo.admin@tkxel.com", "Demo Admin", "Admin"),
        ("kam_head", "demo.kam.head@tkxel.com", "Demo KAM Head", "VP, Key Accounts"),
        ("account_manager", "demo.kam.nadia@tkxel.com", "Nadia Khan", "Senior Key Account Manager"),
        ("account_manager", "demo.kam.omar@tkxel.io", "Omar Siddiqui", "Key Account Manager"),
        ("ops_lead", "demo.ops.ayesha@camp1.tkxel.com", "Ayesha Rahman", "Operations Lead"),
        ("delivery_stakeholder", "demo.delivery.hassan@camp1.tkxel.io", "Hassan Ali", "Delivery Lead"),
        ("commercial_stakeholder", "demo.commercial.sara@tkxel.io", "Sara Malik", "Commercial Partner"),
        ("content_specialist", "demo.content.zain@tkxel.com", "Zain Qureshi", "Content Specialist"),
        ("leadership_viewer", "demo.executive.viewer@tkxel.io", "Executive Viewer", "Executive Sponsor"),
    )
    users: dict[str, User] = {}
    for role, email, full_name, title in specs:
        normalized = normalize_email(email)
        user = db.scalar(select(User).where(User.email == normalized))
        values = {
            "email": normalized,
            "primary_google_calendar_id": normalized,
            "hashed_password": hash_password(DEMO_PASSWORD),
            "full_name": full_name,
            "role": role,
            "title": f"[DEMO] {title}",
            "avatar_initials": initials_for_name(full_name),
            "is_active": True,
        }
        if user is None:
            user = User(**values)
            db.add(user)
        else:
            for key, value in values.items():
                setattr(user, key, value)
        users[email_key(role, full_name)] = user
    return users


def _seed_accounts(db: Session, users: dict[str, User]) -> list[Account]:
    kam_users = [users["account_manager:nadia_khan"], users["account_manager:omar_siddiqui"]]
    ops = users["ops_lead:ayesha_rahman"]
    executive = users["kam_head:demo_kam_head"]
    specs = [
        ("Acme Health Systems", "Strategic", "North America", "Active", "healthy", 88, 1850000),
        ("Northstar Retail Group", "Enterprise", "North America", "Renewal Focus", "warning", 66, 1260000),
        ("Globex Logistics", "Enterprise", "EMEA", "At Risk", "critical", 48, 940000),
        ("Canvs Media", "Growth", "North America", "Expansion Focus", "healthy", 82, 720000),
        ("TaxBack Global", "Enterprise", "EMEA", "Active", "healthy", 77, 980000),
        ("Apex Fintech", "Strategic", "APAC", "At Risk", "critical", 43, 2140000),
        ("Crescent Foods", "Growth", "Middle East", "Onboarding", "warning", 61, 410000),
        ("Helio Energy", "Strategic", "LATAM", "Expansion Focus", "healthy", 91, 1680000),
        ("BluePeak Insurance", "Enterprise", "North America", "Renewal Focus", "warning", 58, 1190000),
        ("Urban Mobility Labs", "Growth", "EMEA", "Active", "healthy", 74, 640000),
        ("Nova Education", "Public Sector", "APAC", "Dormant", "warning", 55, 360000),
        ("Zenith Pharma", "Strategic", "EMEA", "Active", "healthy", 84, 2310000),
        ("Pulse Commerce", "Growth", "North America", "At Risk", "critical", 39, 590000),
        ("Vector Manufacturing", "Enterprise", "LATAM", "Active", "healthy", 79, 870000),
        ("Atlas Travel", "Growth", "Middle East", "Renewal Focus", "warning", 64, 520000),
        ("Summit Banking", "Strategic", "APAC", "Active", "healthy", 86, 2480000),
        ("Evergreen Telecom", "Enterprise", "EMEA", "Onboarding", "warning", 69, 1325000),
        ("BrightPath SaaS", "Growth", "North America", "Expansion Focus", "healthy", 81, 455000),
        ("MetroGov Services", "Public Sector", "North America", "Active", "healthy", 73, 760000),
        ("Orbit Hospitality", "Growth", "LATAM", "At Risk", "critical", 45, 430000),
        ("ClearWater Utilities", "Public Sector", "EMEA", "Renewal Focus", "warning", 57, 825000),
        ("Pioneer Robotics", "Enterprise", "APAC", "Expansion Focus", "healthy", 83, 1080000),
        ("Harbor Payments", "Strategic", "North America", "Active", "healthy", 89, 3010000),
        ("Nimbus Cloud Services", "Enterprise", "Middle East", "Draft", "warning", 52, 690000),
    ]
    accounts: list[Account] = []
    now = utc_now()
    for index, (name, segment, region, lifecycle, risk, health, value) in enumerate(specs, start=1):
        account_id = f"demo-acct-{index:03d}"
        owner = kam_users[index % 2]
        health_relationship = min(95, health + (index % 7) - 2)
        health_usage = max(30, min(95, health - (index % 9) + 3))
        health_delivery = max(30, min(95, health + (index % 5) - 1))
        health_commercial = max(30, min(95, health - (index % 6)))
        account = _upsert(
            db,
            Account,
            account_id,
            name=f"[DEMO] {name}",
            project_name=f"[DEMO] {name} Strategic Account Workspace",
            company_url=f"https://{name.lower().replace(' ', '').replace('&', 'and')}.example.com",
            segment=segment,
            region=region,
            lifecycle_status=lifecycle,
            risk_status=risk,
            commercial_value=value,
            currency="USD",
            service_context=_service_context(index),
            commercial_summary=f"[DEMO] ARR {value:,.0f}; lifecycle={lifecycle}; renewal posture={risk}.",
            initial_notes=f"[DEMO] Seeded account with varied dates, risk, owners, and module activity for local testing.",
            source_citation=f"{DEMO_SOURCE}: account fixture {index:03d}",
            health_overall=health,
            health_relationship=health_relationship,
            health_usage=health_usage,
            health_delivery=health_delivery,
            health_commercial=health_commercial,
            next_governance_at=now + timedelta(days=(index % 9) * 7 + 3),
            created_by_id=owner.id,
            created_at=now - timedelta(days=180 - index * 3),
            updated_at=now - timedelta(days=index % 12),
        )
        accounts.append(account)
        _upsert(
            db,
            AccountOwner,
            f"demo-own-{index:03d}-primary",
            account_id=account.id,
            user_id=owner.id,
            user_name=owner.full_name,
            user_email=owner.email,
            ownership_role="primary_am",
            is_primary=True,
            is_active=True,
            rationale="[DEMO] Primary AM seeded for account-scope filtering and portfolio workload.",
            created_by_id=executive.id,
            created_at=account.created_at,
        )
        _upsert(
            db,
            AccountOwner,
            f"demo-own-{index:03d}-ops",
            account_id=account.id,
            user_id=ops.id,
            user_name=ops.full_name,
            user_email=ops.email,
            ownership_role="ops_lead",
            is_primary=False,
            is_active=True,
            rationale="[DEMO] Supporting owner seeded for matrix ownership checks.",
            created_by_id=executive.id,
            created_at=account.created_at + timedelta(hours=2),
        )
        _upsert(
            db,
            AccountOwnershipHistory,
            f"demo-ownhist-{index:03d}",
            account_id=account.id,
            owner_record_id=f"demo-own-{index:03d}-primary",
            ownership_role="primary_am",
            previous_user_id=None,
            previous_user_name=None,
            new_user_id=owner.id,
            new_user_name=owner.full_name,
            actor_id=executive.id,
            actor_name=executive.full_name,
            rationale="[DEMO] Initial account assignment during demo onboarding.",
            source=DEMO_SOURCE,
            created_at=account.created_at,
        )
    return accounts


def _seed_engagements(db: Session, users: dict[str, User], accounts: list[Account]) -> dict[str, list[Engagement]]:
    owner_cycle = [users["account_manager:nadia_khan"], users["account_manager:omar_siddiqui"]]
    ops = users["ops_lead:ayesha_rahman"]
    delivery = users["delivery_stakeholder:hassan_ali"]
    result: dict[str, list[Engagement]] = {}
    service_sets = [
        ["Product Engineering", "Cloud & DevOps"],
        ["Data Analytics", "Customer Success Ops"],
        ["Automation & QA", "Product Engineering"],
        ["Cloud & DevOps", "Data Analytics"],
    ]
    now = utc_now()
    for account_index, account in enumerate(accounts, start=1):
        result[account.id] = []
        for sequence in range(1, 3):
            owner = owner_cycle[(account_index + sequence) % 2]
            start = now - timedelta(days=420 - account_index * 4 - sequence * 35)
            end = now + timedelta(days=((account_index + sequence) % 8 - 2) * 30 + 90)
            renewal = end - timedelta(days=15 if sequence == 1 else 30)
            notice = renewal - timedelta(days=45 + (account_index % 4) * 15)
            health = max(35, min(94, account.health_delivery + (sequence * 4) - (account_index % 8)))
            status = "draft" if account.lifecycle_status == "Draft" and sequence == 2 else "active"
            delivery_status = "delayed" if account.risk_status == "critical" and sequence == 1 else "at_risk" if account.risk_status == "warning" and sequence == 1 else "active"
            engagement = _upsert(
                db,
                Engagement,
                f"demo-eng-{account_index:03d}-{sequence}",
                account_id=account.id,
                name=f"[DEMO] {'Platform Modernization' if sequence == 1 else 'Managed Delivery'} - {account.name.replace('[DEMO] ', '')}",
                description="[DEMO] Seeded engagement/SOW with renewal windows, service lines, health snapshots, and timeline coverage.",
                status=status,
                owner_id=owner.id,
                owner_name=owner.full_name,
                ops_lead_id=ops.id if sequence == 1 else delivery.id,
                ops_lead_name=ops.full_name if sequence == 1 else delivery.full_name,
                service_lines=service_sets[(account_index + sequence) % len(service_sets)],
                source_links=[{"label": "Demo SOW", "url": f"https://example.com/demo/sow/{account.id}/{sequence}"}],
                value=float(account.commercial_value) * (0.52 if sequence == 1 else 0.31),
                currency=account.currency,
                delivery_status=delivery_status,
                commercial_status="blocked" if account.risk_status == "critical" else "watch" if account.risk_status == "warning" else "healthy",
                delivery_health=health,
                health_status=_rag_from_score(health),
                renewal_risk="critical" if notice < now and account.risk_status == "critical" else "warning" if notice < now + timedelta(days=60) else "low",
                start_date=start,
                end_date=end,
                renewal_date=renewal,
                notice_deadline=notice,
                notice_period_days=45 + (account_index % 4) * 15,
                auto_renewal=sequence == 2,
                commercial_context=f"[DEMO] Renewal date {renewal.date().isoformat()} with seeded commercial posture.",
                resource_dependency="[DEMO] Dependency on client SME availability and release-window approvals.",
                risks=[
                    "Delivery delay risk" if delivery_status == "delayed" else "Scope dependency",
                    "Commercial renewal window" if notice < now + timedelta(days=90) else "No immediate commercial blocker",
                ],
                source_citation=f"{DEMO_SOURCE}: engagement fixture {account_index:03d}-{sequence}",
                created_by_id=owner.id,
                updated_by_id=owner.id,
                created_at=start,
                updated_at=now - timedelta(days=(account_index + sequence) % 14),
            )
            result[account.id].append(engagement)
            _upsert(
                db,
                EngagementRenewalProfile,
                f"demo-renew-{account_index:03d}-{sequence}",
                account_id=account.id,
                engagement_id=engagement.id,
                renewal_readiness="ready" if engagement.renewal_risk == "low" else "needs_plan",
                renewal_risk=engagement.renewal_risk,
                confidence=78 + (account_index % 12),
                commercial_exposure=engagement.value,
                commercial_exposure_currency=engagement.currency,
                owner_id=owner.id,
                owner_name=owner.full_name,
                source_type=DEMO_SOURCE,
                source_citation=f"{DEMO_SOURCE}: renewal profile",
                manual_override_reason=None,
                created_by_id=owner.id,
                updated_by_id=owner.id,
            )
            _upsert(
                db,
                EngagementHealthSnapshot,
                f"demo-eng-health-{account_index:03d}-{sequence}",
                engagement_id=engagement.id,
                account_id=account.id,
                overall=health,
                rag_status=_rag_from_score(health),
                drivers=[
                    {"metric": "delivery", "value": health, "weight": 45},
                    {"metric": "renewal_readiness", "value": 72 if engagement.renewal_risk != "critical" else 40, "weight": 30},
                ],
                freshness_status="fresh",
                is_dirty=False,
                contribution=round(health / 100, 2),
                metric_version="demo-engagement-v1",
                created_by_id=owner.id,
                created_by_name=owner.full_name,
                created_at=now - timedelta(days=(account_index + sequence) % 21),
            )
    return result


def _seed_source_documents(
    db: Session,
    users: dict[str, User],
    accounts: list[Account],
    engagements: dict[str, list[Engagement]],
) -> dict[str, list[SourceDocument]]:
    owner = users["account_manager:nadia_khan"]
    docs_by_account: dict[str, list[SourceDocument]] = {}
    for index, account in enumerate(accounts[:12], start=1):
        docs_by_account[account.id] = []
        engagement = engagements[account.id][0]
        for sequence, source_type in enumerate(("charter", "sow"), start=1):
            doc = _upsert(
                db,
                SourceDocument,
                f"demo-doc-{index:03d}-{sequence}",
                account_id=account.id,
                engagement_id=engagement.id,
                draft_id=None,
                title=f"[DEMO] {account.name.replace('[DEMO] ', '')} {'Project Charter' if source_type == 'charter' else 'SOW'}",
                source_type=source_type,
                file_name=f"demo-{account.id}-{source_type}.pdf",
                file_url=f"/storage/demo/{account.id}/{source_type}.pdf",
                link_url=f"https://example.com/demo/{account.id}/{source_type}",
                uploaded_by_id=owner.id,
                uploaded_by_name=owner.full_name,
                extraction_status="completed",
                confidence=82 + (index % 10),
                pages=12 + index,
                is_sensitive=source_type == "sow",
            )
            docs_by_account[account.id].append(doc)
            _upsert(
                db,
                SourceCitation,
                f"demo-cite-{index:03d}-{sequence}",
                source_document_id=doc.id,
                label=f"[DEMO] {source_type.upper()} scope excerpt",
                page_number=sequence + 2,
                excerpt=f"[DEMO] {account.name} requires executive governance, renewal tracking, and source-backed KYC.",
                field_key="engagement_models" if source_type == "sow" else "company_snapshot",
            )
    return docs_by_account


def _seed_onboarding_drafts(db: Session, users: dict[str, User], accounts: list[Account]) -> None:
    creator = users["admin:demo_admin"]
    statuses = ("ready_for_review", "approved", "changes_requested", "rejected", "draft")
    for index, account in enumerate(accounts[:10], start=1):
        status = statuses[index % len(statuses)]
        draft = _upsert(
            db,
            OnboardingDraft,
            f"demo-draft-{index:03d}",
            status=status,
            extraction_status="completed" if status != "draft" else "pending",
            account_name=f"[DEMO] Draft Workspace - {account.name.replace('[DEMO] ', '')}",
            project_name=f"[DEMO] Onboarding package {index:03d}",
            company_url=account.company_url,
            lifecycle_status="Draft" if status == "draft" else "Onboarding",
            segment=account.segment,
            region=account.region,
            service_context=account.service_context,
            commercial_summary=account.commercial_summary,
            initial_notes="[DEMO] Onboarding draft seeded for approval/rejection/filter testing.",
            commercial_value=float(account.commercial_value) * 0.8,
            currency=account.currency,
            primary_owner_id=creator.id,
            primary_owner_name=creator.full_name,
            primary_owner_email=creator.email,
            confidence=68 + index,
            missing_fields=["HQ location"] if index % 3 == 0 else [],
            conflicts=["Possible duplicate legal entity"] if index % 4 == 0 else [],
            duplicate_account_id=account.id if index % 4 == 0 else None,
            source_citation=f"{DEMO_SOURCE}: onboarding draft",
            created_by_id=creator.id,
            created_by_name=creator.full_name,
            approved_by_id=creator.id if status == "approved" else None,
            rejected_by_id=creator.id if status == "rejected" else None,
            rejection_reason="[DEMO] Missing validated primary AM." if status == "rejected" else None,
            approved_account_id=account.id if status == "approved" else None,
            decided_at=utc_now() - timedelta(days=index) if status in {"approved", "rejected"} else None,
        )
        _upsert(
            db,
            OnboardingDraftEngagement,
            f"demo-draft-eng-{index:03d}",
            draft_id=draft.id,
            name=f"[DEMO] Draft SOW {index:03d}",
            owner_id=creator.id,
            owner_name=creator.full_name,
            ops_lead_id=users["ops_lead:ayesha_rahman"].id,
            ops_lead_name=users["ops_lead:ayesha_rahman"].full_name,
            service_lines=["Product Engineering", "Cloud & DevOps"],
            value=float(account.commercial_value) * 0.35,
            currency=account.currency,
            delivery_status="active",
            start_date=utc_now() - timedelta(days=30),
            end_date=utc_now() + timedelta(days=300),
            renewal_date=utc_now() + timedelta(days=270),
            notice_deadline=utc_now() + timedelta(days=225),
            notice_period_days=45,
            auto_renewal=False,
            commercial_context="[DEMO] Draft commercial terms extracted from uploaded SOW.",
            resource_dependency="[DEMO] Requires architecture review.",
            risks=["Draft scope pending client confirmation"],
            source_citation=f"{DEMO_SOURCE}: onboarding engagement",
            confidence=76,
        )


def _seed_stakeholders(
    db: Session,
    users: dict[str, User],
    accounts: list[Account],
    engagements: dict[str, list[Engagement]],
) -> None:
    creator = users["account_manager:nadia_khan"]
    role_cycle = ("executive_sponsor", "economic_buyer", "technical_decision_maker", "operational_poc", "commercial_owner")
    strengths = ("strong", "medium", "weak", "unknown")
    sentiments = ("positive", "neutral", "negative", "neutral")
    for account_index, account in enumerate(accounts, start=1):
        for sequence in range(1, 4):
            role = role_cycle[(account_index + sequence) % len(role_cycle)]
            stakeholder = _upsert(
                db,
                Stakeholder,
                f"demo-stake-{account_index:03d}-{sequence}",
                account_id=account.id,
                engagement_id=engagements[account.id][0].id if sequence != 3 else None,
                reports_to_stakeholder_id=None,
                name=f"[DEMO] {['Maya Chen', 'Daniel Brooks', 'Priya Nair'][sequence - 1]} {account_index}",
                title=["Chief Product Officer", "VP Operations", "Director, Engineering"][sequence - 1],
                company=account.name.replace("[DEMO] ", ""),
                email=f"demo.client{account_index}.{sequence}@example.com",
                phone=f"+1-555-01{account_index:02d}{sequence}",
                role=role,
                influence="critical" if role in {"executive_sponsor", "economic_buyer"} else "high",
                relationship_strength=strengths[(account_index + sequence) % len(strengths)],
                sentiment=sentiments[(account_index + sequence) % len(sentiments)],
                political_risk="high" if account.risk_status == "critical" and sequence == 1 else "medium",
                status="active",
                notes="[DEMO] Stakeholder seeded for relationship-map, sentiment, coverage-gap, and search testing.",
                last_interaction_at=utc_now() - timedelta(days=(account_index * sequence) % 120),
                is_sensitive=sequence == 1,
                created_by_id=creator.id,
                updated_by_id=creator.id,
            )
            _upsert(
                db,
                StakeholderInteraction,
                f"demo-stake-int-{account_index:03d}-{sequence}",
                stakeholder_id=stakeholder.id,
                account_id=account.id,
                engagement_id=stakeholder.engagement_id,
                interaction_type="meeting" if sequence == 1 else "email",
                subject=f"[DEMO] Relationship touchpoint {sequence}",
                description="[DEMO] Seeded client interaction with outcome and next action.",
                channel="Zoom" if sequence == 1 else "Email",
                sentiment=stakeholder.sentiment,
                relationship_strength=stakeholder.relationship_strength,
                political_risk=stakeholder.political_risk,
                outcome="[DEMO] Confirmed priorities and executive concerns.",
                next_action="[DEMO] Send follow-up brief and assign action owner.",
                interaction_at=stakeholder.last_interaction_at or utc_now(),
                is_sensitive=stakeholder.is_sensitive,
                metadata_json={"source": DEMO_SOURCE},
                created_by_id=creator.id,
                created_by_name=creator.full_name,
            )
        if account_index % 5 == 0:
            _upsert(
                db,
                StakeholderCoverageGap,
                f"demo-gap-{account_index:03d}",
                account_id=account.id,
                rule_key="no_recent_stakeholder_interaction",
                severity="warning",
                title="[DEMO] No recent stakeholder interaction",
                description="[DEMO] Seeded coverage gap for account planning and relationship health demonstration.",
                evidence={"last_interaction_days": 95 + account_index},
                status="open",
            )


def _seed_account_plans(db: Session, users: dict[str, User], accounts: list[Account]) -> None:
    services = {service.slug: service for service in db.scalars(select(ServiceCatalogItem)).all()}
    owner = users["account_manager:omar_siddiqui"]
    for index, account in enumerate(accounts[:18], start=1):
        plan = _upsert(
            db,
            AccountPlan,
            f"demo-plan-{index:03d}",
            account_id=account.id,
            retention_focus="[DEMO] Protect renewal path, confirm executive sponsor, and document recovery risks.",
            growth_focus="[DEMO] Expand into data analytics and cloud governance where service adjacency supports it.",
            risks=["Single-threaded sponsor" if index % 4 == 0 else "Renewal date approaching", "Delivery dependency"],
            opportunities="[DEMO] Candidate cross-sell motions generated from service catalog adjacency.",
            commitments=[{"owner": owner.full_name, "commitment": "Share quarterly roadmap", "due_in_days": 21}],
            service_gaps=["Cloud governance", "Customer analytics"] if index % 2 else ["Automation QA"],
            review_cadence="monthly" if account.risk_status != "healthy" else "quarterly",
            next_review_at=utc_now() + timedelta(days=14 + index),
            status="active" if account.lifecycle_status != "Draft" else "draft",
            created_by_id=owner.id,
            created_by_name=owner.full_name,
            updated_by_id=owner.id,
            updated_by_name=owner.full_name,
        )
        _upsert(
            db,
            AccountPlanVersion,
            f"demo-plan-ver-{index:03d}",
            account_plan_id=plan.id,
            account_id=account.id,
            version=1,
            snapshot_json={"source": DEMO_SOURCE, "plan_status": plan.status, "risk_status": account.risk_status},
            change_summary="[DEMO] Initial account plan version.",
            actor_id=owner.id,
            actor_name=owner.full_name,
        )
        _upsert(
            db,
            AccountPlanAction,
            f"demo-plan-action-{index:03d}",
            account_plan_id=plan.id,
            account_id=account.id,
            title="[DEMO] Confirm executive relationship coverage",
            owner_id=owner.id,
            owner_name=owner.full_name,
            owner_email=owner.email,
            due_at=utc_now() + timedelta(days=(index % 8) * 5 - 7),
            status="open" if index % 4 else "completed",
            priority="high" if account.risk_status != "healthy" else "medium",
            success_criteria=["Updated stakeholder map", "Next governance date confirmed"],
            completed_at=utc_now() - timedelta(days=2) if index % 4 == 0 else None,
            completed_by_id=owner.id if index % 4 == 0 else None,
            created_by_id=owner.id,
            created_by_name=owner.full_name,
            updated_by_id=owner.id,
        )
        service_values = list(services.values())
        if len(service_values) >= 2:
            current_service = service_values[index % len(service_values)]
            target_service = service_values[(index + 1) % len(service_values)]
            engagement = db.get(Engagement, f"demo-eng-{index:03d}-1")
            _upsert(
                db,
                AccountWhitespaceItem,
                f"demo-white-{index:03d}",
                account_id=account.id,
                engagement_id=engagement.id if engagement else None,
                service_id=current_service.id,
                service_name_snapshot=current_service.name,
                coverage_status="active" if index % 3 else "gap",
                notes="[DEMO] Seeded whitespace item for service coverage and filters.",
                source=DEMO_SOURCE,
                created_by_id=owner.id,
                updated_by_id=owner.id,
            )
            _upsert(
                db,
                ServiceRecommendation,
                f"demo-svc-rec-{index:03d}",
                account_id=account.id,
                source_service_id=current_service.id,
                target_service_id=target_service.id,
                relevance_score=65 + (index % 30),
                rationale="[DEMO] Adjacent service recommendation based on current engagement footprint.",
                status="recommended" if index % 4 else "converted",
                source_context=DEMO_SOURCE,
                created_opportunity_id=None,
            )


def _seed_opportunities(
    db: Session,
    users: dict[str, User],
    accounts: list[Account],
    engagements: dict[str, list[Engagement]],
) -> None:
    owner = users["commercial_stakeholder:sara_malik"]
    types = {item.slug: item for item in db.scalars(select(OpportunityType)).all()}
    type_cycle = ("cross_sell", "upsell", "renewal", "expansion", "retention_recovery", "analytics", "automation")
    stages = ("Identified", "Qualified", "Proposal Sent", "Negotiation", "Won", "Lost")
    for index, account in enumerate(accounts, start=1):
        for sequence in range(1, 3):
            opportunity_type = types.get(type_cycle[(index + sequence) % len(type_cycle)]) or next(iter(types.values()))
            stage = stages[(index + sequence) % len(stages)]
            opportunity = _upsert(
                db,
                Opportunity,
                f"demo-opp-{index:03d}-{sequence}",
                account_id=account.id,
                engagement_id=engagements[account.id][sequence - 1].id,
                type_id=opportunity_type.id,
                owner_id=owner.id,
                owner_name=owner.full_name,
                owner_email=owner.email,
                name=f"[DEMO] {opportunity_type.name} motion {index:03d}-{sequence}",
                service_line=["Data Analytics", "Cloud & DevOps", "Automation & QA"][sequence % 3],
                value=85000 + index * 18000 + sequence * 25000,
                currency="USD",
                stage=stage,
                next_step="[DEMO] Confirm business case, executive sponsor, and target close plan.",
                target_date=utc_now() + timedelta(days=15 + index * 3 + sequence * 10),
                source_context=DEMO_SOURCE,
                source_record_id=account.id,
                source_record_type="account",
                source_record_route=f"/accounts/{account.id}?tab=opportunities",
                outcome_reason="[DEMO] Terminal stage seeded for board testing." if stage in {"Won", "Lost"} else None,
                created_by_id=owner.id,
                created_by_name=owner.full_name,
                updated_by_id=owner.id,
                updated_by_name=owner.full_name,
                created_at=utc_now() - timedelta(days=sequence * 12 + index),
                updated_at=utc_now() - timedelta(days=sequence + index % 6),
            )
            _upsert(
                db,
                OpportunityStageHistory,
                f"demo-opp-hist-{index:03d}-{sequence}",
                opportunity_id=opportunity.id,
                account_id=account.id,
                engagement_id=opportunity.engagement_id,
                before_stage=None,
                after_stage=stage,
                actor_id=owner.id,
                actor_name=owner.full_name,
                reason="[DEMO] Seeded initial opportunity stage.",
                timeline_entry_id=None,
            )
            _upsert(
                db,
                OpportunityDecision,
                f"demo-opp-dec-{index:03d}-{sequence}",
                opportunity_id=opportunity.id,
                decision_text="[DEMO] Prioritize opportunity while renewal narrative is fresh.",
                owner_id=owner.id,
                owner_name=owner.full_name,
                created_by_id=owner.id,
                created_by_name=owner.full_name,
            )
            _upsert(
                db,
                OpportunityActionItem,
                f"demo-opp-act-{index:03d}-{sequence}",
                opportunity_id=opportunity.id,
                title="[DEMO] Prepare quantified value hypothesis",
                owner_id=owner.id,
                owner_name=owner.full_name,
                owner_email=owner.email,
                due_at=utc_now() + timedelta(days=sequence * 5 + index % 10),
                status="open" if sequence == 1 else "completed",
                priority="high" if stage in {"Proposal Sent", "Negotiation"} else "medium",
                notes="[DEMO] Seeded opportunity next action.",
                completed_at=utc_now() - timedelta(days=1) if sequence == 2 else None,
                completed_by_id=owner.id if sequence == 2 else None,
                created_by_id=owner.id,
                created_by_name=owner.full_name,
            )


def _seed_scoring(
    db: Session,
    users: dict[str, User],
    accounts: list[Account],
    engagements: dict[str, list[Engagement]],
) -> None:
    actor = users["kam_head:demo_kam_head"]
    for index, account in enumerate(accounts, start=1):
        job = _upsert(
            db,
            ScoringJob,
            f"demo-score-job-{index:03d}",
            job_type="manual",
            scope="account",
            account_id=account.id,
            engagement_id=None,
            status="complete",
            trigger_source=DEMO_SOURCE,
            error_message=None,
            result_json={"overall": account.health_overall, "source": DEMO_SOURCE},
            created_by_id=actor.id,
            created_by_name=actor.full_name,
            started_at=utc_now() - timedelta(days=index + 1),
            completed_at=utc_now() - timedelta(days=index),
        )
        _upsert_score_snapshot(
            db,
            f"demo-score-prev-{index:03d}",
            account,
            job,
            actor,
            max(30, account.health_overall + (12 if index % 3 == 0 else -4)),
            -21,
            "previous",
        )
        _upsert_score_snapshot(
            db,
            f"demo-score-current-{index:03d}",
            account,
            job,
            actor,
            account.health_overall,
            0,
            "current",
        )
        _upsert(
            db,
            AccountHealthRollup,
            f"demo-rollup-{index:03d}",
            account_id=account.id,
            overall=account.health_overall,
            rag_status=_rag_from_score(account.health_overall),
            contributions=[
                {"dimension": "relationship", "value": account.health_relationship},
                {"dimension": "delivery", "value": account.health_delivery},
                {"dimension": "commercial", "value": account.health_commercial},
            ],
            metric_version="demo-rollup-v1",
        )
        _upsert(
            db,
            ManualScoreSubmission,
            f"demo-manual-score-{index:03d}",
            account_id=account.id,
            engagement_id=engagements[account.id][0].id,
            scope="account",
            calculator_id="demo-account-health",
            values_json={
                "relationship_health": account.health_relationship,
                "usage_adoption_health": account.health_usage,
                "delivery_health": account.health_delivery,
                "commercial_health": account.health_commercial,
            },
            evidence_json=[{"type": "demo", "label": "Seeded score input"}],
            validation_status="validated",
            submitted_by_id=actor.id,
            submitted_by_name=actor.full_name,
            created_at=utc_now() - timedelta(days=index % 30),
        )


def _upsert_score_snapshot(
    db: Session,
    snapshot_id: str,
    account: Account,
    job: ScoringJob,
    actor: User,
    overall: int,
    day_offset: int,
    label: str,
) -> ScoreSnapshot:
    return _upsert(
        db,
        ScoreSnapshot,
        snapshot_id,
        account_id=account.id,
        engagement_id=None,
        job_id=job.id,
        scope="account",
        overall=overall,
        rag_status=_rag_from_score(overall),
        drivers=[
            {"metric": "relationship_health", "value": account.health_relationship, "weight": 25},
            {"metric": "usage_adoption_health", "value": account.health_usage, "weight": 25},
            {"metric": "delivery_health", "value": account.health_delivery, "weight": 25},
            {"metric": "commercial_health", "value": account.health_commercial, "weight": 25},
        ],
        reason_codes=[f"demo_{label}_snapshot"],
        metric_version="demo-scoring-v1",
        freshness_status="fresh",
        is_dirty=False,
        trend=overall - account.health_overall,
        status="complete",
        source_context={"source": DEMO_SOURCE, "label": label},
        calculated_by_id=actor.id,
        calculated_by_name=actor.full_name,
        calculated_at=utc_now() + timedelta(days=day_offset),
    )


def _seed_kyc(db: Session, users: dict[str, User], accounts: list[Account], docs_by_account: dict[str, list[SourceDocument]]) -> None:
    actor = users["account_manager:nadia_khan"]
    approver = users["kam_head:demo_kam_head"]
    research_sources = ["Travoly/Trivoly", "ZoomInfo", "CrunchBase"]
    for index, account in enumerate(accounts[:14], start=1):
        documents = docs_by_account.get(account.id, [])
        run_status = "failed" if index % 7 == 0 else "running" if index % 6 == 0 else "complete"
        run = _upsert(
            db,
            KycAgentRun,
            f"demo-kyc-run-{index:03d}",
            account_id=account.id,
            status=run_status,
            trigger_source="account_overview" if index % 2 else "selected_documents",
            previous_run_id=None,
            source_document_ids=[doc.id for doc in documents],
            research_sources=research_sources,
            triggered_by_id=actor.id,
            triggered_by_name=actor.full_name,
            error_message="[DEMO] One workstream failed for demo error-state testing." if run_status == "failed" else None,
            started_at=utc_now() - timedelta(hours=3 + index),
            completed_at=None if run_status == "running" else utc_now() - timedelta(hours=2 + index),
        )
        workstream_statuses = _workstream_statuses_for(index, run_status)
        for workstream in WORKSTREAMS:
            status = workstream_statuses[str(workstream["key"])]
            _upsert(
                db,
                KycWorkstreamOutput,
                f"demo-kyc-ws-{index:03d}-{workstream['sort_order']}",
                run_id=run.id,
                account_id=account.id,
                workstream_key=str(workstream["key"]),
                title=str(workstream["title"]),
                status=status,
                sort_order=int(workstream["sort_order"]),
                output_json=_kyc_output_for(account, str(workstream["key"])),
                citations_json=_kyc_citations(account, documents),
                missing_fields=["Funding context"] if status == "failed" else [],
                confidence=62 if status == "failed" else 79 + index % 12,
                error_message="[DEMO] Source coverage unavailable for this workstream." if status == "failed" else None,
                started_at=run.started_at,
                completed_at=None if status in {"pending", "running"} else utc_now() - timedelta(hours=1 + index),
            )
        fields = _kyc_fields_for(account, index)
        draft_status = "ready_for_review" if index % 5 else "rejected"
        draft = _upsert(
            db,
            KycDraft,
            f"demo-kyc-draft-{index:03d}",
            account_id=account.id,
            status=draft_status,
            trigger_source=run.trigger_source,
            agent_run_id=run.id,
            previous_snapshot_id=None,
            source_document_ids=[doc.id for doc in documents],
            research_sources=research_sources,
            fields_json=fields,
            citations_json=_kyc_citations(account, documents),
            missing_fields=[field["label"] for field in fields if field.get("missing")],
            conflicts=["[DEMO] Conflicting renewal owner found in SOW and notes."] if index % 4 == 0 else [],
            difference_summary=["[DEMO] Commercial exposure changed from previous approved snapshot."] if index % 3 == 0 else [],
            source_context={"source": DEMO_SOURCE, "documents": [doc.title for doc in documents]},
            confidence=68 if index % 4 == 0 else 84,
            completeness=86 if index % 4 else 72,
            source_coverage=80 if documents else 45,
            freshness_status="fresh",
            low_confidence_acknowledged=index % 4 == 0,
            conflicts_acknowledged=index % 4 == 0,
            override_reason="[DEMO] Accepted low confidence for internal rehearsal." if index % 4 == 0 else None,
            review_notes="[DEMO] KYC draft seeded for review/edit/approve/reject workflow.",
            created_by_id=actor.id,
            created_by_name=actor.full_name,
            reviewed_by_id=actor.id,
            reviewed_by_name=actor.full_name,
            rejected_by_id=approver.id if draft_status == "rejected" else None,
            rejected_by_name=approver.full_name if draft_status == "rejected" else None,
            rejection_reason="[DEMO] Missing validated financial source." if draft_status == "rejected" else None,
            decided_at=utc_now() - timedelta(days=2) if draft_status == "rejected" else None,
        )
        db.flush()
        if index % 5 != 0:
            approved_at = utc_now() - timedelta(days=130 if index % 6 == 0 else index * 3)
            snapshot = _upsert(
                db,
                KycSnapshot,
                f"demo-kyc-snap-{index:03d}",
                account_id=account.id,
                version=1,
                source_draft_id=draft.id,
                extraction_run_id=run.id,
                approved_by_id=approver.id,
                approved_by_name=approver.full_name,
                approved_at=approved_at,
                fields_json=fields,
                citations_json=_kyc_citations(account, documents),
                source_context={"source": DEMO_SOURCE, "approved_context": "Demo immutable KYC snapshot"},
                source_document_ids=[doc.id for doc in documents],
                research_sources=research_sources,
                confidence=draft.confidence,
                completeness=draft.completeness,
                source_coverage=draft.source_coverage,
                freshness_status="stale" if index % 6 == 0 else "fresh",
                missing_fields=draft.missing_fields,
                conflicts=draft.conflicts,
                change_summary=["[DEMO] Approved seeded KYC snapshot for local demo."],
                created_at=approved_at,
            )
            draft.approved_by_id = approver.id
            draft.approved_by_name = approver.full_name
            draft.approved_snapshot_id = snapshot.id


def _seed_signals_playbooks_tasks(
    db: Session,
    users: dict[str, User],
    accounts: list[Account],
    engagements: dict[str, list[Engagement]],
) -> None:
    owner = users["account_manager:nadia_khan"]
    rules = {rule.signal_type: rule for rule in db.scalars(select(SignalRule)).all()}
    signal_types = ("stale_kyc", "red_account_health", "renewal_date", "opportunity_stalled", "payment_risk", "governance_overdue")
    templates = db.scalars(select(PlaybookTemplate).order_by(PlaybookTemplate.name)).all()
    template = templates[0] if templates else None
    for index, account in enumerate(accounts, start=1):
        for sequence in range(1, 3):
            signal_type = signal_types[(index + sequence) % len(signal_types)]
            rule = rules.get(signal_type)
            signal = _upsert(
                db,
                Signal,
                f"demo-signal-{index:03d}-{sequence}",
                account_id=account.id,
                engagement_id=engagements[account.id][0].id if sequence == 1 else None,
                rule_id=rule.id if rule else None,
                signal_type=signal_type,
                severity="critical" if account.risk_status == "critical" or signal_type == "red_account_health" else "warning",
                status="new" if sequence == 1 else "accepted",
                owner_id=owner.id,
                owner_name=owner.full_name,
                title=f"[DEMO] {signal_type.replace('_', ' ').title()}",
                detail="[DEMO] Deterministic signal seeded for attention center filters, playbook launch, and dashboards.",
                reason_codes=[signal_type, "demo_seed"],
                evidence_json=[{"type": "account", "id": account.id, "health": account.health_overall}],
                citations_json=[{"label": "Demo evidence", "excerpt": "Seeded signal evidence for local demo."}],
                source_record_type="account",
                source_record_id=account.id,
                source_record_route=f"/accounts/{account.id}?tab=signals",
                confidence=75 + index % 15,
                condition_key=f"demo:{signal_type}:{sequence}",
                due_at=utc_now() + timedelta(days=sequence * 3 - (index % 6)),
                resolved_at=None,
                dismissed_at=None,
            )
            _upsert(
                db,
                SignalEvent,
                f"demo-signal-event-{index:03d}-{sequence}",
                signal_id=signal.id,
                event_type="created",
                previous_status=None,
                new_status=signal.status,
                actor_id=owner.id,
                actor_name=owner.full_name,
                reason="[DEMO] Seeded signal event.",
                metadata_json={"source": DEMO_SOURCE},
            )
        if template and db.get_bind().dialect.name == "postgresql":
            db.flush()
            execution_id = _upsert_playbook_execution(
                db,
                execution_id=f"demo-play-exec-{index:03d}",
                template=template,
                account=account,
                engagement=engagements[account.id][0],
                signal_id=f"demo-signal-{index:03d}-1",
                signal_type=signal_types[(index + 1) % len(signal_types)],
                status="active" if index % 4 else "completed",
                actor=owner,
            )
        else:
            execution_id = None
        for sequence in range(1, 4):
            status = "completed" if sequence == 3 and index % 2 == 0 else "open"
            task = _upsert(
                db,
                Task,
                f"demo-task-{index:03d}-{sequence}",
                account_id=account.id,
                engagement_id=engagements[account.id][0].id,
                playbook_execution_id=execution_id,
                template_activity_id=None,
                source_type="playbook" if execution_id else "manual",
                source_record_id=execution_id if execution_id else account.id,
                source_metric="health_overall",
                title=f"[DEMO] {'Overdue ' if sequence == 1 and index % 3 == 0 else ''}Account action {index:03d}-{sequence}",
                description="[DEMO] Seeded action item for task list pagination, filters, priority, status, and calendar views.",
                owner_id=owner.id,
                owner_name=owner.full_name,
                due_at=utc_now() + timedelta(days=sequence * 4 - (index % 8)),
                status=status,
                priority="urgent" if account.risk_status == "critical" and sequence == 1 else "high" if sequence == 1 else "medium",
                notes="[DEMO] Task generated from seeded signal/playbook context.",
                evidence_json=[
                    {
                        "type": "demo",
                        "label": "Seeded task evidence",
                        "source": DEMO_SOURCE,
                    }
                ],
                outcome="[DEMO] Evidence captured." if status == "completed" else None,
                success_criteria=["Client follow-up completed", "Evidence attached"],
                requires_evidence=sequence == 1,
                completed_at=utc_now() - timedelta(days=1) if status == "completed" else None,
                completed_by_id=owner.id if status == "completed" else None,
                created_by_id=owner.id,
                created_by_name=owner.full_name,
                updated_by_id=owner.id,
            )
            if sequence == 1:
                _upsert(
                    db,
                    TaskEvidence,
                    f"demo-task-evidence-{index:03d}",
                    task_id=task.id,
                    evidence_type="note",
                    title="[DEMO] Follow-up evidence",
                    body="[DEMO] Seeded evidence note attached to the task.",
                    metadata_json={"source": DEMO_SOURCE, "demo": True},
                    created_by_id=owner.id,
                    created_by_name=owner.full_name,
                )


def _seed_content_escalations_governance(
    db: Session,
    users: dict[str, User],
    accounts: list[Account],
    engagements: dict[str, list[Engagement]],
) -> None:
    content_owner = users["content_specialist:zain_qureshi"]
    escalation_owner = users["ops_lead:ayesha_rahman"]
    governance_owner = users["kam_head:demo_kam_head"]
    for sequence, (title, category) in enumerate(
        (
            ("Executive QBR Prep Kit", "governance"),
            ("Renewal Value Narrative", "retention"),
            ("Cloud Cost Optimization Brief", "growth"),
            ("Escalation Recovery Checklist", "escalation"),
            ("Stakeholder Mapping Guide", "relationship"),
        ),
        start=1,
    ):
        _upsert(
            db,
            ContentItem,
            f"demo-content-{sequence:03d}",
            title=f"[DEMO] {title}",
            description="[DEMO] Content seeded for catalog search, filters, recommendations, and sent history.",
            content_type="playbook" if sequence % 2 else "article",
            category=category,
            tags=[DEMO_TAG, category],
            service_lines=["Cloud & DevOps", "Data Analytics"] if sequence % 2 else ["Product Engineering"],
            account_stages=["Active", "Renewal Focus", "At Risk"],
            source_kind="manual",
            url=f"https://example.com/demo/content/{sequence}",
            body_content=f"[DEMO] {title} content body.",
            is_active=True,
            popularity_count=8 + sequence * 3,
            created_by_id=content_owner.id,
            updated_by_id=content_owner.id,
        )
    content_item = db.get(ContentItem, "demo-content-001")
    for index, account in enumerate(accounts[:14], start=1):
        if content_item:
            _upsert(
                db,
                SentContentRecord,
                f"demo-sent-content-{index:03d}",
                account_id=account.id,
                engagement_id=engagements[account.id][0].id,
                content_item_id=content_item.id,
                content_title_snapshot=content_item.title,
                content_type_snapshot=content_item.content_type,
                sender_id=content_owner.id,
                sender_name=content_owner.full_name,
                recipient_name=f"Demo Client {index}",
                recipient_email=f"demo.client{index}@example.com",
                shared_at=utc_now() - timedelta(days=index * 2),
                follow_up_status="due" if index % 3 == 0 else "complete" if index % 4 == 0 else "not_required",
                follow_up_due_at=utc_now() + timedelta(days=index % 10) if index % 3 == 0 else None,
                notes="[DEMO] Sent content history seeded without sending email.",
                timeline_entry_id=None,
            )
        if index <= 12:
            escalation = _upsert(
                db,
                Escalation,
                f"demo-esc-{index:03d}",
                account_id=account.id,
                engagement_id=engagements[account.id][0].id,
                summary=f"[DEMO] {'Critical ' if account.risk_status == 'critical' else ''}Delivery escalation {index:03d}",
                impact="[DEMO] Client milestone or executive confidence may be impacted without mitigation.",
                severity="critical" if account.risk_status == "critical" else "high" if account.risk_status == "warning" else "medium",
                priority="urgent" if account.risk_status == "critical" else "high",
                status="open" if index % 5 else "closed",
                owner_id=escalation_owner.id,
                owner_name=escalation_owner.full_name,
                sla_due_at=utc_now() + timedelta(days=2 - index % 5),
                watchlist=account.risk_status != "healthy",
                mitigation="[DEMO] Daily delivery checkpoint and dependency owner assigned.",
                recovery_actions="[DEMO] Confirm revised timeline and executive update.",
                communication_cadence="Daily" if account.risk_status == "critical" else "Twice weekly",
                resolution_summary="[DEMO] Closure summary for demo." if index % 5 == 0 else None,
                rca="[DEMO] RCA placeholder." if index % 5 == 0 else None,
                closure_evidence="[DEMO] Closure evidence placeholder." if index % 5 == 0 else None,
                closed_by_id=escalation_owner.id if index % 5 == 0 else None,
                closed_at=utc_now() - timedelta(days=1) if index % 5 == 0 else None,
                created_by_id=escalation_owner.id,
                created_by_name=escalation_owner.full_name,
                created_at=utc_now() - timedelta(days=15 + index),
            )
            _upsert(
                db,
                EscalationUpdate,
                f"demo-esc-update-{index:03d}",
                escalation_id=escalation.id,
                update_type="mitigation",
                body="[DEMO] Mitigation owner confirmed and next client communication scheduled.",
                actor_id=escalation_owner.id,
                actor_name=escalation_owner.full_name,
                metadata_json={"source": DEMO_SOURCE},
            )
            _upsert(
                db,
                EscalationNotification,
                f"demo-esc-notif-{index:03d}",
                escalation_id=escalation.id,
                recipient_user_id=governance_owner.id,
                recipient_name=governance_owner.full_name,
                recipient_email=governance_owner.email,
                channel="in_app",
                trigger="escalation_sla",
                reason="[DEMO] SLA attention notification seeded locally.",
                sla_window_key=f"demo-escalation-{index:03d}",
                delivery_status="delivered",
                deduplication_key=f"demo:escalation:{index:03d}:sla",
                delivered_at=utc_now() - timedelta(hours=index),
            )
        if index <= 16:
            event = _upsert(
                db,
                GovernanceEvent,
                f"demo-gov-{index:03d}",
                account_id=account.id,
                engagement_id=engagements[account.id][0].id,
                owner_id=governance_owner.id,
                owner_name=governance_owner.full_name,
                governance_type="QBR" if index % 2 else "Executive Review",
                source=DEMO_SOURCE,
                external_provider=None,
                external_event_id=None,
                deduplication_key=f"demo:governance:{index:03d}",
                mapping_confidence=100,
                review_required=False,
                scheduled_at=utc_now() + timedelta(days=index * 4 - 20),
                end_at=utc_now() + timedelta(days=index * 4 - 20, hours=1),
                status="completed" if index % 4 == 0 else "scheduled",
                agenda="[DEMO] Review health, escalations, renewal path, and growth opportunities.",
                notes="[DEMO] Governance event seeded for calendar/list filters.",
                attendees=[{"email": governance_owner.email, "name": governance_owner.full_name}],
                recurrence_rule_id=None,
                created_by_id=governance_owner.id,
                created_by_name=governance_owner.full_name,
                completed_at=utc_now() - timedelta(days=1) if index % 4 == 0 else None,
            )
            _upsert(
                db,
                GovernanceDecision,
                f"demo-gov-dec-{index:03d}",
                governance_event_id=event.id,
                decision_text="[DEMO] Proceed with recovery plan and publish executive summary.",
                owner_id=governance_owner.id,
                owner_name=governance_owner.full_name,
            )
            _upsert(
                db,
                GovernanceActionItem,
                f"demo-gov-action-{index:03d}",
                governance_event_id=event.id,
                title="[DEMO] Send governance recap",
                owner_id=governance_owner.id,
                owner_name=governance_owner.full_name,
                owner_email=governance_owner.email,
                due_at=utc_now() + timedelta(days=index % 7),
                status="open" if index % 4 else "completed",
                priority="high" if account.risk_status != "healthy" else "medium",
                completed_at=utc_now() - timedelta(hours=4) if index % 4 == 0 else None,
                completed_by_id=governance_owner.id if index % 4 == 0 else None,
            )
            _upsert(
                db,
                GovernanceSourceCitation,
                f"demo-gov-cite-{index:03d}",
                governance_event_id=event.id,
                source_module="account_overview",
                source_entity_type="account",
                source_entity_id=account.id,
                source_route=f"/accounts/{account.id}",
                label="[DEMO] Account health context",
                excerpt="[DEMO] Governance source citation seeded from account health and escalation context.",
            )


def _seed_timeline_handover(
    db: Session,
    users: dict[str, User],
    accounts: list[Account],
    engagements: dict[str, list[Engagement]],
) -> None:
    actor = users["account_manager:omar_siddiqui"]
    event_types = ("account_setup", "kyc_update", "score_change", "governance_event", "escalation_event", "manual_note")
    for account_index, account in enumerate(accounts, start=1):
        for sequence, event_type in enumerate(event_types, start=1):
            entry = _upsert(
                db,
                TimelineEntry,
                f"demo-time-{account_index:03d}-{sequence}",
                account_id=account.id,
                engagement_id=engagements[account.id][0].id if sequence % 2 else None,
                event_type=event_type,
                module=_timeline_module(event_type),
                title=f"[DEMO] {event_type.replace('_', ' ').title()}",
                description=f"[DEMO] Timeline event {sequence} for {account.name}; supports filters, sort, search, comments, and handover.",
                performed_by=actor.id,
                performed_by_name=actor.full_name,
                source_record_id=account.id,
                source_record_type="account",
                source_record_route=f"/accounts/{account.id}",
                before_value={"risk_status": "warning"} if sequence == 3 else None,
                after_value={"risk_status": account.risk_status, "health": account.health_overall},
                is_sensitive=sequence == 5,
                is_system_generated=sequence != 6,
                is_immutable=sequence != 6,
                metadata_json={"source": DEMO_SOURCE, "sequence": sequence},
                event_at=utc_now() - timedelta(days=account_index * 2 + sequence),
                sensitivity_level="restricted" if sequence == 5 else None,
                tags=[DEMO_TAG, event_type],
                mentions=[actor.email] if sequence == 6 else [],
                attachments=[],
                status="active",
                source_hash=f"demo:{account.id}:{event_type}",
                idempotency_key=f"demo:{account.id}:{event_type}:timeline",
            )
            if sequence in {4, 6}:
                _upsert(
                    db,
                    TimelineComment,
                    f"demo-time-comment-{account_index:03d}-{sequence}",
                    timeline_entry_id=entry.id,
                    author_id=actor.id,
                    author_name=actor.full_name,
                    body="[DEMO] Comment seeded for timeline collaboration testing.",
                    mentions=[actor.email],
                    is_sensitive=False,
                    edited_at=utc_now() - timedelta(days=1) if sequence == 6 else None,
                )
        if account_index <= 8:
            summary = _upsert(
                db,
                HandoverSummary,
                f"demo-handover-{account_index:03d}",
                account_id=account.id,
                generated_by_id=actor.id,
                generated_by_name=actor.full_name,
                ownership_change_id=f"demo-ownhist-{account_index:03d}",
                selected_sections=["profile", "kyc", "engagements", "risks", "timeline"],
                source_set_json=[{"type": "timeline", "count": 6}, {"type": "kyc", "count": 1}],
                redaction_summary={"commercial": False, "sensitive_notes": True},
                citations_json=[{"label": "Demo timeline", "excerpt": "Seeded handover source."}],
                content_json={
                    "executive_summary": f"[DEMO] {account.name} is {account.risk_status} with health {account.health_overall}.",
                    "next_actions": ["Review open tasks", "Confirm next governance event"],
                },
                status="complete",
                export_metadata_json={"pdf_ready": True, "source": DEMO_SOURCE},
                share_metadata_json={"internal_share": True},
            )
            db.flush()
            _upsert(
                db,
                HandoverShare,
                f"demo-handover-share-{account_index:03d}",
                handover_summary_id=summary.id,
                account_id=account.id,
                share_token=f"demo-share-token-{account_index:03d}",
                created_by_id=actor.id,
                created_by_name=actor.full_name,
                expires_at=utc_now() + timedelta(days=30),
            )
            _upsert(
                db,
                TimelineAiSearchAudit,
                f"demo-time-ai-{account_index:03d}",
                account_id=account.id,
                user_id=actor.id,
                query="[DEMO] What changed since the last QBR?",
                interpreted_intent="governance_change_summary",
                scopes=["timeline", "governance", "signals"],
                source_ids=[f"demo-time-{account_index:03d}-4"],
                redactions={"sensitive_events": 1 if account.risk_status == "critical" else 0},
            )


def _seed_notifications_reporting(db: Session, users: dict[str, User], accounts: list[Account]) -> None:
    recipient_cycle = [
        users["account_manager:nadia_khan"],
        users["account_manager:omar_siddiqui"],
        users["kam_head:demo_kam_head"],
    ]
    for index, account in enumerate(accounts, start=1):
        recipient = recipient_cycle[index % len(recipient_cycle)]
        _upsert(
            db,
            NotificationRecord,
            f"demo-notif-{index:03d}",
            recipient_user_id=recipient.id,
            recipient_name=recipient.full_name,
            recipient_email=recipient.email,
            trigger="signal_created" if index % 2 else "governance_reminder",
            title=f"[DEMO] Attention needed for {account.name.replace('[DEMO] ', '')}",
            body="[DEMO] In-app notification seeded locally; no email was sent.",
            account_id=account.id,
            account_name_snapshot=account.name,
            source_record_type="account",
            source_record_id=account.id,
            source_record_route=f"/accounts/{account.id}",
            priority="high" if account.risk_status != "healthy" else "medium",
            channel="in_app",
            delivery_status="delivered",
            delivery_metadata_json={"source": DEMO_SOURCE},
            deduplication_key=f"demo:notification:{index:03d}",
            email_queued=False,
            retry_count=0,
            read_at=utc_now() - timedelta(days=1) if index % 4 == 0 else None,
            delivered_at=utc_now() - timedelta(hours=index),
        )
    owner = users["kam_head:demo_kam_head"]
    for sequence, data_source in enumerate(("accounts", "signals", "opportunities"), start=1):
        report = _upsert(
            db,
            ReportDefinition,
            f"demo-report-{sequence:03d}",
            owner_id=owner.id,
            owner_name=owner.full_name,
            name=f"[DEMO] {data_source.title()} Portfolio Report",
            description="[DEMO] Report definition seeded for report builder and run history.",
            visibility="team",
            data_source=data_source,
            fields_json=["name", "risk_status", "health_overall"] if data_source == "accounts" else ["title", "status", "priority"],
            filters_json={"demo": True, "risk": "all"},
            grouping_json=["segment"] if data_source == "accounts" else ["status"],
            layout_json={"format": "table", "source": DEMO_SOURCE},
            export_format="csv",
        )
        schedule = _upsert(
            db,
            ReportSchedule,
            f"demo-report-schedule-{sequence:03d}",
            report_id=report.id,
            owner_id=owner.id,
            owner_name=owner.full_name,
            cadence="weekly",
            timezone="Asia/Karachi",
            recipients_json=[{"email": owner.email, "name": owner.full_name}],
            delivery_channels=["in_app"],
            is_active=True,
            last_run_at=utc_now() - timedelta(days=7),
            next_run_at=utc_now() + timedelta(days=7),
        )
        db.flush()
        _upsert(
            db,
            ReportRun,
            f"demo-report-run-{sequence:03d}",
            report_id=report.id,
            schedule_id=schedule.id,
            status="generated",
            export_format="csv",
            content_json={"rows": 12, "source": DEMO_SOURCE},
            storage_metadata_json={"stored": False, "reason": "demo"},
            permission_scope_json={"role": owner.role},
            recipients_json=[{"email": owner.email, "channel": "in_app"}],
            generated_by_id=owner.id,
            generated_by_name=owner.full_name,
            generated_at=utc_now() - timedelta(days=sequence),
        )
    digest = _upsert(
        db,
        DigestSchedule,
        "demo-digest-weekly",
        name="[DEMO] Weekly Portfolio Digest",
        owner_id=owner.id,
        owner_name=owner.full_name,
        cadence="weekly",
        timezone="Asia/Karachi",
        recipients_json=[{"email": owner.email, "name": owner.full_name}],
        sections_json=["health", "signals", "renewals", "opportunities"],
        filters_json={"demo": True},
        delivery_channels=["in_app"],
        is_active=True,
        last_run_at=utc_now() - timedelta(days=7),
        next_run_at=utc_now() + timedelta(days=7),
    )
    db.flush()
    _upsert(
        db,
        DigestRun,
        "demo-digest-run-weekly",
        schedule_id=digest.id,
        title="[DEMO] Weekly Portfolio Digest Run",
        status="generated",
        recipients_json=digest.recipients_json,
        sections_json=digest.sections_json,
        content_json={"summary": "[DEMO] Digest generated from seeded portfolio records."},
        redactions_json={"commercial_redactions": 0},
        delivery_attempts_json=[{"channel": "in_app", "status": "delivered"}],
        generated_by_id=owner.id,
        generated_by_name=owner.full_name,
        generated_at=utc_now() - timedelta(days=1),
    )
    _upsert(
        db,
        ScheduledWorkerRun,
        "demo-worker-run-001",
        job_type="notifications_reporting",
        mode="scheduled",
        status="complete",
        matched_count=24,
        affected_count=8,
        actor_id=owner.id,
        actor_name=owner.full_name,
        metadata_json={"source": DEMO_SOURCE, "email_sent": False},
        started_at=utc_now() - timedelta(hours=6),
        finished_at=utc_now() - timedelta(hours=6, minutes=-2),
    )


def _seed_integrations_ai_csat(
    db: Session,
    users: dict[str, User],
    accounts: list[Account],
    engagements: dict[str, list[Engagement]],
) -> None:
    actor = users["account_manager:nadia_khan"]
    admin = users["admin:demo_admin"]
    for provider in ("google_calendar", "fathom", "ai_llm_gateway", "csat"):
        _upsert(
            db,
            IntegrationSyncRun,
            f"demo-sync-run-{provider}",
            provider=provider,
            trigger_type=DEMO_SOURCE,
            status="success",
            actor_id=admin.id,
            actor_name=admin.full_name,
            retry_count=0,
            created_count=3,
            updated_count=1,
            skipped_count=0,
            error_count=0,
            failure_type=None,
            message="[DEMO] Local seeded sync run; no external API was called.",
            started_at=utc_now() - timedelta(days=1),
            finished_at=utc_now() - timedelta(days=1, minutes=-4),
            metadata_json={"source": DEMO_SOURCE, "external_api_called": False},
        )
        _upsert(
            db,
            IntegrationSyncLog,
            f"demo-sync-log-{provider}",
            provider=provider,
            source_record_id=f"demo-{provider}-record",
            action="demo_seed",
            status="success",
            deduplication_key=f"demo:{provider}:sync-log",
            message="[DEMO] Local integration log seeded without provider call.",
            payload={"source": DEMO_SOURCE, "provider": provider},
        )
    for index, account in enumerate(accounts[:10], start=1):
        item = _upsert(
            db,
            IntegrationImportedItem,
            f"demo-fathom-item-{index:03d}",
            provider="fathom",
            external_id=f"demo-fathom-meeting-{index:03d}",
            title=f"[DEMO] Fathom meeting summary - {account.name.replace('[DEMO] ', '')}",
            description="[DEMO] Summary: client discussed renewal risk, delivery blockers, and growth priorities.",
            source_link=f"https://fathom.video/share/demo-{index:03d}",
            occurred_at=utc_now() - timedelta(days=index * 2),
            source_timestamp=utc_now() - timedelta(days=index * 2),
            account_id=account.id,
            engagement_id=engagements[account.id][0].id,
            mapping_status="mapped",
            review_status="pending" if index % 3 else "approved",
            review_required=True,
            deduplication_key=f"demo:fathom:{index:03d}",
            sanitized_payload_json={
                "summary": "[DEMO] Redacted Fathom summary payload.",
                "action_items": ["Create renewal action", "Schedule governance follow-up"],
            },
            result_record_type=None,
            result_record_id=None,
            reviewed_by_id=admin.id if index % 3 == 0 else None,
            reviewed_by_name=admin.full_name if index % 3 == 0 else None,
            reviewed_at=utc_now() - timedelta(days=1) if index % 3 == 0 else None,
        )
        _upsert(
            db,
            FathomTaskSuggestion,
            f"demo-fathom-suggestion-{index:03d}",
            imported_item_id=item.id,
            account_id=account.id,
            engagement_id=engagements[account.id][0].id,
            title="[DEMO] Create follow-up task from Fathom action item",
            description="[DEMO] Suggested action item generated from local Fathom sample data.",
            suggested_due_at=utc_now() + timedelta(days=5 + index),
            status="pending" if index % 4 else "rejected",
            reviewer_id=admin.id if index % 4 == 0 else None,
            reviewer_name=admin.full_name if index % 4 == 0 else None,
            reviewed_at=utc_now() - timedelta(hours=index) if index % 4 == 0 else None,
            created_task_id=None,
        )
        _upsert(
            db,
            IntegrationMappingRule,
            f"demo-map-fathom-{index:03d}",
            provider="fathom",
            name=f"[DEMO] Map {account.name.replace('[DEMO] ', '')} meetings",
            pattern=account.name.replace("[DEMO] ", "").split()[0].lower(),
            source_field="title",
            target_account_id=account.id,
            target_engagement_id=engagements[account.id][0].id,
            target_event_type="governance_event",
            priority=index,
            is_active=True,
            created_by_id=admin.id,
            updated_by_id=admin.id,
        )
    for index, account in enumerate(accounts, start=1):
        score = round(2.2 + (index % 8) * 0.42, 1)
        normalized = round((score - 1) / 4 * 100)
        _upsert(
            db,
            CsatScore,
            f"demo-csat-{index:03d}",
            account_id=account.id,
            engagement_id=engagements[account.id][0].id,
            customer_name=f"Demo Customer {index}",
            customer_email=f"demo.csat{index}@example.com",
            score=score,
            scale_min=1,
            scale_max=5,
            normalized_score=normalized,
            category_scores_json={"delivery": score, "communication": min(5, score + 0.3), "value": max(1, score - 0.2)},
            category_weights_json={"delivery": 0.4, "communication": 0.3, "value": 0.3},
            weighted_score=round((score * 0.4) + (min(5, score + 0.3) * 0.3) + (max(1, score - 0.2) * 0.3), 2),
            feedback="[DEMO] Manual CSAT response seeded for satisfaction trend and signal testing.",
            source_label="demo_manual",
            source_id=f"demo-csat-source-{index:03d}",
            source_link=None,
            source_recorded_at=utc_now() - timedelta(days=index * 4),
            freshness_status="stale" if index % 9 == 0 else "fresh",
            score_impact_json={"health_dimension": "relationship", "impact": "positive" if normalized >= 70 else "negative"},
            trend_json={"previous_score": max(1, score - 0.6), "delta": 0.6},
            created_by_id=actor.id,
            created_by_name=actor.full_name,
            updated_by_id=actor.id,
        )
        if index <= 16:
            _upsert(
                db,
                AiGatewayRun,
                f"demo-ai-run-{index:03d}",
                request_type=["account_brief", "timeline_search", "stage_prediction", "kyc_generation"][index % 4],
                status="complete" if index % 5 else "failed",
                actor_id=actor.id,
                actor_name=actor.full_name,
                account_id=account.id,
                engagement_id=engagements[account.id][0].id,
                permission_scope_json={"role": actor.role, "demo": True},
                source_context_json=[{"type": "account", "id": account.id}, {"type": "timeline", "count": 6}],
                research_sources_json=["approved_account_records", "attachments", "demo_seed"],
                response_labels_json=["demo", "local"],
                prompt_json={"query": "[DEMO] Summarize account state"},
                response_json={"summary": f"[DEMO] {account.name} has health {account.health_overall} and {account.risk_status} risk."},
                feedback_json={"rating": "useful" if index % 3 else "needs_review"},
                latency_ms=450 + index * 20,
                usage_json={"tokens": 800 + index * 11},
                error_message="[DEMO] Failed run for error-state testing." if index % 5 == 0 else None,
                affected_records_json=[{"type": "account", "id": account.id}],
                created_at=utc_now() - timedelta(days=index),
            )


def _seed_admin_audit(db: Session, users: dict[str, User], accounts: list[Account]) -> None:
    admin = users["admin:demo_admin"]
    for index, account in enumerate(accounts[:12], start=1):
        _upsert(
            db,
            AuditLog,
            f"demo-audit-{index:03d}",
            module="demo_data",
            action="seed_record",
            entity_type="account",
            entity_id=account.id,
            actor_id=admin.id,
            actor_name=admin.full_name,
            before_value=None,
            after_value={"account": account.name, "source": DEMO_SOURCE},
            reason="[DEMO] Local demo-data seed audit record.",
        )
        _upsert(
            db,
            AccessLog,
            f"demo-access-{index:03d}",
            module="account_overview",
            entity_type="account",
            entity_id=account.id,
            account_id=account.id,
            field_key=None,
            actor_id=admin.id,
            actor_name=admin.full_name,
            decision="allowed",
            reason="[DEMO] Access log seeded for audit screen filtering.",
            metadata_json={"source": DEMO_SOURCE, "role": admin.role},
        )


def _upsert_playbook_execution(
    db: Session,
    *,
    execution_id: str,
    template: PlaybookTemplate,
    account: Account,
    engagement: Engagement,
    signal_id: str,
    signal_type: str,
    status: str,
    actor: User,
) -> str:
    version = template.current_version or template.version or 1
    snapshot = {"source": DEMO_SOURCE, "template": template.name}
    if _table_has_column(db, "playbook_executions", "template_version"):
        now = utc_now()
        db.execute(
            text(
                """
                INSERT INTO playbook_executions (
                    id,
                    template_id,
                    template_version,
                    account_id,
                    engagement_id,
                    signal_id,
                    status,
                    executed_by_id,
                    executed_by_name,
                    customization_json,
                    created_at,
                    template_name_snapshot,
                    template_version_snapshot,
                    source_signal_id,
                    source_signal_type,
                    source_metric,
                    skipped_activity_ids,
                    skip_reasons,
                    template_snapshot,
                    created_by_id,
                    created_by_name,
                    updated_at
                )
                VALUES (
                    :id,
                    :template_id,
                    :template_version,
                    :account_id,
                    :engagement_id,
                    NULL,
                    :status,
                    :actor_id,
                    :actor_name,
                    CAST(:customization_json AS json),
                    :created_at,
                    :template_name_snapshot,
                    :template_version_snapshot,
                    :source_signal_id,
                    :source_signal_type,
                    :source_metric,
                    CAST(:skipped_activity_ids AS json),
                    CAST(:skip_reasons AS json),
                    CAST(:template_snapshot AS json),
                    :created_by_id,
                    :created_by_name,
                    :updated_at
                )
                ON CONFLICT (id) DO UPDATE SET
                    template_id = EXCLUDED.template_id,
                    template_version = EXCLUDED.template_version,
                    account_id = EXCLUDED.account_id,
                    engagement_id = EXCLUDED.engagement_id,
                    status = EXCLUDED.status,
                    executed_by_id = EXCLUDED.executed_by_id,
                    executed_by_name = EXCLUDED.executed_by_name,
                    customization_json = EXCLUDED.customization_json,
                    template_name_snapshot = EXCLUDED.template_name_snapshot,
                    template_version_snapshot = EXCLUDED.template_version_snapshot,
                    source_signal_id = EXCLUDED.source_signal_id,
                    source_signal_type = EXCLUDED.source_signal_type,
                    source_metric = EXCLUDED.source_metric,
                    skipped_activity_ids = EXCLUDED.skipped_activity_ids,
                    skip_reasons = EXCLUDED.skip_reasons,
                    template_snapshot = EXCLUDED.template_snapshot,
                    created_by_id = EXCLUDED.created_by_id,
                    created_by_name = EXCLUDED.created_by_name,
                    updated_at = EXCLUDED.updated_at
                """
            ),
            {
                "id": execution_id,
                "template_id": template.id,
                "template_version": version,
                "account_id": account.id,
                "engagement_id": engagement.id,
                "status": status,
                "actor_id": actor.id,
                "actor_name": actor.full_name,
                "customization_json": json.dumps({"source": DEMO_SOURCE}),
                "created_at": now,
                "template_name_snapshot": template.name,
                "template_version_snapshot": version,
                "source_signal_id": signal_id,
                "source_signal_type": signal_type,
                "source_metric": "health_overall",
                "skipped_activity_ids": json.dumps([]),
                "skip_reasons": json.dumps({}),
                "template_snapshot": json.dumps(snapshot),
                "created_by_id": actor.id,
                "created_by_name": actor.full_name,
                "updated_at": now,
            },
        )
        return execution_id

    _upsert(
        db,
        PlaybookExecution,
        execution_id,
        template_id=template.id,
        template_name_snapshot=template.name,
        template_version_snapshot=version,
        account_id=account.id,
        engagement_id=engagement.id,
        source_signal_id=signal_id,
        source_signal_type=signal_type,
        source_metric="health_overall",
        status=status,
        skipped_activity_ids=[],
        skip_reasons={},
        template_snapshot=snapshot,
        created_by_id=actor.id,
        created_by_name=actor.full_name,
    )
    return execution_id


def _table_has_column(db: Session, table_name: str, column_name: str) -> bool:
    return column_name in {column["name"] for column in inspect(db.get_bind()).get_columns(table_name)}


def _upsert(db: Session, model: type[Any], record_id: str, **values: Any) -> Any:
    record = db.get(model, record_id)
    if record is None:
        record = model(id=record_id, **values)
        db.add(record)
        return record
    for key, value in values.items():
        setattr(record, key, value)
    return record


def _demo_counts(db: Session) -> dict[str, int]:
    return {
        "users": _count_where(db, User, User.email.like("demo%")),
        "accounts": _count_where(db, Account, Account.id.like("demo-acct-%")),
        "engagements": _count_where(db, Engagement, Engagement.id.like("demo-eng-%")),
        "tasks": _count_where(db, Task, Task.id.like("demo-task-%")),
        "signals": _count_where(db, Signal, Signal.id.like("demo-signal-%")),
        "notifications": _count_where(db, NotificationRecord, NotificationRecord.id.like("demo-notif-%")),
        "kyc_runs": _count_where(db, KycAgentRun, KycAgentRun.id.like("demo-kyc-run-%")),
        "fathom_items": _count_where(db, IntegrationImportedItem, IntegrationImportedItem.id.like("demo-fathom-item-%")),
        "ai_runs": _count_where(db, AiGatewayRun, AiGatewayRun.id.like("demo-ai-run-%")),
        "csat_scores": _count_where(db, CsatScore, CsatScore.id.like("demo-csat-%")),
    }


def _count_where(db: Session, model: type[Any], predicate: Any) -> int:
    return int(db.scalar(select(func.count()).select_from(model).where(predicate)) or 0)


def email_key(role: str, full_name: str) -> str:
    return f"{role}:{full_name.lower().replace(' ', '_')}"


def _service_context(index: int) -> str:
    contexts = (
        "Product engineering squads, platform modernization, and release governance.",
        "Data analytics, dashboard modernization, and executive reporting.",
        "Cloud operations, DevOps automation, and reliability enablement.",
        "QA automation, delivery assurance, and support operations.",
    )
    return f"[DEMO] {contexts[index % len(contexts)]}"


def _rag_from_score(value: int) -> str:
    if value < 60:
        return "red"
    if value < 75:
        return "amber"
    return "green"


def _timeline_module(event_type: str) -> str:
    if event_type.startswith("kyc"):
        return "kyc"
    if "score" in event_type:
        return "scoring"
    if "governance" in event_type:
        return "governance"
    if "escalation" in event_type:
        return "escalation"
    return "account"


def _workstream_statuses_for(index: int, run_status: str) -> dict[str, str]:
    statuses: dict[str, str] = {}
    for workstream in WORKSTREAMS:
        key = str(workstream["key"])
        if run_status == "failed" and key == "financial_landscape":
            statuses[key] = "failed"
        elif run_status == "running" and key in {"stakeholder_details", "financial_landscape"}:
            statuses[key] = "running" if key == "stakeholder_details" else "pending"
        else:
            statuses[key] = "complete"
    return statuses


def _kyc_output_for(account: Account, workstream_key: str) -> dict[str, Any]:
    return {
        key: {
            "value": f"[DEMO] {field['label']} for {account.name.replace('[DEMO] ', '')}.",
            "confidence": 82,
            "citations": [{"label": "Demo source", "excerpt": "Seeded KYC source context."}],
        }
        for field in FIELD_CATALOG
        if field["workstream_key"] == workstream_key
        for key in [field["key"]]
    }


def _kyc_fields_for(account: Account, index: int) -> list[dict[str, Any]]:
    fields: list[dict[str, Any]] = []
    for field in FIELD_CATALOG:
        missing = index % 4 == 0 and field["key"] in {"gross_margins", "billing_models"}
        confidence = 62 if missing else 78 + index % 17
        fields.append(
            {
                "key": field["key"],
                "label": field["label"],
                "workstream_key": field["workstream_key"],
                "workstream_title": _workstream_title(str(field["workstream_key"])),
                "value": "" if missing else f"[DEMO] {field['label']} for {account.name.replace('[DEMO] ', '')}.",
                "confidence": confidence,
                "is_required": bool(field.get("required", True)),
                "is_sensitive": bool(field.get("sensitive", False)),
                "reviewed": not missing,
                "missing": missing,
                "conflict": index % 5 == 0 and field["key"] == "renewal_cycle",
                "previous_value": None,
                "citations": [{"label": "Demo KYC citation", "excerpt": "Seeded field citation."}],
            }
        )
    return fields


def _kyc_citations(account: Account, documents: list[SourceDocument]) -> list[dict[str, Any]]:
    citations = [
        {
            "label": f"[DEMO] {doc.title}",
            "excerpt": f"[DEMO] Source excerpt for {account.name} KYC.",
            "source_document_id": doc.id,
            "page_number": 3,
        }
        for doc in documents
    ]
    if not citations:
        citations.append({"label": "[DEMO] Internal note", "excerpt": "Seeded citation without uploaded source document."})
    return citations


def _workstream_title(workstream_key: str) -> str:
    return next(str(item["title"]) for item in WORKSTREAMS if item["key"] == workstream_key)
