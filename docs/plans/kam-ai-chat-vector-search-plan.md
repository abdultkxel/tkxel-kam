# KAM AI Chat Sessions And Vector Search Plan

## 1. Goal

Upgrade the top navigation KAM AI experience from a single-query source search panel into a GPT-like, persisted chat assistant for assigned projects and source records.

The target experience:

- Chat-style UI with session sidebar, scrollable conversation area, and bottom input bar.
- New chat button to start a fresh session.
- Database-backed chat sessions and messages so users do not lose history.
- Vector search across authorized internal KAM source records.
- OpenAI-generated answers grounded in retrieved sources.
- Source citations, confidence, and RBAC-aware visibility.
- Existing KAM AI forecast and advisory logic remain available, but the main answer path becomes retrieval + OpenAI synthesis.

Implementation has started and the initial end-to-end KAM AI chat slice is complete. The implemented slice uses JSON-stored embeddings with local cosine scoring for local/demo compatibility instead of requiring PostgreSQL `pgvector`.

Implemented:

- Persisted chat sessions/messages/sources/source chunks.
- Chat session API routes.
- GPT-like KAM AI panel with session sidebar and bottom composer.
- RBAC-aware retrieval across account, engagement, document, KYC, timeline, opportunity, signal, governance, task, health, stakeholder, Fathom, and escalation records.
- OpenAI synthesis when configured, with deterministic source-ranked fallback.
- Tests for persistence, owner isolation, archive behavior, and source-backed answers.

Deferred:

- Streaming responses.
- Session search/filter.
- Production `pgvector` migration.
- Dedicated retry endpoint for failed assistant messages.

## 2. Current Implementation Summary

Current topbar KAM AI is implemented as a right-side drawer:

- Frontend component: `frontend/src/components/ai/KAMAIPanel.tsx`
- API client: `frontend/src/services/aiAssistance.ts`
- UI trigger: `frontend/src/components/layout/Topbar.tsx`
- Backend router: `backend/app/routers/ai.py`
- Backend service: `backend/app/services/ai_assistance.py`

Current behavior:

- User enters one query at a time.
- Frontend calls `POST /api/ai/search`.
- Backend checks `ai_assistance_search:view`.
- Backend scopes accounts by current user's account access.
- Backend searches timeline records and opportunities using simple text search.
- Backend returns deterministic summary text, not OpenAI-generated narrative.
- Frontend stores a local UI history in `frontend/src/stores/aiStore.ts`.
- Backend logs query runs in `ai_gateway_runs`, but does not maintain ChatGPT-style sessions.
- Optional frontend-only document search uses `frontend/src/services/semanticDocumentSearch.ts`, which searches loaded timeline-derived chunks in the browser.

Current backend source search is mainly in:

- `backend/app/services/ai_assistance.py::_search_sources`
- `backend/app/services/ai_assistance.py::_search_answer`
- `backend/app/services/ai_assistance.py::query_history`

Current limitations:

- No persisted chat sessions.
- No persisted chat messages.
- No true vector search for KAM AI.
- No OpenAI synthesis in `/api/ai/search`.
- No source retrieval across all implemented modules.
- No streaming response.
- No durable session sidebar.
- No session title generation.
- No per-message source/result persistence.
- Frontend and backend histories are split.

## 3. Proposed User Experience

### Chat Layout

Replace the current compact drawer content with a GPT-like layout:

- Left sidebar inside the KAM AI panel:
  - New chat button.
  - List of user's AI sessions, newest first.
  - Session title, updated time, optional account/project label.
  - Search/filter sessions later if needed.
- Main conversation area:
  - Scrollable message thread.
  - User messages aligned right or visually distinct.
  - Assistant responses aligned left with citations and source chips.
  - Loading state while retrieval/OpenAI is running.
  - Error state with retry.
- Bottom chat bar:
  - Fixed at bottom of the panel.
  - Textarea input, submit button, optional account selector, source scope selector.
  - Enter sends, Shift+Enter inserts new line.

