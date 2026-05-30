from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import CustomFieldDefinition, User
from app.rbac import MODULES
from app.repositories.audit import AuditRepository
from app.repositories.custom_fields import CustomFieldRepository
from app.schemas import (
    CustomFieldDefinitionCreateRequest,
    CustomFieldDefinitionPageRead,
    CustomFieldDefinitionUpdateRequest,
    CustomFieldModuleRead,
)
from app.services.audit import AuditService
from app.services.user_management import page_count

SELECT_FIELD_TYPES = {"single_select", "multi_select"}


def field_not_found(definition_id: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Custom field '{definition_id}' was not found")


def field_validation_error(field: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail={"message": "Validation failed", "errors": [{"field": field, "message": message}]},
    )


class CustomFieldService:
    def __init__(self, db: Session, repository: CustomFieldRepository | None = None) -> None:
        self.repository = repository or CustomFieldRepository(db)
        self.audit = AuditService(AuditRepository(db))

    def list_modules(self) -> list[CustomFieldModuleRead]:
        return [CustomFieldModuleRead(slug=slug, name=name) for slug, name in MODULES]

    def list_definitions(
        self,
        *,
        search: str | None = None,
        module: str | None = None,
        field_type: str | None = None,
        status_filter: str = "all",
        sort: str = "sort_order",
        direction: str = "asc",
        page: int = 1,
        page_size: int = 10,
    ) -> CustomFieldDefinitionPageRead:
        definitions, total = self.repository.list_definitions(
            search=search,
            module=module,
            field_type=field_type,
            status_filter=status_filter,
            sort=sort,
            direction=direction,
            page=page,
            page_size=page_size,
        )
        return CustomFieldDefinitionPageRead(
            items=definitions,
            total=total,
            page=page,
            page_size=page_size,
            pages=page_count(total, page_size),
        )

    def get_definition(self, definition_id: str) -> CustomFieldDefinition:
        definition = self.repository.get_by_id(definition_id)
        if definition is None:
            raise field_not_found(definition_id)
        return definition

    def create_definition(self, payload: CustomFieldDefinitionCreateRequest, actor: User) -> CustomFieldDefinition:
        self._ensure_unique(payload.module, payload.field_key)
        self._validate_field_configuration(payload.field_type, payload.options)
        definition = CustomFieldDefinition(
            **payload.model_dump(),
            created_by_id=actor.id,
            updated_by_id=actor.id,
        )
        self.repository.create(definition)
        self.audit.log(
            module="admin_audit_security_rbac",
            action="custom_field_created",
            entity_type="custom_field_definition",
            entity_id=definition.id,
            actor=actor,
            after_value=self._snapshot(definition),
        )
        self.repository.commit()
        return self.get_definition(definition.id)

    def update_definition(self, definition_id: str, payload: CustomFieldDefinitionUpdateRequest, actor: User) -> CustomFieldDefinition:
        definition = self.get_definition(definition_id)
        before_value = self._snapshot(definition)
        updates = payload.model_dump(exclude_unset=True)
        next_module = updates.get("module", definition.module)
        next_key = updates.get("field_key", definition.field_key)
        if next_module != definition.module or next_key != definition.field_key:
            self._ensure_unique(next_module, next_key, current_id=definition.id)

        next_type = updates.get("field_type", definition.field_type)
        next_options = updates.get("options", definition.options)
        self._validate_field_configuration(next_type, next_options)

        for field, value in updates.items():
            setattr(definition, field, value)
        definition.updated_by_id = actor.id

        self.audit.log(
            module="admin_audit_security_rbac",
            action="custom_field_updated",
            entity_type="custom_field_definition",
            entity_id=definition.id,
            actor=actor,
            before_value=before_value,
            after_value=self._snapshot(definition),
        )
        self.repository.commit()
        return self.get_definition(definition.id)

    def delete_definition(self, definition_id: str, actor: User) -> dict[str, str]:
        definition = self.get_definition(definition_id)
        before_value = self._snapshot(definition)
        self.repository.delete(definition)
        self.audit.log(
            module="admin_audit_security_rbac",
            action="custom_field_deleted",
            entity_type="custom_field_definition",
            entity_id=definition.id,
            actor=actor,
            before_value=before_value,
        )
        self.repository.commit()
        return {"message": "Custom field deleted successfully"}

    def _ensure_unique(self, module: str, field_key: str, current_id: str | None = None) -> None:
        existing = self.repository.get_by_module_key(module, field_key)
        if existing is not None and existing.id != current_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A custom field with this module and field key already exists",
            )

    @staticmethod
    def _validate_field_configuration(field_type: str, options: list[str]) -> None:
        if field_type in SELECT_FIELD_TYPES and not options:
            raise field_validation_error("options", "Options are required for select fields.")
        if field_type not in SELECT_FIELD_TYPES and options:
            raise field_validation_error("options", "Options can only be configured for select fields.")

    @staticmethod
    def _snapshot(definition: CustomFieldDefinition) -> dict[str, Any]:
        return {
            "id": definition.id,
            "module": definition.module,
            "field_key": definition.field_key,
            "label": definition.label,
            "description": definition.description,
            "field_type": definition.field_type,
            "placeholder": definition.placeholder,
            "help_text": definition.help_text,
            "options": definition.options,
            "validation_rules": definition.validation_rules,
            "default_value": definition.default_value,
            "is_required": definition.is_required,
            "is_sensitive": definition.is_sensitive,
            "is_active": definition.is_active,
            "show_in_list": definition.show_in_list,
            "show_in_detail": definition.show_in_detail,
            "sort_order": definition.sort_order,
        }
