# UI Cleanup Summary

Generated: 2026-06-03

Cleanup source: `docs/audits/ui-cleanup-plan.md`

## Removed Items

- Removed voice/audio-specific dashboard wording from the V4 Intelligence Layer prompt tile.
  - `Voice brief` is now `QBR brief`.
  - `Prepare a spoken QBR brief for my highest-risk account` is now `Prepare a QBR brief for my highest-risk account`.
  - The microphone icon was replaced with a document icon.
  - The panel copy now says `summarize` instead of `narrate`.

No backend code or database schema was removed.

## Hidden Items

- Hid the standalone Admin `Customization` section from Admin navigation.
- Removed the Admin page render path for `AdminCustomizationPanel`.
- Direct navigation to an unsupported Admin section such as `/admin?section=customization` now falls back to the supported `users` Admin section.
- The `AdminCustomizationPanel` component file was retained because the cleanup plan preferred hiding UI/navigation over deleting medium-risk code.

## Files Changed

- `frontend/src/components/dashboard/V4IntelligenceLayer.tsx`
- `frontend/src/pages/Admin.tsx`
- `docs/audits/ui-cleanup-summary.md`

## Tests Run

- `npm test` from `frontend`
  - Result: Failed.
  - Outcome: 24 test files passed, 1 test file failed.
  - Failure details: `src/components/account/CreateAccountDialog.test.tsx` has 3 failing tests that look for a `Create account` submit button while the current dialog exposes `Create draft`.
  - Notes: This failure is outside the cleanup files and was not changed as part of this scoped UI cleanup. The run also emitted existing React Router future-flag warnings.

- `npm run build` from `frontend`
  - Result: Failed before code bundling output could complete.
  - Failure details: Vite could not unlink root-owned generated file `frontend/dist/assets/index--HKwT_oh.css`.
  - Notes: This is a filesystem ownership issue in the existing `dist` directory, not a TypeScript error from the cleanup.

- `npm run build -- --outDir /tmp/tkxel-kam-frontend-build` from `frontend`
  - Result: Passed.
  - Notes: This verified TypeScript and Vite build output using a writable temporary output directory. Vite emitted its existing large chunk warning.

- Lint
  - Result: Not run.
  - Reason: `frontend/package.json` does not define a lint script.

## Remaining Questionable Items

- `frontend/src/components/admin/AdminCustomizationPanel.tsx` remains in the repository but is no longer reachable from the Admin page.
- Keyboard shortcut modal/global hotkeys were intentionally kept because the cleanup plan classified them as indirectly supported.
- If stakeholders want true voice/audio AI brief support, a new requirement should be added before any voice/audio implementation.
- The unrelated `CreateAccountDialog` test mismatch and root-owned `frontend/dist` files should be handled separately from this unsupported UI cleanup.
