import * as Dialog from '@radix-ui/react-dialog'
import { Archive, Check, ExternalLink, FileText, Loader2, MessageSquare, Plus, Send, Sparkles, X } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAuth } from '@/contexts/AuthContext'
import {
  createKamAiChatSession,
  getKamAiChatSession,
  KamAiChatMessage,
  KamAiChatSession,
  KamAiChatSessionDetail,
  listKamAiChatSessions,
  sendKamAiChatMessage,
  updateKamAiChatSession,
} from '@/services/kamAiChat'
import { useUIStore } from '@/stores/uiStore'
import { cn } from '@/utils/cn'
import { formatCompactCurrency, formatCurrency, formatRelative, titleize } from '@/utils/formatters'

const DEFAULT_SCOPES = ['timeline', 'opportunities', 'governance', 'notes', 'kyc', 'documents']
const SCOPE_OPTIONS = [
  { label: 'Timeline', value: 'timeline' },
  { label: 'Opportunities', value: 'opportunities' },
  { label: 'Governance', value: 'governance' },
  { label: 'Notes', value: 'notes' },
  { label: 'KYC', value: 'kyc' },
  { label: 'Documents', value: 'documents' },
  { label: 'Signals', value: 'signals' },
  { label: 'Tasks', value: 'tasks' },
]

interface ForecastChartPoint {
  month: string
  baseline_revenue?: number
  weighted_opportunity?: number
  growth_adjustment?: number
  risk_adjustment?: number
  forecast_revenue?: number
  health?: number
  open_opportunities?: number
}

interface ForecastChartPayload {
  title?: string
  summary?: string
  points?: ForecastChartPoint[]
  months?: number
  scope?: string
  confidence?: string
  trend_label?: string
  totals?: {
    account_count?: number
    active_sow_count?: number
    open_opportunities?: number
    baseline_revenue?: number
    weighted_opportunity?: number
    growth_adjustment?: number
    risk_adjustment?: number
    forecast_revenue?: number
  }
  highlights?: string[]
  missing_data?: string[]
  recommended_actions?: string[]
  disclaimer?: string
}

