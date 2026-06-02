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
            before_value=before_value,
            after_value=after_value,
            reason=reason,
        )

    def log_access(
        self,
        *,
        module: str,
        entity_type: str,
        entity_id: str | None,
        actor: User,
        decision: str,
        account_id: str | None = None,
        field_key: str | None = None,
        reason: str | None = None,
        metadata_json: dict | None = None,
    ) -> None:
        self.repository.add_access(
            module=module,
            entity_type=entity_type,
            entity_id=entity_id,
            account_id=account_id,
            field_key=field_key,
            actor_id=actor.id,
            actor_name=actor.full_name,
            decision=decision,
            reason=reason,
            metadata_json=metadata_json,
        )
