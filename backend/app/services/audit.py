from app.models import User
from app.repositories.audit import AuditRepository


class AuditService:
    def __init__(self, repository: AuditRepository) -> None:
        self.repository = repository

    def log(
        self,
        *,
        module: str,
        action: str,
        entity_type: str,
        entity_id: str,
        actor: User,
        source: str = "platform",
        before_value: dict | None = None,
        after_value: dict | None = None,
        reason: str | None = None,
    ) -> None:
        self.repository.add(
            module=module,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            actor_id=actor.id,
            actor_name=actor.full_name,
            source=source,
            before_value=before_value,
            after_value=after_value,
            reason=reason,
        )
