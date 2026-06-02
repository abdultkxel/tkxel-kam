from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import StakeholderGapRule, StakeholderRoleConfig, User
from app.repositories.accounts import AccountRepository
from app.repositories.audit import AuditRepository
from app.repositories.rbac import RbacRepository
from app.repositories.stakeholder_config import StakeholderConfigRepository
from app.schemas import (
    StakeholderGapRuleCreateRequest,
    StakeholderGapRulePageRead,
    StakeholderGapRuleRead,
    StakeholderGapRuleUpdateRequest,
    StakeholderRoleConfigCreateRequest,
    StakeholderRoleConfigPageRead,
    StakeholderRoleConfigRead,
    StakeholderRoleConfigUpdateRequest,
)
from app.services.account_access import AccountAccessService
from app.services.audit import AuditService
from app.services.user_management import page_count

STAKEHOLDER_MODULE = "stakeholder_relationship"


class StakeholderConfigService:
    def __init__(self, db: Session) -> None:
        self.repository = StakeholderConfigRepository(db)
        self.access = AccountAccessService(AccountRepository(db), RbacRepository(db))
        self.audit = AuditService(AuditRepository(db))

    def list_roles(self, current_user: User, *, active_state: str = "active", search: str | None = None, page: int = 1, page_size: int = 50, require_configure: bool = False) -> StakeholderRoleConfigPageRead:
        self.access.require_module_permission(current_user, STAKEHOLDER_MODULE, "configure" if require_configure else "view")
        items, total = self.repository.list_roles(active_state=active_state, search=search, page=page, page_size=page_size)
        return StakeholderRoleConfigPageRead(items=[self._role_read(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def create_role(self, payload: StakeholderRoleConfigCreateRequest, current_user: User) -> StakeholderRoleConfigRead:
        self.access.require_module_permission(current_user, STAKEHOLDER_MODULE, "configure")
        if self.repository.get_role_by_slug(payload.slug):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A stakeholder role with this slug already exists")
        role = StakeholderRoleConfig(slug=payload.slug, name=payload.name, description=payload.description, is_active=payload.is_active, display_order=payload.display_order, created_by_id=current_user.id, updated_by_id=current_user.id)
        self.repository.save_role(role)
        self.audit.log(module=STAKEHOLDER_MODULE, action="configure_role", entity_type="stakeholder_role", entity_id=role.id, actor=current_user, after_value=self._role_snapshot(role))
        self.repository.commit()
        return self._role_read(role)

    def update_role(self, role_id: str, payload: StakeholderRoleConfigUpdateRequest, current_user: User) -> StakeholderRoleConfigRead:
        self.access.require_module_permission(current_user, STAKEHOLDER_MODULE, "configure")
        role = self._get_role_or_404(role_id)
        before = self._role_snapshot(role)
        updates = payload.model_dump(exclude_unset=True)
        if "slug" in updates and updates["slug"] != role.slug and self.repository.get_role_by_slug(updates["slug"]):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A stakeholder role with this slug already exists")
        for field, value in updates.items():
            setattr(role, field, value)
        role.updated_by_id = current_user.id
        self.audit.log(module=STAKEHOLDER_MODULE, action="configure_role", entity_type="stakeholder_role", entity_id=role.id, actor=current_user, before_value=before, after_value=self._role_snapshot(role))
        self.repository.commit()
        return self._role_read(role)

    def list_rules(self, current_user: User, *, active_state: str = "active", search: str | None = None, page: int = 1, page_size: int = 50, require_configure: bool = False) -> StakeholderGapRulePageRead:
        self.access.require_module_permission(current_user, STAKEHOLDER_MODULE, "configure" if require_configure else "view")
        items, total = self.repository.list_rules(active_state=active_state, search=search, page=page, page_size=page_size)
        return StakeholderGapRulePageRead(items=[self._rule_read(item) for item in items], total=total, page=page, page_size=page_size, pages=page_count(total, page_size))

    def create_rule(self, payload: StakeholderGapRuleCreateRequest, current_user: User) -> StakeholderGapRuleRead:
        self.access.require_module_permission(current_user, STAKEHOLDER_MODULE, "configure")
        if self.repository.get_rule_by_key(payload.rule_key):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A stakeholder gap rule with this key already exists")
        rule = StakeholderGapRule(rule_key=payload.rule_key, title=payload.title, description=payload.description, severity=payload.severity, condition_json=payload.condition_json, is_active=payload.is_active, display_order=payload.display_order, created_by_id=current_user.id, updated_by_id=current_user.id)
        self.repository.save_rule(rule)
        self.audit.log(module=STAKEHOLDER_MODULE, action="configure_gap_rule", entity_type="stakeholder_gap_rule", entity_id=rule.id, actor=current_user, after_value=self._rule_snapshot(rule))
        self.repository.commit()
        return self._rule_read(rule)

    def update_rule(self, rule_id: str, payload: StakeholderGapRuleUpdateRequest, current_user: User) -> StakeholderGapRuleRead:
        self.access.require_module_permission(current_user, STAKEHOLDER_MODULE, "configure")
        rule = self._get_rule_or_404(rule_id)
        before = self._rule_snapshot(rule)
        updates = payload.model_dump(exclude_unset=True)
        if "rule_key" in updates and updates["rule_key"] != rule.rule_key and self.repository.get_rule_by_key(updates["rule_key"]):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A stakeholder gap rule with this key already exists")
        for field, value in updates.items():
            setattr(rule, field, value)
        rule.updated_by_id = current_user.id
        self.audit.log(module=STAKEHOLDER_MODULE, action="configure_gap_rule", entity_type="stakeholder_gap_rule", entity_id=rule.id, actor=current_user, before_value=before, after_value=self._rule_snapshot(rule))
        self.repository.commit()
        return self._rule_read(rule)

    def require_active_role(self, slug: str) -> None:
        role = self.repository.get_role_by_slug(slug)
        if role is None or not role.is_active:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"message": "Validation failed", "errors": [{"field": "role", "message": "Stakeholder role is inactive or not configured."}]})

    def _get_role_or_404(self, role_id: str) -> StakeholderRoleConfig:
        role = self.repository.get_role(role_id)
        if role is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stakeholder role was not found")
        return role

    def _get_rule_or_404(self, rule_id: str) -> StakeholderGapRule:
        rule = self.repository.get_rule(rule_id)
        if rule is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stakeholder gap rule was not found")
        return rule

    def _role_read(self, role: StakeholderRoleConfig) -> StakeholderRoleConfigRead:
        return StakeholderRoleConfigRead(id=role.id, slug=role.slug, name=role.name, description=role.description, is_active=role.is_active, display_order=role.display_order, created_at=role.created_at, updated_at=role.updated_at, in_use_count=self.repository.count_role_usage(role.slug))

    @staticmethod
    def _role_snapshot(role: StakeholderRoleConfig) -> dict:
        return {"id": role.id, "slug": role.slug, "name": role.name, "description": role.description, "is_active": role.is_active, "display_order": role.display_order}

    @staticmethod
    def _rule_read(rule: StakeholderGapRule) -> StakeholderGapRuleRead:
        return StakeholderGapRuleRead(id=rule.id, rule_key=rule.rule_key, title=rule.title, description=rule.description, severity=rule.severity, condition_json=rule.condition_json, is_active=rule.is_active, display_order=rule.display_order, created_at=rule.created_at, updated_at=rule.updated_at)

    @staticmethod
    def _rule_snapshot(rule: StakeholderGapRule) -> dict:
        return {"id": rule.id, "rule_key": rule.rule_key, "title": rule.title, "description": rule.description, "severity": rule.severity, "condition_json": rule.condition_json, "is_active": rule.is_active, "display_order": rule.display_order}
