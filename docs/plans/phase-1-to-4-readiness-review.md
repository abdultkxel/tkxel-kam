# Phase 1 To 4 AI KYC Readiness Review

Status: Planning only. No application code, database schema, packages, workers, or external API behavior has been changed.

Source plan reviewed: `docs/plans/ai-kyc-pipeline-implementation-plan.md`

Current implementation evidence:

- KYC gateway placeholder: `backend/app/services/kyc_gateway.py`
- KYC service/workflow: `backend/app/services/kyc.py`
- KYC API routes: `backend/app/routers/kyc.py`
- KYC persistence and source documents: `backend/app/models.py`
- Account attachments/source documents: `backend/app/services/accounts.py`, `backend/app/repositories/accounts.py`
- Fathom integration/review: `backend/app/services/integrations.py`, `backend/app/routers/integrations.py`
- Local workers: `backend/app/main.py`
- Frontend KYC: `frontend/src/components/account/KYCAssistedReview.tsx`, `frontend/src/components/account/KYCAgentOverview.tsx`
- Reference documents: `requirements/Account Informationn Reference .pdf`, `requirements/SOW_CANVS_TKLLC_007 .pdf`, `requirements/SOW_CANVS_TKLLC_007 .docx`

External references checked:

- OpenAI API pricing: `https://openai.com/api/pricing/`
- OpenAI platform pricing: `https://platform.openai.com/docs/pricing/`
- OpenAI embeddings guide: `https://platform.openai.com/docs/guides/embeddings`
- OpenAI model docs: `https://platform.openai.com/docs/models`

Important readiness note:

The source implementation plan still contains some older language around Qwen/custom gateways and external research source labels. For Phase 1 to 4, treat the latest product decisions as authoritative:

- Provider: OpenAI only for first implementation.
- Credentials: `.env` only.
- Research providers: no Trivoly/Travoly, ZoomInfo, Crunchbase.
- LinkedIn: on hold.
- OpenAI should process supplied platform/document context only; no web search/browsing in Phase 1 to 4.
- OCR and embeddings/vector search are included in first implementation.
- Redis should be considered for background jobs, but Redis-backed job processing is mainly Phase 6; Phase 1 to 4 should prepare integration points only.

## 1. Open Questions

| Recommendation | Reasoning | Tradeoffs | Complexity | Estimated implementation effort |
|---|---|---|---|---|
| Confirm exact OpenAI model name available in the account before Phase 4. | Current product direction says GPT-5/GPT-5-mini, but available API model IDs can vary by account/tier. Implementation should fail safely if the configured model is unavailable. | Waiting for confirmation avoids broken provider calls; using an env fallback improves local demo reliability but can hide quality differences. | Low | 0.5 day |
| Confirm monthly and per-run budget caps before adding provider calls. | OpenAI API usage is billed separately from ChatGPT plans, and docs recommend monitoring usage/budgets. | Tight caps protect demo cost but may fail larger KYC runs; loose caps improve demos but risk unexpected spend. | Low | 0.5 day |
| Decide whether sensitive commercial fields can be sent to OpenAI for authorized users. | RBAC can hide fields from unauthorized users, but provider exposure is a separate security decision. | Sending sensitive data improves financial KYC depth; redacting it reduces leakage risk but weakens financial landscape output. | Medium | 0.5-1 day decision, 1-2 days implementation impact |
| Confirm pgvector availability in the current PostgreSQL container. | Embeddings are in scope. pgvector is the cleanest fit if PostgreSQL remains primary storage. | pgvector keeps data local; if unavailable, a separate vector database adds operational burden. | Medium | 0.5 day verification |
| Confirm OCR engine. Recommended default: local Tesseract. | User requested OCR in first implementation. Local OCR avoids cloud OCR credentials and external data exposure. | Tesseract is low-cost but can be weaker on messy scans; cloud OCR is stronger but adds credentials, cost, and data transfer concerns. | Medium | 0.5 day decision, 1-3 days implementation impact |
| Confirm whether SOW files are persisted as real files or only metadata. | The user said SOW exists through account creation/SOW Management, but current `SourceDocument` model has metadata fields and no extracted text columns. | If real files exist, ingestion is simpler; if only metadata exists, Phase 2 must add upload/file storage wiring. | Medium | 1 day discovery |
| Confirm RQ vs Celery only as a Phase 6 preparation decision. | Redis jobs are requested, but Phase 1 to 4 do not need full job execution yet. | RQ is simpler; Celery is more mature for production but heavier. | Low for Phase 1-4 | 0.5 day decision |

