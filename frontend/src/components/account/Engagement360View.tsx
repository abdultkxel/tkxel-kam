import * as Tabs from '@radix-ui/react-tabs'
import { AlertTriangle, CalendarClock, FileText, History, Paperclip, ShieldCheck, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { EngagementHealthPanel } from '@/components/account/EngagementHealthPanel'
import { useRole } from '@/hooks/useRole'
import { useTimelineStore } from '@/stores/timelineStore'
import { useV3Store } from '@/stores/v3Store'
import { Account } from '@/types/account'
import { canViewTimelineEntry } from '@/types/timeline'
import { EngagementRecord } from '@/types/v3'
import { cn } from '@/utils/cn'
import { formatCompactCurrency, formatDate, formatRelative } from '@/utils/formatters'

const engagementTabs = ['Profile', 'Renewal', 'Risks', 'Activities', 'Escalations', 'Attachments', 'Timeline']

export function Engagement360View({ account, engagement }: { account: Account; engagement: EngagementRecord }) {
  const user = useRole()
  const documents = useV3Store(state => state.sourceDocuments)
  const signals = useV3Store(state => state.signals)
  const escalations = useV3Store(state => state.escalationRecords)
  const entries = useTimelineStore(state => state.entries)
  const [activeTab, setActiveTab] = useState('Profile')
  const [sectionLoading, setSectionLoading] = useState(false)
  const selectedDocs = useMemo(
    () => documents.filter(document => engagement.sourceDocumentIds.includes(document.id)),
    [documents, engagement.sourceDocumentIds],
  )
  const selectedSignals = useMemo(
    () => signals.filter(signal => signal.engagementId === engagement.id),
    [engagement.id, signals],
  )
  const selectedEscalations = useMemo(
    () => escalations.filter(escalation => escalation.engagementId === engagement.id),
    [engagement.id, escalations],
  )
  const engagementEntries = useMemo(
    () =>
      entries
        .filter(entry => entry.accountId === account.id)
        .filter(entry => entry.sourceRecordId === engagement.id || entry.metadata?.engagementId === engagement.id)
        .filter(entry => canViewTimelineEntry(entry, user.role, user.id))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [account.id, engagement.id, entries, user.id, user.role],
  )

  useEffect(() => {
    setSectionLoading(true)
    const timeout = window.setTimeout(() => setSectionLoading(false), 220)
    return () => window.clearTimeout(timeout)
  }, [activeTab, engagement.id])

  return (
    <main className="space-y-5">
      <section className="tk-card overflow-hidden">
        <div className="border-b border-surface-border bg-surface-secondary p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Engagement 360</p>
              <h2 className="font-display text-3xl font-bold leading-tight text-ink">{engagement.name}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-secondary">{engagement.commercialContext || 'Commercial context is awaiting owner input.'}</p>
            </div>
            <StatusPill status={engagement.status} />
          </div>
        </div>
        <div className="grid divide-y divide-surface-border md:grid-cols-4 md:divide-x md:divide-y-0">
          <Metric label="Value" value={formatCompactCurrency(engagement.value)} />
          <Metric label="Delivery health" value={`${engagement.deliveryHealth}%`} />
          <Metric label="Renewal posture" value={formatDate(engagement.renewalTerms.renewalDate)} />
          <Metric label="Risk items" value={engagement.risks.length} />
        </div>
      </section>

      <EngagementHealthPanel engagement={engagement} />

      <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="tk-card overflow-hidden">
        <div className="overflow-x-auto border-b border-surface-border bg-white p-2">
          <Tabs.List className="grid min-w-[820px] gap-1" style={{ gridTemplateColumns: `repeat(${engagementTabs.length}, minmax(108px, 1fr))` }}>
            {engagementTabs.map(tab => (
              <Tabs.Trigger
                key={tab}
                value={tab}
                className="min-h-[44px] rounded-md px-3 text-xs font-semibold text-ink-secondary transition-colors hover:bg-surface-tertiary data-[state=active]:bg-brand-blue data-[state=active]:text-white"
              >
                {tab}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </div>
        <div className="p-5">
          {sectionLoading ? (
            <div className="grid gap-3 md:grid-cols-2">
              {[0, 1, 2, 3].map(item => <div key={item} className="h-24 animate-pulse rounded-lg bg-surface-secondary" />)}
            </div>
          ) : (
            <>
              <Tabs.Content value="Profile" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Account" value={account.name} />
                  <Field label="Owner" value={engagement.ownerName} />
                  <Field label="Ops lead" value={engagement.opsLeadName || 'Not assigned'} />
                  <Field label="Delivery status" value={labelize(engagement.deliveryStatus ?? 'on_track')} />
                  <Field label="Service lines" value={engagement.serviceLines.join(', ')} multiline />
                  <Field label="Resource dependency" value={engagement.resourceDependency || 'No resource dependency captured.'} multiline />
                </div>
                <Panel title="Evidence" icon={FileText}>
                  <EvidenceList docs={selectedDocs} links={engagement.sourceDocumentLinks ?? []} />
                </Panel>
              </Tabs.Content>

              <Tabs.Content value="Renewal" className="grid gap-4 md:grid-cols-3">
                <Field label="Start date" value={formatDate(engagement.renewalTerms.startDate)} />
                <Field label="End date" value={formatDate(engagement.renewalTerms.endDate)} />
                <Field label="Renewal date" value={formatDate(engagement.renewalTerms.renewalDate)} />
                <Field label="Notice deadline" value={formatDate(engagement.renewalTerms.noticeDeadline)} />
                <Field label="Notice period" value={`${engagement.renewalTerms.noticePeriodDays} days`} />
                <Field label="Auto-renewal" value={engagement.renewalTerms.autoRenewal ? 'Yes' : 'No'} />
                <div className="md:col-span-3">
                  <Panel title="Renewal posture" icon={CalendarClock}>
                    <p className="rounded-lg border border-brand-orange/20 bg-brand-orange/10 p-3 text-sm leading-6 text-brand-orange">{engagement.renewalTerms.sourceCitation}</p>
                  </Panel>
                </div>
              </Tabs.Content>

              <Tabs.Content value="Risks" className="space-y-3">
                {[...engagement.risks, ...selectedSignals.map(signal => signal.headline)].length ? (
                  [...engagement.risks, ...selectedSignals.map(signal => signal.headline)].map(item => (
                    <div key={item} className="flex gap-2 rounded-lg border border-brand-orange/20 bg-brand-orange/10 p-3 text-sm text-brand-orange">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      {item}
                    </div>
                  ))
                ) : (
                  <EmptyMessage text="No active risks or signals for this engagement." />
                )}
              </Tabs.Content>

              <Tabs.Content value="Activities" className="space-y-3">
                {engagement.activities?.length ? engagement.activities.map(activity => (
                  <TimelineLikeRow key={activity.id} title={activity.title} detail={activity.detail} meta={`${activity.performedByName} | ${formatRelative(activity.occurredAt)}`} />
                )) : <EmptyMessage text="No engagement-specific activities yet." />}
              </Tabs.Content>

              <Tabs.Content value="Escalations" className="space-y-3">
                {selectedEscalations.length ? selectedEscalations.map(escalation => (
                  <TimelineLikeRow key={escalation.id} title={escalation.title} detail={escalation.mitigation} meta={`${escalation.status} | SLA ${formatDate(escalation.slaDue)}`} />
                )) : <EmptyMessage text="No escalations linked to this engagement." />}
              </Tabs.Content>

              <Tabs.Content value="Attachments" className="space-y-3">
                {engagement.attachments?.length ? engagement.attachments.map(attachment => (
                  <TimelineLikeRow key={attachment.id} title={attachment.name} detail={attachment.url} meta={`${attachment.uploadedByName} | ${formatRelative(attachment.uploadedAt)}`} icon={<Paperclip className="h-4 w-4 text-brand-blue" />} />
                )) : <EmptyMessage text="No attachments added beyond source evidence." />}
              </Tabs.Content>

              <Tabs.Content value="Timeline" className="space-y-3">
                {engagementEntries.length ? engagementEntries.map(entry => (
                  <TimelineLikeRow key={entry.id} title={entry.title} detail={entry.description} meta={`${entry.performedByName} | ${formatRelative(entry.timestamp)}`} icon={<History className="h-4 w-4 text-brand-blue" />} />
                )) : <EmptyMessage text="No engagement events recorded yet. Create, update, health, and escalation events will appear here and in Account Timeline." />}
              </Tabs.Content>
            </>
          )}
        </div>
      </Tabs.Root>
    </main>
  )
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof ShieldCheck; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-surface-border bg-white p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-brand-blue" />
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function Field({ label, value, multiline = false }: { label: string; value: ReactNode; multiline?: boolean }) {
  return (
    <div className="rounded-lg border border-surface-border bg-white p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">{label}</p>
      <p className={cn('mt-1 text-sm font-medium text-ink', multiline ? 'leading-6' : '')}>{value}</p>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold leading-tight text-ink">{value}</p>
    </div>
  )
}

function EvidenceList({ docs, links }: { docs: { id: string; name: string; type: string; confidence: number; citations: { id: string; page: number; excerpt: string }[] }[]; links: { title: string; url: string; type?: string }[] }) {
  const hasEvidence = docs.length || links.length
  if (!hasEvidence) return <EmptyMessage text="Source evidence failed to load or has not been attached yet." />
  return (
    <div className="space-y-2">
      {docs.map(document => (
        <div key={document.id} className="rounded-lg border border-surface-border bg-surface-secondary p-3">
          <p className="text-sm font-semibold text-ink">{document.name}</p>
          <p className="mt-1 text-xs text-ink-secondary">{document.type.replace('_', ' ')} | {document.confidence}% confidence</p>
          {document.citations.slice(0, 1).map(citation => (
            <p key={citation.id} className="mt-2 rounded-md bg-white p-2 text-xs leading-5 text-ink-secondary">Page {citation.page}: {citation.excerpt}</p>
          ))}
        </div>
      ))}
      {links.map(link => (
        <a key={`${link.title}-${link.url}`} className="block rounded-lg border border-surface-border bg-surface-secondary p-3 text-sm font-semibold text-brand-blue" href={link.url} target="_blank" rel="noreferrer">
          {link.title}
          <span className="mt-1 block text-xs font-medium text-ink-secondary">{link.type ?? 'evidence'}</span>
        </a>
      ))}
    </div>
  )
}

function TimelineLikeRow({ title, detail, meta, icon }: { title: string; detail: string; meta: string; icon?: ReactNode }) {
  return (
    <div className="rounded-lg border border-surface-border bg-white p-4">
      <div className="flex items-start gap-3">
        {icon ?? <UserRound className="mt-0.5 h-4 w-4 text-brand-blue" />}
        <div>
          <p className="text-sm font-semibold text-ink">{title}</p>
          <p className="mt-1 text-sm leading-6 text-ink-secondary">{detail}</p>
          <p className="mt-2 text-xs font-medium text-ink-tertiary">{meta}</p>
        </div>
      </div>
    </div>
  )
}

function EmptyMessage({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-surface-border bg-surface-secondary p-4 text-sm leading-6 text-ink-secondary">{text}</p>
}

function StatusPill({ status }: { status: EngagementRecord['status'] }) {
  const tone = status === 'at_risk'
    ? 'border-rag-red/20 bg-rag-red/10 text-rag-red'
    : status === 'renewal_watch'
      ? 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange'
      : status === 'completed'
        ? 'border-surface-border bg-surface-tertiary text-ink-secondary'
        : 'border-rag-green/20 bg-rag-green/10 text-rag-green'
  return <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-wider ${tone}`}>{status.replace('_', ' ')}</span>
}

function labelize(value: string) {
  return value.replace(/_/g, ' ')
}
