from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.repositories.users import UserRepository
from app.security import decode_access_token
from app.services.auth import AuthService
from app.services.accounts import AccountService
from app.services.account_planning import AccountPlanningService
from app.services.admin_security import AdminSecurityService
from app.services.analytics import AnalyticsService
from app.services.ai_assistance import AiAssistanceService
from app.services.content import ContentService
from app.services.csat import CsatService
from app.services.custom_fields import CustomFieldService
from app.services.email_domains import EmailDomainPolicyService
from app.services.engagements import EngagementService
from app.services.escalations import EscalationService
from app.services.governance import GovernanceService
from app.services.integrations import IntegrationService
from app.services.kyc import KycService
from app.services.kyc_gateway import build_kyc_gateway_adapter
from app.services.dashboards import DashboardsService
from app.services.notifications import NotificationsService
from app.services.onboarding import OnboardingService
from app.services.opportunities import OpportunityService
from app.services.playbooks_tasks import PlaybooksTasksService
from app.services.profile import ProfileService
from app.services.rbac import RbacService
from app.services.reports import ReportsService
from app.services.scoring import ScoringService
from app.services.service_catalog import ServiceCatalogService
from app.services.signals import SignalsService
from app.services.stakeholder_gap_service import StakeholderGapService
from app.services.stakeholder_config import StakeholderConfigService
from app.services.stakeholders import StakeholderService
from app.services.timeline import TimelineService
from app.services.retention import RetentionService
from app.services.user_management import UserManagementService

bearer_scheme = HTTPBearer(
    bearerFormat="JWT",
    description="Paste the access_token returned by POST /api/auth/login.",
)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    token = credentials.credentials
    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub")
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token") from exc

    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject")

    user = UserRepository(db).get_by_id(user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User is inactive or no longer exists")

    EmailDomainPolicyService(db).require_current_user_allowed(user)
    return user


def get_auth_service(db: Annotated[Session, Depends(get_db)]) -> AuthService:
    return AuthService(db)


def get_profile_service(db: Annotated[Session, Depends(get_db)]) -> ProfileService:
    return ProfileService(db)


def get_rbac_service(db: Annotated[Session, Depends(get_db)]) -> RbacService:
    return RbacService(db)


def get_user_management_service(db: Annotated[Session, Depends(get_db)]) -> UserManagementService:
    return UserManagementService(db)


def get_custom_field_service(db: Annotated[Session, Depends(get_db)]) -> CustomFieldService:
    return CustomFieldService(db)


def get_email_domain_policy_service(db: Annotated[Session, Depends(get_db)]) -> EmailDomainPolicyService:
    return EmailDomainPolicyService(db)


def get_account_service(db: Annotated[Session, Depends(get_db)]) -> AccountService:
    return AccountService(db)


def get_onboarding_service(db: Annotated[Session, Depends(get_db)]) -> OnboardingService:
    return OnboardingService(db)


def get_engagement_service(db: Annotated[Session, Depends(get_db)]) -> EngagementService:
    return EngagementService(db)


def get_content_service(db: Annotated[Session, Depends(get_db)]) -> ContentService:
    return ContentService(db)


def get_escalation_service(db: Annotated[Session, Depends(get_db)]) -> EscalationService:
    return EscalationService(db)


def get_governance_service(db: Annotated[Session, Depends(get_db)]) -> GovernanceService:
    return GovernanceService(db)


def get_integration_service(db: Annotated[Session, Depends(get_db)]) -> IntegrationService:
    return IntegrationService(db)


def get_csat_service(db: Annotated[Session, Depends(get_db)]) -> CsatService:
    return CsatService(db)


def get_playbooks_tasks_service(db: Annotated[Session, Depends(get_db)]) -> PlaybooksTasksService:
    return PlaybooksTasksService(db)


def get_stakeholder_service(db: Annotated[Session, Depends(get_db)]) -> StakeholderService:
    return StakeholderService(db)


def get_stakeholder_config_service(db: Annotated[Session, Depends(get_db)]) -> StakeholderConfigService:
    return StakeholderConfigService(db)


def get_stakeholder_gap_service(db: Annotated[Session, Depends(get_db)]) -> StakeholderGapService:
    return StakeholderGapService(db)


def get_opportunity_service(db: Annotated[Session, Depends(get_db)]) -> OpportunityService:
    return OpportunityService(db)


def get_account_planning_service(db: Annotated[Session, Depends(get_db)]) -> AccountPlanningService:
    return AccountPlanningService(db)


def get_ai_assistance_service(db: Annotated[Session, Depends(get_db)]) -> AiAssistanceService:
    return AiAssistanceService(db)


def get_service_catalog_service(db: Annotated[Session, Depends(get_db)]) -> ServiceCatalogService:
    return ServiceCatalogService(db)


def get_retention_service(db: Annotated[Session, Depends(get_db)]) -> RetentionService:
    return RetentionService(db)


def get_kyc_service(db: Annotated[Session, Depends(get_db)]) -> KycService:
    return KycService(db, gateway=build_kyc_gateway_adapter())


def get_scoring_service(db: Annotated[Session, Depends(get_db)]) -> ScoringService:
    return ScoringService(db)


def get_signals_service(db: Annotated[Session, Depends(get_db)]) -> SignalsService:
    return SignalsService(db)


def get_timeline_service(db: Annotated[Session, Depends(get_db)]) -> TimelineService:
    return TimelineService(db)


def get_notifications_service(db: Annotated[Session, Depends(get_db)]) -> NotificationsService:
    return NotificationsService(db)


def get_dashboards_service(db: Annotated[Session, Depends(get_db)]) -> DashboardsService:
    return DashboardsService(db)


def get_reports_service(db: Annotated[Session, Depends(get_db)]) -> ReportsService:
    return ReportsService(db)


def get_analytics_service(db: Annotated[Session, Depends(get_db)]) -> AnalyticsService:
    return AnalyticsService(db)


def get_admin_security_service(db: Annotated[Session, Depends(get_db)]) -> AdminSecurityService:
    return AdminSecurityService(db)


def require_permission(module: str, action: str):
    def permission_dependency(
        current_user: Annotated[User, Depends(get_current_user)],
        service: Annotated[RbacService, Depends(get_rbac_service)],
    ) -> User:
        if service.user_has_permission(current_user, module, action):
            return current_user
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to perform this action")

    return permission_dependency