## 2. Architectural Decisions Required

| Recommendation | Reasoning | Tradeoffs | Complexity | Estimated implementation effort |
|---|---|---|---|---|
| Use a four-layer KYC pipeline: extraction, chunking, retrieval, OpenAI generation. | Separating these phases keeps document processing, vector search, and provider calls testable. | More files/services upfront; much easier to debug and extend later. | Medium | 2-3 days architecture scaffolding |
| Keep `KycGatewayAdapter` as the provider boundary. | `backend/app/services/kyc_gateway.py` already defines an adapter protocol and deterministic fallback. | Existing request/response DTOs will need expansion for chunks, usage, citations, and strict schema metadata. | Medium | 1-2 days |
| Store OpenAI credentials only in `.env`. | Matches product decision and avoids Admin Integration secret UI. | Admins cannot rotate key from UI; deployment process must manage secrets. | Low | 0.5-1 day |
| Use `SourceDocument` as the anchor entity for extraction and chunks. | Existing account/onboarding/engagement flows already reference `SourceDocument`. | Requires schema additions later; Phase 1 to 4 must avoid duplicating source-document concepts. | Medium | 2-4 days in Phase 2-3 |
| Use KYC-specific retrieval service before prompt construction. | Prevents sending too much data and enforces RBAC before OpenAI calls. | Adds retrieval tuning work; avoids expensive and unsafe full-context prompts. | Medium | 2-3 days |
| Keep OpenAI web search disabled. | User has no approved external research credentials and LinkedIn is on hold. | Market/client research may be weaker unless uploaded reference docs contain enough evidence. | Low | 0.5 day guardrail |

## 3. Cost Implications

Current OpenAI pricing references indicate API usage is billed and not included in ChatGPT subscriptions. Pricing changes over time, so implementation should store actual usage and make caps configurable.

Estimated costs using current public pricing snapshots:

- `gpt-5-mini`: about $0.25 / 1M input tokens and $2.00 / 1M output tokens on the OpenAI platform pricing page.
- `gpt-5.5`: OpenAI pricing page lists $5.00 / 1M input tokens and $30.00 / 1M output tokens.
- `text-embedding-3-small`: OpenAI docs list about $0.02 / 1M embedding input tokens.

| Recommendation | Reasoning | Tradeoffs | Complexity | Estimated implementation effort |
|---|---|---|---|---|
| Use `gpt-5-mini` for MVP KYC generation. | A typical KYC run of 25k input tokens and 6k output tokens costs roughly $0.018 with `gpt-5-mini`, based on current listed prices. | Lower cost; may need stronger model fallback if KYC depth is weak. | Low | 0.5 day config, 1 day provider tests |
| Keep `gpt-5.5` as manual quality fallback only. | The same 25k input/6k output run is roughly $0.305 with `gpt-5.5`, much higher but likely stronger. | Better quality; cost can jump quickly across demo accounts. | Low | 0.5 day config |
| Add per-run and monthly budget caps before real provider calls. | Prevents accidental spend during repeated refreshes or broken retry loops. | Budget failures need clear UI states and retry behavior. | Medium | 1-2 days |
| Embed only changed/new chunks. | Embedding cost is low, but repeated full re-indexing wastes time and money. | Requires checksum/hash tracking; saves cost and improves idempotency. | Medium | 1-2 days |
| Keep OpenAI web search disabled in MVP. | Web search is separately priced per call and not required for internal-source KYC. | Less external market data; safer and cheaper. | Low | 0.5 day guardrail |

## 4. Token Usage Estimates

Assumptions:

