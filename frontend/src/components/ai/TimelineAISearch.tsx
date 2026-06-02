import * as Collapsible from '@radix-ui/react-collapsible'
import * as Dialog from '@radix-ui/react-dialog'
import { Check, ChevronDown, FileSearch, Loader2, Search, Sparkles, X } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { AISearchResult, INTENT_EXAMPLES, INTENT_KEYS } from '@/services/aiSearch'
import { SemanticDocumentChunk } from '@/services/semanticDocumentSearch'
import { runTimelineAiSearch } from '@/services/timeline'
import { useUIStore } from '@/stores/uiStore'
import { TimelineEntry } from '@/types/timeline'
import { cn } from '@/utils/cn'
import { formatRelative, titleize } from '@/utils/formatters'

interface Props {
  accountId: string
}

export function TimelineAISearch({ accountId }: Props) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AISearchResult | null>(null)
  const [searchDocuments, setSearchDocuments] = useState(false)
  const [docResults, setDocResults] = useState<SemanticDocumentChunk[]>([])
  const [selectedDoc, setSelectedDoc] = useState<SemanticDocumentChunk | null>(null)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const { token } = useAuth()
  const openAI = useUIStore(state => state.openAI)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 400)
    return () => window.clearTimeout(timer)
  }, [query])

  const suggestions = useMemo(() => {
    const normalized = debouncedQuery.replace('@', '').toLowerCase().trim()
    if (!focused && !normalized) return []
    if (!normalized || debouncedQuery.trim() === '@') return INTENT_KEYS.slice(0, 6)
    return INTENT_KEYS.filter(item => item.includes(normalized)).slice(0, 6)
  }, [debouncedQuery, focused])

  async function submit(nextQuery = query) {
    const trimmed = nextQuery.trim()
    if (!trimmed) return
    if (!token) return
    setLoading(true)
    setSourcesOpen(false)
    try {
      const answer = await runTimelineAiSearch(token, accountId, {
        query: trimmed,
        scopes: ['timeline', 'opportunities', 'escalations', 'governance', 'notes', 'kyc'],
        document_search: searchDocuments,
        limit: 10,
      })
      setDocResults(answer.document_results.map((item, index) => ({
        id: item.id,
        accountId,
        entryId: item.id,
        documentName: item.source_label,
        pageNumber: 1,
        excerpt: item.excerpt,
        sourceLabel: item.source_label,
        score: index + 1,
      })))
      setResult({
        answer: answer.answer,
        sourceEntries: answer.results.map(item => ({
          id: item.id,
          accountId,
          eventType: item.event_type as TimelineEntry['eventType'],
          module: item.source_module as TimelineEntry['module'],
          title: item.title,
          description: item.excerpt,
          performedBy: 'system',
          performedByName: 'Authorized timeline source',
          timestamp: item.event_at,
          sourceRecordRoute: item.source_route ?? undefined,
          isSensitive: false,
          isSystemGenerated: true,
          isImmutable: true,
        })),
        queryIntent: `${titleize(answer.mode)}: ${titleize(answer.interpreted_intent)}`,
        confidence: answer.confidence,
        disclaimer: answer.disclaimer,
      })
    } catch (err) {
      setDocResults([])
      setResult({
        answer: err instanceof Error ? err.message : 'AI Timeline Search could not run.',
        sourceEntries: [],
        queryIntent: 'Error',
        confidence: 'low',
        disclaimer: 'Try again or use standard timeline search.',
      })
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    submit()
  }

  function chooseSuggestion(value: string) {
    setQuery(value)
    setFocused(false)
    submit(value)
  }

  return (
    <section className="tk-card p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-tint-20 text-brand-blue">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Phase 2 Intelligence</p>
              <h3 className="text-base font-semibold text-ink">AI-powered timeline search</h3>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => window.setTimeout(() => setFocused(false), 140)}
              placeholder="Ask timeline questions or type @ for structured intents"
              className="tk-input rounded-full pl-10 pr-24 focus:ring-brand-blue/30"
            />
            <button type="submit" className="absolute right-1 top-1/2 inline-flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center gap-1 rounded-full bg-brand-blue px-4 text-xs font-semibold text-white hover:bg-brand-blue-dark">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Ask
            </button>
            {suggestions.length ? (
              <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 rounded-lg border border-surface-border bg-white p-2 shadow-panel">
                {suggestions.map(item => (
                  <button
                    key={item}
                    type="button"
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => chooseSuggestion(item)}
                    className="flex min-h-[44px] w-full items-center justify-between rounded-md px-3 text-left text-sm font-medium text-ink hover:bg-surface-tertiary"
                  >
                    {item}
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-blue">Structured</span>
                  </button>
                ))}
              </div>
            ) : null}
          </form>
          <label className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-md border border-surface-border bg-white px-3 text-sm font-semibold text-ink">
            <input type="checkbox" checked={searchDocuments} onChange={event => setSearchDocuments(event.target.checked)} className="peer sr-only" />
            <span className="flex h-5 w-5 items-center justify-center rounded-sm border border-surface-border bg-white text-white peer-checked:border-brand-blue peer-checked:bg-brand-blue">
              <Check className="h-3 w-3" />
            </span>
            <FileSearch className="h-4 w-4 text-brand-blue" />
            Search documents
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            {INTENT_EXAMPLES.slice(0, 4).map(example => (
              <button
                key={example}
                type="button"
                onClick={() => chooseSuggestion(example)}
                className="rounded-full border border-surface-border bg-white px-3 py-2 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-tertiary hover:text-ink"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
        <button className="tk-button-secondary shrink-0" onClick={() => openAI(query || INTENT_EXAMPLES[0], accountId)}>
          Try in KAM AI
        </button>
      </div>

      {loading ? (
        <div className="mt-5 overflow-hidden rounded-lg border border-surface-border bg-surface-tertiary p-4">
          <div className="h-4 w-2/3 animate-pulse-soft rounded bg-surface-border" />
          <div className="mt-3 h-4 w-full animate-pulse-soft rounded bg-surface-border" />
          <div className="mt-2 h-4 w-5/6 animate-pulse-soft rounded bg-surface-border" />
        </div>
      ) : null}

      {result && !loading ? (
        <div className="mt-5 rounded-xl border border-brand-blue/20 bg-blue-tint-20 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-brand-blue px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-white">{result.queryIntent}</span>
                <span className="rounded-full border border-surface-border bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">{result.confidence} confidence</span>
              </div>
              <p className="text-sm leading-6 text-ink">{result.answer}</p>
              {result.disclaimer ? <p className="mt-2 text-xs font-medium text-ink-secondary">{result.disclaimer}</p> : null}
            </div>
            <button
              className="tk-icon-button bg-white"
              onClick={() => {
                setResult(null)
                setDocResults([])
              }}
              aria-label="Clear AI search"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <Collapsible.Root open={sourcesOpen} onOpenChange={setSourcesOpen} className="mt-3">
            <Collapsible.Trigger className="inline-flex min-h-[44px] items-center gap-1 text-xs font-semibold text-brand-blue">
              Based on {result.sourceEntries.length} events
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', sourcesOpen ? 'rotate-180' : '')} />
            </Collapsible.Trigger>
            <Collapsible.Content className="grid gap-2 md:grid-cols-2">
              {result.sourceEntries.length ? (
                result.sourceEntries.map(entry => (
                  <article key={entry.id} className="rounded-lg border border-surface-border bg-white p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-blue">{titleize(entry.eventType)} | {entry.id}</p>
                    <h4 className="mt-1 text-sm font-semibold text-ink">{entry.title}</h4>
                    <p className="mt-1 line-clamp-2 text-xs text-ink-secondary">{entry.description}</p>
                    <p className="mt-2 text-xs text-ink-tertiary">{formatRelative(entry.timestamp)} by {entry.performedByName}</p>
                  </article>
                ))
              ) : (
                <p className="rounded-lg border border-surface-border bg-white p-3 text-sm text-ink-secondary">No visible source entries matched this query.</p>
              )}
            </Collapsible.Content>
          </Collapsible.Root>

          {searchDocuments ? (
            <Collapsible.Root className="mt-3" defaultOpen={docResults.length > 0}>
              <Collapsible.Trigger className="inline-flex min-h-[44px] items-center gap-1 text-xs font-semibold text-brand-blue">
                Document sources ({docResults.length})
                <FileSearch className="h-3.5 w-3.5" />
              </Collapsible.Trigger>
              <Collapsible.Content className="grid gap-2 md:grid-cols-2">
                {docResults.length ? (
                  docResults.map(chunk => (
                    <button
                      key={chunk.id}
                      type="button"
                      onClick={() => setSelectedDoc(chunk)}
                      className="rounded-lg border border-surface-border bg-white p-3 text-left transition-colors hover:bg-surface-tertiary"
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-blue">{chunk.sourceLabel}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-ink-secondary">{chunk.excerpt}</p>
                    </button>
                  ))
                ) : (
                  <p className="rounded-lg border border-surface-border bg-white p-3 text-sm text-ink-secondary">No visible document chunks matched this query.</p>
                )}
              </Collapsible.Content>
            </Collapsible.Root>
          ) : null}
        </div>
      ) : null}

      <Dialog.Root open={Boolean(selectedDoc)} onOpenChange={open => !open && setSelectedDoc(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/30" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-surface-border bg-white p-6 shadow-panel">
            {selectedDoc ? (
              <>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Document viewer</p>
                    <Dialog.Title className="text-base font-semibold text-ink">{selectedDoc.documentName}</Dialog.Title>
                    <Dialog.Description className="mt-1 text-sm text-ink-secondary">Page {selectedDoc.pageNumber} | Linked timeline entry {selectedDoc.entryId}</Dialog.Description>
                  </div>
                  <Dialog.Close className="tk-icon-button" aria-label="Close document viewer">
                    <X className="h-4 w-4" />
                  </Dialog.Close>
                </div>
                <div className="rounded-lg border border-surface-border bg-surface-tertiary p-4 text-sm leading-6 text-ink-secondary">
                  {selectedDoc.excerpt}
                </div>
              </>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  )
}
