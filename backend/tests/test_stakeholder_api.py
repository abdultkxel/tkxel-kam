from collections.abc import Generator
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException
from fastapi.routing import APIRoute
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.main import app
from app.models import Account, AccountOwner, Engagement, Stakeholder, StakeholderInteraction, TimelineEntry, User
from app.schemas import StakeholderCreateRequest, StakeholderInteractionCreateRequest, StakeholderUpdateRequest
from app.services.seed import seed_default_data
from app.services.stakeholder_gap_service import StakeholderGapService
from app.services.stakeholders import StakeholderService


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    with TestingSessionLocal() as session:
        seed_default_data(session)
        yield session

    Base.metadata.drop_all(bind=engine)


def seeded_user(session: Session, role: str) -> User:
    user = session.scalar(select(User).where(User.role == role))
    assert user is not None
    return user


def create_account(session: Session, *, owner: User | None = None, name: str = "Atlas Health") -> Account:
    account = Account(name=name, lifecycle_status="Active", segment="Growth")
    session.add(account)
    session.flush()
    if owner is not None:
        session.add(
            AccountOwner(
                account_id=account.id,
                user_id=owner.id,
                user_name=owner.full_name,
                user_email=owner.email,
                ownership_role="primary_am",
                is_primary=True,
                is_active=True,
                rationale="Test ownership",
                created_by_id=owner.id,
            )
        )
    session.commit()
    return account


def create_engagement(session: Session, account: Account, owner: User) -> Engagement:
    engagement = Engagement(
        account_id=account.id,
        name="Platform Modernization",
        owner_id=owner.id,
        owner_name=owner.full_name,
        service_lines=["Engineering"],
        start_date=datetime.now(timezone.utc),
    )
    session.add(engagement)
    session.commit()
    return engagement


def stakeholder_payload(**overrides) -> StakeholderCreateRequest:
    data = {
        "name": "Mina Sponsor",
        "title": "Chief Digital Officer",
        "company": "Atlas Health",
        "email": "mina.sponsor@example.com",
        "phone": "+1 555 0199",
        "role": "executive_sponsor",
        "influence": "critical",
        "relationship_strength": "strong",
        "sentiment": "positive",
        "political_risk": "low",
        "status": "active",
        "notes": "Strategic sponsor for renewal and expansion.",
    }
    data.update(overrides)
    return StakeholderCreateRequest(**data)


def event_types(session: Session, account_id: str) -> list[str]:
    return list(
        session.scalars(
            select(TimelineEntry.event_type)
            .where(TimelineEntry.account_id == account_id)
            .order_by(TimelineEntry.created_at)
        )
    )


def as_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def open_gap_keys(gaps) -> set[str]:
    return {gap.rule_key for gap in gaps if gap.status == "open"}


def gap_by_key(gaps) -> dict[str, object]:
    return {gap.rule_key: gap for gap in gaps}


def test_stakeholder_routes_are_registered() -> None:
    routes = {(route.path, method) for route in app.routes if isinstance(route, APIRoute) for method in route.methods}

    assert ("/api/accounts/{account_id}/stakeholders", "GET") in routes
    assert ("/api/accounts/{account_id}/stakeholders", "POST") in routes
    assert ("/api/accounts/{account_id}/stakeholders/coverage-gaps", "GET") in routes
    assert ("/api/accounts/{account_id}/stakeholders/recalculate-coverage-gaps", "POST") in routes
    assert ("/api/accounts/{account_id}/stakeholders/org-chart", "GET") in routes
    assert ("/api/stakeholders/{stakeholder_id}", "GET") in routes
    assert ("/api/stakeholders/{stakeholder_id}/interactions", "GET") in routes
    assert ("/api/stakeholders/{stakeholder_id}/interactions", "POST") in routes
    assert ("/api/stakeholders/{stakeholder_id}", "PATCH") in routes
    assert ("/api/stakeholders/{stakeholder_id}", "DELETE") in routes


