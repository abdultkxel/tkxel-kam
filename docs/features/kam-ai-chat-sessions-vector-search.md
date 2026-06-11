# KAM AI Chat Sessions And Vector Search

## Summary

KAM AI upgrade from a single-query source search drawer to a GPT-like, persisted chat assistant with session history, bottom chat composer, vector-style source retrieval, OpenAI-generated responses when configured, OpenAI web search for public/industry context, citations, and RBAC-aware source filtering.

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
- OpenAI response generation from retrieved sources, plus OpenAI web search when public/industry context is requested.
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
- Clicking `KAM AI` with an empty topbar search opens the KAM AI panel without sending a message.
- Submitting from the topbar creates a fresh KAM AI chat and sends the query automatically, matching the expected ChatGPT-style handoff instead of only pre-filling the drawer composer.
- RBAC-aware account/module/sensitive-source filtering.
- Internal vector/source-ranked response path is used first for account-grounded KAM questions when reliable authorized KAM records match the query.
- OpenAI is used as a fallback when internal vector search does not return reliable evidence, and those answers are marked as non-source-backed fallback guidance.
- User-explicit external search requests now retrieve authorized internal KAM sources first, then use OpenAI web search and synthesize a combined answer that separates internal KAM facts from public web findings. Trigger phrases include OpenAI, ChatGPT, GPT, LLM, AI search, web search, internet/online/public search, Google search wording, and outside-KAM wording.
- Industry, market, sector, competitor, benchmark, public context, public profile, and URL lookup questions also use the combined internal-vector plus OpenAI web-search path, including LinkedIn URL, official website, company URL, domain, homepage, and public/social profile requests.
- OpenAI web citations are displayed separately from internal KAM source citations, while internal citations remain persisted on the assistant message.
- Docker exposes explicit `KAM_AI_*` environment variables so KAM AI can use a real OpenAI API key/model independently of local KYC defaults. `KAM_AI_API_KEY` may come from `KAM_AI_API_KEY`, `OPENAI_API_KEY`, or an intentionally shared `AI_KYC_API_KEY`.
- Forecast, prediction, chart, graph, and next-six-month prompts now use the shared forecasting service and persist a `forecast_chart` payload on the assistant message for reload-safe chart rendering.
- Assistant responses render in a structured human-friendly style: markdown headings become styled headings, bold markers become bold text, and raw list markers are replaced with clean visual bullets.
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
- `docker compose run --rm --no-deps backend python -m py_compile app/services/kam_ai_chat.py`
- `docker compose run --rm --no-deps backend pytest tests/test_kam_ai_chat.py -q` passed with 11 tests after the combined internal-vector/OpenAI web-search update.
- `docker compose run --rm --no-deps frontend npm test -- KAMAIPanel.test.tsx` passed with 6 tests after updating KAM AI UI helper text and combined-source rendering coverage.
- `docker compose run --rm --no-deps backend python -m py_compile app/services/kam_ai_chat.py app/config.py`
- `docker compose run --rm --no-deps frontend npm run typecheck`
- `docker compose config --quiet`

Coverage added:

- Session/message/source persistence.
- AI gateway run persistence.
- Session owner isolation.
- Archive behavior.
- OpenAI synthesis mocked to avoid external calls in tests.
- Topbar KAM AI input and KAM AI composer synchronization.
- Empty topbar `KAM AI` click opens the panel without sending a message.
- Topbar KAM AI submit creates a new session and auto-sends the query.
- Internal-first KAM AI behavior with OpenAI fallback only when no reliable internal match is available.
- Explicit external-search KAM AI requests combine internal results with OpenAI web-search tooling.
- Industry context prompts route to the combined internal-vector plus OpenAI web-search path.
- Public profile lookup prompts such as LinkedIn URL requests route to the combined OpenAI web-search path.
- KAM AI UI renders OpenAI web sources separately from internal KAM sources.
- Live KAM AI loader while a query is running.
- Forecast query chart metadata persistence.
- Forecast chart rendering and markdown-marker cleanup in KAM AI responses.
