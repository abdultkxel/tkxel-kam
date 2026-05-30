from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.dependencies import get_current_user, get_custom_field_service
from app.models import User
from app.rbac import ALL_MODULE_SLUGS
from app.schemas import CustomFieldDefinitionRead
from app.services.custom_fields import CustomFieldService

router = APIRouter(prefix="/api/custom-fields", tags=["Field Builder Runtime"])


@router.get(
    "",
    response_model=list[CustomFieldDefinitionRead],
    summary="List active runtime custom fields",
    description="Returns active Field Builder definitions for a module so authorized feature screens can render and validate custom fields.",
)
def list_runtime_custom_fields(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[CustomFieldService, Depends(get_custom_field_service)],
    module: Annotated[str, Query(description="PRD module slug to render custom fields for.")],
) -> list[CustomFieldDefinitionRead]:
    if module not in ALL_MODULE_SLUGS:
        return []
    return service.list_active_definitions_for_user(module, current_user)