- One KYC account has 1-3 SOW/charter/reference documents, notes, timeline records, Fathom summaries, and prior snapshot context.
- Chunks are 500-800 tokens with overlap.
- The KYC prompt retrieves only top-ranked chunks, not the full account corpus.

| Scenario | Input tokens | Output tokens | Embedding tokens | Estimated behavior |
|---|---:|---:|---:|---|
| Small MVP account | 12k-18k | 3k-5k | 10k-30k | Enough for SOW + account context + small note/timeline set. |
| Normal demo account | 22k-35k | 5k-8k | 30k-80k | Best target for rich, cited KYC without overloading context. |
| Heavy account | 50k-80k | 8k-12k | 100k-250k | Needs strict retrieval/ranking and possibly multi-step generation. |

| Recommendation | Reasoning | Tradeoffs | Complexity | Estimated implementation effort |
|---|---|---|---|---|
| Target 25k-35k input tokens per KYC run for MVP. | Keeps cost manageable while allowing enough cited evidence for five workstreams. | May miss weakly related evidence; retrieval quality becomes important. | Medium | 1-2 days prompt/retrieval tuning |
| Cap output at 6k-8k tokens initially. | Prevents verbose drafts and cost drift. | May require concise KYC fields; reviewers may ask for richer sections later. | Low | 0.5 day config |
| Run one OpenAI generation call for all five workstreams in MVP. | Simpler and cheaper than five separate calls. | If one workstream fails due schema issue, retrying all workstreams costs more. | Medium | 1-2 days schema/prompt |
| Production-ready option: generate per workstream. | Better isolation, status tracking, and retries. | More calls and more orchestration. | High | 3-5 days |

## 5. Storage Estimates

Storage assumptions:

- Extracted text: usually 2-6 KB per page after normalization.
- Chunks: 500-800 tokens, often 2-4 KB per chunk.
- Embeddings: `text-embedding-3-small` default vector length is 1536. Float32 storage is about 6 KB per vector before index overhead.

| Scale | Extracted text | Chunks | Embeddings | Approx total with index overhead |
|---|---:|---:|---:|---:|
| 1 account, 100 chunks | 100-300 KB | 200-400 KB | ~600 KB | 1-2 MB |
| 100 accounts, 100 chunks each | 10-30 MB | 20-40 MB | ~60 MB | 100-180 MB |
| 1,000 accounts, 100 chunks each | 100-300 MB | 200-400 MB | ~600 MB | 1-2 GB |

| Recommendation | Reasoning | Tradeoffs | Complexity | Estimated implementation effort |
|---|---|---|---|---|
| Store raw extracted text and normalized text separately only if needed. | Raw text helps debugging extraction; normalized text is what retrieval uses. | More storage; better audit/debugging. | Medium | 1-2 days |
| Store chunk hashes and extraction checksums. | Enables idempotent reprocessing and avoids duplicate embeddings. | Adds migration columns and checksum logic. | Medium | 1 day |
| Store embeddings in PostgreSQL/pgvector for MVP. | Avoids a separate vector service and keeps backup/restore simpler. | PostgreSQL size and index tuning matter as data grows. | Medium | 1-2 days |
| Add retention/archive policy later, not Phase 1-4. | Keeps MVP focused. | Storage can grow if many documents are uploaded. | Low | Defer |

## 6. OCR Strategy Options

| Option | Recommendation | Reasoning | Tradeoffs | Complexity | Estimated implementation effort |
|---|---|---|---|---|---|
| Local Tesseract OCR | Recommended MVP | No cloud credentials; keeps document text local; good enough for many scanned PDFs. | Requires system package; quality varies with scans; slower than cloud OCR. | Medium | 2-3 days |
| Cloud OCR | Defer | Better quality for messy scans and tables. | Adds cost, credentials, data transfer, and vendor security review. | High | 4-7 days |
| Mark scanned docs `ocr_required` only | Not aligned with user request | Fastest and safest if OCR dependency is blocked. | Does not satisfy first-implementation OCR requirement. | Low | 0.5-1 day |
| Hybrid OCR | Production-ready | Try local OCR first, escalate poor-confidence docs to cloud OCR later. | More moving parts and review workflow. | High | 5-8 days |