### Session Behavior

- Opening KAM AI loads the latest active session.
- Clicking a session loads full message history.
- Clicking new chat creates a new empty session.
- Sending a message appends a user message, runs retrieval/OpenAI, then appends assistant response.
- Search results/sources for each assistant response are stored with the message.
- User can close/reopen KAM AI without losing the session.

### Response Behavior

Assistant response should include:

- Direct answer.
- Recommended next actions when applicable.
- Cited source list.
- Confidence and limitations.
- "I could not find enough evidence" language when sources are weak.
- Links back to account tabs/modules.

## 4. Source Universe For KAM AI

KAM AI should search only records the logged-in user is authorized to view.

Initial source types:

- Accounts: `accounts`
- Engagements/SOWs: `engagements`, `source_documents`, `source_document_chunks`
- KYC: `kyc_snapshots`, `kyc_drafts`, `kyc_workstream_outputs`
- Timeline/notes: `timeline_entries`
- Tasks: `tasks`
- Signals: `signals`
- Opportunities: `opportunities`
- Governance: `governance_events`, governance decisions/actions where implemented
- Health/scoring: `score_snapshots`, `account_health_rollups`
- Escalations: `escalations`
- Stakeholders: stakeholder records and interactions
- Integrations: approved Fathom imported items only
- Retention/growth: retention plans, milestones, actions, whitespace/recommendations where implemented

Sensitive commercial, financial, escalation, executive, and attachment content must only be embedded/retrieved/rendered when RBAC allows the requesting user to view it.

## 5. Proposed Architecture

### Flow

1. User opens KAM AI.
2. Frontend calls `GET /api/ai/chat-sessions`.
3. Frontend loads latest session via `GET /api/ai/chat-sessions/{session_id}`.
4. User sends a message.
5. Frontend calls `POST /api/ai/chat-sessions/{session_id}/messages`.
6. Backend:
   - Stores user message.
   - Resolves account scope and RBAC.
   - Builds/refreshes source chunks if needed.
   - Embeds user query.
   - Runs vector search plus keyword fallback.
   - Filters results by account access and module permission.
   - Sends retrieved source pack to OpenAI.
   - Stores assistant message, citations, model metadata, and audit log.
7. Frontend appends assistant response in the conversation.

### Recommended Service Split

- `AiChatSessionService`
  - session CRUD
  - message persistence
  - session title generation
- `KamAiRetrievalService`
  - source indexing
  - vector search
  - keyword fallback
  - RBAC filtering
- `KamAiSourceIndexer`
  - converts domain records into normalized chunks
  - refreshes stale chunks
- `KamAiOpenAiResponder`
  - builds prompt
  - calls OpenAI
  - parses structured response
- `KamAiCitationMapper`
  - maps retrieved records to frontend links/tabs
- `KamAiAuditService`
  - writes `ai_gateway_runs` and audit logs

## 6. Vector Search Design

### Recommended Storage

Use PostgreSQL `pgvector` for production-ready vector search.

Proposed table:

```text
kam_ai_source_chunks
```

Core columns:

- `id`
- `account_id`
- `source_type`
- `source_record_id`
- `source_route`
- `title`
- `chunk_text`
- `chunk_hash`
- `embedding`
- `embedding_provider`
- `embedding_model`
- `embedding_dimensions`
- `sensitivity_level`
- `permission_module`
- `permission_action`
- `metadata_json`
- `created_at`
- `updated_at`
- `deleted_at`

Recommended embedding model:

- `text-embedding-3-small` for lower cost.

Alternative local/demo fallback:

- Existing `backend/app/services/kyc_embeddings.py::LocalHashEmbeddingClient` can be reused for offline tests, but it is not a true semantic embedding model.

### Retrieval Ranking

Use combined ranking:

