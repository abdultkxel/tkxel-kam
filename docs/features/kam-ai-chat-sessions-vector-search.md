# KAM AI Chat Sessions And Vector Search

## Summary

KAM AI upgrade from a single-query source search drawer to a GPT-like, persisted chat assistant with session history, bottom chat composer, vector-style source retrieval, OpenAI-generated responses when configured, citations, and RBAC-aware source filtering.

Planning document:

- `docs/plans/kam-ai-chat-vector-search-plan.md`

## Current State

Current topbar KAM AI is implemented through:

- `frontend/src/components/ai/KAMAIPanel.tsx`
- `frontend/src/services/aiAssistance.ts`
- `backend/app/routers/ai.py`
- `backend/app/services/ai_assistance.py`

It now provides persisted ChatGPT-like sessions for the topbar KAM AI panel while keeping the older `/api/ai/search` path available for existing search/forecast flows.

## Target Scope

- Persisted chat sessions and messages.
- ChatGPT-like UI with session sidebar and bottom chat input.
- Vector search over authorized KAM source records.
- OpenAI response generation from retrieved sources.
- Source citations and source links.
- RBAC-aware filtering and sensitive-data controls.
- Backend audit and run history.

## Implementation Status

Implemented:

- Persisted KAM AI chat sessions, messages, per-message citations, and normalized source chunks.
- API endpoints for listing, creating, reading, archiving, and sending messages in chat sessions.
- Admin reindex/status endpoints for the KAM AI source index.
- GPT-like frontend panel with session sidebar, new chat action, source scopes, scrollable responses, and bottom composer.
- Topbar search is now the KAM AI input; its text stays synchronized with the KAM AI composer and opens the KAM AI panel through the embedded `KAM AI` button.
- RBAC-aware account/module/sensitive-source filtering.
- OpenAI response path with deterministic source-ranked fallback when OpenAI is not configured or fails.
- AI gateway run logging and audit logging for session/message activity.

Remaining:

- Streaming responses are not implemented yet.
- Search/filter inside the session sidebar is deferred.
- Production vector storage uses JSON embeddings/local cosine scoring for local compatibility; `pgvector` can be introduced later if the deployment stack enables the extension.

## Test Notes

Verified with:

- `docker compose exec -T backend python -m py_compile app/models.py app/schemas.py app/repositories/kam_ai_chat.py app/services/kam_ai_chat.py app/routers/ai.py app/dependencies.py`
- `docker compose exec -T backend pytest tests/test_kam_ai_chat.py -q`
- `docker compose exec -T frontend npm test -- KAMAIPanel.test.tsx`
- `docker compose exec -T frontend npm run typecheck`
- `docker compose exec -T frontend npm run build`

Coverage added:

- Session/message/source persistence.
- AI gateway run persistence.
- Session owner isolation.
- Archive behavior.
- OpenAI synthesis mocked to avoid external calls in tests.
- Topbar KAM AI input and KAM AI composer synchronization.
