from sqlalchemy.orm import Session

from app.models import AccessLog, AuditLog


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
            before_value=before_value,
            after_value=after_value,
            reason=reason,
        )
        self.db.add(entry)
        self.db.flush()
        return entry

    def add_access(
        self,
        *,
        module: str,
        entity_type: str,
        entity_id: str | None,
        actor_id: str,
        actor_name: str,
        decision: str,
        account_id: str | None = None,
        field_key: str | None = None,
        reason: str | None = None,
        metadata_json: dict | None = None,
    ) -> AccessLog:
        entry = AccessLog(
            module=module,
            entity_type=entity_type,
            entity_id=entity_id,
            account_id=account_id,
            field_key=field_key,
            actor_id=actor_id,
            actor_name=actor_name,
            decision=decision,
            reason=reason,
            metadata_json=metadata_json or {},
        )
        self.db.add(entry)
        self.db.flush()
        self.db.commit()
        return entry
