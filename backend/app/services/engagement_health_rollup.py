from app.models import Account, AccountHealthRollup, Engagement
from app.repositories.engagements import EngagementRepository


ENGAGEMENT_HEALTH_ROLLUP_ADAPTER_VERSION = "engagement-health-rollup-adapter-v1"
SCORING_ENGINE_PENDING_STATUS = "pending_scoring_engine"


def notify_account_health_impacted_by_engagement_change(
    engagements: EngagementRepository,
    *,
    account: Account,
    engagement: Engagement,
) -> AccountHealthRollup:
    """Persist engagement health contribution data until configurable account scoring exists.

    TODO: Replace this adapter with the published account health scoring service once the
    scoring engine owns account health rollup calculations.
    """
    engagements.flush()
    active_engagements, _ = engagements.list_for_account(account_id=account.id, status_filter="active", page=1, page_size=1000)
    rollup = AccountHealthRollup(
        account_id=account.id,
        overall=account.health_overall,
        rag_status=account.risk_status,
        contributions=[engagement_health_contribution(engagements, item) for item in active_engagements],
        metric_version=ENGAGEMENT_HEALTH_ROLLUP_ADAPTER_VERSION,
    )
    engagements.add_account_rollup(rollup)
    return rollup


def engagement_health_contribution(engagements: EngagementRepository, engagement: Engagement) -> dict:
    latest_snapshot = engagements.latest_health_snapshot(engagement.id)
    return {
        "engagement_id": engagement.id,
        "name": engagement.name,
        "score": engagement.delivery_health,
        "health_score": engagement.delivery_health,
        "health_status": engagement.health_status,
        "delivery_status": engagement.delivery_status,
        "latest_snapshot_id": latest_snapshot.id if latest_snapshot else None,
        "latest_snapshot_score": latest_snapshot.overall if latest_snapshot else None,
        "latest_snapshot_rag_status": latest_snapshot.rag_status if latest_snapshot else None,
        "contribution": latest_snapshot.contribution if latest_snapshot else None,
        "scoring_status": SCORING_ENGINE_PENDING_STATUS,
    }
