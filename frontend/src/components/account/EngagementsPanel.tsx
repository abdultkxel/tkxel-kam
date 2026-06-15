import { AlertTriangle, Archive, ArrowRight, BriefcaseBusiness, CalendarClock, CheckCircle2, FileText, Loader2, Pencil, Plus, Save, Search, ShieldCheck, Upload, UserRound, XCircle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { EngagementFormDialog } from '@/components/account/EngagementFormDialog'
import { ConfirmDialog } from '@/components/admin/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterBar } from '@/components/ui/FilterBar'
import { Skeleton } from '@/components/ui/Skeleton'
import { SortableTable } from '@/components/ui/SortableTable'
import type { Column } from '@/components/ui/SortableTable'
import { useApproveEngagementImportDraft, useArchiveEngagement, useCreateEngagementFromCharter, useEngagementImportDrafts, useEngagements, useRejectEngagementImportDraft, useUpdateEngagementImportDraft } from '@/hooks/useEngagements'
import type { EngagementImportDraftRecord, EngagementUpdatePayload } from '@/services/accountWorkspace'
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
  const { drafts, isLoading: draftsLoading, refetch: refetchDrafts } = useEngagementImportDrafts(account.id)
  const { archiveEngagement, isLoading: archiving } = useArchiveEngagement()
  const { createEngagementFromCharter, isLoading: importingCharter } = useCreateEngagementFromCharter()
  const { updateEngagementImportDraft, isLoading: savingDraft } = useUpdateEngagementImportDraft()
  const { approveEngagementImportDraft, isLoading: approvingDraft } = useApproveEngagementImportDraft()
  const { rejectEngagementImportDraft, isLoading: rejectingDraft } = useRejectEngagementImportDraft()

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
      const draft = await createEngagementFromCharter(account.id, file)
      toast.success(`Engagement draft ready: ${draft.name}`)
      await refetchDrafts().catch(() => undefined)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Project charter could not be imported')
    } finally {
      if (charterInputRef.current) charterInputRef.current.value = ''
    }
  }

  async function saveDraft(draft: EngagementImportDraftRecord, payload: EngagementUpdatePayload) {
    try {
      await updateEngagementImportDraft(draft.id, payload, account.id)
      toast.success('Engagement draft changes saved')
      await refetchDrafts().catch(() => undefined)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Engagement draft could not be saved')
      throw error
    }
  }

  async function approveDraft(draft: EngagementImportDraftRecord) {
    try {
      await approveEngagementImportDraft(draft.id, account.id)
      toast.success('Engagement draft approved')
      await Promise.all([refetchDrafts().catch(() => undefined), refetch().catch(() => undefined)])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Engagement draft could not be approved')
      throw error
    }
  }

  async function rejectDraft(draft: EngagementImportDraftRecord, reason: string) {
    try {
      await rejectEngagementImportDraft(draft.id, reason, account.id)
      toast.success('Engagement draft rejected')
      await refetchDrafts().catch(() => undefined)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Engagement draft could not be rejected')
      throw error
    }
  }

  const draftBusy = savingDraft || approvingDraft || rejectingDraft

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

      {draftsLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
        </div>
      ) : drafts.length > 0 ? (
        <section className="tk-card overflow-hidden">
          <div className="border-b border-surface-border bg-blue-tint-20 p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Imported charter drafts</p>
                <h3 className="mt-1 text-lg font-semibold text-ink">{drafts.length} ready for review</h3>
              </div>
              <Badge tone="blue">Draft</Badge>
            </div>
          </div>
          <div className="divide-y divide-surface-border">
            {drafts.map(draft => (
              <EngagementDraftReviewCard
                key={draft.id}
                draft={draft}
                busy={draftBusy}
                onSave={saveDraft}
                onApprove={approveDraft}
                onReject={rejectDraft}
              />
            ))}
          </div>
        </section>
      ) : null}

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

interface EngagementDraftFormState {
  name: string
  serviceLines: string
  value: string
  startDate: string
  endDate: string
  renewalDate: string
  noticePeriodDays: string
  commercialContext: string
  resourceDependency: string
  risks: string
  rejectReason: string
}

