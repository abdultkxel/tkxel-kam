import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, BriefcaseBusiness, CalendarClock, Download, FileCheck2, Link2, LucideIcon, Printer, ShieldAlert, UserRound, X } from 'lucide-react'
import { ReactNode, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Account } from '@/types/account'
import { Opportunity } from '@/types/opportunity'
import { TimelineEntry } from '@/types/timeline'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/contexts/AuthContext'
import { exportHandoverPdf, generateHandoverSummary, getHandoverSummaries, shareHandoverSummary, HandoverSummary as ApiHandoverSummary } from '@/services/timeline'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface HandoverSummaryData {
  generatedAt: string
  healthScores: Account['health']
  scoreHistory: TimelineEntry[]
  openRisks: string[]
  activeEscalations: TimelineEntry[]
  openOpportunities: Opportunity[]
  recentDecisions: TimelineEntry[]
  lastTimeline: TimelineEntry[]
  upcomingGovernance: { id: string; title: string; type: 'QBR' | 'SteerCo' | 'Executive Review'; date: string }[]
  keyStakeholders: string[]
}

function EmptyCopy({ children }: { children: string }) {
  return <p className="text-sm text-ink-secondary">{children}</p>
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon
  title: string
  children: ReactNode
}) {
  return (
    <section className="tk-card print-section p-4">
      <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
        <Icon className="h-4 w-4 text-brand-blue" />
        {title}
      </h3>
      {children}
    </section>
  )
}

function EntryList({ entries }: { entries: TimelineEntry[] }) {
  if (!entries.length) return <EmptyCopy>No recorded entries.</EmptyCopy>

  return (
    <div className="space-y-2">
      {entries.map(entry => (
        <div key={entry.id} className="rounded-lg border border-surface-border p-3 text-sm">
          <p className="font-semibold text-ink">{entry.title}</p>
          <p className="mt-1 text-xs text-ink-secondary">{formatDate(entry.timestamp)} | {entry.performedByName}</p>
        </div>
      ))}
    </div>
  )
}