OCR readiness recommendation:

- Use text extraction first.
- If text density is below threshold, run OCR.
- Store `ocr_status`, `ocr_engine`, `ocr_confidence` if available, and extraction error details.
- Never block manual KYC if OCR fails; mark the source as weak evidence.

## 7. Embedding/Vector Search Options

| Option | Recommendation | Reasoning | Tradeoffs | Complexity | Estimated implementation effort |
|---|---|---|---|---|---|
| PostgreSQL full-text only | Not enough for requested first version | Simpler, but user explicitly requested embeddings/vector search. | Lower quality semantic matching. | Low | 1-2 days |
| PostgreSQL + pgvector | Recommended MVP | Keeps vectors with existing DB and supports semantic retrieval without extra service. | Requires pgvector extension and index tuning. | Medium | 2-4 days |
| Qdrant | Production alternative | Strong vector DB, easy local Docker usage. | Adds another service and operational dependency. | Medium | 3-5 days |
| Pinecone/managed vector DB | Defer | Good managed production option. | Adds credentials/cost/external dependency. | High | 5-8 days |

Retrieval recommendation:

- Use hybrid retrieval: source trust score + metadata filters + full-text rank + vector similarity.
- Always filter by account, engagement, source type, sensitivity, and RBAC before ranking.
- Store top retrieved chunk IDs in the KYC run for auditability.

## 8. AI Provider Recommendations

| Recommendation | Reasoning | Tradeoffs | Complexity | Estimated implementation effort |
|---|---|---|---|---|
| Implement OpenAI only in Phase 4. | Matches product decision and avoids premature abstraction across providers. | Future Qwen/Azure support will need an adapter later; provider contract still keeps it possible. | Medium | 2-4 days |
| Use `gpt-5-mini` for default generation. | Mini GPT models are faster and less expensive; OpenAI docs recommend mini models for price/performance tradeoffs. | KYC detail may be weaker than a flagship model. | Low | 0.5 day config |
| Add optional `AI_KYC_QUALITY_MODEL` for manual fallback. | Allows KAM Head/admin-triggered re-run with stronger model if needed. | More config and budget governance. | Low | 1 day |
| Use `text-embedding-3-small` for embeddings. | Low-cost embedding model with default 1536 dimensions and strong enough for MVP retrieval. | `text-embedding-3-large` may improve retrieval slightly, but costs more and doubles vector dimensions. | Medium | 1-2 days |
| Disable OpenAI web search/tools. | No approved external research source for Phase 1-4. | Market research may rely heavily on uploaded reference docs. | Low | 0.5 day guardrail |

## 9. Source Ranking/Trust Model

Recommended trust ranking:

| Source | Trust score | Use for |
|---|---:|---|
| Signed SOW/contract/MSA | 100 | Scope, obligations, dates, team structure, billing, renewal, notice, payment terms. |
| Approved engagement records | 95 | Current delivery model, service lines, active project state, ownership. |
| Approved KYC snapshot | 90 | Prior institutional knowledge and diff baseline. |
| Account profile/CRM fields | 85 | Segment, region, owner, lifecycle, commercial metadata. |
| Governance/timeline history | 80 | Escalations, delivery delays, decisions, executive cadence, handover. |
| Account notes | 70 | Informal context, relationship history, follow-ups. |
| Reviewed Fathom summaries/action items | 70 | Meeting intelligence, action items, stakeholder sentiment, commitments. |
| Uploaded account/reference docs | 65 | Market/client profile depth, if reviewed/approved. |
| Prior draft KYC | 50 | Hints only; never official truth. |
| AI inference without direct evidence | 20 | Suggested interpretation only, low confidence. |

| Recommendation | Reasoning | Tradeoffs | Complexity | Estimated implementation effort |
|---|---|---|---|---|
| Encode source trust score into retrieval ranking. | Signed documents should outrank notes and AI drafts. | Lower-trust but recent notes may be important; recency should be a secondary factor. | Medium | 1-2 days |
| Use conflict rules: SOW beats notes, newer approved records beat older snapshots. | Prevents AI from treating all sources equally. | Requires conflict detection and user-visible notes. | Medium | 1-2 days |
| Mark unsupported claims as insufficient evidence. | Avoids hallucinated market/client facts when external research is disabled. | Some fields may look incomplete in demos unless enough reference data is uploaded. | Low | 0.5-1 day |

