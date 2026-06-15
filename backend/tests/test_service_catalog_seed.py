from collections.abc import Generator

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import ServiceCatalogItem
from app.services.seed import seed_default_data


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)
    with TestingSessionLocal() as session:
        yield session
    Base.metadata.drop_all(bind=engine)


def test_default_seed_populates_full_service_catalog(db_session: Session) -> None:
    seed_default_data(db_session)

    services = list(db_session.scalars(select(ServiceCatalogItem).where(ServiceCatalogItem.is_active.is_(True)).order_by(ServiceCatalogItem.display_order)))
    service_names = [service.name for service in services]

    assert len(service_names) == 49
    assert service_names[:6] == [
        "Assessment & Strategy",
        "Business Analysis",
        "UX Design",
        "Solution Architecture & Design",
        "Development",
        "DevOps Service",
    ]
    assert {
        "GenAI Services",
        "AI Transformation",
        "Cloud Migration Service",
        "Staff Augmentation",
        "Mulesoft",
    }.issubset(service_names)