def test_create_update_and_archive_stakeholder_emit_timeline_events(db_session: Session) -> None:
    kam = seeded_user(db_session, "account_manager")
    account = create_account(db_session, owner=kam)
    service = StakeholderService(db_session)

    created = service.create(account.id, stakeholder_payload(), kam)
    assert created.name == "Mina Sponsor"
    assert created.role == "executive_sponsor"
    assert created.sensitive_fields_redacted is False

    updated = service.update(
        created.id,
        StakeholderUpdateRequest(sentiment="neutral", relationship_strength="developing", notes="Sponsor wants clearer delivery proof."),
        kam,
    )
    assert updated.sentiment == "neutral"
    assert updated.relationship_strength == "developing"

    archived = service.delete(created.id, kam)
    assert archived.message == "Stakeholder archived successfully"

    assert event_types(db_session, account.id) == [
        "stakeholder_added",
        "stakeholder_updated",
        "relationship_changed",
        "stakeholder_archived",
    ]


def test_list_stakeholders_supports_filters_and_search(db_session: Session) -> None:
    kam = seeded_user(db_session, "account_manager")
    account = create_account(db_session, owner=kam)
    engagement = create_engagement(db_session, account, kam)
    service = StakeholderService(db_session)
    service.create(account.id, stakeholder_payload(engagement_id=engagement.id, name="Priya Finance", role="economic_buyer", sentiment="negative", political_risk="high"), kam)
    service.create(account.id, stakeholder_payload(name="Omar Architect", role="technical_decision_maker", sentiment="positive", political_risk="low", email="omar.architect@example.com"), kam)

    by_role = service.list_for_account(account.id, kam, role="economic_buyer")
    by_sentiment = service.list_for_account(account.id, kam, sentiment="negative")
    by_risk = service.list_for_account(account.id, kam, political_risk="high")
    by_engagement = service.list_for_account(account.id, kam, engagement_id=engagement.id)
    by_search = service.list_for_account(account.id, kam, search="Finance")

    assert [item.name for item in by_role.items] == ["Priya Finance"]
    assert [item.name for item in by_sentiment.items] == ["Priya Finance"]
    assert [item.name for item in by_risk.items] == ["Priya Finance"]
    assert [item.name for item in by_engagement.items] == ["Priya Finance"]
    assert [item.name for item in by_search.items] == ["Priya Finance"]


def test_create_and_list_stakeholder_interactions_updates_relationship_history(db_session: Session) -> None:
    kam = seeded_user(db_session, "account_manager")
    account = create_account(db_session, owner=kam)
    service = StakeholderService(db_session)
    created = service.create(account.id, stakeholder_payload(sentiment="neutral", relationship_strength="developing"), kam)
    interaction_date = datetime(2026, 5, 18, 15, 30, tzinfo=timezone.utc)

    interaction = service.create_interaction(
        created.id,
        StakeholderInteractionCreateRequest(
            interaction_type="governance_touchpoint",
            interaction_date=interaction_date,
            summary="Sponsor confirmed renewal confidence after delivery review.",
            outcome="KAM will send expansion proposal before the next steering committee.",
            sentiment_after="positive",
            relationship_strength_after="strong",
        ),
        kam,
    )

    assert interaction.interaction_type == "governance_touchpoint"
    assert as_utc(interaction.interaction_date) == interaction_date
    assert interaction.summary == "Sponsor confirmed renewal confidence after delivery review."
    assert interaction.outcome == "KAM will send expansion proposal before the next steering committee."
    assert interaction.sentiment_after == "positive"
    assert interaction.relationship_strength_after == "strong"

    refreshed = db_session.get(Stakeholder, created.id)
    assert refreshed is not None
    assert refreshed.last_interaction_at is not None
    assert as_utc(refreshed.last_interaction_at) == interaction_date
    assert refreshed.sentiment == "positive"
    assert refreshed.relationship_strength == "strong"

    stored = db_session.get(StakeholderInteraction, interaction.id)
    assert stored is not None
    assert stored.metadata_json == {
        "changed_fields": ["sentiment", "relationship_strength"],
        "before": {"sentiment": "neutral", "relationship_strength": "developing"},
        "after": {"sentiment": "positive", "relationship_strength": "strong"},
    }

    timeline = db_session.scalar(
        select(TimelineEntry).where(TimelineEntry.event_type == "stakeholder_interaction_added", TimelineEntry.source_record_id == interaction.id)
    )
    assert timeline is not None
    assert timeline.before_value == {"sentiment": "neutral", "relationship_strength": "developing"}
    assert timeline.after_value == {"sentiment": "positive", "relationship_strength": "strong"}
    assert timeline.source_record_type == "stakeholder_interaction"

    listed = service.list_interactions(created.id, kam)
    assert listed.total == 1
    assert listed.items[0].id == interaction.id


