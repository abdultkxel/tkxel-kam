import * as Collapsible from '@radix-ui/react-collapsible'
import * as Dialog from '@radix-ui/react-dialog'
import { ArrowRight, BarChart3, Check, ChevronDown, FileSearch, History, Loader2, Search, Sparkles, TrendingUp, X } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useRole } from '@/hooks/useRole'
import { AISearchResult, AISearchScope, INTENT_EXAMPLES, runAISearch } from '@/services/aiSearch'
import { searchDocumentChunks, SemanticDocumentChunk } from '@/services/semanticDocumentSearch'
import { useAccountStore } from '@/stores/accountStore'
import { AIQueryRun, useAIStore } from '@/stores/aiStore'
import { useOpportunityStore } from '@/stores/opportunityStore'
import { useTimelineStore } from '@/stores/timelineStore'
import { useUIStore } from '@/stores/uiStore'
import { Account } from '@/types/account'
import { Opportunity } from '@/types/opportunity'
import { TimelineEntry } from '@/types/timeline'
import { cn } from '@/utils/cn'
import { formatCompactCurrency, formatRelative, titleize } from '@/utils/formatters'

const scopeOptions: { label: string; value: AISearchScope }[] = [
  { label: 'Timeline', value: 'timeline' },
  { label: 'Opportunities', value: 'opportunities' },
  { label: 'Governance', value: 'governance' },
  { label: 'Notes', value: 'notes' },
  { label: 'KYC', value: 'kyc' },
]

const EMPTY_QUERY_RUNS: AIQueryRun[] = []

type ForecastPoint = {
  month: string
  arr: number
  health: number
  pipeline: number
}

type ForecastResult = {
  title: string
  summary: string
  points: ForecastPoint[]
  highlights: string[]
}