export function KAMAIPanel() {
  const open = useUIStore(state => state.aiOpen)
  const prefill = useUIStore(state => state.aiPrefill)
  const setAIPrefill = useUIStore(state => state.setAIPrefill)
  const activeAccountId = useUIStore(state => state.activeAccountId)
  const closeAI = useUIStore(state => state.closeAI)
  const { token } = useAuth()
  const [sessions, setSessions] = useState<KamAiChatSession[]>([])
  const [activeSession, setActiveSession] = useState<KamAiChatSessionDetail | null>(null)
  const [scopes, setScopes] = useState<string[]>(DEFAULT_SCOPES)
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const input = prefill

  useEffect(() => {
    if (!open || !token) return
    void loadSessions()
  }, [open, token])

  useEffect(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [activeSession?.messages.length, sending])

  const activeMessages = activeSession?.messages ?? []
  const selectedScopeSet = useMemo(() => new Set(scopes), [scopes])

  async function loadSessions() {
    if (!token) return
    setLoadingSessions(true)
    setError('')
    try {
      const page = await listKamAiChatSessions(token, { pageSize: 50 })
      setSessions(page.items)
      if (page.items.length) {
        const detail = await getKamAiChatSession(token, page.items[0].id)
        setActiveSession(detail)
        setScopes(detail.scope_json.length ? detail.scope_json : DEFAULT_SCOPES)
      } else {
        const detail = await createKamAiChatSession(token, { title: 'New KAM AI chat', account_id: activeAccountId === 'amd-001' ? undefined : activeAccountId, scopes: DEFAULT_SCOPES })
        setActiveSession(detail)
        setSessions([detail])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load KAM AI sessions')
    } finally {
      setLoadingSessions(false)
    }
  }

  async function createNewChat() {
    if (!token) return
    setSending(false)
    setError('')
    try {
      const detail = await createKamAiChatSession(token, { title: 'New KAM AI chat', account_id: activeAccountId === 'amd-001' ? undefined : activeAccountId, scopes })
      setActiveSession(detail)
      setSessions(current => [detail, ...current])
      setAIPrefill('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create a new KAM AI chat')
    }
  }

  async function loadSession(sessionId: string) {
    if (!token) return
    setError('')
    try {
      const detail = await getKamAiChatSession(token, sessionId)
      setActiveSession(detail)
      setScopes(detail.scope_json.length ? detail.scope_json : DEFAULT_SCOPES)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load KAM AI chat')
    }
  }

  async function archiveActiveSession() {
    if (!token || !activeSession) return
    setError('')
    try {
      await updateKamAiChatSession(token, activeSession.id, { archived: true })
      const remaining = sessions.filter(session => session.id !== activeSession.id)
      setSessions(remaining)
      if (remaining.length) await loadSession(remaining[0].id)
      else await createNewChat()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to archive KAM AI chat')
    }
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault()
    const content = input.trim()
    if (!content || !token) return
    let session = activeSession
    setSending(true)
    setError('')
    setAIPrefill('')
    try {
      if (!session) {
        session = await createKamAiChatSession(token, { title: 'New KAM AI chat', scopes })
        setActiveSession(session)
      }
      const optimistic: KamAiChatSessionDetail = {
        ...session,
        messages: [
          ...session.messages,
          {
            id: `pending-user-${Date.now()}`,
            session_id: session.id,
            role: 'user',
            content,
            status: 'complete',
            token_usage_json: {},
            metadata_json: {},
            sources: [],
            created_at: new Date().toISOString(),
          },
          {
            id: `pending-assistant-${Date.now()}`,
            session_id: session.id,
            role: 'assistant',
            content: 'Thinking across authorized source records...',
            status: 'running',
            token_usage_json: {},
            metadata_json: {},
            sources: [],
            created_at: new Date().toISOString(),
          },
        ],
      }
      setActiveSession(optimistic)
      const detail = await sendKamAiChatMessage(token, session.id, {
        content,
        scopes,
        document_search: scopes.includes('documents'),
        limit: 12,
      })
      setActiveSession(detail)
      setSessions(current => [detail, ...current.filter(item => item.id !== detail.id)])
    } catch (err) {
      setAIPrefill(content)
      setError(err instanceof Error ? err.message : 'KAM AI could not answer this message')
    } finally {
      setSending(false)
    }
  }

  function toggleScope(scope: string) {
    setScopes(current => {
      if (current.includes(scope)) return current.length === 1 ? current : current.filter(item => item !== scope)
      return [...current, scope]
    })
  }

  return (
    <Dialog.Root open={open} onOpenChange={value => !value && closeAI()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/25 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 grid h-[100dvh] w-full max-w-[1100px] grid-cols-1 overflow-hidden border-l border-surface-border bg-white shadow-2xl md:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="hidden min-h-0 border-r border-surface-border bg-surface-secondary md:flex md:flex-col">
            <div className="border-b border-surface-border p-3">
              <button type="button" onClick={createNewChat} className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md bg-brand-blue px-3 text-sm font-semibold text-white hover:bg-brand-blue-dark">
                <Plus className="h-4 w-4" />
                New chat
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {loadingSessions ? <SessionSkeleton /> : null}
              {!loadingSessions && sessions.length === 0 ? <p className="p-3 text-sm text-ink-secondary">No KAM AI sessions yet.</p> : null}
              {sessions.map(session => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => loadSession(session.id)}
                  className={cn(
                    'mb-1 w-full rounded-md border px-3 py-2 text-left transition-colors',
                    activeSession?.id === session.id ? 'border-brand-blue bg-white text-ink shadow-sm' : 'border-transparent text-ink-secondary hover:bg-white hover:text-ink',
                  )}
                >
                  <span className="block truncate text-sm font-semibold">{session.title}</span>
                  <span className="mt-1 block truncate text-xs">{stripLooseMarkdown(session.last_message_preview || 'Empty chat')}</span>
                  <span className="mt-1 block text-[11px] text-ink-tertiary">{session.last_message_at ? formatRelative(session.last_message_at) : formatRelative(session.created_at)}</span>
                </button>
              ))}
            </div>
          </aside>

          <section className="flex min-h-0 flex-col">
            <header className="flex items-start justify-between gap-4 border-b border-surface-border px-4 py-3">
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">KAM AI</p>
                <Dialog.Title className="truncate font-display text-xl font-bold text-ink">{activeSession?.title ?? 'New KAM AI chat'}</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-ink-secondary">
                  Ask across your assigned projects and authorized source records.
                </Dialog.Description>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" className="tk-icon-button md:hidden" onClick={createNewChat} aria-label="New KAM AI chat">
                  <Plus className="h-4 w-4" />
                </button>
                {activeSession ? (
                  <button type="button" className="tk-icon-button" onClick={archiveActiveSession} aria-label="Archive KAM AI chat" title="Archive chat">
                    <Archive className="h-4 w-4" />
                  </button>
                ) : null}
                <Dialog.Close className="tk-icon-button" aria-label="Close KAM AI">
                  <X className="h-5 w-5" />
                </Dialog.Close>
              </div>
            </header>

            <div className="border-b border-surface-border bg-white px-4 py-2">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {SCOPE_OPTIONS.map(option => {
                  const selected = selectedScopeSet.has(option.value)
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleScope(option.value)}
                      aria-pressed={selected}
                      className={cn(
                        'inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors',
                        selected ? 'border-brand-blue bg-blue-tint-20 text-brand-blue' : 'border-surface-border bg-white text-ink-secondary hover:bg-surface-tertiary',
                      )}
                    >
                      {selected ? <Check className="h-3.5 w-3.5" /> : null}
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <main className="min-h-0 flex-1 overflow-y-auto bg-surface-secondary px-4 py-5">
              {error ? <div className="mb-4 rounded-md border border-rag-red/20 bg-rag-red/10 p-3 text-sm font-medium text-rag-red">{error}</div> : null}
              {!activeMessages.length && !loadingSessions ? <EmptyChat onPrompt={value => setAIPrefill(value)} /> : null}
              <div className="mx-auto flex max-w-3xl flex-col gap-4">
                {activeMessages.map(message => <ChatMessage key={message.id} message={message} />)}
                {sending && activeMessages.every(message => message.status !== 'running') ? <ThinkingMessage /> : null}
                <div ref={messagesEndRef} />
              </div>
            </main>

            <footer className="border-t border-surface-border bg-white p-3">
              <form onSubmit={submit} className="mx-auto flex max-w-3xl items-end gap-2">
                <textarea
                  value={input}
                  onChange={event => setAIPrefill(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      void submit()
                    }
                  }}
                  className="tk-input max-h-36 min-h-[52px] flex-1 resize-none rounded-2xl px-4 py-3"
                  placeholder="Ask about risks, renewals, QBR prep, SOWs, KYC, tasks, or next actions"
                  rows={1}
                />
                <button type="submit" disabled={sending || !input.trim() || !token} className="inline-flex min-h-[52px] min-w-[52px] items-center justify-center rounded-full bg-brand-blue text-white hover:bg-brand-blue-dark disabled:opacity-60" aria-label="Send KAM AI message">
                  {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                </button>
              </form>
            </footer>
          </section>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function EmptyChat({ onPrompt }: { onPrompt: (value: string) => void }) {
  const prompts = [
    'Prioritize my assigned projects by risk and next action',
    'Show renewal risks and notice windows across my projects',
    'Prepare me for upcoming QBRs',
    'Find open escalations and critical tasks',
  ]
  return (
    <div className="mx-auto max-w-3xl rounded-lg border border-surface-border bg-white p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-brand-blue" />
        <h3 className="text-base font-semibold text-ink">Start a KAM AI chat</h3>
      </div>
      <p className="mt-2 text-sm leading-6 text-ink-secondary">Ask across authorized source records. Each answer is saved to this session with citations.</p>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {prompts.map(prompt => (
          <button key={prompt} type="button" onClick={() => onPrompt(prompt)} className="min-h-[44px] rounded-md border border-surface-border bg-surface-secondary px-3 text-left text-sm font-medium text-ink hover:bg-white">
            {prompt}
          </button>
        ))}
      </div>
    </div>
  )
}

function ChatMessage({ message }: { message: KamAiChatMessage }) {
  const isUser = message.role === 'user'
  const metadata = message.metadata_json ?? {}
  const recommended = Array.isArray(metadata.recommended_actions) ? metadata.recommended_actions.map(String) : []
  const missing = Array.isArray(metadata.missing_evidence) ? metadata.missing_evidence.map(String) : []
  const forecastChart = forecastChartFromMetadata(metadata)
  return (
    <article className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[92%] rounded-2xl border px-4 py-3 shadow-sm', isUser ? 'border-brand-blue bg-brand-blue text-white' : 'border-surface-border bg-white text-ink')}>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
          {isUser ? <MessageSquare className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5 text-brand-blue" />}
          <span>{isUser ? 'You' : 'KAM AI'}</span>
          {!isUser && message.status === 'running' ? <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-blue" /> : null}
        </div>
        <MessageContent content={message.content} />
        {!isUser && forecastChart ? <ForecastChartCard chart={forecastChart} /> : null}
        {!isUser && message.status === 'failed' && message.error_message ? <p className="mt-2 rounded-md bg-rag-red/10 p-2 text-xs text-rag-red">{message.error_message}</p> : null}
        {!isUser ? (
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-ink-secondary">
            {message.confidence ? <span className="rounded-full bg-surface-secondary px-2 py-1 capitalize">{message.confidence} confidence</span> : null}
            {message.intent ? <span className="rounded-full bg-surface-secondary px-2 py-1">{titleize(message.intent)}</span> : null}
            {message.model_name ? <span className="rounded-full bg-surface-secondary px-2 py-1">{message.model_name}</span> : null}
          </div>
        ) : null}
        {!isUser && recommended.length ? <MessageList title="Recommended actions" items={recommended} /> : null}
        {!isUser && missing.length ? <MessageList title="Missing evidence" items={missing} muted /> : null}
        {!isUser && message.sources.length ? <SourceList sources={message.sources} /> : null}
      </div>
    </article>
  )
}

function MessageContent({ content }: { content: string }) {
  const blocks = messageBlocks(content)
  return (
    <div className="grid gap-2 text-sm leading-6">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          return <h3 key={`${index}-${block.text.slice(0, 24)}`} className="mt-1 text-base font-bold leading-6 text-ink">{renderInlineBold(block.text)}</h3>
        }
        if (block.type === 'list') {
          return (
            <div key={`${index}-${block.text.slice(0, 24)}`} className="flex gap-2 rounded-md bg-surface-secondary px-3 py-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue" />
              <p className="min-w-0 text-sm leading-6 text-ink-secondary">{renderInlineBold(block.text)}</p>
            </div>
          )
        }
        return <p key={`${index}-${block.text.slice(0, 24)}`} className="text-sm leading-6">{renderInlineBold(block.text)}</p>
      })}
    </div>
  )
}

function renderInlineBold(value: string) {
  const nodes: Array<string | JSX.Element> = []
  const pattern = /\*\*([^*]+)\*\*/g
  let lastIndex = 0
  let match: RegExpExecArray | null = pattern.exec(value)
  while (match) {
    if (match.index > lastIndex) nodes.push(value.slice(lastIndex, match.index))
    nodes.push(
      <strong key={`${match.index}-${match[1]}`} className="font-semibold">
        {match[1]}
      </strong>,
    )
    lastIndex = match.index + match[0].length
    match = pattern.exec(value)
  }
  if (lastIndex < value.length) nodes.push(value.slice(lastIndex))
  return nodes.length ? nodes.map(node => (typeof node === 'string' ? stripLooseMarkdown(node, false) : node)) : stripLooseMarkdown(value, false)
}

function stripLooseMarkdown(value: string, trim = true) {
  const cleaned = value.replace(/[*#`]+/g, '')
  return trim ? cleaned.trim() : cleaned
}

function messageBlocks(content: string): Array<{ type: 'heading' | 'paragraph' | 'list'; text: string }> {
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const heading = line.match(/^#{1,6}\s+(.+)$/)
      if (heading) return { type: 'heading' as const, text: heading[1].trim() }
      const markdownList = line.match(/^[-*]\s+(.+)$/)
      if (markdownList) return { type: 'list' as const, text: markdownList[1].trim() }
      const numberedList = line.match(/^\d+[.)]\s+(.+)$/)
      if (numberedList) return { type: 'list' as const, text: numberedList[1].trim() }
      if (line.length <= 42 && !/[.!?]$/.test(line) && /^[A-Z0-9][\w\s/&-]+$/.test(line)) {
        return { type: 'heading' as const, text: line }
      }
      return { type: 'paragraph' as const, text: line }
    })
}

function MessageList({ title, items, muted = false }: { title: string; items: string[]; muted?: boolean }) {
  return (
    <div className={cn('mt-3 rounded-md p-3', muted ? 'bg-brand-orange/10 text-ink-secondary' : 'bg-blue-tint-20 text-ink')}>
      <p className="text-xs font-bold uppercase tracking-wider">{title}</p>
      <ul className="mt-2 grid gap-1 text-sm leading-5">
        {items.slice(0, 5).map(item => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" />
            <span>{stripLooseMarkdown(item)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ForecastChartCard({ chart }: { chart: ForecastChartPayload }) {
  const points = Array.isArray(chart.points) ? chart.points : []
  const chartData = points.map(point => ({
    month: point.month,
    forecast: Number(point.forecast_revenue ?? 0),
    baseline: Number(point.baseline_revenue ?? 0),
    opportunity: Number(point.weighted_opportunity ?? 0),
  }))
  const totals = chart.totals ?? {}
  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-surface-border bg-white">
      <div className="border-b border-surface-border bg-surface-secondary p-4">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Forecast visualization</p>
        <h3 className="mt-1 text-base font-bold text-ink">{chart.title || 'Forecast Chart'}</h3>
        {chart.summary ? <p className="mt-1 text-sm leading-6 text-ink-secondary">{stripLooseMarkdown(chart.summary)}</p> : null}
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-3">
        <ForecastMetric label="Forecast revenue" value={totals.forecast_revenue} />
        <ForecastMetric label="Baseline" value={totals.baseline_revenue} />
        <ForecastMetric label="Weighted pipeline" value={totals.weighted_opportunity} />
      </div>
      {chartData.length ? (
        <div className="h-[260px] px-2 pb-4 text-brand-blue" role="img" aria-label="KAM AI six-month forecast chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 12, right: 16, bottom: 6, left: 6 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d9e2ec" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={value => formatCompactCurrency(Number(value))} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={58} />
              <Tooltip formatter={value => formatCurrency(Number(value))} labelClassName="font-semibold text-ink" />
              <Line type="monotone" dataKey="forecast" name="Forecast revenue" stroke="#0066b3" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="baseline" name="Baseline revenue" stroke="#f97316" strokeWidth={2} dot={false} strokeDasharray="5 5" />
              <Line type="monotone" dataKey="opportunity" name="Weighted opportunity" stroke="#22c55e" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="px-4 pb-4 text-sm font-medium text-ink-secondary">No chart points are available for this forecast.</p>
      )}
    </section>
  )
}

function ForecastMetric({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-secondary p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-ink-secondary">{label}</p>
      <p className="mt-1 text-lg font-bold text-ink">{formatCompactCurrency(Number(value ?? 0))}</p>
    </div>
  )
}

function forecastChartFromMetadata(metadata: Record<string, unknown>): ForecastChartPayload | null {
  const value = metadata.forecast_chart
  if (!value || typeof value !== 'object') return null
  const chart = value as ForecastChartPayload
  return Array.isArray(chart.points) ? chart : null
}

function SourceList({ sources }: { sources: KamAiChatMessage['sources'] }) {
  return (
    <details className="mt-3 rounded-md border border-surface-border bg-surface-secondary p-3">
      <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-brand-blue">Sources ({sources.length})</summary>
      <div className="mt-3 grid gap-2">
        {sources.map(source => (
          <article key={source.id} className="rounded-md border border-surface-border bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-brand-blue">[{source.citation_index}] {titleize(source.source_type)}</p>
                <h4 className="mt-1 text-sm font-semibold text-ink">{source.title}</h4>
                <p className="mt-1 line-clamp-3 text-xs leading-5 text-ink-secondary">{source.excerpt}</p>
                <p className="mt-2 text-[11px] text-ink-tertiary">{source.account_name || 'Account'} | score {Math.round(source.relevance_score)}</p>
              </div>
              {source.source_route ? (
                <Link to={source.source_route} className="tk-icon-button shrink-0 bg-white" title="Open source">
                  <ExternalLink className="h-4 w-4" />
                </Link>
              ) : <FileText className="h-4 w-4 shrink-0 text-ink-tertiary" />}
            </div>
          </article>
        ))}
      </div>
    </details>
  )
}

function ThinkingMessage() {
  return (
    <article className="flex justify-start">
      <div className="rounded-2xl border border-surface-border bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-medium text-ink-secondary">
          <Loader2 className="h-4 w-4 animate-spin text-brand-blue" />
          Searching authorized sources and preparing an answer...
        </div>
      </div>
    </article>
  )
}

function SessionSkeleton() {
  return (
    <div className="grid gap-2 p-2">
      {[0, 1, 2].map(item => <div key={item} className="h-16 animate-pulse-soft rounded-md bg-surface-border" />)}
    </div>
  )
}