def test_stakeholder_interactions_do_not_overwrite_relationship_when_after_values_are_absent(db_session: Session) -> None:
    kam = seeded_user(db_session, "account_manager")
    account = create_account(db_session, owner=kam)
    service = StakeholderService(db_session)
    created = service.create(account.id, stakeholder_payload(sentiment="positive", relationship_strength="champion"), kam)

    interaction = service.create_interaction(
        created.id,
        StakeholderInteractionCreateRequest(
            interaction_type="email",
            interaction_date=datetime(2026, 5, 19, 10, 0, tzinfo=timezone.utc),
            summary="Shared follow-up notes from the renewal planning call.",
        ),
        kam,
    )

    refreshed = db_session.get(Stakeholder, created.id)
    assert refreshed is not None
    assert refreshed.sentiment == "positive"
    assert refreshed.relationship_strength == "champion"
    assert db_session.get(StakeholderInteraction, interaction.id).metadata_json == {"changed_fields": [], "before": None, "after": None}

    timeline = db_session.scalar(
        select(TimelineEntry).where(TimelineEntry.event_type == "stakeholder_interaction_added", TimelineEntry.source_record_id == interaction.id)
    )
    assert timeline is not None
    assert timeline.before_value is None
    assert timeline.after_value is None


def test_coverage_gaps_detect_missing_default_rule_conditions_without_duplicates(db_session: Session) -> None:
    kam = seeded_user(db_session, "account_manager")
    account = create_account(db_session, owner=kam)
    stakeholder_service = StakeholderService(db_session)
    gap_service = StakeholderGapService(db_session)

    stakeholder_service.create(
        account.id,
        stakeholder_payload(
            name="Jordan Influencer",
            role="influencer",
            influence="medium",
            sentiment="neutral",
            political_risk="low",
        ),
        kam,
    )

    gaps = gap_service.recalculate(account.id, kam)
    assert open_gap_keys(gaps) == {
        "no_active_executive_sponsor",
        "no_commercial_owner_or_economic_buyer",
        "only_one_active_stakeholder",
        "no_high_or_critical_influence_stakeholder",
        "no_recent_stakeholder_interaction",
    }

    by_key = gap_by_key(gaps)
    assert by_key["only_one_active_stakeholder"].evidence["active_stakeholder_count"] == 1
    assert by_key["no_recent_stakeholder_interaction"].evidence["threshold_days"] == 90

    recalculated = gap_service.recalculate(account.id, kam)
    assert len(recalculated) == len({gap.rule_key for gap in recalculated})