export function HandoverSummary({
  account,
  entries,
  opportunities,
  open,
  onOpenChange,
}: {
  account: Account
  entries: TimelineEntry[]
  opportunities: Opportunity[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [summary, setSummary] = useState<HandoverSummaryData | null>(null)
  const [apiSummary, setApiSummary] = useState<ApiHandoverSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<ApiHandoverSummary[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [shareUrl, setShareUrl] = useState('')
  const { token } = useAuth()

  useEffect(() => {
    let active = true
    if (!open || !token) return undefined
    setLoading(true)
    setError('')
    setShareUrl('')
    setSummary(null)
    setApiSummary(null)
    setHistory([])
    setHistoryError('')
    generateHandoverSummary(token, account.id)
      .then(data => {
        if (!active) return
        setApiSummary(data)
        setSummary(mapApiSummary(data, account, opportunities))
        setHistoryLoading(true)
        getHandoverSummaries(token, account.id, { page: 1, page_size: 5 })
          .then(page => {
            if (active) setHistory(page.items)
          })
          .catch(err => {
            if (active) setHistoryError(err instanceof Error ? err.message : 'Handover history could not be loaded')
          })
          .finally(() => {
            if (active) setHistoryLoading(false)
          })
      })
      .catch(err => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Handover summary could not be generated')
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [account, open, opportunities, token])

  async function exportPdf() {
    if (!token || !apiSummary) return
    try {
      const blob = await exportHandoverPdf(token, apiSummary.id)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `handover-${account.name.replace(/\W+/g, '-').toLowerCase()}.pdf`
      link.click()
      URL.revokeObjectURL(url)
      toast.success('Handover PDF exported')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Handover PDF could not be exported')
    }
  }

  async function shareInternal() {
    if (!token || !apiSummary) return
    try {
      const share = await shareHandoverSummary(token, apiSummary.id)
      setShareUrl(share.internal_share_url)
      await navigator.clipboard?.writeText(`${window.location.origin}${share.internal_share_url}`)
      toast.success('Internal share link copied')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Internal share link could not be created')
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40 no-print" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 w-[min(1120px,100vw)] overflow-y-auto border-l border-surface-border bg-white p-8 shadow-panel">
          <div className="mb-6 flex items-start justify-between gap-4 print-section">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Phase 2 Handover Summary</p>
              <Dialog.Title className="font-display text-3xl font-bold text-ink">{account.name}</Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-ink-secondary">
                Stage: {account.stage} | Owner: {account.ownerName} | ARR: {formatCurrency(account.arr)}
              </Dialog.Description>
              {summary ? <p className="mt-1 text-xs text-ink-secondary">Generated {formatDate(summary.generatedAt)}</p> : null}
            </div>
            <div className="flex gap-2 no-print">
              <button className="tk-button-secondary" disabled={!apiSummary} onClick={shareInternal}>
                <Link2 className="h-4 w-4" />
                Share link
              </button>
              <button className="tk-button-secondary" disabled={!apiSummary} onClick={exportPdf}>
                <Download className="h-4 w-4" />
                PDF
              </button>
              <button className="tk-button-secondary" onClick={() => window.print()}>
                <Printer className="h-4 w-4" />
                Print
              </button>
              <Dialog.Close className="tk-icon-button" aria-label="Close">
                <X className="h-5 w-5" />
              </Dialog.Close>
            </div>
          </div>

          {loading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="tk-card p-4">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="mt-4 h-16 w-full" />
                  <Skeleton className="mt-3 h-16 w-full" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="rounded-lg border border-rag-red/20 bg-rag-red/10 p-4 text-sm font-medium text-rag-red">{error}</div>
          ) : !summary ? (
            <div className="rounded-lg border border-surface-border p-4 text-sm text-ink-secondary">No handover summary generated yet.</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {shareUrl ? (
                <section className="tk-card p-4 md:col-span-2">
                  <p className="text-sm font-semibold text-ink">Internal share link</p>
                  <p className="mt-1 break-all text-xs text-ink-secondary">{shareUrl}</p>
                </section>
              ) : null}
              <section className="tk-card p-4 md:col-span-2">
                <p className="text-sm font-semibold text-ink">Recent handover summaries</p>
                {historyLoading ? (
                  <p className="mt-2 text-sm text-ink-secondary">Loading handover history...</p>
                ) : historyError ? (
                  <p className="mt-2 text-sm font-medium text-rag-red">{historyError}</p>
                ) : history.length ? (
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {history.map(item => (
                      <div key={item.id} className="rounded-lg border border-surface-border p-3 text-sm">
                        <p className="font-semibold text-ink">{item.selected_sections.join(', ') || 'Account summary'}</p>
                        <p className="mt-1 text-xs text-ink-secondary">Generated {formatDate(item.created_at)} by {item.generated_by_name}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-ink-secondary">No previous handover summaries.</p>
                )}
              </section>
              <Section icon={FileCheck2} title="Health Scores">
                {Object.entries(summary.healthScores).map(([key, value]) => (
                  <div key={key} className="flex justify-between border-b border-surface-border py-2 text-sm last:border-b-0">
                    <span className="capitalize text-ink-secondary">{key}</span>
                    <span className="font-semibold text-ink">{value}</span>
                  </div>
                ))}
                <div className="mt-4">
                  <EntryList entries={summary.scoreHistory} />
                </div>
              </Section>

              <Section icon={AlertTriangle} title="Open Risks">
                {summary.openRisks.length ? summary.openRisks.map(risk => (
                  <p key={risk} className="border-b border-surface-border py-2 text-sm text-ink-secondary last:border-b-0">{risk}</p>
                )) : <EmptyCopy>No open risks.</EmptyCopy>}
              </Section>

              <Section icon={ShieldAlert} title="Active Escalations">
                <EntryList entries={summary.activeEscalations} />
              </Section>

              <Section icon={BriefcaseBusiness} title="Open Opportunities">
                {summary.openOpportunities.length ? summary.openOpportunities.map(opportunity => (
                  <div key={opportunity.id} className="border-b border-surface-border py-2 text-sm last:border-b-0">
                    <p className="font-semibold text-ink">{opportunity.name}</p>
                    <p className="text-ink-secondary">{formatCurrency(opportunity.estimatedValue)} | {opportunity.stage} | closes {formatDate(opportunity.closeDate)}</p>
                  </div>
                )) : <EmptyCopy>No open opportunities.</EmptyCopy>}
              </Section>

              <Section icon={FileCheck2} title="Recent Decisions">
                <EntryList entries={summary.recentDecisions} />
              </Section>

              <Section icon={CalendarClock} title="Upcoming Governance">
                {summary.upcomingGovernance.length ? summary.upcomingGovernance.map(item => (
                  <div key={item.id} className="rounded-lg border border-surface-border p-3 text-sm">
                    <p className="font-semibold text-ink">{item.title}</p>
                    <p className="mt-1 text-xs text-ink-secondary">{item.type} | {formatDate(item.date)}</p>
                  </div>
                )) : <EmptyCopy>No governance events in the next 60 days.</EmptyCopy>}
              </Section>

              <Section icon={UserRound} title="Key Stakeholders">
                {summary.keyStakeholders.map(stakeholder => (
                  <p key={stakeholder} className="border-b border-surface-border py-2 text-sm text-ink-secondary last:border-b-0">{stakeholder}</p>
                ))}
              </Section>

              <Section icon={FileCheck2} title="Last 10 Timeline Events">
                <EntryList entries={summary.lastTimeline} />
              </Section>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function mapApiSummary(summary: ApiHandoverSummary, account: Account, opportunities: Opportunity[]): HandoverSummaryData {
  const content = summary.content as Record<string, unknown>
  const recent = Array.isArray(content.recent_timeline) ? content.recent_timeline.map(item => mapSummaryEntry(item as Record<string, unknown>, account.id)) : []
  return {
    generatedAt: summary.created_at,
    healthScores: account.health,
    scoreHistory: recent.filter(entry => entry.eventType === 'score_change').slice(0, 6),
    openRisks: account.risks,
    activeEscalations: recent.filter(entry => entry.module === 'escalation' && !entry.title.toLowerCase().includes('closed')),
    openOpportunities: opportunities.filter(opportunity => !['Won', 'Lost'].includes(opportunity.stage)),
    recentDecisions: recent.filter(entry => ['approval_event', 'executive_event', 'governance_event'].includes(entry.eventType)),
    lastTimeline: recent.slice(0, 10),
    upcomingGovernance: [],
    keyStakeholders: account.stakeholders,
  }
}

function mapSummaryEntry(item: Record<string, unknown>, accountId: string): TimelineEntry {
  return {
    id: String(item.id ?? crypto.randomUUID()),
    accountId,
    eventType: String(item.event_type ?? 'manual_note') as TimelineEntry['eventType'],
    module: String(item.source_module ?? item.module ?? 'manual') as TimelineEntry['module'],
    title: String(item.title ?? 'Timeline event'),
    description: String(item.description ?? ''),
    performedBy: String(item.actor_id ?? item.performed_by ?? 'system'),
    performedByName: String(item.actor_name ?? item.performed_by_name ?? 'System'),
    timestamp: String(item.event_at ?? item.timestamp ?? item.created_at ?? new Date().toISOString()),
    sourceRecordId: item.source_record_id ? String(item.source_record_id) : undefined,
    sourceRecordType: item.source_record_type ? String(item.source_record_type) : undefined,
    sourceRecordRoute: item.source_record_route ? String(item.source_record_route) : undefined,
    isSensitive: Boolean(item.is_sensitive),
    isSystemGenerated: Boolean(item.is_system_generated ?? true),
    isImmutable: Boolean(item.is_immutable ?? true),
  }
}
