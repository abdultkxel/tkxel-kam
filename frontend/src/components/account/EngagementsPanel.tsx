import { AlertTriangle, Archive, ArrowRight, BriefcaseBusiness, CalendarClock, FileText, Loader2, Pencil, Plus, Search, ShieldCheck, Upload, UserRound } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { EngagementFormDialog } from '@/components/account/EngagementFormDialog'
import { ConfirmDialog } from '@/components/admin/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterBar } from '@/components/ui/FilterBar'
import { Skeleton } from '@/components/ui/Skeleton'
import { SortableTable } from '@/components/ui/SortableTable'
import type { Column } from '@/components/ui/SortableTable'
import { useArchiveEngagement, useCreateEngagementFromCharter, useEngagements } from '@/hooks/useEngagements'
import type { Account } from '@/types/account'
import type { EngagementHealthStatus, EngagementRecord, EngagementRenewalRisk, EngagementRenewalStatus, EngagementStatus } from '@/types/v3'
import { cn } from '@/utils/cn'
import { formatDate, titleize } from '@/utils/formatters'

type BadgeTone = 'green' | 'amber' | 'red' | 'blue' | 'gray'

const statusOptions: EngagementStatus[] = ['draft', 'active', 'on_hold', 'renewal_watch', 'at_risk', 'completed', 'archived']
const healthOptions: EngagementHealthStatus[] = ['green', 'amber', 'red', 'unknown']
const renewalStatusOptions: EngagementRenewalStatus[] = ['not_due', 'upcoming_notice_window', 'notice_due', 'renewal_due', 'expired', 'unknown']

