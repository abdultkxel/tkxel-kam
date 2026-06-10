# Base Data Seeding

## Scope

Defines the local/demo base data that is created during application startup, `make seed`, and `make reset-db`.

## Seeded Roles

The platform seeds one hidden setup role and five visible operating roles:

- `super_admin` - hidden setup role, all permissions, exactly one seeded setup user.
- `admin` - visible administrator, all permissions.
- `kam_head` - portfolio governance owner, all permissions, including account and KYC approvals.
- `account_manager` - limited account owner role. Can create/update working records, but account creation approval and KYC approval remain with KAM Head/Admin/Super Admin.
- `delivery_lead` - engagement health, escalations, governance, and delivery tasks.
- `leadership_viewer` - read-only strategic visibility for portfolio, risk, retention, growth, and decisions.

Legacy seeded roles such as `content_specialist`, `commercial_stakeholder`, `delivery_stakeholder`, and `ops_lead` are no longer part of the basic seed set after a database reset.

## Seeded Users

The basic seed creates one user for each visible role plus one hidden Super Admin:

- `admin@tkxel.com` / `Admin@12345` - hidden Super Admin setup user.
- `admin.user@tkxel.com` / `User@12345`
- `kam.head.user@tkxel.com` / `User@12345`
- `account.manager.user@tkxel.com` / `User@12345`
- `delivery.lead.user@tkxel.com` / `User@12345`
- `leadership.viewer.user@tkxel.com` / `User@12345`

## Visibility Rules

- Super Admin user records are excluded from `/api/admin/users`.
- The Super Admin role is excluded from `/api/admin/roles`.
- Because the frontend uses those Admin APIs for user and role management, Super Admin is hidden from Admin screens and role assignment dropdowns by default.

## Commands

- `make seed` creates/updates base roles, permissions, allowed email domains, and basic users.
- `make reset-db` stops app services, drops/recreates the local database schema, seeds basic data, and starts app services again.

## Implementation Files

- Role catalog: `backend/app/rbac.py`
- Base seeding: `backend/app/services/seed.py`
- CLI commands: `backend/app/cli.py`
- Make targets: `Makefile`
- Hidden Super Admin filtering: `backend/app/repositories/users.py`, `backend/app/repositories/rbac.py`

## Test Notes

After a reset, verify:

- Total users in the database are 6, including hidden Super Admin.
- Admin users API returns 5 visible users.
- Admin roles API returns 5 visible roles.
- `super_admin` does not appear in Admin user/role API responses.
