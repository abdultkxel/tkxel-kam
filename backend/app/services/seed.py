from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import (
    Account,
    AccountOwner,
    KycConfiguration,
    Opportunity,
    OpportunityStageDefinition,
    OpportunityStageTransition,
    OpportunityType,
    PlaybookTemplate,
    PlaybookTemplateActivity,
    ScoringMetricDefinition,
    ScoringMetricVersion,
    ServiceAdjacencyRule,
    ServiceCatalogItem,
    SignalRule,
    StakeholderGapRule,
    StakeholderRoleConfig,
    User,
    utc_now,
)
from app.rbac import DEFAULT_ROLES
from app.security import hash_password
from app.services.email_domains import EmailDomainPolicyService
from app.services.rbac import RbacService
from app.services.users import initials_for_name, normalize_email

DEFAULT_ROLE_USER_EMAIL_DOMAIN = "tkxel.com"


def seed_default_data(db: Session) -> User:
    RbacService(db).seed_defaults()
    super_admin = seed_super_admin(db)
    seed_allowed_email_domains(db, super_admin)
    seed_default_role_users(db)
    seed_kyc_configuration(db)
    seed_opportunity_reference_data(db)
    seed_relationship_planning_reference_data(db)
    seed_scoring_signals_playbooks(db, super_admin)
    seed_demo_opportunities(db)
    return super_admin


def seed_allowed_email_domains(db: Session, super_admin: User) -> None:
    settings = get_settings()
    EmailDomainPolicyService(db).seed_allowed_domains(settings.allowed_email_domains, actor=super_admin)


