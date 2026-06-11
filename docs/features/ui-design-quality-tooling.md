# UI Design Quality Tooling

## Summary

Adds Impeccable as frontend design-quality tooling for deterministic UI anti-pattern detection.

## Behavior

- Impeccable is installed as a frontend dev dependency.
- `npm run ui:detect` scans `frontend/src` for UI anti-patterns using Impeccable's deterministic detector.
- The tool is advisory for local review and can be promoted to CI once the current UI baseline is clean.
- Urgent engagement renewal rows use a subdued full-row tint and light ring instead of a one-sided side-tab border, keeping alert visibility without triggering Impeccable's side-tab pattern.

## Commands

```bash
cd frontend
npm run ui:detect
```

## Implementation Files

- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/src/components/account/EngagementsPanel.tsx`
- `frontend/src/components/account/EngagementsPanel.test.tsx`

## Test Notes

- Run `npm run ui:detect` to verify the Impeccable CLI is available.
- Run `npm run typecheck` to confirm the frontend dependency update does not affect TypeScript compilation.
- Run `npm test -- EngagementsPanel.test.tsx` to verify the urgent renewal row does not regress to the side-tab border treatment.