export function KAMAIPanel() {
  const open = useUIStore(state => state.aiOpen)
  const prefill = useUIStore(state => state.aiPrefill)
  const accountId = useUIStore(state => state.activeAccountId)
  const closeAI = useUIStore(state => state.closeAI)
  const setActiveAccountId = useUIStore(state => state.setActiveAccountId)
  const [input, setInput] = useState(prefill)
  const [scopes, setScopes] = useState<AISearchScope[]>(['timeline', 'opportunities', 'governance', 'notes', 'kyc'])
  const [searchDocuments, setSearchDocuments] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AISearchResult | null>(null)
  const [docResults, setDocResults] = useState<SemanticDocumentChunk[]>([])
  const [forecastResult, setForecastResult] = useState<ForecastResult | null>(null)
  const [sourcesOpen, setSourcesOpen] = useState(true)
  const [documentsOpen, setDocumentsOpen] = useState(true)
  const user = useRole()
  const queryRuns = useAIStore(state => state.queryRuns[accountId] ?? EMPTY_QUERY_RUNS)
  const addQueryRun = useAIStore(state => state.addQueryRun)
  const accounts = useAccountStore(state => state.accounts)
  const opportunities = useOpportunityStore(state => state.opportunities)
  const timelineEntries = useTimelineStore(state => state.entries)

  const activeAccount = useMemo(() => accounts.find(account => account.id === accountId) ?? accounts[0], [accountId, accounts])
  const accountTimeline = useMemo(() => timelineEntries.filter(entry => entry.accountId === activeAccount?.id), [activeAccount?.id, timelineEntries])
  const accountOpportunities = useMemo(() => opportunities.filter(opportunity => opportunity.accountId === activeAccount?.id), [activeAccount?.id, opportunities])

  useEffect(() => {
    setInput(prefill)
  }, [prefill])

  useEffect(() => {
    setResult(null)
    setDocResults([])
    setForecastResult(null)
  }, [accountId])

  function toggleScope(scope: AISearchScope) {
    setScopes(current => {
      if (current.includes(scope)) return current.length === 1 ? current : current.filter(item => item !== scope)
      return [...current, scope]
    })
  }

  async function runQuery(nextQuery = input) {
    const trimmed = nextQuery.trim()
    if (!trimmed || !activeAccount) return
    setInput(trimmed)
    setLoading(true)
    setSourcesOpen(true)
    setDocumentsOpen(true)

    try {
      await new Promise(resolve => window.setTimeout(resolve, 320))
      const forecast = shouldRenderForecast(trimmed) ? buildForecastResult(activeAccount, accountOpportunities) : null
      const answer = forecast
        ? buildForecastAISearchResult(forecast, accountTimeline)
        : await runAISearch(
            {
              accountId: activeAccount.id,
              query: trimmed,
              scope: scopes,
              role: user.role,
              userId: user.id,
            },
            { timeline: timelineEntries, opportunities, accounts },
          )
      const documentMatches = searchDocuments
        ? searchDocumentChunks({
            accountId: activeAccount.id,
            query: trimmed,
            role: user.role,
            userId: user.id,
            entries: timelineEntries,
          })
        : []

      setResult(answer)
      setDocResults(documentMatches)
      setForecastResult(forecast)
      addQueryRun({
        id: `ai-run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        accountId: activeAccount.id,
        query: trimmed,
        answer: answer.answer,
        intent: answer.queryIntent,
        confidence: answer.confidence,
        sourceEntryIds: answer.sourceEntries.map(entry => entry.id),
        documentSourceIds: documentMatches.map(chunk => chunk.id),
        createdAt: new Date().toISOString(),
      })
    } finally {
      setLoading(false)
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    runQuery()
  }

  return (
    <Dialog.Root open={open} onOpenChange={value => !value && closeAI()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/20" />
        <Dialog.Content className="fixed bottom-4 right-4 z-50 flex h-[min(820px,calc(100vh-2rem))] w-[min(760px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-surface-border bg-white shadow-ai">
          <div className="flex items-start justify-between gap-4 border-b border-surface-border px-5 py-4">
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">KAM AI</p>
              <Dialog.Title className="font-display text-2xl font-bold leading-tight text-ink">AI Query Dashboard</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-secondary">
                Ask source-backed questions across account history, tasks, governance, KYC, and documents.
              </Dialog.Description>
            </div>
            <Dialog.Close className="tk-icon-button shrink-0" aria-label="Close KAM AI">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <section className="rounded-xl border border-surface-border bg-surface-secondary p-4">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_190px_120px] md:items-end">
                <label className="space-y-1">
                  <span className="tk-label text-xs">Account context</span>
                  <select className="tk-input" value={activeAccount?.id ?? ''} onChange={event => setActiveAccountId(event.target.value)}>
                    {accounts.map(account => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </label>
                <AccountStat label="Health" value={activeAccount ? String(activeAccount.health.overall) : '-'} />
                <AccountStat label="ARR" value={activeAccount ? formatCompactCurrency(activeAccount.arr) : '-'} />
              </div>
            </section>

            <section className="rounded-xl border border-surface-border p-4">
              <form onSubmit={submit} className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
                <input
                  value={input}
                  onChange={event => setInput(event.target.value)}
                  className="tk-input min-h-[52px] rounded-full pl-10 pr-32 focus:ring-brand-blue/30"
                  placeholder="Ask KAM AI about account risk, renewal, timeline, KYC, or tasks"
                />
                <button type="submit" disabled={loading || !input.trim()} className="absolute right-1 top-1/2 inline-flex min-h-[44px] min-w-[104px] -translate-y-1/2 items-center justify-center gap-2 rounded-full bg-brand-blue px-4 text-sm font-semibold text-white hover:bg-brand-blue-dark disabled:opacity-60">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Query
                </button>
              </form>

              <div className="mt-4 flex flex-wrap gap-2">
                {scopeOptions.map(option => {
                  const selected = scopes.includes(option.value)
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleScope(option.value)}
                      aria-pressed={selected}
                      className={cn(
                        'inline-flex min-h-[44px] items-center gap-2 rounded-full border px-3 text-xs font-semibold transition-colors',
                        selected ? 'border-brand-blue bg-blue-tint-20 text-brand-blue' : 'border-surface-border bg-white text-ink-secondary hover:bg-surface-tertiary hover:text-ink',
                      )}
                    >
                      <span className={cn('flex h-4 w-4 items-center justify-center rounded-full border', selected ? 'border-brand-blue bg-brand-blue text-white' : 'border-surface-border')}>
                        {selected ? <Check className="h-3 w-3" /> : null}
                      </span>
                      {option.label}
                    </button>
                  )
                })}
                <button
                  type="button"
                  onClick={() => setSearchDocuments(value => !value)}
                  aria-pressed={searchDocuments}
                  className={cn(
                    'inline-flex min-h-[44px] items-center gap-2 rounded-full border px-3 text-xs font-semibold transition-colors',
                    searchDocuments ? 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange' : 'border-surface-border bg-white text-ink-secondary hover:bg-surface-tertiary hover:text-ink',
                  )}
                >
                  <FileSearch className="h-4 w-4" />
                  Search documents
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {['Forecast next 6 months', ...INTENT_EXAMPLES.slice(0, 4)].map(example => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => runQuery(example)}
                    className="rounded-full border border-surface-border bg-white px-3 py-2 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-tertiary hover:text-ink"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </section>

            {loading ? <KAMAILoading /> : null}

            {result && !loading ? (
              <section className="rounded-xl border border-brand-blue/20 bg-blue-tint-20 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-brand-blue px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-white">{result.queryIntent}</span>
                      <span className="rounded-full border border-surface-border bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">{result.confidence} confidence</span>
                    </div>
                    <p className="text-sm leading-6 text-ink">{result.answer}</p>
                    {result.disclaimer ? <p className="mt-2 text-xs font-medium text-ink-secondary">{result.disclaimer}</p> : null}
                    {forecastResult ? <ForecastChart forecast={forecastResult} /> : null}
                  </div>
                  <button className="tk-icon-button bg-white" onClick={() => { setResult(null); setForecastResult(null) }} aria-label="Clear KAM AI answer">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <SourceCollapsible
                  open={sourcesOpen}
                  onOpenChange={setSourcesOpen}
                  title={`Timeline sources (${result.sourceEntries.length})`}
                >
                  {result.sourceEntries.length ? result.sourceEntries.map(entry => <TimelineSourceCard key={entry.id} entry={entry} />) : (
                    <p className="rounded-lg border border-surface-border bg-white p-3 text-sm text-ink-secondary">No visible timeline sources matched this query.</p>
                  )}
                </SourceCollapsible>

                {searchDocuments ? (
                  <SourceCollapsible
                    open={documentsOpen}
                    onOpenChange={setDocumentsOpen}
                    title={`Document sources (${docResults.length})`}
                    icon={<FileSearch className="h-3.5 w-3.5" />}
                  >
                    {docResults.length ? docResults.map(chunk => <DocumentSourceCard key={chunk.id} chunk={chunk} />) : (
                      <p className="rounded-lg border border-surface-border bg-white p-3 text-sm text-ink-secondary">No visible document sources matched this query.</p>
                    )}
                  </SourceCollapsible>
                ) : null}
              </section>
            ) : null}

            <RecentQueries runs={queryRuns} onRunAgain={runQuery} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function AccountStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-surface-border bg-white px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold leading-none text-ink">{value}</p>
    </div>
  )
}

function KAMAILoading() {
  return (
    <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-tertiary p-4">
      <div className="h-4 w-2/3 animate-pulse-soft rounded bg-surface-border" />
      <div className="mt-3 h-4 w-full animate-pulse-soft rounded bg-surface-border" />
      <div className="mt-2 h-4 w-5/6 animate-pulse-soft rounded bg-surface-border" />
    </div>
  )
}

function ForecastChart({ forecast }: { forecast: ForecastResult }) {
  const maxArr = Math.max(1, ...forecast.points.map(point => point.arr))
  const chartWidth = 560
  const chartHeight = 220
  const left = 42
  const right = 24
  const top = 30
  const bottom = 44
  const plotWidth = chartWidth - left - right
  const plotHeight = chartHeight - top - bottom
  const xFor = (index: number) => left + (plotWidth / Math.max(1, forecast.points.length - 1)) * index
  const arrY = (value: number) => top + plotHeight - (value / maxArr) * plotHeight
  const healthY = (value: number) => top + plotHeight - (Math.max(0, Math.min(100, value)) / 100) * plotHeight
  const arrLine = forecast.points.map((point, index) => `${xFor(index)},${arrY(point.arr)}`).join(' ')
  const healthLine = forecast.points.map((point, index) => `${xFor(index)},${healthY(point.health)}`).join(' ')

  return (
    <div className="mt-4 rounded-xl border border-surface-border bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-brand-blue" />
            <h3 className="text-sm font-semibold text-ink">{forecast.title}</h3>
          </div>
          <p className="mt-1 text-xs leading-5 text-ink-secondary">Directional prototype forecast based on current ARR, open pipeline, and account health.</p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs font-medium text-ink-secondary">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-brand-blue" />Projected ARR</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-brand-orange" />Health trend</span>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-[240px] min-w-[560px] text-ink-secondary">
          {[0, 1, 2, 3].map(index => {
            const y = top + (plotHeight / 3) * index
            return <line key={index} x1={left} x2={chartWidth - right} y1={y} y2={y} className="stroke-surface-border" strokeWidth="1" />
          })}
          {forecast.points.map((point, index) => {
            const x = xFor(index)
            const y = arrY(point.arr)
            const height = top + plotHeight - y
            return (
              <g key={point.month}>
                <rect x={x - 13} y={y} width="26" height={height} rx="6" className="fill-blue-tint-40" />
                <text x={x} y={chartHeight - 18} textAnchor="middle" className="fill-ink-secondary text-[11px] font-semibold">{point.month}</text>
              </g>
            )
          })}
          <polyline points={arrLine} fill="none" className="stroke-brand-blue" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={healthLine} fill="none" className="stroke-brand-orange" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {forecast.points.map((point, index) => (
            <g key={`${point.month}-dots`}>
              <circle cx={xFor(index)} cy={arrY(point.arr)} r="4" className="fill-brand-blue" />
              <circle cx={xFor(index)} cy={healthY(point.health)} r="4" className="fill-brand-orange" />
            </g>
          ))}
          <text x={left} y="18" className="fill-ink-secondary text-[11px] font-semibold">ARR</text>
          <text x={chartWidth - right - 42} y="18" className="fill-ink-secondary text-[11px] font-semibold">Health</text>
        </svg>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {forecast.highlights.map(item => (
          <p key={item} className="rounded-md bg-surface-secondary px-3 py-2 text-xs leading-5 text-ink-secondary">{item}</p>
        ))}
      </div>
    </div>
  )
}

function SourceCollapsible({
  open,
  onOpenChange,
  title,
  icon,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  icon?: JSX.Element
  children: React.ReactNode
}) {
  return (
    <Collapsible.Root open={open} onOpenChange={onOpenChange} className="mt-4">
      <Collapsible.Trigger className="inline-flex min-h-[44px] items-center gap-1 text-xs font-semibold text-brand-blue">
        {title}
        {icon}
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open ? 'rotate-180' : '')} />
      </Collapsible.Trigger>
      <Collapsible.Content className="grid gap-2 md:grid-cols-2">
        {children}
      </Collapsible.Content>
    </Collapsible.Root>
  )
}

function TimelineSourceCard({ entry }: { entry: TimelineEntry }) {
  return (
    <article className="rounded-lg border border-surface-border bg-white p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-blue">{titleize(entry.eventType)} | {entry.id}</p>
      <h4 className="mt-1 text-sm font-semibold text-ink">{entry.title}</h4>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink-secondary">{entry.description}</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-tertiary">{formatRelative(entry.timestamp)} by {entry.performedByName}</p>
        {entry.sourceRecordRoute ? (
          <Link to={entry.sourceRecordRoute} className="text-xs font-semibold text-brand-blue hover:text-brand-blue-dark">View source</Link>
        ) : null}
      </div>
    </article>
  )
}

function DocumentSourceCard({ chunk }: { chunk: SemanticDocumentChunk }) {
  return (
    <article className="rounded-lg border border-surface-border bg-white p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-blue">{chunk.sourceLabel}</p>
      <h4 className="mt-1 text-sm font-semibold text-ink">{chunk.documentName}</h4>
      <p className="mt-1 line-clamp-3 text-xs leading-5 text-ink-secondary">{chunk.excerpt}</p>
    </article>
  )
}

function RecentQueries({ runs, onRunAgain }: { runs: AIQueryRun[]; onRunAgain: (query: string) => void }) {
  return (
    <section className="rounded-xl border border-surface-border p-4">
      <div className="mb-3 flex items-center gap-2">
        <History className="h-4 w-4 text-brand-blue" />
        <h3 className="text-sm font-semibold text-ink">Recent queries</h3>
      </div>
      {runs.length ? (
        <div className="grid gap-2">
          {runs.slice(0, 4).map(run => (
            <article key={run.id} className="rounded-lg border border-surface-border bg-surface-secondary p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{run.query}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink-secondary">{run.answer}</p>
                  <p className="mt-2 text-[11px] font-medium text-ink-tertiary">{run.intent} | {run.confidence} confidence | {run.sourceEntryIds.length + run.documentSourceIds.length} sources | {formatRelative(run.createdAt)}</p>
                </div>
                <button type="button" className="tk-button-secondary min-h-[36px] shrink-0 px-3 py-1.5 text-xs" onClick={() => onRunAgain(run.query)}>
                  Run again <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="rounded-lg bg-surface-secondary p-4 text-sm text-ink-secondary">Ask a question to build account-scoped KAM AI history.</p>
      )}
    </section>
  )
}

function shouldRenderForecast(query: string) {
  const normalized = query.toLowerCase()
  const asksProjection = /forecast|predict|projection|trend|next\s+6|next\s+six|six\s+months|6\s+months/.test(normalized)
  const asksVisual = /chart|graph|forecast|predict|projection/.test(normalized)
  return asksProjection && asksVisual
}

function buildForecastAISearchResult(forecast: ForecastResult, timeline: TimelineEntry[]): AISearchResult {
  const sources = [...timeline].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 6)
  return {
    answer: forecast.summary,
    sourceEntries: sources,
    queryIntent: 'Predictive forecast',
    confidence: 'medium',
    disclaimer: `This forecast is based on current account values, open pipeline, health posture, and ${sources.length} recent recorded events. Verify before use in client communications.`,
  }
}

function buildForecastResult(account: Account, opportunities: Opportunity[]): ForecastResult {
  const openPipeline = opportunities
    .filter(opportunity => opportunity.stage !== 'Won' && opportunity.stage !== 'Lost')
    .reduce((sum, opportunity) => sum + opportunity.estimatedValue, 0)
  const baseArr = Math.max(account.arr, 1)
  const healthStart = account.health.overall
  const riskDrag = account.riskStatus === 'critical' ? -1.5 : account.riskStatus === 'warning' ? 0.25 : 1.15
  const captureRate = account.riskStatus === 'critical' ? 0.16 : account.riskStatus === 'warning' ? 0.24 : 0.34
  const points = Array.from({ length: 6 }, (_, index): ForecastPoint => {
    const monthDate = new Date()
    monthDate.setMonth(monthDate.getMonth() + index + 1)
    const month = monthDate.toLocaleDateString(undefined, { month: 'short' })
    const capture = openPipeline * captureRate * ((index + 1) / 6)
    const organicExpansion = baseArr * 0.012 * (index + 1)
    const arr = Math.round(baseArr + capture + organicExpansion)
    const health = Math.round(Math.max(38, Math.min(94, healthStart + riskDrag * (index + 1) + (openPipeline > baseArr * 0.25 ? 0.8 * index : 0))))
    const pipeline = Math.max(0, Math.round(openPipeline * (1 - 0.1 * (index + 1))))
    return { month, arr, health, pipeline }
  })
  const finalPoint = points[points.length - 1]
  const arrDelta = finalPoint.arr - baseArr
  const healthDelta = finalPoint.health - healthStart

  return {
    title: `${account.name} six-month forecast`,
    summary: `${account.name} is projected to reach ${formatCompactCurrency(finalPoint.arr)} ARR over the next six months, a ${formatCompactCurrency(arrDelta)} lift from the current baseline. Health is projected to ${healthDelta >= 0 ? 'improve' : 'decline'} by ${Math.abs(healthDelta)} points if current task pressure and pipeline assumptions hold.`,
    points,
    highlights: [
      `Open pipeline basis: ${formatCompactCurrency(openPipeline)} across ${opportunities.filter(opportunity => opportunity.stage !== 'Won' && opportunity.stage !== 'Lost').length} opportunities.`,
      `Projected month-six health: ${finalPoint.health}/100 from current ${healthStart}/100.`,
      `Remaining modeled pipeline by month six: ${formatCompactCurrency(finalPoint.pipeline)}.`,
    ],
  }
}
