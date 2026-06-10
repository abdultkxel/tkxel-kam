# Account Numeric Display ID

## Summary

Accounts keep their UUID primary key for routing, API relationships, and existing foreign-key references, but the UI now displays a human-friendly numeric account reference.

## Decisions

- `accounts.id` remains the internal UUID.
- `accounts.account_number` is a nullable unique display number used in API responses and UI labels.
- New accounts receive the next number through `AccountRepository.save`.
- Existing accounts are backfilled at startup and through `backend/migrations/20260610_account_numeric_display_id.sql`.
- Account list search and sort support the numeric reference.
- UI labels display `Account #100001` instead of exposing UUIDs on account cards, account detail headers, table rows, and CSV exports.

## API Contract

- `AccountRead.account_number: int | null`
- `GET /api/accounts?sort=account_number`
- `GET /api/accounts?search=Account #100001`

## Test Notes

- Backend tests should verify numeric ID assignment, uniqueness, search, sort, and detail response exposure.
- Frontend should keep using UUIDs for links and API calls.