def test_coverage_gaps_recalculate_after_stakeholder_and_interaction_changes(db_session: Session) -> None:
    kam = seeded_user(db_session, "account_manager")
    account = create_account(db_session, owner=kam)
    stakeholder_service = StakeholderService(db_session)
    gap_service = StakeholderGapService(db_session)

    sponsor = stakeholder_service.create(
        account.id,
        stakeholder_payload(
            name="Mina Sponsor",
            role="executive_sponsor",
            influence="critical",
            political_risk="low",
        ),
        kam,
    )
    assert open_gap_keys(gap_service.list_for_account(account.id, kam)) == {
        "no_commercial_owner_or_economic_buyer",
        "only_one_active_stakeholder",
        "no_recent_stakeholder_interaction",
    }

    buyer = stakeholder_service.create(
        account.id,
        stakeholder_payload(
            name="Priya Buyer",
            role="economic_buyer",
            influence="medium",
            sentiment="neutral",
            political_risk="high",
            email="priya.buyer@example.com",
        ),
        kam,
    )
    assert open_gap_keys(gap_service.list_for_account(account.id, kam)) == {
        "active_high_political_risk_stakeholder",
        "no_recent_stakeholder_interaction",
    }

    stakeholder_service.create_interaction(
        sponsor.id,
        StakeholderInteractionCreateRequest(
            interaction_type="executive_review",
            interaction_date=datetime.now(timezone.utc),
            summary="Sponsor confirmed continued executive alignment.",
        ),
        kam,
    )
    assert open_gap_keys(gap_service.list_for_account(account.id, kam)) == {"active_high_political_risk_stakeholder"}

    stakeholder_service.update(buyer.id, StakeholderUpdateRequest(political_risk="low"), kam)
    assert open_gap_keys(gap_service.list_for_account(account.id, kam)) == set()

    stakeholder_service.delete(sponsor.id, kam)
    gaps_after_archive = gap_service.list_for_account(account.id, kam)
    assert open_gap_keys(gaps_after_archive) == {
        "no_active_executive_sponsor",
        "only_one_active_stakeholder",
        "no_high_or_critical_influence_stakeholder",
        "no_recent_stakeholder_interaction",
    }
    assert gap_by_key(gaps_after_archive)["active_high_political_risk_stakeholder"].status == "resolved"
    assert gap_by_key(gaps_after_archive)["active_high_political_risk_stakeholder"].resolved_at is not None


def test_org_chart_returns_hierarchy_edges_and_unmapped_stakeholders(db_session: Session) -> None:
    kam = seeded_user(db_session, "account_manager")
    account = create_account(db_session, owner=kam)
    service = StakeholderService(db_session)
    sponsor = service.create(
        account.id,
        stakeholder_payload(name="Mina Sponsor", role="executive_sponsor", influence="critical"),
        kam,
    )
    buyer = service.create(
        account.id,
        stakeholder_payload(
            name="Priya Buyer",
            role="economic_buyer",
            influence="high",
            email="priya.buyer@example.com",
            reports_to_stakeholder_id=sponsor.id,
        ),
        kam,
    )
    orphan = service.create(
        account.id,
        stakeholder_payload(
            name="Omar Architect",
            role="technical_decision_maker",
            influence="medium",
            email="omar.architect@example.com",
        ),
        kam,
    )

    chart = service.org_chart(account.id, kam)
    nodes = {node.id: node for node in chart.nodes}
    edges = {(edge.source, edge.target, edge.relationship_type) for edge in chart.edges}

    assert nodes["unmapped_stakeholders"].name == "Unmapped Stakeholders"
    assert nodes[sponsor.id].parent_id == "unmapped_stakeholders"
    assert nodes[buyer.id].parent_id == sponsor.id
    assert nodes[buyer.id].role == "economic_buyer"
    assert nodes[buyer.id].influence_level == "high"
    assert nodes[orphan.id].parent_id == "unmapped_stakeholders"
    assert (sponsor.id, buyer.id, "reports_to") in edges
    assert ("unmapped_stakeholders", sponsor.id, "unmapped") in edges
    assert ("unmapped_stakeholders", orphan.id, "unmapped") in edges


def test_org_chart_redacts_sensitive_identity_fields_for_unauthorized_viewer(db_session: Session) -> None:
    kam = seeded_user(db_session, "account_manager")
    leader = seeded_user(db_session, "leadership_viewer")
    account = create_account(db_session, owner=kam)
    service = StakeholderService(db_session)
    sensitive = service.create(
        account.id,
        stakeholder_payload(
            name="Sensitive Sponsor",
            title="Private Executive Sponsor",
            is_sensitive=True,
        ),
        kam,
    )

    chart = service.org_chart(account.id, leader)
    node = next(node for node in chart.nodes if node.id == sensitive.id)

    assert node.name == "Sensitive Stakeholder"
    assert node.title is None
    assert node.role == "executive_sponsor"
    assert node.sensitive_fields_redacted is True