def seed_kyc_configuration(db: Session) -> KycConfiguration:
    from app.services.kyc import DEFAULT_RESEARCH_SOURCES, FIELD_CATALOG, FRESHNESS_THRESHOLD_DAYS, LOW_CONFIDENCE_THRESHOLD

    existing = db.scalar(select(KycConfiguration).where(KycConfiguration.name == "default"))
    required_field_keys = [field["key"] for field in FIELD_CATALOG if field.get("required", True)]
    if existing:
        existing.required_field_keys = required_field_keys
        existing.freshness_threshold_days = existing.freshness_threshold_days or FRESHNESS_THRESHOLD_DAYS
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
        return existing_user

    user = User(
        email=email,
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
        existing_user = db.scalar(select(User).where(User.email == email))
        if existing_user:
            seeded_users.append(existing_user)
            continue

        full_name = role.name.replace(" / ", " ").replace("/", " ")
        user = User(
            email=email,
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
        ("Identified", "Won", True),
        ("Identified", "Lost", True),
        ("Qualified", "Proposal Sent", False),
        ("Proposal Sent", "Negotiation", False),
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

    service_specs = (
        ("product_engineering", "Product Engineering", "Engineering", ["web", "mobile", "platform"]),
        ("cloud_devops", "Cloud & DevOps", "Engineering", ["cloud", "sre", "infra"]),
        ("data_analytics", "Data Analytics", "Data", ["bi", "warehouse", "analytics"]),
        ("automation_qa", "Automation & QA", "Quality", ["qa", "automation", "testing"]),
        ("customer_success_ops", "Customer Success Ops", "Customer", ["retention", "ops", "enablement"]),
    )
    services: dict[str, ServiceCatalogItem] = {}
    for index, (slug, name, category, tags) in enumerate(service_specs, start=1):
        service = db.scalar(select(ServiceCatalogItem).where(ServiceCatalogItem.slug == slug))
        if service is None:
            service = ServiceCatalogItem(slug=slug, name=name, category=category, tags=tags, is_active=True, display_order=index)
            db.add(service)
        else:
            service.name = name
            service.category = category
            service.tags = tags
            service.is_active = True
            service.display_order = index
        services[slug] = service
    db.flush()

    adjacency_specs = (
        ("product_engineering", "automation_qa", 82, "Product engineering accounts often benefit from test automation and quality enablement."),
        ("product_engineering", "cloud_devops", 78, "Product delivery maturity usually exposes cloud, release, and reliability opportunities."),
        ("cloud_devops", "data_analytics", 72, "Cloud modernization can unlock data platform and analytics expansion."),
        ("data_analytics", "automation_qa", 68, "Analytics programs often need validation, automation, and data quality coverage."),
        ("customer_success_ops", "data_analytics", 70, "Customer success operations benefit from reporting, segmentation, and retention analytics."),
    )
    for source_slug, target_slug, score, rationale in adjacency_specs:
        source = services.get(source_slug)
        target = services.get(target_slug)
        if not source or not target:
            continue
        existing = db.scalar(
            select(ServiceAdjacencyRule).where(
                ServiceAdjacencyRule.source_service_id == source.id,
                ServiceAdjacencyRule.target_service_id == target.id,
            )
        )
        if existing:
            existing.relevance_score = score
            existing.rationale = rationale
            existing.is_active = True
            continue
        db.add(ServiceAdjacencyRule(source_service_id=source.id, target_service_id=target.id, relevance_score=score, rationale=rationale, is_active=True))

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
        ("stale_kyc", "Stale KYC", "stale_kyc", "warning", {"freshness_days": 180}),
        ("weak_metric", "Weak Health Metric", "weak_metric", "warning", {"rag_status": ["red", "amber"]}),
        ("stakeholder_gap", "Stakeholder Gap", "stakeholder_gap", "critical", {"missing": "primary_am"}),
        ("escalation_sla", "Escalation SLA Attention", "escalation_sla", "critical", {"status": "open_or_overdue"}),
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
        template = db.scalar(select(PlaybookTemplate).where(PlaybookTemplate.name == name))
        if template is None:
            template = PlaybookTemplate(
                name=name,
                objective=objective,
                description=f"Seeded playbook for {name.lower()} signals.",
                signal_types=signal_types,
                weak_metrics=weak_metrics,
                default_owner_rule="account_primary_am",
                due_date_rule={"basis": "execution_date", "offset_days": 7},
                success_criteria=["Tasks completed with evidence", "Signal resolved or accepted with recovery plan"],
                skip_rules=["Duplicate task already open", "Signal dismissed with reason"],
                version=1,
                is_active=True,
                created_by_id=super_admin.id,
                updated_by_id=super_admin.id,
            )
            template.activities = _seed_playbook_activities(activities)
            db.add(template)
            continue
        template.name = name
        template.objective = objective
        template.description = f"Seeded playbook for {name.lower()} signals."
        template.signal_types = signal_types
        template.weak_metrics = weak_metrics
        template.default_owner_rule = "account_primary_am"
        template.due_date_rule = {"basis": "execution_date", "offset_days": 7}
        template.success_criteria = ["Tasks completed with evidence", "Signal resolved or accepted with recovery plan"]
        template.skip_rules = ["Duplicate task already open", "Signal dismissed with reason"]
        template.is_active = True
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


def seed_demo_opportunities(db: Session) -> None:
    if db.bind is not None and db.bind.dialect.name == "sqlite":
        return
    if db.scalar(select(Opportunity.id).limit(1)):
        return
    if db.scalar(select(Account.id).limit(1)):
        return
    account_manager = db.scalar(select(User).where(User.role == "account_manager").order_by(User.email).limit(1))
    admin_user = db.scalar(select(User).where(User.role == "admin").order_by(User.email).limit(1))
    if account_manager is None:
        return

    demo_accounts = (
        ("amd-001", "Signal", "Strategic", "healthy", 1840000, account_manager),
        ("globex-002", "Cafe Zupas", "Enterprise", "warning", 1260000, admin_user or account_manager),
        ("initech-003", "Canvs", "Growth", "critical", 740000, account_manager),
        ("northstar-004", "TaxBack", "Enterprise", "healthy", 980000, admin_user or account_manager),
    )
    for account_id, name, segment, risk_status, commercial_value, owner in demo_accounts:
        account = db.get(Account, account_id)
        if account is None:
            account = Account(
                id=account_id,
                name=name,
                lifecycle_status="Active",
                segment=segment,
                risk_status=risk_status,
                commercial_value=commercial_value,
                currency="USD",
                health_overall=78 if risk_status == "healthy" else 62,
                health_relationship=80,
                health_usage=74,
                health_delivery=76,
                health_commercial=72,
                created_by_id=owner.id,
            )
            db.add(account)
        owner_record = db.scalar(
            select(AccountOwner).where(
                AccountOwner.account_id == account_id,
                AccountOwner.ownership_role == "primary_am",
                AccountOwner.is_active.is_(True),
            )
        )
        if owner_record is None:
            db.add(
                AccountOwner(
                    account_id=account_id,
                    user_id=owner.id,
                    user_name=owner.full_name,
                    user_email=owner.email,
                    ownership_role="primary_am",
                    is_primary=True,
                    is_active=True,
                    rationale="Seeded demo owner for local opportunity pipeline.",
                    created_by_id=owner.id,
                )
            )

    db.flush()
    type_by_slug = {item.slug: item for item in db.scalars(select(OpportunityType))}
    now = utc_now()
    demo_opportunities = (
        ("opp-101", "amd-001", "Cloud cost governance expansion", "expansion", "Cloud & DevOps", 420000, 24, "Negotiation", "Confirm commercial model with finance sponsor."),
        ("opp-102", "globex-002", "Regional analytics rollout", "analytics", "Data Analytics", 310000, 41, "Proposal Sent", "Follow up on regional rollout proposal."),
        ("opp-103", "initech-003", "Retention recovery package", "retention_recovery", "Customer Success", 180000, 15, "Qualified", "Align recovery scope with executive sponsor."),
        ("opp-104", "northstar-004", "Store operations automation", "automation", "Automation", 260000, 58, "Identified", "Map store operations workflows with client ops lead."),
        ("opp-105", "amd-001", "Data platform enablement", "analytics", "Data Platform", 620000, 73, "Won", "Prepare kickoff handoff for delivery team."),
    )
    for opportunity_id, account_id, name, type_slug, service_line, value, days, stage, next_step in demo_opportunities:
        if db.get(Opportunity, opportunity_id):
            continue
        opportunity_type = type_by_slug.get(type_slug)
        if opportunity_type is None:
            continue
        owner = next((item[5] for item in demo_accounts if item[0] == account_id), account_manager)
        db.add(
            Opportunity(
                id=opportunity_id,
                account_id=account_id,
                type_id=opportunity_type.id,
                owner_id=owner.id,
                owner_name=owner.full_name,
                owner_email=owner.email,
                name=name,
                service_line=service_line,
                value=value,
                currency="USD",
                stage=stage,
                next_step=next_step,
                target_date=now + timedelta(days=days),
                source_context="seed",
                source_record_route=f"/opportunities?opportunity={opportunity_id}",
                outcome_reason="Client approved expansion." if stage == "Won" else None,
                created_by_id=owner.id,
                created_by_name=owner.full_name,
                updated_by_id=owner.id,
                updated_by_name=owner.full_name,
            )
        )
    db.commit()
