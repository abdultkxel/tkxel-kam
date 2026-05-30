from app.models import User
from app.repositories.timeline import TimelineRepository


class TimelineService:
    def __init__(self, repository: TimelineRepository) -> None:
        self.repository = repository

    def add_account_event(
        self,
        *,
        account_id: str,
        title: str,
        description: str,
        actor: User,
        event_type: str = "account_setup",
        module: str = "manual",
        engagement_id: str | None = None,
        source_record_id: str | None = None,
        source_record_type: str | None = None,
        source_record_route: str | None = None,
        before_value: dict | None = None,
        after_value: dict | None = None,
        metadata: dict | None = None,
    ) -> None:
        self.repository.add(
            account_id=account_id,
            engagement_id=engagement_id,
            event_type=event_type,
            module=module,
            title=title,
            description=description,
            performed_by=actor.id,
            performed_by_name=actor.full_name,
            source_record_id=source_record_id,
            source_record_type=source_record_type,
            source_record_route=source_record_route,
            before_value=before_value,
            after_value=after_value,
            metadata=metadata,
        )