## 10. Fathom Data Utilization Plan

Current implementation evidence:

- Fathom imported item review/redaction exists in `backend/app/services/integrations.py`.
- Approved Fathom items can create timeline events.
- Fathom task suggestions exist and can be approved/rejected.

| Recommendation | Reasoning | Tradeoffs | Complexity | Estimated implementation effort |
|---|---|---|---|---|
| Use only reviewed/redacted Fathom items in KYC retrieval. | Meeting transcripts/summaries can contain sensitive or inaccurate content. Review gate protects KYC quality. | Extra review step; safer data. | Medium | 1-2 days |
| Convert Fathom summaries/action items into retrievable chunks. | Meeting intelligence is valuable for stakeholder details, risks, commitments, and follow-ups. | Needs source mapping and citation routes. | Medium | 1-2 days |
| Do not use raw Fathom transcript text by default. | Reduces risk of sensitive leakage and noisy prompts. | Less detail if summaries are thin. | Low | 0.5 day |
| Cite Fathom as meeting evidence with review status. | Reviewers need to know where stakeholder/action-item facts came from. | Requires citation UI labels. | Medium | 1 day |

## 11. Risks

| Risk | Severity | Recommendation | Reasoning | Tradeoffs | Complexity | Estimated implementation effort |
|---|---|---|---|---|---|---|
| OpenAI cost drift from retries/large prompts | High | Add budgets, token caps, and retry limits before provider calls. | Cost can grow quickly with repeated KYC refreshes. | May reject some useful large contexts. | Medium | 1-2 days |
| Sensitive data leakage | Critical | RBAC-filter retrieval and redact logs/prompts. | KYC includes commercial/payment/margin fields. | May reduce output detail. | High | 2-4 days |
| Weak KYC due missing external research | Medium | Use uploaded reference docs and mark missing evidence. | OpenAI cannot cite facts not supplied in context. | Demo may show incomplete market research without reference docs. | Medium | 1-2 days |
| OCR quality issues | Medium | Store OCR confidence/status and allow manual correction. | Scanned PDFs vary widely. | More UI and review logic. | Medium | 2-3 days |
| Vector search returns wrong chunks | High | Hybrid ranking and citation validation. | Semantic search can retrieve plausible but wrong context. | More ranking logic. | Medium | 2-3 days |
| Source plan drift | Medium | Update `docs/plans/ai-kyc-pipeline-implementation-plan.md` before implementation. | The current plan still has older provider/source language. | Extra doc pass. | Low | 0.5 day |

## 12. Simplified MVP Approach

Recommended MVP for Phase 1 to 4:

1. Phase 1: Update plan/spec alignment and add configuration decisions.
2. Phase 2: Extract PDF/DOCX/text from existing SOW/source documents; add OCR with local Tesseract if available.
3. Phase 3: Store chunks and embeddings with pgvector; hybrid retrieval with source trust ranking.
4. Phase 4: Add OpenAI adapter with mocked tests, strict output schema, token/budget caps, and no web search.

| Recommendation | Reasoning | Tradeoffs | Complexity | Estimated implementation effort |
|---|---|---|---|---|
| Use one KYC generation call for all five workstreams in MVP. | Faster implementation and lower cost. | Less granular retries. | Medium | 2-3 days |
| Start with top 25-35 chunks per account. | Good balance of evidence and cost. | May miss rare facts. | Medium | 1 day tuning |
| Use local OCR only. | Satisfies OCR requirement without external vendor. | Quality limitations. | Medium | 2-3 days |
| Use pgvector if available, otherwise pause before substituting another vector DB. | Avoids surprise architecture expansion. | Blocks vector phase if extension is unavailable. | Medium | 0.5 day verification |

