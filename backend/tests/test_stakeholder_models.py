from collections.abc import Generator
from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Account, Engagement, Stakeholder, StakeholderCoverageGap, StakeholderInteraction
from app.reference_data import STAKEHOLDER_ROLE_VALUES


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
        yield session

    Base.metadata.drop_all(bind=engine)


def indexed_columns(indexes: list[dict]) -> set[tuple[str, ...]]:
    return {tuple(index["column_names"]) for index in indexes}


def test_stakeholder_tables_columns_and_indexes_are_created(db_session: Session) -> None:
    inspector = inspect(db_session.bind)
    tables = set(inspector.get_table_names())

    assert "stakeholders" in tables
    assert "stakeholder_interactions" in tables
    assert "stakeholder_coverage_gaps" in tables
    assert "stakeholder_relationship_changes" not in tables

    stakeholder_columns = {column["name"] for column in inspector.get_columns("stakeholders")}
    assert {
        "account_id",
        "engagement_id",
        "reports_to_stakeholder_id",
        "linkedin_url",
        "role",
        "influence",
        "relationship_strength",
        "sentiment",
        "political_risk",
        "status",
        "notes",
        "last_interaction_at",
        "is_sensitive",
        "archived_at",
    }.issubset(stakeholder_columns)

    stakeholder_indexes = indexed_columns(inspector.get_indexes("stakeholders"))
    assert ("account_id",) in stakeholder_indexes
    assert ("engagement_id",) in stakeholder_indexes
    assert ("role",) in stakeholder_indexes
    assert ("status",) in stakeholder_indexes
    assert ("sentiment",) in stakeholder_indexes
    assert ("political_risk",) in stakeholder_indexes
    assert ("reports_to_stakeholder_id",) in stakeholder_indexes

    interaction_columns = {column["name"] for column in inspector.get_columns("stakeholder_interactions")}
    assert {
        "stakeholder_id",
        "account_id",
        "engagement_id",
        "interaction_type",
        "subject",
        "description",
        "interaction_at",
        "is_sensitive",
        "metadata_json",
        "archived_at",
    }.issubset(interaction_columns)

    interaction_indexes = indexed_columns(inspector.get_indexes("stakeholder_interactions"))
    assert ("stakeholder_id",) in interaction_indexes
    assert ("account_id",) in interaction_indexes
    assert ("engagement_id",) in interaction_indexes

    gap_columns = {column["name"] for column in inspector.get_columns("stakeholder_coverage_gaps")}
    assert {
        "account_id",
        "rule_key",
        "severity",
        "title",
        "description",
        "evidence",
        "status",
        "created_at",
        "resolved_at",
    }.issubset(gap_columns)

    gap_indexes = indexed_columns(inspector.get_indexes("stakeholder_coverage_gaps"))
    assert ("account_id",) in gap_indexes
    assert ("rule_key",) in gap_indexes
    assert ("severity",) in gap_indexes
    assert ("status",) in gap_indexes


def test_stakeholders_support_account_engagement_hierarchy_and_interactions(db_session: Session) -> None:
    account = Account(name="Atlas Health")
    engagement = Engagement(
        account=account,
        name="Platform Modernization SOW",
        owner_name="KAM Owner",
        start_date=datetime.now(timezone.utc),
    )
    executive_sponsor = Stakeholder(
        account=account,
        name="Sam Sponsor",
        role="executive_sponsor",
        influence="critical",
        relationship_strength="strong",
        sentiment="positive",
        political_risk="low",
    )
    economic_buyer = Stakeholder(
        account=account,
        engagement=engagement,
        reports_to=executive_sponsor,
        name="Evan Buyer",
        role="economic_buyer",
        influence="high",
        relationship_strength="developing",
        sentiment="neutral",
        political_risk="medium",
        is_sensitive=True,
    )
    interaction = StakeholderInteraction(
        stakeholder=economic_buyer,
        account=account,
        engagement=engagement,
        interaction_type="governance_touchpoint",
        subject="Renewal readiness discussion",
        description="Confirmed budget holder concerns and next governance action.",
        sentiment="neutral",
        relationship_strength="developing",
        political_risk="medium",
        created_by_name="KAM Owner",
        is_sensitive=True,
    )
    gap = StakeholderCoverageGap(
        account=account,
        rule_key="only_one_active_stakeholder",
        severity="medium",
        title="Only one active stakeholder",
        description="The account has a single active stakeholder.",
        evidence={"active_stakeholder_count": 1},
    )

    db_session.add_all([interaction, gap])
    db_session.commit()

    assert economic_buyer.account_id == account.id
    assert economic_buyer.engagement_id == engagement.id
    assert economic_buyer.reports_to_stakeholder_id == executive_sponsor.id
    assert economic_buyer in executive_sponsor.direct_reports
    assert interaction.stakeholder_id == economic_buyer.id
    assert interaction.account_id == account.id
    assert interaction.engagement_id == engagement.id
    assert interaction.created_at is not None
    assert economic_buyer.archived_at is None
    assert gap.account_id == account.id
    assert gap.status == "open"


def test_stakeholder_role_reference_values_match_prd() -> None:
    assert STAKEHOLDER_ROLE_VALUES == (
        "executive_sponsor",
        "economic_buyer",
        "technical_decision_maker",
        "operational_poc",
        "commercial_owner",
        "influencer",
    )