- Vector similarity.
- Keyword match.
- Source trust score.
- Recency.
- Account relevance.
- Module/source priority.
- Sensitivity/RBAC eligibility.

Recommended source priority:

1. Approved KYC snapshot.
2. Uploaded SOW/charter/source document chunks.
3. Engagement records.
4. Governance decisions/actions.
5. Escalations and critical signals.
6. Tasks and timeline notes.
7. Opportunities and retention/growth records.
8. Approved Fathom summaries.
9. Health/scoring records.

## 7. OpenAI Response Design

KAM AI should use OpenAI to transform retrieved sources into a useful answer.

Provider config:

- `KAM_AI_PROVIDER=openai`
- `KAM_AI_MODEL=gpt-5.4-mini`
- `KAM_AI_API_KEY` or reuse `AI_KYC_API_KEY` only if intentionally shared
- `KAM_AI_MAX_INPUT_TOKENS`
- `KAM_AI_MAX_OUTPUT_TOKENS`
- `KAM_AI_TEMPERATURE`
- `KAM_AI_TIMEOUT_SECONDS`
- `KAM_AI_MAX_COST_PER_RUN_USD`

Prompt rules:

- Use only retrieved authorized source records.
- Do not invent facts.
- Include citations for important claims.
- State missing evidence clearly.
- Respect RBAC and do not expose restricted records.
- Use account/project names and source routes in citations.
- For strategy questions, separate evidence from recommendation.

Response schema:

```json
{
  "answer_markdown": "string",
  "confidence": "high|medium|low",
  "intent": "risk|renewal|governance|growth|forecast|handoff|general",
  "recommended_actions": [],
  "citations": [],
  "missing_evidence": [],
  "follow_up_questions": []
}
```

## 8. Session And Message Database Design

### `kam_ai_chat_sessions`

Fields:

- `id`
- `user_id`
- `title`
- `account_id` nullable
- `scope_json`
- `status`
- `last_message_at`
- `created_at`
- `updated_at`
- `archived_at`

### `kam_ai_chat_messages`

Fields:

- `id`
- `session_id`
- `role` values: `user`, `assistant`, `system`
- `content`
- `status` values: `pending`, `running`, `complete`, `failed`
- `intent`
- `confidence`
- `model_provider`
- `model_name`
- `token_usage_json`
- `error_message`
- `created_at`
- `completed_at`

### `kam_ai_chat_message_sources`

Fields:

- `id`
- `message_id`
- `source_type`
- `source_record_id`
- `account_id`
- `title`
- `excerpt`
- `source_route`
- `relevance_score`
- `citation_index`
- `metadata_json`

### Relationship With `ai_gateway_runs`

Keep `ai_gateway_runs` for audit and technical run details. Link it from `kam_ai_chat_messages`:

- `ai_gateway_run_id`

This avoids overloading `ai_gateway_runs` as the conversation store.

## 9. API Requirements

New endpoints:

- `GET /api/ai/chat-sessions`
  - List current user's sessions.
- `POST /api/ai/chat-sessions`
  - Create new session.
- `GET /api/ai/chat-sessions/{session_id}`
  - Load session and messages.
- `PATCH /api/ai/chat-sessions/{session_id}`
  - Rename/archive session.
- `POST /api/ai/chat-sessions/{session_id}/messages`
  - Send user message and return assistant response.
- `POST /api/ai/chat-sessions/{session_id}/messages/{message_id}/retry`
  - Retry failed assistant response.
- `POST /api/admin/ai/reindex`
  - Admin-only source reindex trigger.
- `GET /api/admin/ai/index-status`
  - Admin-only indexing status.

Optional later:

- Streaming endpoint via SSE or WebSocket:
  - `GET /api/ai/chat-sessions/{session_id}/messages/{message_id}/stream`

## 10. Frontend Changes Required

Modify:

- `frontend/src/components/ai/KAMAIPanel.tsx`
- `frontend/src/services/aiAssistance.ts`
- `frontend/src/stores/aiStore.ts`
- `frontend/src/components/layout/Topbar.tsx` only if launch behavior changes

