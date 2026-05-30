import * as Dialog from '@radix-ui/react-dialog'
import { addDays, differenceInCalendarDays, format } from 'date-fns'
import { CalendarClock, FileText, Loader2, Pencil, Plus, Save, X } from 'lucide-react'
import { nanoid } from 'nanoid'
import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'
import { ApiError } from '@/services/api'
import { createAccountEngagement, updateEngagementApi } from '@/services/engagements'
import { useV3Store } from '@/stores/v3Store'
import { Account, RiskStatus } from '@/types/account'
import { EngagementDeliveryStatus, EngagementRecord, EngagementStatus, SourceDocumentLink } from '@/types/v3'
import { emitTimelineEvent } from '@/utils/emitTimelineEvent'

const statusOptions: EngagementStatus[] = ['active', 'renewal_watch', 'at_risk', 'completed']
const deliveryStatusOptions: EngagementDeliveryStatus[] = ['on_track', 'watch', 'at_risk', 'blocked', 'complete']

interface EngagementFormDialogProps {
  account: Account
  engagement?: EngagementRecord
  trigger?: ReactNode
  onSaved?: (engagement: EngagementRecord) => void
}

interface FormState {
  name: string
  status: EngagementStatus
  sourceDocuments: string
  startDate: string
  endDate: string
  renewalDate: string
  noticePeriodDays: string
  noticeDeadline: string
  ownerId: string
  ownerName: string
  opsLeadId: string
  opsLeadName: string
  serviceLines: string
  value: string
  deliveryStatus: EngagementDeliveryStatus
  deliveryHealth: string
  resourceDependency: string
  commercialContext: string
  risks: string
}