function EngagementDraftReviewCard({
  draft,
  busy,
  onSave,
  onApprove,
  onReject,
}: {
  draft: EngagementImportDraftRecord
  busy: boolean
  onSave: (draft: EngagementImportDraftRecord, payload: EngagementUpdatePayload) => Promise<void>
  onApprove: (draft: EngagementImportDraftRecord) => Promise<void>
  onReject: (draft: EngagementImportDraftRecord, reason: string) => Promise<void>
}) {
  const [form, setForm] = useState<EngagementDraftFormState>(() => draftToForm(draft))
  const [formError, setFormError] = useState('')

  useEffect(() => {
    setForm(draftToForm(draft))
    setFormError('')
  }, [draft])

  function updateField(field: keyof EngagementDraftFormState, value: string) {
    setForm(current => ({ ...current, [field]: value }))
    if (formError) setFormError('')
  }

  function payloadFromForm(): EngagementUpdatePayload {
    const value = Number(form.value || 0)
    return {
      name: form.name.trim(),
      serviceLines: splitList(form.serviceLines),
      contractValue: Number.isFinite(value) ? value : 0,
      startDate: dateInputToIso(form.startDate) ?? undefined,
      endDate: dateInputToIso(form.endDate),
      renewalDate: dateInputToIso(form.renewalDate),
      noticePeriodDays: form.noticePeriodDays.trim() ? Number(form.noticePeriodDays) : null,
      commercialContext: form.commercialContext.trim() || null,
      resourceDependency: form.resourceDependency.trim() || null,
      risks: splitList(form.risks),
    }
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setFormError('Engagement name is required.')
      return false
    }
    if (splitList(form.serviceLines).length === 0) {
      setFormError('Add at least one service line.')
      return false
    }
    await onSave(draft, payloadFromForm())
    return true
  }

  async function handleApprove() {
    const saved = await handleSave()
    if (!saved) return
    await onApprove(draft)
  }

  async function handleReject() {
    const reason = form.rejectReason.trim()
    if (reason.length < 3) {
      setFormError('Add a rejection reason.')
      return
    }
    await onReject(draft, reason)
  }

  return (
    <article className="bg-white p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-base font-semibold text-ink">{draft.name}</h4>
            <Badge tone="amber">{`${draft.confidence}% confidence`}</Badge>
          </div>
          <p className="mt-1 text-sm text-ink-secondary">{draft.sourceDocuments[0]?.fileName ?? draft.sourceDocuments[0]?.name ?? 'Imported source document'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="tk-button-secondary bg-white" disabled={busy} onClick={() => void handleSave()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save draft changes
          </button>
          <button type="button" className="tk-button-primary" disabled={busy} onClick={() => void handleApprove()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Approve draft
          </button>
        </div>
      </div>

      {draft.missingFields.length > 0 ? (
        <div className="mt-4 rounded-md border border-brand-orange/20 bg-brand-orange/10 p-3 text-sm text-brand-orange">
          {draft.missingFields.join(' ')}
        </div>
      ) : null}
      {formError ? <p className="mt-3 text-sm font-semibold text-rag-red">{formError}</p> : null}

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <DraftField label="Engagement name" value={form.name} onChange={value => updateField('name', value)} />
        <DraftField label="Service lines" value={form.serviceLines} onChange={value => updateField('serviceLines', value)} />
        <DraftField label="Contract value" value={form.value} type="number" onChange={value => updateField('value', value)} />
        <DraftField label="Notice period days" value={form.noticePeriodDays} type="number" onChange={value => updateField('noticePeriodDays', value)} />
        <DraftField label="Start date" value={form.startDate} type="date" onChange={value => updateField('startDate', value)} />
        <DraftField label="End date" value={form.endDate} type="date" onChange={value => updateField('endDate', value)} />
        <DraftField label="Renewal date" value={form.renewalDate} type="date" onChange={value => updateField('renewalDate', value)} />
        <div className="rounded-md border border-surface-border bg-surface-secondary p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">Assigned owner</p>
          <p className="mt-1 text-sm font-semibold text-ink">{draft.ownerName}</p>
        </div>
        <DraftTextarea label="Commercial context" value={form.commercialContext} onChange={value => updateField('commercialContext', value)} />
        <DraftTextarea label="Risks" value={form.risks} onChange={value => updateField('risks', value)} />
        <DraftTextarea label="Resource dependency" value={form.resourceDependency} onChange={value => updateField('resourceDependency', value)} />
        <DraftTextarea label="Reject reason" value={form.rejectReason} onChange={value => updateField('rejectReason', value)} />
      </div>

      {draft.stakeholderDrafts.length > 0 ? (
        <div className="mt-5 rounded-md border border-surface-border bg-surface-secondary p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">Stakeholders drafted</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {draft.stakeholderDrafts.map((stakeholder, index) => (
              <span key={`${stakeholder.email ?? stakeholder.name ?? index}`} className="rounded-full border border-surface-border bg-white px-2.5 py-1 text-xs font-semibold text-ink-secondary">
                {stakeholder.name}
                {stakeholder.title ? `, ${stakeholder.title}` : ''}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex justify-end">
        <button type="button" className="tk-button-secondary bg-white text-rag-red hover:bg-rag-red/10" disabled={busy} onClick={() => void handleReject()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
          Reject draft
        </button>
      </div>
    </article>
  )
}

function DraftField({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: 'text' | 'number' | 'date' }) {
  return (
    <label className="space-y-1">
      <span className="tk-label">{label}</span>
      <input className="tk-input" type={type} value={value} onChange={event => onChange(event.target.value)} />
    </label>
  )
}

function DraftTextarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-1">
      <span className="tk-label">{label}</span>
      <textarea className="tk-input min-h-24 resize-y" value={value} onChange={event => onChange(event.target.value)} />
    </label>
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

function draftToForm(draft: EngagementImportDraftRecord): EngagementDraftFormState {
  return {
    name: draft.name,
    serviceLines: draft.serviceLines.join(', '),
    value: String(draft.contractValue ?? draft.value ?? 0),
    startDate: isoToDateInput(draft.renewalTerms.startDate),
    endDate: isoToDateInput(draft.renewalTerms.endDate),
    renewalDate: isoToDateInput(draft.renewalTerms.renewalDate),
    noticePeriodDays: draft.renewalTerms.noticePeriodDays ? String(draft.renewalTerms.noticePeriodDays) : '',
    commercialContext: draft.commercialContext === 'No commercial context recorded yet.' ? '' : draft.commercialContext,
    resourceDependency: draft.resourceDependency === 'No resource dependency recorded.' ? '' : draft.resourceDependency,
    risks: draft.risks.join('\n'),
    rejectReason: draft.rejectionReason ?? '',
  }
}

function splitList(value: string) {
  return value
    .split(/[\n,;]+/)
    .map(item => item.trim())
    .filter(Boolean)
}

function isoToDateInput(value?: string | null) {
  if (!value) return ''
  return value.slice(0, 10)
}

function dateInputToIso(value: string) {
  if (!value.trim()) return null
  return new Date(`${value}T00:00:00.000Z`).toISOString()
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