Create:

- `frontend/src/components/ai/KAMAIChatPanel.tsx`
- `frontend/src/components/ai/KAMAIChatSidebar.tsx`
- `frontend/src/components/ai/KAMAIMessageList.tsx`
- `frontend/src/components/ai/KAMAIMessageBubble.tsx`
- `frontend/src/components/ai/KAMAIComposer.tsx`
- `frontend/src/components/ai/KAMAISourceList.tsx`
- `frontend/src/services/kamAiChat.ts`
- `frontend/src/types/kamAiChat.ts`

UI states:

- Session loading.
- Empty first session.
- Message sending.
- Assistant thinking.
- Retrieval found no sources.
- OpenAI error with retry.
- Session archived/renamed.
- RBAC restricted source notice.

## 11. Backend Changes Required

Modify:

- `backend/app/routers/ai.py`
- `backend/app/services/ai_assistance.py`
- `backend/app/schemas.py`
- `backend/app/models.py`
- `backend/app/database.py`
- `backend/app/config.py`
- `backend/app/rbac.py`

Create:

- `backend/app/services/kam_ai_chat.py`
- `backend/app/services/kam_ai_retrieval.py`
- `backend/app/services/kam_ai_indexer.py`
- `backend/app/services/kam_ai_openai.py`
- `backend/app/repositories/kam_ai_chat.py`
- `backend/app/repositories/kam_ai_index.py`
- migration for chat/session/vector tables

## 12. RBAC And Security

Required controls:

- User can only list/load their own sessions unless Admin/Super Admin has explicit audit access.
- Sources must be filtered before prompt construction.
- Sensitive records must not be embedded into unrestricted chunks.
- Message sources should store only excerpts the user was allowed to see at answer time.
- Prompt logs should mask secrets and avoid unrestricted sensitive full-text logging.
- Leadership/Executive users get read-only answers and aggregated/limited commercial details.
- Delivery Lead sees delivery/governance/escalation/task content based on RBAC.

Audit events:

- Session created.
- Message sent.
- Assistant answer generated.
- Retrieval failure.
- OpenAI failure.
- Session renamed/archived.
- Admin reindex triggered.

## 13. Source Link Mapping

Every citation should link back to the correct UI module:

- Account overview: `/accounts/{account_id}?tab=overview`
- Engagement: `/accounts/{account_id}?tab=engagement`
- KYC: `/accounts/{account_id}?tab=kyc`
- Health: `/accounts/{account_id}?tab=health`
- Opportunities: `/accounts/{account_id}?tab=opportunities`
- Governance: `/accounts/{account_id}?tab=governance`
- Timeline: `/accounts/{account_id}?tab=timeline`
- Notes: `/accounts/{account_id}?tab=notes`
- Documents: `/accounts/{account_id}?tab=documents`
- Tasks: `/tasks?accountId={account_id}`
- Playbook/signals: `/playbook?accountId={account_id}` or existing route

## 14. Background Indexing

Index source chunks when records change:

- Account create/update.
- Engagement create/update.
- SOW/source document extraction completes.
- KYC snapshot approved/restored.
- Timeline entry created/updated.
- Task created/updated.
- Signal created/updated.
- Opportunity created/updated.
- Governance event/action/decision changed.
- Escalation changed.
- Fathom item approved.

For first implementation:

- Add manual admin reindex endpoint.
- Add synchronous reindex for small changed records.
- Add local worker later if indexing becomes slow.

## 15. Implementation Phases

### Phase 1: API Contract And Schema

Deliverables:

- Finalize chat/session schema.
- Add migration plan.
- Add request/response schemas.
- Add feature file and tests outline.

Complexity: Medium.

### Phase 2: Persisted Chat Sessions

Deliverables:

- Session CRUD.
- Message persistence.
- Session sidebar API.
- Frontend session loading/new chat.

