import * as Dialog from '@radix-ui/react-dialog'
import { CalendarClock, FileText, Link2, Loader2, Save, X } from 'lucide-react'
import type { FormEvent, InputHTMLAttributes } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { FieldError } from '@/components/form/FieldError'
import { ServiceLineMultiSelect } from '@/components/account/ServiceLineMultiSelect'
import { useServiceCatalogOptions } from '@/hooks/useServiceCatalogOptions'
import { useCreateEngagement, useUpdateEngagement } from '@/hooks/useEngagements'
import type { EngagementCreatePayload, EngagementUpdatePayload } from '@/services/accountWorkspace'
import type { Account } from '@/types/account'
import type { EngagementCommercialStatus, EngagementDeliveryStatus, EngagementHealthStatus, EngagementRecord, EngagementRenewalRisk } from '@/types/v3'
import { cn } from '@/utils/cn'
import { apiFieldErrors, clearFieldError, hasFieldErrors } from '@/utils/formErrors'
import type { FieldErrors } from '@/utils/formErrors'

type EngagementFormField =
  | 'name'
  | 'description'
  | 'startDate'
  | 'endDate'
  | 'renewalDate'
  | 'noticePeriodDays'
  | 'contractValue'
  | 'currency'
  | 'deliveryStatus'
  | 'commercialStatus'
  | 'healthScore'
  | 'healthStatus'
  | 'renewalRisk'
  | 'resourceDependencyNotes'
  | 'sourceLinksText'

interface EngagementFormState {
  name: string
  description: string
  serviceLines: string[]
  startDate: string
  endDate: string
  renewalDate: string
  noticePeriodDays: string
  contractValue: string
  currency: string
  deliveryStatus: EngagementDeliveryStatus
  commercialStatus: EngagementCommercialStatus
  healthScore: string
  healthStatus: EngagementHealthStatus
  renewalRisk: EngagementRenewalRisk
  resourceDependencyNotes: string
  sourceLinksText: string
}

interface Props {
  account: Pick<Account, 'id' | 'ownerId' | 'ownerName'>
  engagement?: EngagementRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => Promise<unknown> | unknown
}

const deliveryStatuses: EngagementDeliveryStatus[] = ['not_started', 'planned', 'active', 'watch', 'blocked', 'at_risk', 'completed']
const commercialStatuses: EngagementCommercialStatus[] = ['healthy', 'watch', 'risk']
const healthStatuses: EngagementHealthStatus[] = ['green', 'amber', 'red', 'unknown']
const renewalRisks: EngagementRenewalRisk[] = ['low', 'medium', 'high', 'unknown']

