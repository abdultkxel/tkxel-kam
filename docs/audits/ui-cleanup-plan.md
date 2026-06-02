# UI Cleanup Plan

Generated: 2026-06-03

Source audit: `docs/audits/ui-scope-audit.md`

Scope: plan only. No application code was modified.

## Double-Check Summary

The unsupported items from the UI scope audit were rechecked against `specs/*`, `requirements/*`, `docs/*`, frontend route names, component names, visible UI labels, backend API endpoint names, and database entities.

| Audit item | Source/spec result | Route/component/label result | API/entity result | Final classification |
| --- | --- | --- | --- | --- |
| `Voice brief` / `spoken QBR brief` dashboard prompt | AI search, account briefs, governance briefs, and source-backed synthesis are supported. Voice, audio playback, speech synthesis, and spoken narration are not found in specs, requirements, or docs. | Appears on `/dashboard` in `frontend/src/components/dashboard/V4IntelligenceLayer.tsx` with `Voice brief`, `Prepare a spoken QBR brief...`, and `narrate` copy. | Related text AI endpoints exist, including `/api/ai/query`, `/api/ai/search`, and `/api/governance-events/{event_id}/ai-brief`. No voice/audio endpoint or voice/audio database entity was found. | Safe to remove the voice-specific wording and icon while keeping a text brief prompt. |
| Admin `Customization` section | Field Builder, Playbooks, Opportunity stages, Scoring, and Planning are supported. A standalone Admin Customization module is not supported. `docs/features/growth-opportunity-management.md` describes this area as mock customization context. | Appears as `/admin?section=customization` through `frontend/src/pages/Admin.tsx`, rendering `frontend/src/components/admin/AdminCustomizationPanel.tsx` with `Stage Rule Builder`, `Drag-and-drop Step Editor`, `Custom Fields`, and `Save stage rules`. | No standalone customization API was found. Related supported APIs/entities exist: custom fields, playbook templates, scoring metrics, opportunity stages, and stage transitions. | Should hide from navigation only; keep supported configuration surfaces visible. |
| Keyboard shortcut modal and global hotkeys | Explicit global hotkey requirements are not found. Keyboard accessibility, focus support, and semantic controls are indirectly supported by platform/accessibility requirements. | Runs on all authenticated pages through `frontend/src/hooks/useKeyboardShortcuts.ts` and `frontend/src/components/layout/AppShell.tsx`; visible modal label is `Keyboard shortcuts`. | No backend API or database entity is expected or required. | Keep because indirectly supported. |

## 1. Safe To Remove

### Voice-Specific Dashboard Prompt Wording

Unsupported UI item: `Voice brief` / `Prepare a spoken QBR brief for my highest-risk account`

Files to modify:

- `frontend/src/components/dashboard/V4IntelligenceLayer.tsx`

Exact UI behavior after cleanup:

- Keep the dashboard AI prompt tile because text-based QBR/account/pre-meeting briefs are supported.
- Rename `Voice brief` to `QBR brief` or `Pre-meeting brief`.
- Change the prompt query from `Prepare a spoken QBR brief for my highest-risk account` to a text-only query such as `Prepare a QBR brief for my highest-risk account`.
- Replace the microphone icon with a non-audio icon such as `FileText`, `Presentation`, or `Sparkles`.
- Replace `Ask, search, narrate, and chart...` copy with `Ask, search, summarize, and chart...`.
- Clicking the tile should continue to open KAM AI with the text brief prompt.
- The UI should no longer imply audio generation, narration, speech synthesis, or playback.

Risk level: Low

Test steps:

- Open `/dashboard`.
- Confirm the prompt tile no longer contains `Voice`, `spoken`, or `narrate`.
- Click the renamed brief tile and confirm the KAM AI panel opens with a text-only QBR/pre-meeting brief prompt.
- Confirm the other prompt tiles still work.
- Search the frontend for `Voice brief`, `spoken QBR`, and `narrate` to ensure unsupported voice wording is gone from this dashboard surface.

## 2. Should Hide From Navigation Only

### Admin Customization Section

Unsupported UI item: Admin `Customization` section, including `Stage Rule Builder`, `Drag-and-drop Step Editor`, local `Custom Fields`, and `Save stage rules`.

Files to modify:

- `frontend/src/pages/Admin.tsx`
- Optional later cleanup only after confirmation: `frontend/src/components/admin/AdminCustomizationPanel.tsx`

Exact UI behavior after cleanup:

- Remove or feature-hide the `Customization` tab from the Admin section selector.
- Do not render `AdminCustomizationPanel` for production/demo navigation.
- Direct navigation to `/admin?section=customization` should not show the mock customization panel. It should fall back to `/admin?section=users`, `/admin?section=fields`, or another supported Admin section.
- Keep the supported configuration areas visible and unchanged:
  - `Field builder`
  - `Scoring`
  - `Opportunities`
  - `Planning`
  - `Playbook`
- Do not delete related backend-backed configuration features or database entities.

Risk level: Low to Medium

Test steps:

- Open `/admin` and confirm the `Customization` tab is not visible.
- Visit `/admin?section=customization` directly and confirm the mock controls do not appear.
- Confirm `Stage Rule Builder`, `Drag-and-drop Step Editor`, and `Save stage rules` are not reachable through Admin navigation.
- Confirm `Field builder`, `Scoring`, `Opportunities`, `Planning`, and `Playbook` still render normally.
- Confirm no Admin page import/build warnings appear after hiding or removing the unused import.

## 3. Needs Confirmation

No unsupported audit item needs to remain exposed while waiting for confirmation after the cleanup above.

Confirmation would only be needed if stakeholders want to add a real voice/audio feature. In that case, create a new requirement before implementation covering audio generation, playback controls, transcript text, accessibility, storage, privacy, retention, and AI Gateway logging.

## 4. Keep Because Indirectly Supported

### Keyboard Shortcut Help Modal And Global Hotkeys

Previously marked unsupported UI item: Keyboard shortcut help modal and global hotkey workflow.

Files to modify:

- No code cleanup required.
- Optional documentation update if product wants explicit coverage: `specs/12-platform-readiness-reliability-and-scope-guardrails.md`.

Exact UI behavior after cleanup:

- Keep `Cmd/Ctrl + K` for opening KAM AI.
- Keep `?` for opening the shortcut modal.
- Keep `N` for adding a timeline note.
- Keep `E` for navigating to Governance.
- Keep `G then D` and `G then A` route shortcuts.
- Preserve the current guard that prevents shortcuts from firing while typing in inputs, textareas, or editable content.
- Treat the shortcut modal as a platform usability/accessibility enhancement, not as a separate business module.

Risk level: Low

Test steps:

- On an authenticated page, press `?` and confirm the shortcut modal opens.
- Press `Cmd/Ctrl + K` and confirm KAM AI opens.
- Press `N` and confirm the Add Note modal opens.
- Press `E` and confirm navigation to `/governance`.
- Press `G` then `D` and confirm navigation to `/dashboard`.
- Press `G` then `A` and confirm navigation to `/accounts`.
- Type those keys inside an input or textarea and confirm no global shortcut fires.

## Notes For Future Cleanup

- Do not remove backend-backed modules that overlap with Admin Customization. The cleanup target is the standalone mock wrapper, not Field Builder, Playbooks, Scoring, Opportunity stage configuration, or Planning.
- Do not remove the AI brief/dashboard prompt completely. The unsupported part is only the voice/audio implication.
- If the keyboard shortcut feature remains, documenting it in the platform readiness/accessibility spec would remove future ambiguity.