Complexity: Medium.

### Phase 3: Source Indexing

Deliverables:

- Normalized source chunk table.
- Indexer for accounts, timeline, KYC, opportunities, governance, tasks, signals, engagements, documents.
- Manual reindex command/API.

Complexity: High.

### Phase 4: Vector Search

Deliverables:

- Embedding provider.
- Query embedding.
- Vector similarity search.
- Keyword fallback.
- RBAC filtering.

Complexity: High.

### Phase 5: OpenAI Answer Generation

Deliverables:

- OpenAI response adapter.
- Strict response schema.
- Citations.
- Missing evidence handling.
- Audit logging.

Complexity: Medium.

### Phase 6: GPT-Like Frontend

Deliverables:

- Chat sidebar.
- Scrollable message area.
- Bottom chat bar.
- Source citation UI.
- Retry and loading states.

Complexity: High.

### Phase 7: History, Rename, Archive, Retry

Deliverables:

- Rename session.
- Archive session.
- Retry failed message.
- Persisted current session.

Complexity: Medium.

### Phase 8: Hardening And Tests

Deliverables:

- Backend unit/API tests.
- Frontend component tests.
- RBAC tests.
- Vector search tests.
- OpenAI mocked tests.
- Performance checks on demo data.

Complexity: Medium.

## 16. Test Plan

Backend tests:

- User can create/list/load own chat sessions.
- User cannot load another user's session.
- New message creates user and assistant message.
- OpenAI failure stores failed assistant message.
- Vector search filters unauthorized account records.
- Sensitive source chunks excluded when user lacks permission.
- Keyword fallback works when embeddings fail.
- Query history persists after logout/login.
- Admin reindex refreshes chunks idempotently.

Frontend tests:

- KAM AI opens with latest session.
- New chat creates empty session.
- Sending a prompt appends user and assistant messages.
- Session sidebar loads previous session.
- Loading, empty, error, retry states render.
- Source citations link to modules.
- Bottom chat bar remains fixed while messages scroll.

Manual demo tests:

- Login as Account Manager and ask about assigned project risks.
- Login as KAM Head and ask portfolio-level question.
- Login as Leadership/Executive and verify commercial masking.
- Ask a question with no matching sources and verify safe answer.
- Close/reopen browser and confirm sessions remain.

## 17. Risks

- OpenAI cost can grow if too many source chunks are sent.
- pgvector setup may require Docker/PostgreSQL extension changes.
- Indexing all modules may expose sensitive content unless RBAC metadata is strict.
- Frontend panel may become too dense on smaller screens.
- Source records can become stale unless indexing hooks are reliable.
- Existing `ai_gateway_runs` history and new chat sessions can confuse users unless UI clearly separates chat history from technical audit history.

## 18. Assumptions

- KAM AI should search internal KAM platform records first, not public web.
- OpenAI is allowed for answer generation.
- Vector embeddings may use OpenAI embeddings in production.
- Chat sessions are per-user by default.
- Admin/Super Admin can audit KAM AI activity, but not silently edit another user's session.
- Existing KYC Tavily/web research remains separate unless explicitly added later.

## 19. Questions Before Implementation

1. Should KAM AI use only internal system sources, or should Tavily public web research also be available as an optional source toggle?
2. Should chat responses stream token-by-token, or is a normal loading state acceptable for the first version?
3. Should Admin/Super Admin be able to view all users' KAM AI sessions, or only audit metadata?
4. Should KAM AI sessions be shareable with teammates?
5. Should we use OpenAI embeddings only, or start with local hash embeddings and add OpenAI embeddings after the chat UI is stable?
6. Is `gpt-5.4-mini` confirmed as the model name to use, or should this be corrected to the currently available model in `.env` before implementation?
7. Should the existing `KAMAIPanel.tsx` be refactored in place, or should we build a new `KAMAIChatPanel.tsx` and switch the topbar to it after tests pass?
