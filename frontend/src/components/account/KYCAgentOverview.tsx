import { AlertTriangle, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, FileSearch, Loader2, RefreshCcw, Search, SearchCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { createKycAgentRun, getKycFreshness, listKycAgentRuns, refreshKycAgentRun } from '@/services/kyc'
import { KycAgentRun, KycRunStatus, KycWorkstream } from '@/types/kyc'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/utils/cn'

type AgentStep = {
  workstream_key: string
  title: string
  status: 'pending'
  confidence: number
  output: Record<string, string>
  missing_fields: string[]
  error_message?: string | null
}

const kycAgentSteps: AgentStep[] = [
  {
    workstream_key: 'market_research',
    title: 'Market Research',
    status: 'pending',
    confidence: 0,
    output: {
      'Industry overview': 'Industry category, maturity stage, disruptions, value chain, and major players',
      'Market landscape and trends': 'Buying cycles, technology adoption patterns, macro demand drivers, and peer movement',
      'Competitor analysis': 'Direct competitors, product comparisons, partnerships, and differentiation opportunities',
      'Regulatory and compliance factors': 'Industry standards, data obligations, architecture impact, and regulatory change',
    },
    missing_fields: [],
  },
  {
    workstream_key: 'client_research',
    title: 'Client Research',
    status: 'pending',
    confidence: 0,
    output: {
      'Company snapshot': 'Founded year, employees, HQ, regions served, and ownership structure',
      'Vision, mission and strategy': 'Company direction, goals, leadership statements, and innovation priorities',
      'Company history and evolution': 'Founding story, pivots, acquisitions, restructuring, and leadership changes',
      'Stakeholder map': 'Decision authority, influence, sponsorship potential, and relationship strength',
      'Technical landscape': 'Tech stack, architecture, integrations, cloud providers, constraints, and dependencies',
    },
    missing_fields: [],
  },
  {
    workstream_key: 'stakeholder_details',
    title: 'Stakeholder Details',
    status: 'pending',
    confidence: 0,
    output: {
      'Client-side stakeholders': 'Decision-makers, operational contacts, org changes, influence map, and preferences',
      'Tkxel-side stakeholder mapping': 'AM, delivery lead, PM, technical leads, executive sponsor, cadence, and ownership',
    },
    missing_fields: [],
  },
  {
    workstream_key: 'tkxel_engagement',
    title: 'Tkxel Engagement with Client',
    status: 'pending',
    confidence: 0,
    output: {
      'Project charters': 'Objectives, scope, milestones, metrics, contacts, dependencies, and assumptions',
      'Engagement models': 'Staff augmentation, dedicated teams, fixed-price, managed services, support, and maintenance',
      'Contractual obligations and SLAs': 'Terms, commitments, support levels, escalation procedures, renewal windows, and penalties',
      'Past engagement summary': 'Delivered outcomes, issues, escalations, learnings, practices, and client sentiment',
    },
    missing_fields: [],
  },
  {
    workstream_key: 'financial_landscape',
    title: 'Financial Landscape',
    status: 'pending',
    confidence: 0,
    output: {
      'Renewal cycle': 'Contract end dates, renewal dependencies, risks, and pricing sensitivity',
      'Payment behaviour': 'On-time payments, delays, disputes, and credit-risk signals',
      'Gross margins': 'Margin by project, blended account margin, trend, and stability risks',
      'Billing models': 'Hourly, T&M, monthly pods, milestone-based work, managed services, and support billing',
    },
    missing_fields: [],
  },
]

export function KYCAgentOverview({ accountId, compact = false, onReview }: { accountId: string; compact?: boolean; onReview: () => void }) {
  const { token } = useAuth()
  const [runs, setRuns] = useState<{ items: KycAgentRun[]; total: number; page: number; page_size: number; pages: number } | null>(null)
  const [freshnessStatus, setFreshnessStatus] = useState('missing')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<KycRunStatus | 'all'>('all')
  const [page, setPage] = useState(1)
  const [openStep, setOpenStep] = useState(kycAgentSteps[0].workstream_key)
  const [loading, setLoading] = useState<'initial' | 'refresh' | ''>('initial')
  const [error, setError] = useState<string | null>(null)

  const latestRun = runs?.items[0] ?? null
  const workstreams = useMemo<(KycWorkstream | AgentStep)[]>(() => latestRun?.workstreams.length ? latestRun.workstreams : kycAgentSteps, [latestRun])
  const totalBlocks = useMemo(() => workstreams.reduce((sum, step) => sum + Object.keys(step.output).length, 0), [workstreams])
  const lastRefresh = latestRun ? formatDateTime(latestRun.completed_at ?? latestRun.updated_at) : 'Not run'

  const loadRuns = useCallback(
    async (mode: 'initial' | 'refresh' = 'refresh') => {
      if (!token) {
        setError('Sign in to refresh KYC agent data.')
        setLoading('')
        return
      }
      setLoading(mode)
      setError(null)
      try {
        const [runPage, freshness] = await Promise.all([
          listKycAgentRuns(token, accountId, {
            search: searchTerm.trim(),
            status: statusFilter,
            page,
            page_size: 4,
            sort: 'created_at',
            direction: 'desc',
          }),
          getKycFreshness(token, accountId),
        ])
        setRuns(runPage)
        setFreshnessStatus(freshness.freshness_status)
        setOpenStep(current => {
          if (runPage.items[0]?.workstreams.some(item => item.workstream_key === current)) return current
          return runPage.items[0]?.workstreams[0]?.workstream_key ?? kycAgentSteps[0].workstream_key
        })
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : 'KYC agent request failed')
      } finally {
        setLoading('')
      }
    },
    [accountId, page, searchTerm, statusFilter, token],
  )

  useEffect(() => {
    void loadRuns('initial')
  }, [loadRuns])

  async function refreshData() {
    if (!token) return
    setLoading('refresh')
    setError(null)
    try {
      if (latestRun) await refreshKycAgentRun(token, accountId, latestRun.id)
      else await createKycAgentRun(token, accountId, { trigger_source: 'kyc_page' })
      toast.success('AI KYC data refreshed')
      setPage(1)
      await loadRuns('refresh')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'KYC agent refresh failed')
    } finally {
      setLoading('')
    }
  }

  return (
    <section className="tk-card overflow-hidden">
      <div className="border-b border-surface-border bg-surface-secondary p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">AI KYC agent</p>
            <h3 className="mt-1 text-base font-semibold text-ink">KYC intelligence overview</h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-secondary">
              Latest run status: {latestRun ? latestRun.status.replace(/_/g, ' ') : 'not started'}; approved snapshot freshness: {freshnessStatus}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="tk-button-secondary bg-white" onClick={refreshData} disabled={Boolean(loading)}>
              {loading === 'refresh' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              Refresh AI data
            </button>
            <button type="button" className="tk-button-primary" onClick={onReview}>
              <SearchCheck className="h-4 w-4" />
              Review data
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-0 divide-y divide-surface-border md:grid-cols-3 md:divide-x md:divide-y-0">
        <KYCMetric label="Agent steps" value={workstreams.length} />
        <KYCMetric label="Research blocks" value={totalBlocks} />
        <KYCMetric label="Last refresh" value={lastRefresh} />
      </div>

      {error ? (
        <div className="m-5 mb-0 flex items-start gap-2 rounded-lg border border-rag-red/20 bg-rag-red/10 p-3 text-sm text-rag-red">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 border-b border-surface-border p-5 md:grid-cols-[minmax(0,1fr)_180px]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
          <input
            className="tk-input pl-9"
            value={searchTerm}
            onChange={event => {
              setSearchTerm(event.target.value)
              setPage(1)
            }}
            placeholder="Search agent runs"
          />
        </label>
        <select className="tk-input" value={statusFilter} onChange={event => { setStatusFilter(event.target.value as KycRunStatus | 'all'); setPage(1) }}>
          <option value="all">All run statuses</option>
          <option value="complete">Complete</option>
          <option value="partial">Partial</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
          <option value="running">Running</option>
        </select>
      </div>

      {loading === 'initial' && !runs ? (
        <div className="flex items-center justify-center gap-3 p-8 text-sm font-semibold text-ink-secondary">
          <Loader2 className="h-5 w-5 animate-spin text-brand-blue" />
          Loading KYC agent
        </div>
      ) : null}

      {!loading && runs && !runs.total ? (
        <EmptyState
          icon={FileSearch}
          heading="No KYC agent runs"
          body="Start an AI KYC refresh for this account."
          action={{ label: 'Start AI data refresh', onClick: refreshData }}
        />
      ) : null}

      {runs?.total || latestRun ? (
        <>
          <div className={cn('grid gap-3 p-5', compact ? 'xl:grid-cols-1' : 'xl:grid-cols-5')}>
            {workstreams.map((step, index) => {
              const expanded = openStep === step.workstream_key
              return (
                <article key={step.workstream_key} className="rounded-lg border border-surface-border bg-white">
                  <button
                    type="button"
                    className="flex min-h-[88px] w-full items-start justify-between gap-3 p-4 text-left transition-colors hover:bg-surface-secondary"
                    onClick={() => setOpenStep(expanded ? '' : step.workstream_key)}
                    aria-expanded={expanded}
                  >
                    <div className="min-w-0">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-blue-tint-20 text-xs font-bold text-brand-blue">{index + 1}</span>
                      <h4 className="mt-3 text-sm font-semibold text-ink">{step.title}</h4>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <StatusBadge status={step.status} />
                        <span className="text-xs font-semibold text-ink-secondary">{step.confidence}% confidence</span>
                      </div>
                    </div>
                    <ChevronDown className={cn('mt-1 h-4 w-4 shrink-0 text-ink-secondary transition-transform', expanded && 'rotate-180')} />
                  </button>
                  {expanded ? (
                    <div className="border-t border-surface-border p-4">
                      <div className="grid gap-3">
                        {Object.entries(step.output).map(([field, value]) => (
                          <div key={field}>
                            <div className="flex items-center gap-2">
                              {step.status === 'failed' ? <AlertTriangle className="h-4 w-4 text-rag-red" /> : <CheckCircle2 className="h-4 w-4 text-rag-green" />}
                              <p className="text-xs font-semibold uppercase tracking-wider text-ink">{formatOutputKey(field)}</p>
                            </div>
                          <p className="mt-2 text-xs leading-5 text-ink-secondary">{formatOutputValue(value)}</p>
                          </div>
                        ))}
                        {step.error_message ? <p className="rounded-md bg-rag-red/10 p-2 text-xs leading-5 text-rag-red">{step.error_message}</p> : null}
                        {step.missing_fields.length ? <p className="rounded-md bg-brand-orange/10 p-2 text-xs leading-5 text-brand-orange">{step.missing_fields.length} missing field{step.missing_fields.length === 1 ? '' : 's'}</p> : null}
                      </div>
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>

          <div className="border-t border-surface-border p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="text-sm font-semibold text-ink">Run history</p>
              <div className="flex items-center gap-2">
                <button type="button" aria-label="Previous run page" className="tk-button-secondary bg-white px-2" disabled={(runs?.page ?? page) <= 1} onClick={() => setPage(current => Math.max(1, current - 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-xs font-semibold text-ink-secondary">Page {runs?.page ?? page} of {Math.max(runs?.pages ?? 1, 1)}</span>
                <button type="button" aria-label="Next run page" className="tk-button-secondary bg-white px-2" disabled={(runs?.page ?? page) >= (runs?.pages ?? 1)} onClick={() => setPage(current => Math.min(runs?.pages ?? current + 1, current + 1))}>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {runs?.items.map(run => (
                <div key={run.id} className="rounded-lg border border-surface-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge status={run.status} />
                    <span className="text-xs text-ink-secondary">{run.workstreams.length} steps</span>
                  </div>
                  <p className="mt-2 text-xs font-semibold text-ink">{formatDateTime(run.created_at)}</p>
                  <p className="mt-1 text-xs text-ink-secondary">{run.trigger_source.replace(/_/g, ' ')}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </section>
  )
}

function KYCMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-3 p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-tint-20 text-brand-blue">
        <FileSearch className="h-5 w-5" />
      </span>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">{label}</p>
        <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'complete'
      ? 'border-rag-green/20 bg-rag-green/10 text-rag-green'
      : status === 'failed'
        ? 'border-rag-red/20 bg-rag-red/10 text-rag-red'
        : status === 'partial'
          ? 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange'
          : 'border-blue-tint-20 bg-blue-tint-20 text-brand-blue'

  return <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', tone)}>{status.replace(/_/g, ' ')}</span>
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function formatOutputKey(value: string) {
  return value.replace(/_/g, ' ')
}

function formatOutputValue(value: unknown) {
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value !== null && 'value' in value) {
    const nested = (value as { value?: unknown }).value
    return typeof nested === 'string' ? nested : ''
  }
  return ''
}