def test_leadership_viewer_is_read_only_and_sensitive_fields_are_redacted(db_session: Session) -> None:
    kam = seeded_user(db_session, "account_manager")
    leader = seeded_user(db_session, "leadership_viewer")
    account = create_account(db_session, owner=kam)
    service = StakeholderService(db_session)
    gap_service = StakeholderGapService(db_session)
    created = service.create(account.id, stakeholder_payload(is_sensitive=True), kam)

    viewed = service.get(created.id, leader)
    assert viewed.name == "Mina Sponsor"
    assert viewed.email is None
    assert viewed.phone is None
    assert viewed.notes is None
    assert viewed.sensitive_fields_redacted is True

    listed = service.list_for_account(account.id, leader)
    assert listed.total == 1
    assert listed.items[0].sensitive_fields_redacted is True

    gaps = gap_service.list_for_account(account.id, leader)
    assert gaps

    service.create_interaction(
        created.id,
        StakeholderInteractionCreateRequest(
            interaction_type="executive_review",
            interaction_date=datetime.now(timezone.utc),
            summary="Sensitive sponsor conversation.",
            outcome="KAM will follow up privately.",
        ),
        kam,
    )
    interaction_history = service.list_interactions(created.id, leader)
    assert interaction_history.total == 1
    assert interaction_history.items[0].summary is None
    assert interaction_history.items[0].outcome is None
    assert interaction_history.items[0].sensitive_fields_redacted is True

    with pytest.raises(HTTPException) as create_error:
        service.create(account.id, stakeholder_payload(name="Read Only Buyer", role="economic_buyer"), leader)
    assert create_error.value.status_code == 403

    with pytest.raises(HTTPException) as update_error:
        service.update(created.id, StakeholderUpdateRequest(sentiment="negative"), leader)
    assert update_error.value.status_code == 403

    with pytest.raises(HTTPException) as interaction_error:
        service.create_interaction(
            created.id,
            StakeholderInteractionCreateRequest(
                interaction_type="note",
                interaction_date=datetime.now(timezone.utc),
                summary="Leadership viewers cannot log interactions.",
            ),
            leader,
        )
    assert interaction_error.value.status_code == 403

    with pytest.raises(HTTPException) as recalculate_error:
        gap_service.recalculate(account.id, leader)
    assert recalculate_error.value.status_code == 403

    with pytest.raises(HTTPException) as delete_error:
        service.delete(created.id, leader)
    assert delete_error.value.status_code == 403


def test_unauthorized_account_user_cannot_access_stakeholders(db_session: Session) -> None:
    kam = seeded_user(db_session, "account_manager")
    admin = seeded_user(db_session, "admin")
    restricted_account = create_account(db_session, owner=None, name="Restricted Account")
    service = StakeholderService(db_session)
    gap_service = StakeholderGapService(db_session)
    created = service.create(restricted_account.id, stakeholder_payload(), admin)

    with pytest.raises(HTTPException) as list_error:
        service.list_for_account(restricted_account.id, kam)
    assert list_error.value.status_code == 403

    with pytest.raises(HTTPException) as read_error:
        service.get(created.id, kam)
    assert read_error.value.status_code == 403

    with pytest.raises(HTTPException) as interaction_list_error:
        service.list_interactions(created.id, kam)
    assert interaction_list_error.value.status_code == 403

    with pytest.raises(HTTPException) as gap_list_error:
        gap_service.list_for_account(restricted_account.id, kam)
    assert gap_list_error.value.status_code == 403

    with pytest.raises(HTTPException) as org_chart_error:
        service.org_chart(restricted_account.id, kam)
    assert org_chart_error.value.status_code == 403