export function EngagementFormDialog({ account, engagement, open, onOpenChange, onSaved }: Props) {
  const { createEngagement, isLoading: creating } = useCreateEngagement()
  const { updateEngagement, isLoading: updating } = useUpdateEngagement()
  const { serviceLineOptions, isLoading: loadingServiceLines, error: serviceLineCatalogError } = useServiceCatalogOptions()
  const [form, setForm] = useState<EngagementFormState>(() => initialForm(engagement))
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState('')
  const isEditing = Boolean(engagement)
  const isSaving = creating || updating
  const accountManagerName = account.ownerName || engagement?.ownerName || 'Unassigned'

  useEffect(() => {
    if (!open) return
    setForm(initialForm(engagement))
    setFieldErrors({})
    setFormError('')
  }, [account.id, account.ownerId, account.ownerName, engagement, open])

  const noticeDeadlinePreview = useMemo(() => previewNoticeDeadline(form), [form])

  function updateField(field: EngagementFormField, value: string) {
    setForm(current => ({ ...current, [field]: value }))
    setFieldErrors(errors => clearFieldError(errors, field))
    setFormError('')
  }

  function updateServiceLines(serviceLines: string[]) {
    setForm(current => ({ ...current, serviceLines }))
    setFieldErrors(errors => clearFieldError(errors, 'serviceLines'))
    setFormError('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const validation = validateForm(form)
    setFieldErrors(validation.fieldErrors)
    setFormError(validation.formError)
    if (validation.formError || hasFieldErrors(validation.fieldErrors)) return

    const payload = buildPayload(form)
    try {
      if (engagement) await updateEngagement(engagement.id, payload)
      else await createEngagement(account.id, payload as EngagementCreatePayload)
      onOpenChange(false)
      toast.success(engagement ? 'Engagement updated' : 'Engagement created')
      await onSaved?.()
    } catch (error) {
      const nextFieldErrors = apiFieldErrors(error, fieldAliases)
      const ownerFieldError = nextFieldErrors.ownerId
      if (ownerFieldError) {
        const visibleFieldErrors = { ...nextFieldErrors }
        delete visibleFieldErrors.ownerId
        setFieldErrors(visibleFieldErrors)
        setFormError(ownerFieldError)
        return
      }
      setFieldErrors(nextFieldErrors)
      if (hasFieldErrors(nextFieldErrors)) {
        setFormError('')
        return
      }
      setFormError(error instanceof Error ? error.message : 'Engagement could not be saved')
      toast.error(error instanceof Error ? error.message : 'Engagement could not be saved')
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={value => !isSaving && onOpenChange(value)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex h-[100dvh] w-[min(980px,100vw)] flex-col overflow-hidden border-l border-surface-border bg-white shadow-panel">
          <div className="flex items-start justify-between gap-4 border-b border-surface-border bg-white p-5">
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Engagement/SOW</p>
              <Dialog.Title className="font-display text-2xl font-bold text-ink">{isEditing ? 'Edit engagement' : 'Add engagement'}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-secondary">
                Capture contract terms, renewal posture, ownership, service coverage, health, and source links.
              </Dialog.Description>
            </div>
            <Dialog.Close className="tk-icon-button shrink-0" aria-label="Close engagement form" disabled={isSaving}>
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
                <div className="space-y-5">
                  <section className="grid gap-4 rounded-lg border border-surface-border bg-white p-4 md:grid-cols-2">
                    <TextField label="Name" field="name" value={form.name} error={fieldErrors.name} onChange={updateField} required />
                    <ReadOnlyField label="Account Manager" value={accountManagerName} />
                    <label className="block md:col-span-2">
                      <span className="tk-label">Description</span>
                      <textarea className={fieldClass(fieldErrors.description, 'min-h-[96px] resize-y')} value={form.description} onChange={event => updateField('description', event.target.value)} aria-invalid={Boolean(fieldErrors.description)} />
                      <FieldError id="engagement-description-error" message={fieldErrors.description} />
                    </label>
                    <ServiceLineMultiSelect
                      className="md:col-span-2"
                      label="Service lines"
                      selected={form.serviceLines}
                      options={serviceLineOptions}
                      onChange={updateServiceLines}
                      error={fieldErrors.serviceLines}
                      required
                      isLoading={loadingServiceLines}
                      catalogError={serviceLineCatalogError}
                    />
                  </section>

                  <section className="grid gap-4 rounded-lg border border-surface-border bg-white p-4 md:grid-cols-3">
                    <DateField label="Start date" field="startDate" value={form.startDate} error={fieldErrors.startDate} onChange={updateField} required />
                    <DateField label="End date" field="endDate" value={form.endDate} error={fieldErrors.endDate} onChange={updateField} />
                    <DateField label="Renewal date" field="renewalDate" value={form.renewalDate} error={fieldErrors.renewalDate} onChange={updateField} />
                    <TextField label="Notice period days" field="noticePeriodDays" type="number" min="0" value={form.noticePeriodDays} error={fieldErrors.noticePeriodDays} onChange={updateField} />
                    <TextField label="Contract value" field="contractValue" type="number" min="0" step="0.01" value={form.contractValue} error={fieldErrors.contractValue} onChange={updateField} />
                    <TextField label="Currency" field="currency" value={form.currency} error={fieldErrors.currency} onChange={(field, value) => updateField(field, value.toUpperCase())} maxLength={3} />
                  </section>

                  <section className="grid gap-4 rounded-lg border border-surface-border bg-white p-4 md:grid-cols-3">
                    <SelectField label="Delivery status" field="deliveryStatus" value={form.deliveryStatus} options={deliveryStatuses} error={fieldErrors.deliveryStatus} onChange={updateField} />
                    <SelectField label="Commercial status" field="commercialStatus" value={form.commercialStatus} options={commercialStatuses} error={fieldErrors.commercialStatus} onChange={updateField} />
                    <TextField label="Health score" field="healthScore" type="number" min="0" max="100" value={form.healthScore} error={fieldErrors.healthScore} onChange={updateField} />
                    <SelectField label="Health status" field="healthStatus" value={form.healthStatus} options={healthStatuses} error={fieldErrors.healthStatus} onChange={updateField} />
                    <SelectField label="Renewal risk" field="renewalRisk" value={form.renewalRisk} options={renewalRisks} error={fieldErrors.renewalRisk} onChange={updateField} />
                  </section>

                  <section className="grid gap-4 rounded-lg border border-surface-border bg-white p-4">
                    <label className="block md:col-span-2">
                      <span className="tk-label">Resource dependency notes</span>
                      <textarea className={fieldClass(fieldErrors.resourceDependencyNotes, 'min-h-[96px] resize-y')} value={form.resourceDependencyNotes} onChange={event => updateField('resourceDependencyNotes', event.target.value)} aria-invalid={Boolean(fieldErrors.resourceDependencyNotes)} />
                      <FieldError id="engagement-resource-notes-error" message={fieldErrors.resourceDependencyNotes} />
                    </label>
                    <label className="block">
                      <span className="tk-label">Source links</span>
                      <textarea className={fieldClass(fieldErrors.sourceLinksText, 'min-h-[120px] resize-y')} value={form.sourceLinksText} onChange={event => updateField('sourceLinksText', event.target.value)} placeholder={'SOW | https://example.com/sow.pdf\nhttps://example.com/commercial-note'} aria-invalid={Boolean(fieldErrors.sourceLinksText)} />
                      <FieldError id="engagement-source-links-error" message={fieldErrors.sourceLinksText} />
                    </label>
                  </section>
                </div>

                <aside className="space-y-4">
                  <div className="rounded-lg border border-surface-border bg-surface-secondary p-4">
                    <div className="flex items-center gap-2">
                      <CalendarClock className="h-4 w-4 text-brand-blue" />
                      <h3 className="text-sm font-semibold text-ink">Notice preview</h3>
                    </div>
                    <p className="mt-3 text-2xl font-bold text-ink">{noticeDeadlinePreview ?? 'Not available'}</p>
                    <p className="mt-2 text-xs leading-5 text-ink-secondary">Preview is calculated from renewal date when present, otherwise from end date, minus notice period days. The backend remains the source of truth.</p>
                  </div>

                  <div className="rounded-lg border border-surface-border bg-white p-4">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-brand-blue" />
                      <h3 className="text-sm font-semibold text-ink">Form checks</h3>
                    </div>
                    <ul className="mt-3 space-y-2 text-xs leading-5 text-ink-secondary">
                      <li>Name, service lines, and start date are required.</li>
                      <li>The engagement owner is inherited from the account manager.</li>
                      <li>End date must be after start date.</li>
                      <li>Contract value and notice period cannot be negative.</li>
                      <li>Health score must be between 0 and 100.</li>
                    </ul>
                  </div>

                  <div className="rounded-lg border border-surface-border bg-white p-4">
                    <div className="flex items-center gap-2">
                      <Link2 className="h-4 w-4 text-brand-blue" />
                      <h3 className="text-sm font-semibold text-ink">Source link format</h3>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-ink-secondary">Use one link per line. Add an optional title with a pipe, for example `SOW | https://...`.</p>
                  </div>
                </aside>
              </div>
            </div>

            <div className="border-t border-surface-border bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {formError ? <p className="rounded-md border border-rag-red/20 bg-rag-red/10 px-3 py-2 text-sm font-medium text-rag-red">{formError}</p> : <span />}
                <div className="flex justify-end gap-2">
                  <button type="button" className="tk-button-secondary" onClick={() => onOpenChange(false)} disabled={isSaving}>Cancel</button>
                  <button type="submit" className="tk-button-primary" disabled={isSaving}>
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {isSaving ? 'Saving...' : isEditing ? 'Save changes' : 'Create engagement'}
                  </button>
                </div>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function TextField({
  label,
  field,
  value,
  error,
  onChange,
  required = false,
  type = 'text',
  ...inputProps
}: {
  label: string
  field: EngagementFormField
  value: string
  error?: string
  onChange: (field: EngagementFormField, value: string) => void
  required?: boolean
  type?: string
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  return (
    <label className="block">
      <span className="tk-label">{label} {required ? <span className="text-rag-red">*</span> : null}</span>
      <input {...inputProps} type={type} className={fieldClass(error)} value={value} onChange={event => onChange(field, event.target.value)} aria-invalid={Boolean(error)} />
      <FieldError id={`engagement-${field}-error`} message={error} />
    </label>
  )
}

function DateField({ label, field, value, error, onChange, required = false }: { label: string; field: EngagementFormField; value: string; error?: string; onChange: (field: EngagementFormField, value: string) => void; required?: boolean }) {
  return <TextField label={label} field={field} value={value} error={error} onChange={onChange} required={required} type="date" />
}

function SelectField({ label, field, value, options, error, onChange }: { label: string; field: EngagementFormField; value: string; options: string[]; error?: string; onChange: (field: EngagementFormField, value: string) => void }) {
  return (
    <label className="block">
      <span className="tk-label">{label}</span>
      <select className={fieldClass(error)} value={value} onChange={event => onChange(field, event.target.value)} aria-invalid={Boolean(error)}>
        {options.map(option => <option key={option} value={option}>{titleize(option)}</option>)}
      </select>
      <FieldError id={`engagement-${field}-error`} message={error} />
    </label>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="tk-label">{label}</span>
      <div className="tk-input mt-2 flex items-center bg-surface-secondary text-ink" aria-readonly="true">
        {value}
      </div>
    </div>
  )
}

function initialForm(engagement?: EngagementRecord | null): EngagementFormState {
  return {
    name: engagement?.name ?? '',
    description: engagement?.description ?? '',
    serviceLines: engagement?.serviceLines ?? [],
    startDate: toDateInput(engagement?.renewalTerms.startDate) || todayInput(),
    endDate: toDateInput(engagement?.renewalTerms.endDate),
    renewalDate: toDateInput(engagement?.renewalTerms.renewalDate),
    noticePeriodDays: engagement?.renewalTerms.noticePeriodDays !== undefined ? String(engagement.renewalTerms.noticePeriodDays) : '',
    contractValue: engagement ? String(engagement.contractValue ?? engagement.value) : '0',
    currency: engagement?.currency ?? 'USD',
    deliveryStatus: engagement?.deliveryStatus ?? 'active',
    commercialStatus: engagement?.commercialStatus ?? 'watch',
    healthScore: String(engagement?.healthScore ?? engagement?.deliveryHealth ?? 70),
    healthStatus: engagement?.healthStatus ?? 'unknown',
    renewalRisk: engagement?.renewalRisk ?? 'unknown',
    resourceDependencyNotes: engagement?.resourceDependencyNotes ?? engagement?.resourceDependency ?? '',
    sourceLinksText: linksToText(engagement?.sourceLinks ?? []),
  }
}

function validateForm(form: EngagementFormState) {
  const fieldErrors: FieldErrors = {}
  const contractValue = Number(form.contractValue)
  const noticePeriodDays = form.noticePeriodDays === '' ? undefined : Number(form.noticePeriodDays)
  const healthScore = Number(form.healthScore)
  const sourceLinks = parseSourceLinks(form.sourceLinksText)

  if (!form.name.trim()) fieldErrors.name = 'Name is required'
  if (!form.serviceLines.length) fieldErrors.serviceLines = 'At least one service line is required'
  if (!form.startDate) fieldErrors.startDate = 'Start date is required'
  if (form.startDate && form.endDate && Date.parse(form.endDate) <= Date.parse(form.startDate)) fieldErrors.endDate = 'End date must be after start date'
  if (!Number.isFinite(contractValue) || contractValue < 0) fieldErrors.contractValue = 'Contract value cannot be negative'
  if (noticePeriodDays !== undefined && (!Number.isFinite(noticePeriodDays) || noticePeriodDays < 0)) fieldErrors.noticePeriodDays = 'Notice period cannot be negative'
  if (!Number.isFinite(healthScore) || healthScore < 0 || healthScore > 100) fieldErrors.healthScore = 'Health score must be between 0 and 100'
  if (!/^[A-Z]{3}$/.test(form.currency.trim().toUpperCase())) fieldErrors.currency = 'Currency must be a 3-letter code'
  if (sourceLinks.error) fieldErrors.sourceLinksText = sourceLinks.error

  return { fieldErrors, formError: '' }
}

function buildPayload(form: EngagementFormState): EngagementCreatePayload | EngagementUpdatePayload {
  return {
    name: form.name.trim(),
    description: optionalText(form.description),
    serviceLines: form.serviceLines,
    startDate: toApiDate(form.startDate),
    endDate: optionalApiDate(form.endDate),
    renewalDate: optionalApiDate(form.renewalDate),
    noticePeriodDays: form.noticePeriodDays === '' ? null : Number(form.noticePeriodDays),
    contractValue: Number(form.contractValue),
    currency: form.currency.trim().toUpperCase(),
    deliveryStatus: form.deliveryStatus,
    commercialStatus: form.commercialStatus,
    healthScore: Number(form.healthScore),
    healthStatus: form.healthStatus,
    renewalRisk: form.renewalRisk,
    resourceDependencyNotes: optionalText(form.resourceDependencyNotes),
    sourceLinks: parseSourceLinks(form.sourceLinksText).links,
  }
}

function fieldClass(error?: string, extra?: string) {
  return cn('tk-input mt-2', error && 'border-rag-red focus:border-rag-red focus:ring-rag-red/20', extra)
}

function parseSourceLinks(value: string): { links: { title?: string | null; url: string }[]; error?: string } {
  const links = []
  for (const line of value.split('\n').map(item => item.trim()).filter(Boolean)) {
    const [left, ...rest] = line.split('|').map(item => item.trim())
    const title = rest.length ? left : null
    const url = rest.length ? rest.join('|').trim() : left
    if (!url) return { links: [], error: 'Each source link needs a URL' }
    links.push({ title, url })
  }
  return { links }
}

function linksToText(links: { title?: string | null; url: string }[]) {
  return links.map(link => (link.title ? `${link.title} | ${link.url}` : link.url)).join('\n')
}

function previewNoticeDeadline(form: EngagementFormState) {
  const base = form.renewalDate || form.endDate
  if (!base) return ''
  const noticePeriod = form.noticePeriodDays === '' ? 0 : Number(form.noticePeriodDays)
  if (!Number.isFinite(noticePeriod) || noticePeriod < 0) return ''
  const date = new Date(`${base}T00:00:00`)
  if (!Number.isFinite(date.getTime())) return ''
  date.setDate(date.getDate() - noticePeriod)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function toDateInput(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function todayInput() {
  return new Date().toISOString().slice(0, 10)
}

function toApiDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`).toISOString()
}

function optionalApiDate(value: string) {
  return value ? toApiDate(value) : null
}

function optionalText(value: string) {
  const trimmed = value.trim()
  return trimmed || null
}

function titleize(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

const fieldAliases: Record<string, string> = {
  owner_id: 'ownerId',
  service_lines: 'serviceLines',
  start_date: 'startDate',
  end_date: 'endDate',
  renewal_date: 'renewalDate',
  notice_period_days: 'noticePeriodDays',
  value: 'contractValue',
  contract_value: 'contractValue',
  currency: 'currency',
  delivery_status: 'deliveryStatus',
  commercial_status: 'commercialStatus',
  delivery_health: 'healthScore',
  health_score: 'healthScore',
  health_status: 'healthStatus',
  renewal_risk: 'renewalRisk',
  resource_dependency: 'resourceDependencyNotes',
  resource_dependency_notes: 'resourceDependencyNotes',
  source_links: 'sourceLinksText',
}
