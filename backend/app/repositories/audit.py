from sqlalchemy.orm import Session

from app.models import AuditLog


class AuditRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def add(
        self,
        *,
        module: str,
        action: str,
        entity_type: str,
        entity_id: str,
        actor_id: str,
        actor_name: str,
        source: str = "platform",
        before_value: dict | None = None,
        after_value: dict | None = None,
        reason: str | None = None,
    ) -> AuditLog:
        entry = AuditLog(
            module=module,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            actor_id=actor_id,
            actor_name=actor_name,
            source=source,
            before_value=before_value,
            after_value=after_value,
            reason=reason,
        )
        self.db.add(entry)
        self.db.flush()
        return entry
