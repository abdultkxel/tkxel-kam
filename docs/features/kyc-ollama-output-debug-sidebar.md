# KYC Ollama Output And Debug Sidebar

## Scope

Adds a KYC review surface that shows the generated Ollama/Qwen KYC output, current extracted KYC fields, citations, and compliant research-source status in a fixed-height CKEditor. A companion sidebar shows stored prompt, raw response, source, and processing logs for new KYC runs. Runtime prompt sections are persisted before the local Qwen/Ollama request starts, so the sidebar can show the prompt while the run is still running; raw responses appear after Ollama returns.

## Decisions

- Tavily remains the compliant web-search provider for public web, news, blogs, business pages, and public Reddit results when returned by Tavily.
- Direct Google scraping is not used.
- LinkedIn is not scraped or cited without approved official API/data-provider access.
- ZoomInfo is not queried unless approved API credentials are configured.
- Prompt and raw response logs are stored on KYC run retrieval metadata for reviewer/debug visibility.
- Running KYC runs persist prepared prompt sections and runtime Qwen/Ollama events before provider execution so long local model calls can be inspected during processing.

## Data Model Notes

- Standard Ollama KYC runs store `retrieval_summary_json.ollama_debug`.
- Tavily/Ollama research runs store `retrieval_summary_json.research_debug`.
- Approved snapshots keep the appended detailed KYC response through existing snapshot versioning.

## UI Notes

- `KYCAssistedReview` renders a fixed-height read-only CKEditor for the generated KYC body.
- `KYCAssistedReview` renders a fixed-height read-only CKEditor sidebar for prompt/response logs.
- `KYCAssistedReview` quietly polls KYC data while the latest run is pending/running so runtime events and prompts appear without a manual refresh.
- Existing editable KYC fields and detailed description remain the reviewer-editable source for approval.
- The global KYC header now exposes `New draft` beside the approval controls.
- Completed and running local KYC runs expose a `Re-run Qwen` action in the Local AI run status card. The action refreshes the linked run and preserves previous output while the new run is pending/running. If the previous running run has exceeded the configured timeout, the backend releases it as failed before queueing the replacement run.
- The local Qwen prompt explicitly asks for maximum detail from extracted document text and approved Tavily/API-backed web research context, while blocking direct Google scraping, unofficial LinkedIn scraping, and uncredentialed ZoomInfo usage.

## Tests

- `docker compose exec -T frontend npm test -- src/components/account/KYCAssistedReview.test.tsx`
- `docker compose exec -T frontend npm run typecheck`
- `docker compose exec -T backend pytest tests/test_tavily_kyc_research.py -q`
- `docker compose exec -T backend pytest tests/test_ai_kyc_pipeline_phase_1_to_4.py -q`
- `docker compose exec -T backend python -m compileall app/services/kyc.py app/services/kyc_gateway.py app/services/tavily_research.py`