Estimated MVP effort for Phase 1 to 4: 10-16 engineering days, depending on existing SOW file accessibility and pgvector/OCR availability.

## 13. Production-Ready Approach

Production-ready Phase 1 to 4 additions:

| Recommendation | Reasoning | Tradeoffs | Complexity | Estimated implementation effort |
|---|---|---|---|---|
| Per-workstream generation with independent schema validation. | Better retry, status, and partial success behavior. | More OpenAI calls and orchestration. | High | 4-6 days |
| Dedicated extraction review workflow. | Prevents bad OCR/extraction text from polluting KYC. | Adds UI and reviewer workload. | High | 4-7 days |
| Separate vector retrieval evaluation tests. | Prevents silent retrieval quality regression. | Requires test fixtures and expected rankings. | Medium | 2-3 days |
| Source redaction policy per field/source type. | Stronger protection for commercial terms and meeting notes. | More RBAC complexity. | High | 3-5 days |
| Strong model fallback for KAM Head only. | Allows quality rerun for executive accounts. | Higher cost and governance needs. | Medium | 1-2 days |

Estimated production-ready effort for Phase 1 to 4: 20-32 engineering days.

## 14. Recommended Implementation Order

| Order | Recommendation | Reasoning | Tradeoffs | Complexity | Estimated implementation effort |
|---:|---|---|---|---|---|
| 1 | Update the main AI KYC implementation plan to remove stale Qwen/custom-gateway/external-source language for Phase 1-4. | Prevents implementation drift. | Small delay before coding. | Low | 0.5 day |
| 2 | Verify SOW/source-document file accessibility. | Extraction design depends on whether files are stored or only metadata exists. | May expose a prerequisite upload/storage gap. | Medium | 1 day |
| 3 | Verify pgvector and OCR availability in Docker/local environment. | Phase 2-3 scope depends on available system services. | May require Docker/package changes later. | Medium | 0.5-1 day |
| 4 | Add env/config validation plan for OpenAI and budgets. | Provider calls must fail safely before any spend. | No visible user feature yet. | Low | 1 day |
| 5 | Implement extraction first. | RAG and citations need extracted text. | Delays OpenAI demo but builds the foundation. | Medium | 3-5 days |
| 6 | Implement chunking/embedding/retrieval. | OpenAI should receive only relevant, trusted context. | Requires tuning and tests. | Medium | 3-5 days |
| 7 | Implement OpenAI adapter with mocked tests. | Keeps real spend out of tests and validates schema. | Real quality tuning still later. | Medium | 3-4 days |
| 8 | Run a controlled local smoke test with one account/SOW and strict budget cap. | Confirms end-to-end readiness before Phase 5+. | May reveal prompt/schema gaps. | Medium | 1 day |

Final readiness recommendation:

Proceed with Phase 1 only after first updating the main AI KYC plan to match the latest product decisions. Then implement Phase 2 and Phase 3 before Phase 4, because OpenAI generation without extracted/chunked evidence would recreate the current weak one-line KYC problem with a more expensive provider.

## Phase 1-4 Completion Note - 2026-06-03

Status:
- Phase 1, Phase 2, Phase 3, and Phase 4 have been implemented.

Implemented decisions:
- OpenAI is the configured live provider through `.env`/Docker environment variables.
- Tests and offline mode use the deterministic adapter and local hash embeddings to avoid real AI spend.
- OCR support was added through Tesseract and Poppler in the backend Docker image.
- Source retrieval ranks trusted documents higher than lower-trust sources and filters sensitive context by RBAC.
- Direct external research providers and LinkedIn scraping were not implemented.

Verification:
- Focused AI KYC tests: 9 passed.
- Full backend tests with deterministic provider: 108 passed.
- Backend Docker image rebuilt successfully.
- Backend OpenAPI endpoint returned HTTP 200.
- Live Postgres contains the extraction and chunk tables.

Remaining recommended order:
1. Phase 5 strict output schema and prompt tuning against the provided reference KYC/SOW documents.
2. Phase 6 Redis/Celery async worker lifecycle.
3. Phase 7 review/approval UX refinements.
4. Phase 8 citation and extraction UI enhancements.
