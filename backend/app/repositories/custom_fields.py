from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import CustomFieldDefinition, CustomFieldValue


class CustomFieldRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

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
    ) -> tuple[list[CustomFieldDefinition], int]:
        conditions = self._conditions(search, module, field_type, status_filter)
        total = self.db.scalar(select(func.count(CustomFieldDefinition.id)).where(*conditions)) or 0
        sort_column = self._sort_column(sort)
        order_by = sort_column.desc() if direction == "desc" else sort_column.asc()
        definitions = list(
            self.db.scalars(
                select(CustomFieldDefinition)
                .where(*conditions)
                .order_by(order_by, CustomFieldDefinition.label.asc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        return definitions, total

    def get_by_id(self, definition_id: str) -> CustomFieldDefinition | None:
        return self.db.get(CustomFieldDefinition, definition_id)

    def get_by_module_key(self, module: str, field_key: str) -> CustomFieldDefinition | None:
        return self.db.scalar(
            select(CustomFieldDefinition).where(
                CustomFieldDefinition.module == module,
                CustomFieldDefinition.field_key == field_key,
            )
        )

    def list_active_definitions(self, modules: list[str]) -> list[CustomFieldDefinition]:
        return list(
            self.db.scalars(
                select(CustomFieldDefinition)
                .where(
                    CustomFieldDefinition.module.in_(modules),
                    CustomFieldDefinition.is_active.is_(True),
                )
                .order_by(CustomFieldDefinition.sort_order, CustomFieldDefinition.label)
            )
        )

    def list_values_for_record(self, module: str, record_id: str) -> list[CustomFieldValue]:
        return list(
            self.db.scalars(
                select(CustomFieldValue)
                .where(CustomFieldValue.module == module, CustomFieldValue.record_id == record_id)
                .order_by(CustomFieldValue.created_at)
            )
        )

    def get_value_for_definition(self, definition_id: str, record_id: str) -> CustomFieldValue | None:
        return self.db.scalar(
            select(CustomFieldValue).where(
                CustomFieldValue.field_definition_id == definition_id,
                CustomFieldValue.record_id == record_id,
            )
        )

    def create(self, definition: CustomFieldDefinition) -> CustomFieldDefinition:
        self.db.add(definition)
        self.db.flush()
        return definition

    def add_value(self, value: CustomFieldValue) -> CustomFieldValue:
        self.db.add(value)
        self.db.flush()
        return value

    def delete_values_for_record(self, modules: list[str], record_id: str) -> None:
        values = list(
            self.db.scalars(
                select(CustomFieldValue).where(
                    CustomFieldValue.module.in_(modules),
                    CustomFieldValue.record_id == record_id,
                )
            )
        )
        for value in values:
            self.db.delete(value)
        self.db.flush()

    def delete(self, definition: CustomFieldDefinition) -> None:
        self.db.delete(definition)

    def commit(self) -> None:
        self.db.commit()

    @staticmethod
    def _conditions(
        search: str | None,
        module: str | None,
        field_type: str | None,
        status_filter: str,
    ) -> list:
        conditions = []
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(
                or_(
                    CustomFieldDefinition.label.ilike(term),
                    CustomFieldDefinition.field_key.ilike(term),
                    CustomFieldDefinition.module.ilike(term),
                    CustomFieldDefinition.description.ilike(term),
                )
            )
        if module:
            conditions.append(CustomFieldDefinition.module == module)
        if field_type:
            conditions.append(CustomFieldDefinition.field_type == field_type)
        if status_filter == "active":
            conditions.append(CustomFieldDefinition.is_active.is_(True))
        if status_filter == "inactive":
            conditions.append(CustomFieldDefinition.is_active.is_(False))
        return conditions

    @staticmethod
    def _sort_column(sort: str):
        sortable_columns = {
            "label": CustomFieldDefinition.label,
            "module": CustomFieldDefinition.module,
            "field_type": CustomFieldDefinition.field_type,
            "sort_order": CustomFieldDefinition.sort_order,
            "updated_at": CustomFieldDefinition.updated_at,
        }
        return sortable_columns.get(sort, CustomFieldDefinition.sort_order)
