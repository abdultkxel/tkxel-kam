# Account Visibility Scoping

## Summary

KAM Head users must see the full account portfolio. Account Manager users must see only accounts where they have an active Account Manager ownership assignment.

## Scope

- `KAM Head` keeps portfolio account visibility through portfolio permissions.
- `Account Manager` is treated as assigned-scope only for account visibility, even if older local data contains stale portfolio grants on the role.
- Account Manager account scope is limited to active AM ownership roles: `primary_am`, `supporting_am`, `account_manager`, `am`, and `kam`.
- Active non-AM ownership rows, such as `ops_lead`, do not make an account visible to an Account Manager.

## Implementation Notes

- `AccountAccessService.visible_account_ids()` is the shared backend helper for list-style account scoping.
- `AccountAccessService.can_view_account()` applies AM ownership-role filtering for Account Manager detail access.
- `/api/accounts` passes the same AM ownership-role scope into the repository query so returned rows and `total` use the same authorization rule.
- Capability output keeps `can_view_portfolio=false` for Account Manager users, even if stale portfolio permission keys are present.

## Tests

- Backend regression coverage verifies:
  - KAM Head can list all accounts.
  - Account Manager can list/read only AM-assigned accounts.
  - Account Manager cannot read unrelated or ops-only accounts.
  - A stale `accounts:view_portfolio` role grant does not widen Account Manager account visibility.