export function EngagementsPanel({ account }: { account: Account }) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [healthStatus, setHealthStatus] = useState('')
  const [owner, setOwner] = useState('')
  const [renewalStatus, setRenewalStatus] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingEngagement, setEditingEngagement] = useState<EngagementRecord | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<EngagementRecord | null>(null)
  const charterInputRef = useRef<HTMLInputElement | null>(null)
  const { engagements, isLoading, error, refetch } = useEngagements(account.id, { page: 1, page_size: 100 })
  const { archiveEngagement, isLoading: archiving } = useArchiveEngagement()
  const { createEngagementFromCharter, isLoading: importingCharter } = useCreateEngagementFromCharter()

  const ownerOptions = useMemo(() => {
    const owners = new Map<string, string>()
    engagements.forEach(engagement => {
      const value = ownerFilterValue(engagement)
      if (value) owners.set(value, engagement.ownerName || 'Unassigned')
    })
    return Array.from(owners.entries()).map(([value, label]) => ({ value, label }))
  }, [engagements])

  const filteredEngagements = useMemo(
    () =>
      engagements.filter(engagement => {
        const query = search.trim().toLowerCase()
        if (query && !engagement.name.toLowerCase().includes(query)) return false
        if (status && engagement.status !== status) return false
        if (healthStatus && getHealthStatus(engagement) !== healthStatus) return false
        if (owner && ownerFilterValue(engagement) !== owner) return false
        if (renewalStatus && getRenewalStatus(engagement) !== renewalStatus) return false
        return true
      }),
    [engagements, healthStatus, owner, renewalStatus, search, status],
  )

  const openCreate = useCallback(() => {
    setEditingEngagement(null)
    setFormOpen(true)
  }, [])

  const openEdit = useCallback((engagement: EngagementRecord) => {
    setEditingEngagement(engagement)
    setFormOpen(true)
  }, [])

  const openArchive = useCallback((engagement: EngagementRecord) => {
    setArchiveTarget(engagement)
  }, [])

  const columns = useMemo<Column<EngagementRecord>[]>(
    () => [
      {
        key: 'name',
        header: 'Engagement',
        sortable: true,
        render: engagement => {
          const status = getRenewalStatus(engagement)
          return (
            <div className={cn('min-w-[220px]', isUrgentRenewalStatus(status) && 'rounded-md bg-brand-orange/10 px-3 py-2 ring-1 ring-brand-orange/20')}>
              <p className="font-semibold text-ink">{engagement.name}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone={statusTone(engagement.status)}>{titleize(engagement.status)}</Badge>
                <Badge tone={renewalStatusTone(status)}>{titleize(status)}</Badge>
              </div>
            </div>
          )
        },
      },
      {
        key: 'ownerName',
        header: 'Owner',
        sortable: true,
        render: engagement => (
          <span className="inline-flex min-w-[140px] items-center gap-2">
            <UserRound className="h-4 w-4 shrink-0 text-brand-blue" />
            <span>{engagement.ownerName || 'Unassigned'}</span>
          </span>
        ),
      },
      {
        key: 'serviceLines',
        header: 'Service Lines',
        render: engagement => <span className="block min-w-[180px] text-ink-secondary">{engagement.serviceLines.length ? engagement.serviceLines.join(', ') : 'None recorded'}</span>,
      },
      {
        key: 'deliveryStatus',
        header: 'Delivery',
        render: engagement => (
          <div className="min-w-[150px] space-y-1.5">
            <Badge tone={deliveryTone(engagement.deliveryStatus)}>{titleize(engagement.deliveryStatus ?? 'unknown')}</Badge>
            <Badge tone={healthTone(getHealthStatus(engagement))}>{titleize(getHealthStatus(engagement))}</Badge>
          </div>
        ),
      },
      {
        key: 'value',
        header: 'Contract',
        sortable: true,
        render: engagement => (
          <span className="inline-flex min-w-[120px] items-center gap-2 font-semibold">
            <BriefcaseBusiness className="h-4 w-4 shrink-0 text-brand-blue" />
            {formatContractValue(engagement)}
          </span>
        ),
      },
      {
        key: 'renewalTerms',
        header: 'Dates',
        render: engagement => (
          <div className="min-w-[230px] space-y-1 text-xs text-ink-secondary">
            <DateLine label="Start" value={engagement.renewalTerms.startDate} />
            <DateLine label="End" value={engagement.renewalTerms.endDate} />
            <DateLine label="Renewal" value={engagement.renewalTerms.renewalDate} />
            <DateLine label="Notice" value={engagement.renewalTerms.noticeDeadline} />
          </div>
        ),
      },
      {
        key: 'renewalRisk',
        header: 'Renewal Risk',
        render: engagement => <Badge tone={renewalRiskTone(engagement.renewalRisk)}>{titleize(engagement.renewalRisk ?? 'unknown')}</Badge>,
      },
      {
        key: 'risks',
        header: 'Open Risks',
        render: engagement => (
          <span className={cn('inline-flex min-w-[72px] items-center justify-center rounded-full border px-2 py-1 text-xs font-semibold', engagement.risks.length ? 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange' : 'border-rag-green/20 bg-rag-green/10 text-rag-green')}>
            {engagement.risks.length}
          </span>
        ),
      },
      {
        key: 'actions',
        header: '',
        render: engagement => (
          <span className="inline-flex min-w-[96px] justify-end gap-1">
            <button
              type="button"
              className="tk-icon-button"
              aria-label={`Edit ${engagement.name}`}
              onClick={event => {
                event.stopPropagation()
                openEdit(engagement)
              }}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="tk-icon-button text-rag-red hover:bg-rag-red/10"
              aria-label={`Archive ${engagement.name}`}
              onClick={event => {
                event.stopPropagation()
                openArchive(engagement)
              }}
            >
              <Archive className="h-4 w-4" />
            </button>
            <span className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-brand-blue">
              <ArrowRight className="h-4 w-4" />
            </span>
          </span>
        ),
      },
    ],
    [openArchive, openEdit],
  )

  function clearFilters() {
    setSearch('')
    setStatus('')
    setHealthStatus('')
    setOwner('')
    setRenewalStatus('')
  }

  async function confirmArchive() {
    if (!archiveTarget) return
    try {
      await archiveEngagement(archiveTarget.id, account.id)
      toast.success('Engagement archived')
      setArchiveTarget(null)
      await refetch().catch(() => undefined)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Engagement could not be archived')
    }
  }

  async function importCharter(file?: File | null) {
    if (!file) return
    try {
      const engagement = await createEngagementFromCharter(account.id, file)
      toast.success(`Engagement created from charter: ${engagement.name}`)
      await refetch().catch(() => undefined)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Project charter could not be imported')
    } finally {
      if (charterInputRef.current) charterInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-5">
      <section className="tk-card overflow-hidden">
        <div className="border-b border-surface-border bg-surface-secondary p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Engagement/SOW</p>
              <h2 className="mt-1 text-xl font-semibold text-ink">Account engagements</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-secondary">Track SOW-backed ownership, delivery posture, contract exposure, renewal windows, and open risks for this account.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                ref={charterInputRef}
                type="file"
                className="hidden"
                accept=".xlsx,.xlsm,.xls,.pdf,.docx,.txt,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={event => void importCharter(event.target.files?.[0])}
              />
              <button className="tk-button-secondary bg-white shrink-0" type="button" onClick={() => charterInputRef.current?.click()} disabled={importingCharter}>
                {importingCharter ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Import Charter
              </button>
              <button className="tk-button-primary shrink-0" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Add Engagement
              </button>
            </div>
          </div>
        </div>
        <div className="grid gap-0 divide-y divide-surface-border md:grid-cols-4 md:divide-x md:divide-y-0">
          <SummaryMetric icon={FileText} label="Engagements" value={engagements.length} />
          <SummaryMetric icon={ShieldCheck} label="Healthy" value={engagements.filter(item => getHealthStatus(item) === 'green').length} />
          <SummaryMetric icon={CalendarClock} label="Renewal Watch" value={engagements.filter(item => isUrgentRenewalStatus(getRenewalStatus(item))).length} />
          <SummaryMetric icon={AlertTriangle} label="Open Risks" value={engagements.reduce((sum, item) => sum + item.risks.length, 0)} tone="orange" />
        </div>
      </section>

      <FilterBar onClear={clearFilters} contentClassName="md:grid-cols-[minmax(180px,1.4fr)_repeat(4,minmax(150px,1fr))_auto]">
        <label className="space-y-1">
          <span className="tk-label">Search</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
            <input className="tk-input pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="Engagement name" />
          </div>
        </label>
        <FilterSelect label="Status" value={status} onChange={setStatus} options={statusOptions.map(value => ({ value, label: titleize(value) }))} />
        <FilterSelect label="Health" value={healthStatus} onChange={setHealthStatus} options={healthOptions.map(value => ({ value, label: titleize(value) }))} />
        <FilterSelect label="Owner" value={owner} onChange={setOwner} options={ownerOptions} />
        <FilterSelect label="Renewal" value={renewalStatus} onChange={setRenewalStatus} options={renewalStatusOptions.map(value => ({ value, label: titleize(value) }))} />
      </FilterBar>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : error ? (
        <EmptyState icon={AlertTriangle} heading="Engagements could not be loaded" body={error.message} action={{ label: 'Retry', onClick: () => void refetch() }} />
      ) : engagements.length === 0 ? (
        <EmptyState icon={FileText} heading="No engagements yet" body="Create the first SOW-backed engagement for this account." action={{ label: 'Add Engagement', onClick: openCreate }} />
      ) : filteredEngagements.length === 0 ? (
        <EmptyState icon={FileText} heading="No engagements match these filters" body="Clear filters or search for a different engagement." action={{ label: 'Clear filters', onClick: clearFilters }} />
      ) : (
        <SortableTable
          items={filteredEngagements}
          columns={columns}
          defaultSort={{ column: 'name', direction: 'asc' }}
          onRowClick={engagement => navigate(`/accounts/${account.id}/engagements/${engagement.id}`)}
        />
      )}
      <EngagementFormDialog
        account={account}
        engagement={editingEngagement}
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={() => refetch()}
      />
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="Archive engagement?"
        description={`Archive ${archiveTarget?.name ?? 'this engagement'}? It will be removed from active engagement lists, but history and timeline events will remain available.`}
        confirmLabel="Archive"
        busyLabel="Archiving"
        isBusy={archiving}
        onOpenChange={value => {
          if (!archiving && !value) setArchiveTarget(null)
        }}
        onConfirm={() => void confirmArchive()}
      />
    </div>
  )
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="space-y-1">
      <span className="tk-label">{label}</span>
      <select className="tk-input" value={value} onChange={event => onChange(event.target.value)}>
        <option value="">All</option>
        {options.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}

function SummaryMetric({ icon: Icon, label, value, tone = 'blue' }: { icon: typeof FileText; label: string; value: number; tone?: 'blue' | 'orange' }) {
  return (
    <div className="flex min-h-[104px] items-center gap-3 bg-white p-4">
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', tone === 'orange' ? 'bg-brand-orange/10 text-brand-orange' : 'bg-blue-tint-20 text-brand-blue')}>
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">{label}</p>
        <p className="mt-1 font-display text-2xl font-bold text-ink">{value}</p>
      </div>
    </div>
  )
}

function DateLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex justify-between gap-3">
      <span className="font-semibold uppercase tracking-wider">{label}</span>
      <span className="font-medium text-ink">{formatOptionalDate(value)}</span>
    </p>
  )
}

function Badge({ tone, children }: { tone: BadgeTone; children: string }) {
  const toneClass: Record<BadgeTone, string> = {
    green: 'border-rag-green/20 bg-rag-green/10 text-rag-green',
    amber: 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange',
    red: 'border-rag-red/20 bg-rag-red/10 text-rag-red',
    blue: 'border-brand-blue/20 bg-blue-tint-20 text-brand-blue',
    gray: 'border-surface-border bg-surface-tertiary text-ink-secondary',
  }
  return <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider', toneClass[tone])}>{children}</span>
}

function ownerFilterValue(engagement: EngagementRecord) {
  return engagement.ownerId || engagement.ownerName
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

function deliveryTone(status: EngagementRecord['deliveryStatus']): BadgeTone {
  if (status === 'active' || status === 'completed') return 'green'
  if (status === 'planned' || status === 'watch') return 'amber'
  if (status === 'blocked' || status === 'at_risk') return 'red'
  if (status === 'not_started') return 'blue'
  return 'gray'
}

function healthTone(status: EngagementHealthStatus): BadgeTone {
  if (status === 'green') return 'green'
  if (status === 'amber') return 'amber'
  if (status === 'red') return 'red'
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

function isUrgentRenewalStatus(status: EngagementRenewalStatus) {
  return status === 'notice_due' || status === 'renewal_due' || status === 'expired'
}

function formatOptionalDate(value: string) {
  const time = Date.parse(value)
  return Number.isFinite(time) ? formatDate(value) : 'Not set'
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

function formatContractValue(engagement: EngagementRecord) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: engagement.currency ?? 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(engagement.contractValue ?? engagement.value)
}
