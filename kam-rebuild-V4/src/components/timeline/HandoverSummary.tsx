import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, BriefcaseBusiness, CalendarClock, FileCheck2, LucideIcon, Printer, ShieldAlert, UserRound, X } from 'lucide-react'
import { ReactNode, useEffect, useState } from 'react'
import { assembleHandoverSummary, HandoverSummaryData } from '@/services/handoverSummary'
import { Account } from '@/types/account'
import { Opportunity } from '@/types/opportunity'
import { TimelineEntry } from '@/types/timeline'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatCurrency, formatDate } from '@/utils/formatters'

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
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true
    if (!open) return undefined
    setLoading(true)
    setSummary(null)
    assembleHandoverSummary(account, entries, opportunities).then(data => {
      if (!active) return
      setSummary(data)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [account, entries, open, opportunities])

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
              <button className="tk-button-secondary" onClick={() => window.print()}>
                <Printer className="h-4 w-4" />
                Print
              </button>
              <Dialog.Close className="tk-icon-button" aria-label="Close">
                <X className="h-5 w-5" />
              </Dialog.Close>
            </div>
          </div>

          {loading || !summary ? (
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="tk-card p-4">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="mt-4 h-16 w-full" />
                  <Skeleton className="mt-3 h-16 w-full" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
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
