import * as Tabs from '@radix-ui/react-tabs'
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  FileText,
  History,
  Link2,
  Pencil,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { EngagementFormDialog } from '@/components/account/EngagementFormDialog'
import { ConfirmDialog } from '@/components/admin/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { useArchiveEngagement, useEngagement, useEngagementTimeline } from '@/hooks/useEngagements'
import type { TimelineEntry } from '@/types/timeline'
import type { EngagementHealthStatus, EngagementRecord, EngagementRenewalRisk, EngagementRenewalStatus, EngagementStatus } from '@/types/v3'
import { cn } from '@/utils/cn'
import { formatDate, formatRelative, titleize } from '@/utils/formatters'

type BadgeTone = 'green' | 'amber' | 'red' | 'blue' | 'gray'
type DetailTab = 'Profile' | 'SOW / Renewal' | 'Delivery Health' | 'Risks' | 'Timeline'

const tabs: DetailTab[] = ['Profile', 'SOW / Renewal', 'Delivery Health', 'Risks', 'Timeline']

export function EngagementDetail() {
  const navigate = useNavigate()
  const { accountId, engagementId } = useParams()
  const [formOpen, setFormOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<DetailTab>('Profile')
  const { data: engagement, isLoading, error, refetch } = useEngagement(engagementId)
  const { events, isLoading: timelineLoading, error: timelineError, refetch: refetchTimeline } = useEngagementTimeline(engagementId, { page: 1, page_size: 50 })
  const { archiveEngagement, isLoading: archiving } = useArchiveEngagement()

  if (!engagementId) return <Navigate to={accountId ? `/accounts/${accountId}?tab=engagements` : '/accounts'} replace />

  if (isLoading && !engagement) {
    return (
      <div>
        <PageHeader eyebrow="Engagement 360" title="Loading engagement" description="Fetching Engagement/SOW details." />
        <div className="space-y-4">
          <Skeleton className="h-36 w-full" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    )
  }

  if (error && !engagement) {
    return <EmptyState icon={AlertTriangle} heading="Engagement could not be loaded" body={error.message} action={{ label: 'Retry', onClick: () => void refetch() }} />
  }

  if (!engagement) return <Navigate to={accountId ? `/accounts/${accountId}?tab=engagements` : '/accounts'} replace />

  const backAccountId = engagement.accountId
  const currentEngagementId = engagement.id
  const currentAccountId = engagement.accountId
  const healthStatus = getHealthStatus(engagement)
  const renewalStatus = getRenewalStatus(engagement)
  const headerDetails = [
    engagement.accountName ? `Account: ${engagement.accountName}` : null,
    `Owner: ${engagement.ownerName || 'Unassigned'}`,
    engagement.serviceLines.length ? engagement.serviceLines.join(', ') : 'No service lines recorded',
  ].filter(Boolean).join(' | ')

  async function confirmArchive() {
    try {
      await archiveEngagement(currentEngagementId, currentAccountId)
      toast.success('Engagement archived')
      setArchiveOpen(false)
      navigate(`/accounts/${currentAccountId}?tab=engagements`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Engagement could not be archived')
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Engagement 360"
        title={engagement.name}
        description={headerDetails}
        actions={
          <>
            <Badge tone={statusTone(engagement.status)}>{titleize(engagement.status)}</Badge>
            <Badge tone={healthTone(healthStatus)}>{titleize(healthStatus)}</Badge>
            <Badge tone={deliveryTone(engagement.deliveryStatus)}>{titleize(engagement.deliveryStatus ?? 'unknown')}</Badge>
            <Badge tone={renewalRiskTone(engagement.renewalRisk)}>{titleize(engagement.renewalRisk ?? 'unknown')}</Badge>
            <button className="tk-button-primary" onClick={() => setFormOpen(true)}>
              <Pencil className="h-4 w-4" />
              Edit Engagement
            </button>
            <button className="tk-button-secondary border-rag-red/30 text-rag-red hover:bg-rag-red/10" onClick={() => setArchiveOpen(true)}>
              <Archive className="h-4 w-4" />
              Archive
            </button>
            <Link className="tk-button-secondary" to={`/accounts/${backAccountId}?tab=engagements`}>
              <ArrowLeft className="h-4 w-4" />
              Account engagements
            </Link>
          </>
        }
      />

      <section className="tk-card mb-5 overflow-hidden">
        <div className="grid divide-y divide-surface-border sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4 xl:grid-cols-8">
          <SummaryCard icon={BriefcaseBusiness} label="Contract value" value={formatContractValue(engagement)} />
          <SummaryCard icon={CalendarClock} label="Start date" value={formatOptionalDate(engagement.renewalTerms.startDate)} />
          <SummaryCard icon={CalendarClock} label="End date" value={formatOptionalDate(engagement.renewalTerms.endDate)} tone={daysTone(engagement.renewalTerms.daysToExpiry)} />
          <SummaryCard icon={CalendarClock} label="Renewal date" value={formatOptionalDate(engagement.renewalTerms.renewalDate)} tone={renewalStatus === 'renewal_due' ? 'amber' : 'blue'} />
          <SummaryCard icon={CalendarClock} label="Notice deadline" value={formatOptionalDate(engagement.renewalTerms.noticeDeadline)} tone={renewalStatus === 'notice_due' ? 'amber' : 'blue'} />
          <SummaryCard icon={TrendingUp} label="Days to expiry" value={formatDaysToExpiry(engagement.renewalTerms.daysToExpiry)} tone={daysTone(engagement.renewalTerms.daysToExpiry)} />
          <SummaryCard icon={ShieldCheck} label="Renewal status" value={titleize(renewalStatus)} tone={renewalStatusTone(renewalStatus)} />
          <SummaryCard icon={AlertTriangle} label="Open risks" value={String(engagement.risks.length)} tone={engagement.risks.length ? 'amber' : 'green'} />
        </div>
      </section>

      <Tabs.Root value={activeTab} onValueChange={value => setActiveTab(value as DetailTab)} className="space-y-5">
        <div className="rounded-lg border border-surface-border bg-white p-2 shadow-card">
          <label className="grid gap-1 md:hidden">
            <span className="px-1 text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Engagement section</span>
            <select className="tk-input" value={activeTab} onChange={event => setActiveTab(event.target.value as DetailTab)}>
              {tabs.map(tab => (
                <option key={tab} value={tab}>{tab}</option>
              ))}
            </select>
          </label>
          <Tabs.List className="hidden gap-1 md:grid md:grid-cols-5">
            {tabs.map(tab => (
              <Tabs.Trigger
                key={tab}
                value={tab}
                className="flex min-h-[44px] items-center justify-center rounded-md px-3 text-center text-xs font-semibold text-ink-secondary transition-colors hover:bg-surface-tertiary hover:text-ink data-[state=active]:bg-brand-blue data-[state=active]:text-white"
              >
                {tab}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </div>

        <Tabs.Content value="Profile">
          <ProfileTab engagement={engagement} healthStatus={healthStatus} renewalStatus={renewalStatus} />
        </Tabs.Content>

        <Tabs.Content value="SOW / Renewal">
          <SowRenewalTab engagement={engagement} renewalStatus={renewalStatus} />
        </Tabs.Content>

        <Tabs.Content value="Delivery Health">
          <DeliveryHealthTab engagement={engagement} healthStatus={healthStatus} />
        </Tabs.Content>

        <Tabs.Content value="Risks">
          <RisksTab engagement={engagement} onEdit={() => setFormOpen(true)} />
        </Tabs.Content>

        <Tabs.Content value="Timeline">
          <TimelineTab events={events} isLoading={timelineLoading} error={timelineError} onRetry={() => void refetchTimeline()} />
        </Tabs.Content>
      </Tabs.Root>

      <EngagementFormDialog
        account={{ id: backAccountId, ownerId: engagement.ownerId, ownerName: engagement.ownerName }}
        engagement={engagement}
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={() => Promise.allSettled([refetch(), refetchTimeline()])}
      />
      <ConfirmDialog
        open={archiveOpen}
        title="Archive engagement?"
        description={`Archive ${engagement.name}? It will be removed from active engagement lists, but history and timeline events will remain available.`}
        confirmLabel="Archive"
        busyLabel="Archiving"
        isBusy={archiving}
        onOpenChange={value => {
          if (!archiving) setArchiveOpen(value)
        }}
        onConfirm={() => void confirmArchive()}
      />
    </div>
  )
}

function ProfileTab({ engagement, healthStatus, renewalStatus }: { engagement: EngagementRecord; healthStatus: EngagementHealthStatus; renewalStatus: EngagementRenewalStatus }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="tk-card overflow-hidden">
        <SectionHeader icon={FileText} title="Basic Details" eyebrow="Profile" />
        <div className="space-y-5 p-5">
          <DescriptionBlock title="Description" value={engagement.description || engagement.commercialContext || 'No description recorded.'} />
          <DetailGrid>
            <Field label="Account" value={engagement.accountName || engagement.accountId} />
            <Field label="Owner" value={engagement.ownerName || 'Unassigned'} />
            <Field label="Ops lead" value={engagement.opsLeadName || 'Unassigned'} />
            <Field label="Status" value={<Badge tone={statusTone(engagement.status)}>{titleize(engagement.status)}</Badge>} />
            <Field label="Delivery status" value={<Badge tone={deliveryTone(engagement.deliveryStatus)}>{titleize(engagement.deliveryStatus ?? 'unknown')}</Badge>} />
            <Field label="Health" value={<Badge tone={healthTone(healthStatus)}>{titleize(healthStatus)}</Badge>} />
            <Field label="Renewal risk" value={<Badge tone={renewalRiskTone(engagement.renewalRisk)}>{titleize(engagement.renewalRisk ?? 'unknown')}</Badge>} />
            <Field label="Renewal status" value={<Badge tone={renewalStatusTone(renewalStatus)}>{titleize(renewalStatus)}</Badge>} />
            <Field label="Contract value" value={formatContractValue(engagement)} />
          </DetailGrid>
          <ChipSection label="Service lines" items={engagement.serviceLines} empty="No service lines recorded." />
        </div>
      </section>

      <section className="tk-card overflow-hidden">
        <SectionHeader icon={Link2} title="Sources" eyebrow="Evidence" />
        <div className="space-y-4 p-5">
          <SourceLinks engagement={engagement} />
        </div>
      </section>
    </div>
  )
}

function SowRenewalTab({ engagement, renewalStatus }: { engagement: EngagementRecord; renewalStatus: EngagementRenewalStatus }) {
  return (
    <section className="tk-card overflow-hidden">
      <SectionHeader icon={CalendarClock} title="SOW / Renewal" eyebrow="Commercial terms" />
      <div className="space-y-5 p-5">
        <DetailGrid>
          <Field label="Start date" value={formatOptionalDate(engagement.renewalTerms.startDate)} />
          <Field label="End date" value={formatOptionalDate(engagement.renewalTerms.endDate)} />
          <Field label="Renewal date" value={formatOptionalDate(engagement.renewalTerms.renewalDate)} />
          <Field label="Notice period" value={`${engagement.renewalTerms.noticePeriodDays ?? 0} days`} />
          <Field label="Notice deadline" value={formatOptionalDate(engagement.renewalTerms.noticeDeadline)} />
          <Field label="Days to expiry" value={formatDaysToExpiry(engagement.renewalTerms.daysToExpiry)} />
          <Field label="Renewal risk" value={<Badge tone={renewalRiskTone(engagement.renewalRisk)}>{titleize(engagement.renewalRisk ?? 'unknown')}</Badge>} />
          <Field label="Renewal status" value={<Badge tone={renewalStatusTone(renewalStatus)}>{titleize(renewalStatus)}</Badge>} />
          <Field label="Commercial status" value={<Badge tone={commercialTone(engagement.commercialStatus)}>{titleize(engagement.commercialStatus ?? 'unknown')}</Badge>} />
          <Field label="Contract value" value={formatContractValue(engagement)} />
        </DetailGrid>
        <DescriptionBlock title="Commercial context" value={engagement.commercialContext || 'No commercial context recorded.'} />
      </div>
    </section>
  )
}

function DeliveryHealthTab({ engagement, healthStatus }: { engagement: EngagementRecord; healthStatus: EngagementHealthStatus }) {
  return (
    <section className="tk-card overflow-hidden">
      <SectionHeader icon={ShieldCheck} title="Delivery Health" eyebrow="Delivery posture" />
      <div className="space-y-5 p-5">
        <DetailGrid>
          <Field label="Delivery status" value={<Badge tone={deliveryTone(engagement.deliveryStatus)}>{titleize(engagement.deliveryStatus ?? 'unknown')}</Badge>} />
          <Field label="Health score" value={`${engagement.healthScore ?? engagement.deliveryHealth}/100`} />
          <Field label="Health status" value={<Badge tone={healthTone(healthStatus)}>{titleize(healthStatus)}</Badge>} />
          <Field label="Open risks" value={String(engagement.risks.length)} />
        </DetailGrid>
        <DescriptionBlock title="Resource dependency notes" value={engagement.resourceDependencyNotes || engagement.resourceDependency || 'No resource dependency notes recorded.'} />
        <div className="rounded-lg border border-dashed border-surface-border bg-surface-secondary p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-blue" />
            <div>
              <p className="text-sm font-semibold text-ink">Health drivers</p>
              <p className="mt-1 text-sm leading-6 text-ink-secondary">Scoring driver breakdown is not available yet. This page keeps the latest delivery status, health score, risks, and resource notes visible until the scoring engine supplies driver-level detail.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function RisksTab({ engagement, onEdit }: { engagement: EngagementRecord; onEdit: () => void }) {
  return (
    <section className="tk-card overflow-hidden">
      <SectionHeader
        icon={AlertTriangle}
        title="Risks"
        eyebrow="Risk register"
        actions={
          <button className="tk-button-secondary" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
            Edit Engagement
          </button>
        }
      />
      <div className="p-5">
        {engagement.risks.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {engagement.risks.map((risk, index) => (
              <article key={`${risk}-${index}`} className="rounded-lg border border-brand-orange/20 bg-brand-orange/10 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-brand-orange" />
                  <p className="text-sm leading-6 text-brand-orange">{risk}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState icon={CheckCircle2} heading="No open risks recorded" body="Risks for this engagement are currently clear." className="rounded-lg border border-surface-border bg-surface-secondary" />
        )}
      </div>
    </section>
  )
}

function TimelineTab({ events, isLoading, error, onRetry }: { events: TimelineEntry[]; isLoading: boolean; error: Error | null; onRetry: () => void }) {
  return (
    <section className="tk-card overflow-hidden">
      <SectionHeader icon={History} title="Timeline" eyebrow="Engagement events" />
      <div className="p-5">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : error ? (
          <EmptyState icon={AlertTriangle} heading="Timeline could not be loaded" body={error.message} action={{ label: 'Retry', onClick: onRetry }} />
        ) : events.length ? (
          <div className="space-y-3">
            {events.map(event => (
              <TimelineEventCard key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <EmptyState icon={History} heading="No timeline events yet" body="Engagement activity will appear here after create, update, health, renewal, and archive actions." />
        )}
      </div>
    </section>
  )
}

function TimelineEventCard({ event }: { event: TimelineEntry }) {
  return (
    <article className="rounded-lg border border-surface-border bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="blue">{titleize(event.eventType)}</Badge>
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-tertiary">{formatOptionalDate(event.timestamp)} | {formatRelative(event.timestamp)}</span>
          </div>
          <h3 className="mt-3 text-base font-semibold text-ink">{event.title}</h3>
          <p className="mt-1 text-sm leading-6 text-ink-secondary">{event.description}</p>
        </div>
        <div className="shrink-0 rounded-lg border border-surface-border bg-surface-secondary px-3 py-2 text-xs font-semibold text-ink-secondary">
          Actor: {event.performedByName || event.performedBy}
        </div>
      </div>
      {(event.beforeValue || event.afterValue) ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <TimelineValue label="Previous value" value={event.beforeValue} />
          <TimelineValue label="New value" value={event.afterValue} />
        </div>
      ) : null}
    </article>
  )
}

function TimelineValue({ label, value }: { label: string; value?: Record<string, unknown> }) {
  return (
    <div className="min-w-0 rounded-lg border border-surface-border bg-surface-secondary p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">{label}</p>
      {value ? (
        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md bg-white p-3 text-xs leading-5 text-ink-secondary">{formatTimelineValue(value)}</pre>
      ) : (
        <p className="mt-2 text-sm text-ink-tertiary">Not recorded</p>
      )}
    </div>
  )
}

function SourceLinks({ engagement }: { engagement: EngagementRecord }) {
  const links = engagement.sourceLinks ?? []
  const hasSources = links.length || engagement.sourceDocumentIds.length || engagement.sourceCitation
  if (!hasSources) return <p className="text-sm text-ink-secondary">No source links or source documents recorded.</p>

  return (
    <>
      {links.length ? (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">Source links</p>
          <div className="mt-2 space-y-2">
            {links.map((link, index) => (
              <a
                key={`${link.url}-${index}`}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-surface-border bg-surface-secondary px-3 py-2 text-sm font-semibold text-brand-blue transition-colors hover:bg-blue-tint-20"
              >
                <span className="min-w-0 break-words">{link.title || link.url}</span>
                <ExternalLink className="h-4 w-4 shrink-0" />
              </a>
            ))}
          </div>
        </div>
      ) : null}
      {engagement.sourceDocumentIds.length ? (
        <ChipSection label="Source documents" items={engagement.sourceDocumentIds} empty="No source document IDs recorded." />
      ) : null}
      {engagement.sourceCitation ? <DescriptionBlock title="Source citation" value={engagement.sourceCitation} /> : null}
    </>
  )
}

function SectionHeader({ icon: Icon, title, eyebrow, actions }: { icon: typeof FileText; title: string; eyebrow: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-surface-border bg-surface-secondary p-5 md:flex-row md:items-start md:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-tint-20 text-brand-blue">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">{eyebrow}</p>
          <h2 className="mt-1 text-xl font-semibold text-ink">{title}</h2>
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}

function DetailGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-x-6 gap-y-4 md:grid-cols-2 xl:grid-cols-3">{children}</div>
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 border-b border-surface-border pb-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">{label}</p>
      <div className="mt-1 break-words text-sm font-medium leading-6 text-ink">{value}</div>
    </div>
  )
}

function DescriptionBlock({ title, value }: { title: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">{title}</p>
      <div className="mt-2 rounded-lg border border-surface-border bg-surface-secondary p-4 text-sm leading-6 text-ink-secondary">{value}</div>
    </div>
  )
}

function ChipSection({ label, items, empty }: { label: string; items: string[]; empty: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">{label}</p>
      {items.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {items.map(item => (
            <span key={item} className="rounded-full border border-surface-border bg-surface-secondary px-3 py-1 text-xs font-semibold text-ink-secondary">{item}</span>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-ink-secondary">{empty}</p>
      )}
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value, tone = 'blue' }: { icon: typeof FileText; label: string; value: string; tone?: BadgeTone }) {
  const toneClass: Record<BadgeTone, string> = {
    green: 'bg-rag-green/10 text-rag-green',
    amber: 'bg-brand-orange/10 text-brand-orange',
    red: 'bg-rag-red/10 text-rag-red',
    blue: 'bg-blue-tint-20 text-brand-blue',
    gray: 'bg-surface-tertiary text-ink-secondary',
  }
  return (
    <div className="min-h-[124px] bg-white p-4">
      <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', toneClass[tone])}>
        <Icon className="h-4 w-4" />
      </span>
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">{label}</p>
      <p className="mt-1 break-words text-sm font-bold leading-5 text-ink">{value}</p>
    </div>
  )
}

function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  const toneClass: Record<BadgeTone, string> = {
    green: 'border-rag-green/20 bg-rag-green/10 text-rag-green',
    amber: 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange',
    red: 'border-rag-red/20 bg-rag-red/10 text-rag-red',
    blue: 'border-brand-blue/20 bg-blue-tint-20 text-brand-blue',
    gray: 'border-surface-border bg-surface-tertiary text-ink-secondary',
  }
  return <span className={cn('inline-flex min-h-[28px] items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider', toneClass[tone])}>{children}</span>
}

function getHealthStatus(engagement: EngagementRecord): EngagementHealthStatus {
  if (engagement.healthStatus) return engagement.healthStatus
  if (engagement.deliveryHealth >= 80) return 'green'
  if (engagement.deliveryHealth >= 60) return 'amber'
  return 'red'
}

function getRenewalStatus(engagement: EngagementRecord): EngagementRenewalStatus {
  if (engagement.renewalStatus) return engagement.renewalStatus
  if (engagement.renewalTerms.renewalStatus) return engagement.renewalTerms.renewalStatus
  const daysToExpiry = engagement.renewalTerms.daysToExpiry
  if (!Number.isFinite(daysToExpiry)) return 'unknown'
  if (daysToExpiry < 0) return 'expired'

  const renewalDays = daysUntil(engagement.renewalTerms.renewalDate)
  if (Number.isFinite(renewalDays) && renewalDays <= 30) return 'renewal_due'

  const noticeDays = daysUntil(engagement.renewalTerms.noticeDeadline)
  if (Number.isFinite(noticeDays) && noticeDays <= 30) return 'notice_due'
  if (Number.isFinite(noticeDays) && noticeDays <= 90) return 'upcoming_notice_window'

  return 'not_due'
}

function statusTone(status: EngagementStatus): BadgeTone {
  if (status === 'active' || status === 'completed') return 'green'
  if (status === 'renewal_watch' || status === 'on_hold') return 'amber'
  if (status === 'at_risk') return 'red'
  if (status === 'draft') return 'blue'
  return 'gray'
}

function healthTone(status: EngagementHealthStatus): BadgeTone {
  if (status === 'green') return 'green'
  if (status === 'amber') return 'amber'
  if (status === 'red') return 'red'
  return 'gray'
}

function deliveryTone(status?: EngagementRecord['deliveryStatus']): BadgeTone {
  if (status === 'active' || status === 'completed') return 'green'
  if (status === 'planned' || status === 'watch') return 'amber'
  if (status === 'blocked' || status === 'at_risk') return 'red'
  if (status === 'not_started') return 'blue'
  return 'gray'
}

function renewalRiskTone(risk?: EngagementRenewalRisk): BadgeTone {
  if (risk === 'low') return 'green'
  if (risk === 'medium') return 'amber'
  if (risk === 'high') return 'red'
  return 'gray'
}

function renewalStatusTone(status: EngagementRenewalStatus): BadgeTone {
  if (status === 'not_due') return 'green'
  if (status === 'upcoming_notice_window' || status === 'renewal_due' || status === 'notice_due') return 'amber'
  if (status === 'expired') return 'red'
  return 'gray'
}

function commercialTone(status?: EngagementRecord['commercialStatus']): BadgeTone {
  if (status === 'healthy') return 'green'
  if (status === 'watch') return 'amber'
  if (status === 'risk') return 'red'
  return 'gray'
}

function daysTone(days: number): BadgeTone {
  if (!Number.isFinite(days)) return 'gray'
  if (days < 0) return 'red'
  if (days <= 30) return 'amber'
  return 'blue'
}

function formatOptionalDate(value?: string | null) {
  if (!value) return 'Not set'
  const time = Date.parse(value)
  return Number.isFinite(time) ? formatDate(value) : 'Not set'
}

function formatDaysToExpiry(days: number) {
  if (!Number.isFinite(days)) return 'Not set'
  if (days === 0) return 'Today'
  if (days < 0) return `${Math.abs(days)}d expired`
  return `${days}d`
}

function formatContractValue(engagement: EngagementRecord) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: engagement.currency ?? 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(engagement.contractValue ?? engagement.value)
}

function daysUntil(value?: string | null) {
  if (!value) return Number.NaN
  const time = Date.parse(value)
  if (!Number.isFinite(time)) return Number.NaN
  const target = new Date(time)
  const today = new Date()
  const targetDay = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate())
  const todayDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((targetDay - todayDay) / (24 * 60 * 60 * 1000))
}

function formatTimelineValue(value: Record<string, unknown>) {
  return JSON.stringify(value, null, 2)
}