export function EngagementFormDialog({ account, engagement, trigger, onSaved }: EngagementFormDialogProps) {
  const user = useRole()
  const { token } = useAuth()
  const createEngagement = useV3Store(state => state.createEngagement)
  const updateEngagement = useV3Store(state => state.updateEngagement)
  const upsertEngagement = useV3Store(state => state.upsertEngagement)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(() => initialForm(account, engagement))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const editing = Boolean(engagement)

  const expectedNoticeDeadline = useMemo(() => {
    if (!form.renewalDate) return ''
    const period = Number(form.noticePeriodDays || 0)
    if (!Number.isFinite(period)) return ''
    return format(shiftDays(new Date(`${form.renewalDate}T00:00:00`), -period), 'yyyy-MM-dd')
  }, [form.noticePeriodDays, form.renewalDate])

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(current => ({ ...current, [key]: value }))
    setErrors(current => {
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  async function submit() {
    const nextErrors = validateForm(form, expectedNoticeDeadline)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    const payload = toEngagement(account, form, engagement)
    setSaving(true)
    try {
      let saved: EngagementRecord | undefined
      if (token) {
        saved = editing && engagement
          ? await updateEngagementApi(token, engagement.id, payload)
          : await createAccountEngagement(token, account.id, payload)
        upsertEngagement(saved)
      } else {
        saved = editing && engagement ? updateEngagement(engagement.id, payload) : createEngagement(payload)
      }
      if (!saved) return

      emitTimelineEvent({
        accountId: account.id,
        eventType: 'approval_event',
        module: 'approval',
        title: editing ? 'Engagement updated' : 'Engagement created',
        description: `${saved.name} was ${editing ? 'updated' : 'created'} from ${saved.sourceDocumentLinks?.length ? 'source evidence' : 'manual entry'}.`,
        performedBy: user.id,
        performedByName: user.name,
        sourceRecordId: saved.id,
        sourceRecordType: 'engagement',
        sourceRecordRoute: `/engagements/${saved.id}`,
        metadata: { engagementId: saved.id, sourceDocumentLinks: saved.sourceDocumentLinks },
        tags: ['engagement', saved.status],
        isSensitive: false,
        isSystemGenerated: false,
        isImmutable: true,
      })

      toast.success(editing ? 'Engagement updated' : 'Engagement created')
      onSaved?.(saved)
      setOpen(false)
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(apiErrorsToFormErrors(error))
        toast.error(error.message)
      } else {
        toast.error(editing ? 'Unable to update engagement' : 'Unable to create engagement')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={next => {
      setOpen(next)
              if (next) {
                setForm(initialForm(account, engagement))
                setErrors({})
              }
    }}>
      <Dialog.Trigger asChild>
        {trigger ?? (
          <button className="tk-button-primary">
            {editing ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {editing ? 'Edit engagement' : 'Create engagement'}
          </button>
        )}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[min(92vh,920px)] w-[min(920px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-surface-border bg-white shadow-panel">
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-surface-border bg-white p-5">
            <div>
              <Dialog.Title className="font-display text-2xl font-bold text-ink">{editing ? 'Edit engagement' : 'Create engagement'}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-secondary">
                Capture the SOW profile, commercial terms, delivery status, owner, service lines, evidence, and risks.
              </Dialog.Description>
            </div>
            <Dialog.Close className="tk-icon-button" aria-label="Close engagement form">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <div className="grid gap-5 p-5">
            <section className="grid gap-4 md:grid-cols-2">
              <Field label="Engagement name" error={errors.name}>
                <input className="tk-input" value={form.name} onChange={event => updateField('name', event.target.value)} />
              </Field>
              <Field label="Record status">
                <select className="tk-input" value={form.status} onChange={event => updateField('status', event.target.value as EngagementStatus)}>
                  {statusOptions.map(option => <option key={option} value={option}>{labelize(option)}</option>)}
                </select>
              </Field>
              <Field label="Owner" error={errors.ownerName}>
                <input className="tk-input" value={form.ownerName} onChange={event => updateField('ownerName', event.target.value)} />
              </Field>
              <Field label="Ops lead">
                <input className="tk-input" value={form.opsLeadName} onChange={event => updateField('opsLeadName', event.target.value)} />
              </Field>
              <Field label="Service lines" error={errors.serviceLines}>
                <input className="tk-input" value={form.serviceLines} onChange={event => updateField('serviceLines', event.target.value)} placeholder="Cloud, Data, Managed Delivery" />
              </Field>
              <Field label="Value (USD)" error={errors.value}>
                <input className="tk-input" type="number" min={0} value={form.value} onChange={event => updateField('value', event.target.value)} />
              </Field>
            </section>

            <section className="rounded-lg border border-surface-border bg-surface-secondary p-4">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-brand-blue" />
                <h3 className="text-sm font-semibold text-ink">Renewal terms</h3>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-5">
                <Field label="Start date" error={errors.startDate}>
                  <input className="tk-input" type="date" value={form.startDate} onChange={event => updateField('startDate', event.target.value)} />
                </Field>
                <Field label="End date" error={errors.endDate}>
                  <input className="tk-input" type="date" value={form.endDate} onChange={event => updateField('endDate', event.target.value)} />
                </Field>
                <Field label="Renewal date" error={errors.renewalDate}>
                  <input className="tk-input" type="date" value={form.renewalDate} onChange={event => updateField('renewalDate', event.target.value)} />
                </Field>
                <Field label="Notice days">
                  <input className="tk-input" type="number" min={0} value={form.noticePeriodDays} onChange={event => updateField('noticePeriodDays', event.target.value)} />
                </Field>
                <Field label="Notice deadline" error={errors.noticeDeadline}>
                  <input className="tk-input" type="date" value={form.noticeDeadline} onChange={event => updateField('noticeDeadline', event.target.value)} />
                </Field>
              </div>
              {expectedNoticeDeadline && form.noticeDeadline !== expectedNoticeDeadline ? (
                <button className="tk-button-secondary mt-3 bg-white" type="button" onClick={() => updateField('noticeDeadline', expectedNoticeDeadline)}>
                  Use {expectedNoticeDeadline}
                </button>
              ) : null}
            </section>

            <section className="grid gap-4 md:grid-cols-[260px_1fr]">
              <div className="rounded-lg border border-surface-border bg-white p-4">
                <p className="text-sm font-semibold text-ink">Delivery status</p>
                <select className="tk-input mt-3" value={form.deliveryStatus} onChange={event => updateField('deliveryStatus', event.target.value as EngagementDeliveryStatus)}>
                  {deliveryStatusOptions.map(option => <option key={option} value={option}>{labelize(option)}</option>)}
                </select>
                <label className="mt-4 block">
                  <span className="tk-label">Delivery health: {form.deliveryHealth}</span>
                  <input className="mt-3 w-full accent-brand-blue" type="range" min={0} max={100} value={form.deliveryHealth} onChange={event => updateField('deliveryHealth', event.target.value)} />
                </label>
              </div>
              <div className="grid gap-4">
                <Field label="Resource dependency">
                  <textarea className="tk-input min-h-24" value={form.resourceDependency} onChange={event => updateField('resourceDependency', event.target.value)} />
                </Field>
                <Field label="Commercial context">
                  <textarea className="tk-input min-h-24" value={form.commercialContext} onChange={event => updateField('commercialContext', event.target.value)} />
                </Field>
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <Field label="Risks">
                <textarea className="tk-input min-h-28" value={form.risks} onChange={event => updateField('risks', event.target.value)} placeholder="One risk per line" />
              </Field>
              <Field label="Source documents">
                <div className="relative">
                  <FileText className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-ink-tertiary" />
                  <textarea className="tk-input min-h-28 pr-10" value={form.sourceDocuments} onChange={event => updateField('sourceDocuments', event.target.value)} placeholder="SOW title | https://... | sow" />
                </div>
              </Field>
            </section>
          </div>

          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-surface-border bg-white p-5">
            <Dialog.Close type="button" className="tk-button-secondary" disabled={saving}>Cancel</Dialog.Close>
            <button className="tk-button-primary" type="button" onClick={submit} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Saving' : 'Save'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="tk-label">{label}</span>
      {children}
      {error ? <span className="text-xs font-medium text-rag-red">{error}</span> : null}
    </label>
  )
}

function initialForm(account: Account, engagement?: EngagementRecord): FormState {
  const now = new Date()
  const renewalDate = engagement?.renewalTerms.renewalDate ?? addDays(now, 365).toISOString()
  const noticePeriodDays = engagement?.renewalTerms.noticePeriodDays ?? 60
  return {
    name: engagement?.name ?? '',
    status: engagement?.status === 'draft' ? 'active' : engagement?.status ?? 'active',
    sourceDocuments: linksToText(engagement),
    startDate: toInputDate(engagement?.renewalTerms.startDate ?? now.toISOString()),
    endDate: toInputDate(engagement?.renewalTerms.endDate ?? addDays(now, 364).toISOString()),
    renewalDate: toInputDate(renewalDate),
    noticePeriodDays: String(noticePeriodDays),
    noticeDeadline: toInputDate(engagement?.renewalTerms.noticeDeadline ?? shiftDays(new Date(renewalDate), -noticePeriodDays).toISOString()),
    ownerId: engagement?.ownerId ?? account.ownerId,
    ownerName: engagement?.ownerName ?? account.ownerName,
    opsLeadId: engagement?.opsLeadId ?? '',
    opsLeadName: engagement?.opsLeadName ?? '',
    serviceLines: engagement?.serviceLines.join(', ') ?? '',
    value: String(engagement?.value ?? account.arr),
    deliveryStatus: engagement?.deliveryStatus ?? 'on_track',
    deliveryHealth: String(engagement?.deliveryHealth ?? account.health.delivery),
    resourceDependency: engagement?.resourceDependency ?? '',
    commercialContext: engagement?.commercialContext ?? '',
    risks: engagement?.risks.join('\n') ?? '',
  }
}

function validateForm(form: FormState, expectedNoticeDeadline: string) {
  const errors: Record<string, string> = {}
  if (!form.name.trim()) errors.name = 'Engagement name is required.'
  if (!form.ownerName.trim()) errors.ownerName = 'Owner is required.'
  if (!form.startDate) errors.startDate = 'Start date is required.'
  if (!splitList(form.serviceLines).length) errors.serviceLines = 'At least one service line is required.'
  if (Number(form.value) < 0 || Number.isNaN(Number(form.value))) errors.value = 'Value must be non-negative.'
  if (form.startDate && form.endDate && new Date(form.endDate) <= new Date(form.startDate)) errors.endDate = 'End date must be after start date.'
  if (form.endDate && form.renewalDate && new Date(form.renewalDate) < new Date(form.endDate)) errors.renewalDate = 'Renewal date must be on or after end date.'
  if (form.noticeDeadline && expectedNoticeDeadline && form.noticeDeadline !== expectedNoticeDeadline) errors.noticeDeadline = 'Notice deadline must match renewal date minus notice period.'
  return errors
}

function apiErrorsToFormErrors(error: ApiError) {
  const fieldMap: Record<string, keyof FormState> = {
    name: 'name',
    owner_id: 'ownerName',
    owner_name: 'ownerName',
    start_date: 'startDate',
    end_date: 'endDate',
    renewal_date: 'renewalDate',
    notice_deadline: 'noticeDeadline',
    notice_period_days: 'noticePeriodDays',
    service_lines: 'serviceLines',
    value: 'value',
    delivery_status: 'deliveryStatus',
    delivery_health: 'deliveryHealth',
  }
  return error.fieldErrors.reduce<Record<string, string>>((formErrors, fieldError) => {
    const key = fieldMap[fieldError.field] ?? fieldError.field
    formErrors[key] = fieldError.message
    return formErrors
  }, {})
}

function toEngagement(account: Account, form: FormState, existing?: EngagementRecord): EngagementRecord {
  const value = Number(form.value || 0)
  const renewalTerms = {
    startDate: toIso(form.startDate),
    endDate: toIso(form.endDate),
    renewalDate: toIso(form.renewalDate),
    noticeDeadline: toIso(form.noticeDeadline),
    noticePeriodDays: Number(form.noticePeriodDays || 0),
    autoRenewal: existing?.renewalTerms.autoRenewal ?? false,
    commercialExposure: value,
    daysToExpiry: differenceInCalendarDays(new Date(form.endDate), new Date()),
    riskStatus: riskStatusFromDelivery(form.deliveryStatus),
    confidence: existing?.renewalTerms.confidence ?? 100,
    sourceDocumentId: existing?.renewalTerms.sourceDocumentId ?? `manual-doc-${nanoid(6)}`,
    sourceCitation: parseSourceLinks(form.sourceDocuments)[0]?.title ? `Manual evidence: ${parseSourceLinks(form.sourceDocuments)[0].title}` : 'Manual engagement entry.',
  }

  return {
    id: existing?.id ?? `eng-${nanoid(8)}`,
    accountId: account.id,
    accountName: account.name,
    name: form.name.trim(),
    status: form.status,
    ownerId: form.ownerId || account.ownerId,
    ownerName: form.ownerName.trim(),
    opsLeadId: form.opsLeadId,
    opsLeadName: form.opsLeadName,
    serviceLines: splitList(form.serviceLines),
    value,
    currency: 'USD',
    deliveryStatus: form.deliveryStatus,
    deliveryHealth: Number(form.deliveryHealth || 0),
    resourceDependency: form.resourceDependency.trim(),
    commercialContext: form.commercialContext.trim(),
    risks: splitLines(form.risks),
    sourceDocumentIds: existing?.sourceDocumentIds ?? [],
    sourceDocumentLinks: parseSourceLinks(form.sourceDocuments),
    attachments: existing?.attachments ?? [],
    activities: existing?.activities ?? [],
    health: existing?.health,
    createdAt: existing?.createdAt,
    updatedAt: existing?.updatedAt,
    renewalTerms,
  }
}

function parseSourceLinks(value: string): SourceDocumentLink[] {
  return value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [title, url, type] = line.split('|').map(part => part.trim())
      return { title: title || url, url: url || '#', type: (type || 'evidence') as SourceDocumentLink['type'] }
    })
}

function linksToText(engagement?: EngagementRecord) {
  const links = engagement?.sourceDocumentLinks ?? []
  return links.map(link => `${link.title} | ${link.url} | ${link.type ?? 'evidence'}`).join('\n')
}

function splitList(value: string) {
  return value.split(',').map(item => item.trim()).filter(Boolean)
}

function splitLines(value: string) {
  return value.split('\n').map(item => item.trim()).filter(Boolean)
}

function toInputDate(value: string) {
  return format(new Date(value), 'yyyy-MM-dd')
}

function toIso(value: string) {
  return new Date(`${value}T00:00:00`).toISOString()
}

function shiftDays(value: Date, days: number) {
  const next = new Date(value)
  next.setDate(next.getDate() + days)
  return next
}

function riskStatusFromDelivery(status: EngagementDeliveryStatus): RiskStatus {
  if (status === 'blocked' || status === 'at_risk') return 'critical'
  if (status === 'watch') return 'warning'
  return 'healthy'
}

function labelize(value: string) {
  return value.replace(/_/g, ' ')
}
