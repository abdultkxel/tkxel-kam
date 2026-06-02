from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import CustomFieldDefinition, CustomFieldValue, User
from app.rbac import MODULES
from app.repositories.accounts import AccountRepository
from app.repositories.audit import AuditRepository
from app.repositories.custom_fields import CustomFieldRepository
from app.repositories.rbac import RbacRepository
from app.schemas import (
    CustomFieldDefinitionCreateRequest,
    CustomFieldDefinitionPageRead,
    CustomFieldDefinitionUpdateRequest,
    CustomFieldModuleRead,
)
from app.services.audit import AuditService
from app.services.account_access import AccountAccessService
from app.services.user_management import page_count

SELECT_FIELD_TYPES = {"single_select", "multi_select"}


def field_not_found(definition_id: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Custom field '{definition_id}' was not found")


def field_validation_error(field: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=422,
        detail={"message": "Validation failed", "errors": [{"field": field, "message": message}]},
    )


def field_validation_errors(errors: list[dict[str, str]]) -> HTTPException:
    return HTTPException(
        status_code=422,
        detail={"message": "Validation failed", "errors": errors},
    )


class CustomFieldService:
    def __init__(self, db: Session, repository: CustomFieldRepository | None = None) -> None:
        self.repository = repository or CustomFieldRepository(db)
        self.access = AccountAccessService(AccountRepository(db), RbacRepository(db))
        self.audit = AuditService(AuditRepository(db))

    def list_modules(self) -> list[CustomFieldModuleRead]:
        return [CustomFieldModuleRead(slug=slug, name=name) for slug, name in MODULES]

    def list_active_definitions(self, modules: list[str]) -> list[CustomFieldDefinition]:
        return self.repository.list_active_definitions(modules)

    def list_active_definitions_for_user(self, module: str, actor: User) -> list[CustomFieldDefinition]:
        self.access.require_module_permission(actor, module, "view")
        return self.repository.list_active_definitions([module])

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

    def save_record_values(self, modules: str | list[str], record_id: str, values: dict[str, Any], actor: User, audit_module: str = "account_onboarding_workspace") -> None:
        module_list = [modules] if isinstance(modules, str) else modules
        definitions = self.repository.list_active_definitions(module_list)
        values_to_save = self._validated_values(definitions, values)
        for field_key, value in values_to_save.items():
            definition = next(item for item in definitions if item.field_key == field_key)
            self.repository.add_value(
                CustomFieldValue(
                    field_definition_id=definition.id,
                    module=definition.module,
                    record_id=record_id,
                    value=value,
                    created_by_id=actor.id,
                    updated_by_id=actor.id,
                )
            )
        if values_to_save:
            self.audit.log(
                module=audit_module,
                action="custom_field_values_saved",
                entity_type="custom_field_values",
                entity_id=record_id,
                actor=actor,
                after_value=values_to_save,
            )

    def replace_record_values(self, modules: str | list[str], record_id: str, values: dict[str, Any], actor: User, audit_module: str) -> None:
        module_list = [modules] if isinstance(modules, str) else modules
        definitions = self.repository.list_active_definitions(module_list)
        values_to_save = self._validated_values(definitions, values)
        self.repository.delete_values_for_record(module_list, record_id)
        for field_key, value in values_to_save.items():
            definition = next(item for item in definitions if item.field_key == field_key)
            self.repository.add_value(
                CustomFieldValue(
                    field_definition_id=definition.id,
                    module=definition.module,
                    record_id=record_id,
                    value=value,
                    created_by_id=actor.id,
                    updated_by_id=actor.id,
                )
            )
        self.audit.log(
            module=audit_module,
            action="custom_field_values_replaced",
            entity_type="custom_field_values",
            entity_id=record_id,
            actor=actor,
            after_value=values_to_save,
        )

    def record_values(self, module: str, record_id: str) -> dict[str, Any]:
        values = self.repository.list_values_for_record(module, record_id)
        return {item.field_definition.field_key: item.value for item in values if item.field_definition is not None}

    def copy_record_values(self, modules: str | list[str], source_record_id: str, target_record_id: str, actor: User) -> None:
        module_list = [modules] if isinstance(modules, str) else modules
        values = [value for module in module_list for value in self.repository.list_values_for_record(module, source_record_id)]
        for value in values:
            self.repository.add_value(
                CustomFieldValue(
                    field_definition_id=value.field_definition_id,
                    module=value.module,
                    record_id=target_record_id,
                    value=value.value,
                    created_by_id=actor.id,
                    updated_by_id=actor.id,
                )
            )
        if values:
            self.audit.log(
                module="account_onboarding_workspace",
                action="custom_field_values_copied",
                entity_type="custom_field_values",
                entity_id=target_record_id,
                actor=actor,
                after_value={item.field_definition.field_key: item.value for item in values if item.field_definition is not None},
            )

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

    def _validated_values(self, definitions: list[CustomFieldDefinition], values: dict[str, Any]) -> dict[str, Any]:
        definitions_by_key = {definition.field_key: definition for definition in definitions}
        errors: list[dict[str, str]] = []
        unknown_keys = sorted(set(values) - set(definitions_by_key))
        errors.extend({"field": f"custom_field_values.{key}", "message": "Custom field is not active for this module."} for key in unknown_keys)

        for definition in definitions:
            value = values.get(definition.field_key)
            if definition.is_required and self._is_empty(value):
                errors.append({"field": f"custom_field_values.{definition.field_key}", "message": f"{definition.label} is required."})
                continue
            if not self._is_empty(value):
                errors.extend(self._value_errors(definition, value))

        if errors:
            raise field_validation_errors(errors)
        return {key: value for key, value in values.items() if key in definitions_by_key and not self._is_empty(value)}

    @staticmethod
    def _is_empty(value: Any) -> bool:
        return value is None or value == "" or value == [] or value == {}

    @staticmethod
    def _value_errors(definition: CustomFieldDefinition, value: Any) -> list[dict[str, str]]:
        field = f"custom_field_values.{definition.field_key}"
        field_type = definition.field_type
        if field_type in {"text", "textarea", "email", "url", "phone", "date", "datetime"} and not isinstance(value, str):
            return [{"field": field, "message": f"{definition.label} must be text."}]
        if field_type in {"number", "currency"} and not isinstance(value, int | float):
            return [{"field": field, "message": f"{definition.label} must be a number."}]
        if field_type == "boolean" and not isinstance(value, bool):
            return [{"field": field, "message": f"{definition.label} must be true or false."}]
        if field_type == "single_select" and value not in definition.options:
            return [{"field": field, "message": f"{definition.label} must use one of the configured options."}]
        if field_type == "multi_select":
            if not isinstance(value, list):
                return [{"field": field, "message": f"{definition.label} must be a list of options."}]
            invalid_options = [item for item in value if item not in definition.options]
            if invalid_options:
                return [{"field": field, "message": f"{definition.label} includes an option that is not configured."}]
        return []

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
