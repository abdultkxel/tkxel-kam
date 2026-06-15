# Account Active Stage Success Badge

## Summary

Account lifecycle stage badges now render `Active` as a success badge. This keeps active accounts visually aligned with other successful/healthy states instead of using the blue informational badge style.

## Scope

- Account portfolio cards.
- Account portfolio table stage cells.
- Account 360 overview command-center stage badge.

## Decisions

- Only the exact account stage `Active` uses success styling.
- Other lifecycle stages keep their existing neutral or informational treatment in their current surfaces.
- No backend, API, or data model changes are required.

## Tests

- `frontend/src/pages/Accounts.test.tsx` verifies `Active` account stage badges use the green success styling in card and table views.
- `frontend/src/components/account/Account360.test.tsx` verifies the Account 360 overview `Active` stage badge uses the green success styling.
