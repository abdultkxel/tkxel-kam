import * as Dialog from '@radix-ui/react-dialog'
import { Loader2, Save, ShieldAlert, UserRound, X } from 'lucide-react'
import type { FormEvent, InputHTMLAttributes } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { FieldError } from '@/components/form/FieldError'
import { useEngagements } from '@/hooks/useEngagements'
import { useCreateStakeholder, useUpdateStakeholder } from '@/hooks/useStakeholders'
import type {
  Stakeholder,
  StakeholderCreatePayload,
  StakeholderInfluence,
  StakeholderRelationshipStrength,
  StakeholderRoleOption,
  StakeholderSentiment,
  StakeholderStatus,
} from '@/types/stakeholder'
import type { Account } from '@/types/account'
import { cn } from '@/utils/cn'
import { apiFieldErrors, clearFieldError, hasFieldErrors } from '@/utils/formErrors'
import type { FieldErrors } from '@/utils/formErrors'

type StakeholderFormField =
  | 'name'
  | 'title'
  | 'company'
  | 'email'
  | 'phone'
  | 'linkedinUrl'
  | 'engagementId'
  | 'reportsToStakeholderId'
  | 'role'
  | 'influence'
  | 'relationshipStrength'
  | 'sentiment'
  | 'status'
  | 'notes'
  | 'lastInteractionAt'

interface StakeholderFormState {
  name: string
  title: string
  company: string
  email: string
  phone: string
  linkedinUrl: string
  engagementId: string
  reportsToStakeholderId: string
  role: string
  influence: StakeholderInfluence
  relationshipStrength: StakeholderRelationshipStrength
  sentiment: StakeholderSentiment
  status: StakeholderStatus
  notes: string
  lastInteractionAt: string
  isSensitive: boolean
}

interface Props {
  account: Pick<Account, 'id' | 'name'>
  stakeholder?: Stakeholder | null
  stakeholders: Stakeholder[]
  roleOptions?: StakeholderRoleOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => Promise<unknown> | unknown
}

const fallbackRoleOptions: StakeholderRoleOption[] = ['executive_sponsor', 'economic_buyer', 'technical_decision_maker', 'operational_poc', 'commercial_owner', 'influencer'].map(value => ({ value, label: titleize(value) }))
const influenceOptions: StakeholderInfluence[] = ['low', 'medium', 'high', 'critical']
const relationshipOptions: StakeholderRelationshipStrength[] = ['unknown', 'weak', 'developing', 'strong', 'champion']
const sentimentOptions: StakeholderSentiment[] = ['negative', 'neutral', 'positive', 'champion']
const statusOptions: StakeholderStatus[] = ['active', 'inactive', 'left_company', 'do_not_contact']

const fieldAliases = {
  engagement_id: 'engagementId',
  reports_to_stakeholder_id: 'reportsToStakeholderId',
  linkedin_url: 'linkedinUrl',
  relationship_strength: 'relationshipStrength',
  last_interaction_at: 'lastInteractionAt',
  is_sensitive: 'isSensitive',
}

export function StakeholderFormDrawer({ account, stakeholder, stakeholders, roleOptions = fallbackRoleOptions, open, onOpenChange, onSaved }: Props) {
  const { createStakeholder, isLoading: creating } = useCreateStakeholder(account.id)
  const { updateStakeholder, isLoading: updating } = useUpdateStakeholder()
  const { engagements } = useEngagements(open ? account.id : undefined, { page: 1, page_size: 100 })
  const effectiveRoleOptions = useMemo(() => mergeRoleOptions(roleOptions.length ? roleOptions : fallbackRoleOptions, stakeholder?.role ? [stakeholder.role] : []), [roleOptions, stakeholder?.role])
  const [form, setForm] = useState<StakeholderFormState>(() => initialForm(stakeholder, effectiveRoleOptions[0]?.value ?? 'operational_poc'))
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState('')
  const isEditing = Boolean(stakeholder)
  const isSaving = creating || updating

  useEffect(() => {
    if (!open) return
    setForm(initialForm(stakeholder, effectiveRoleOptions[0]?.value ?? 'operational_poc'))
    setFieldErrors({})
    setFormError('')
  }, [open, stakeholder])

  useEffect(() => {
    if (!open || stakeholder || !effectiveRoleOptions.length) return
    setForm(current => effectiveRoleOptions.some(option => option.value === current.role) ? current : { ...current, role: effectiveRoleOptions[0].value })
  }, [effectiveRoleOptions, open, stakeholder])

  const managerOptions = useMemo(
    () =>
      stakeholders
        .filter(item => item.id !== stakeholder?.id && item.status === 'active')
        .map(item => ({ value: item.id, label: item.title ? `${item.name} - ${item.title}` : item.name })),
    [stakeholder?.id, stakeholders],
  )

  function updateField(field: StakeholderFormField, value: string) {
    setForm(current => ({ ...current, [field]: value }))
    setFieldErrors(errors => clearFieldError(errors, field))
    setFormError('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const validation = validateForm(form)
    setFieldErrors(validation.fieldErrors)
    setFormError(validation.formError)
    if (validation.formError || hasFieldErrors(validation.fieldErrors)) return

    try {
      if (stakeholder) await updateStakeholder(stakeholder.id, buildPayload(form))
      else await createStakeholder(buildPayload(form) as StakeholderCreatePayload)
      onOpenChange(false)
      toast.success(stakeholder ? 'Stakeholder updated' : 'Stakeholder created')
      await onSaved?.()
    } catch (error) {
      const nextFieldErrors = apiFieldErrors(error, fieldAliases)
      setFieldErrors(nextFieldErrors)
      if (hasFieldErrors(nextFieldErrors)) {
        setFormError('')
        return
      }
      const message = error instanceof Error ? error.message : 'Stakeholder could not be saved'
      setFormError(message)
      toast.error(message)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={value => !isSaving && onOpenChange(value)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex h-[100dvh] w-[min(820px,100vw)] flex-col overflow-hidden border-l border-surface-border bg-white shadow-panel">
          <div className="flex items-start justify-between gap-4 border-b border-surface-border bg-white p-5">
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Stakeholder map</p>
              <Dialog.Title className="font-display text-2xl font-bold text-ink">{isEditing ? 'Edit stakeholder' : 'Add stakeholder'}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-secondary">
                Maintain client ownership, influence, sentiment, relationship posture, and sensitivity controls for {account.name}.
              </Dialog.Description>
            </div>
            <Dialog.Close className="tk-icon-button shrink-0" aria-label="Close stakeholder form" disabled={isSaving}>
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
                <div className="space-y-5">
                  <section className="grid gap-4 rounded-lg border border-surface-border bg-white p-4 md:grid-cols-2">
                    <TextField label="Name" field="name" value={form.name} error={fieldErrors.name} onChange={updateField} required />
                    <TextField label="Title" field="title" value={form.title} error={fieldErrors.title} onChange={updateField} />
                    <TextField label="Company" field="company" value={form.company} error={fieldErrors.company} onChange={updateField} />
                    <TextField label="Email" field="email" type="email" value={form.email} error={fieldErrors.email} onChange={updateField} />
                    <TextField label="Phone" field="phone" value={form.phone} error={fieldErrors.phone} onChange={updateField} />
                    <TextField label="LinkedIn URL" field="linkedinUrl" type="url" value={form.linkedinUrl} error={fieldErrors.linkedinUrl} onChange={updateField} placeholder="https://www.linkedin.com/in/contact" />
                    <label className="block">
                      <span className="tk-label">Engagement</span>
                      <select className={fieldClass(fieldErrors.engagementId)} value={form.engagementId} onChange={event => updateField('engagementId', event.target.value)} aria-invalid={Boolean(fieldErrors.engagementId)}>
                        <option value="">Account-level</option>
                        {engagements.map(engagement => (
                          <option key={engagement.id} value={engagement.id}>{engagement.name}</option>
                        ))}
                      </select>
                      <FieldError id="stakeholder-engagement-error" message={fieldErrors.engagementId} />
                    </label>
                  </section>

                  <section className="grid gap-4 rounded-lg border border-surface-border bg-white p-4 md:grid-cols-2">
                    <SelectField label="Role" field="role" value={form.role} options={effectiveRoleOptions} error={fieldErrors.role} onChange={updateField} required />
                    <SelectField label="Reports to" field="reportsToStakeholderId" value={form.reportsToStakeholderId} options={managerOptions} error={fieldErrors.reportsToStakeholderId} onChange={updateField} />
                    <SelectField label="Influence" field="influence" value={form.influence} options={influenceOptions} error={fieldErrors.influence} onChange={updateField} />
                    <SelectField label="Relationship" field="relationshipStrength" value={form.relationshipStrength} options={relationshipOptions} error={fieldErrors.relationshipStrength} onChange={updateField} />
                    <SelectField label="Sentiment" field="sentiment" value={form.sentiment} options={sentimentOptions} error={fieldErrors.sentiment} onChange={updateField} />
                    <SelectField label="Status" field="status" value={form.status} options={statusOptions} error={fieldErrors.status} onChange={updateField} />
                    <TextField label="Last interaction" field="lastInteractionAt" type="datetime-local" value={form.lastInteractionAt} error={fieldErrors.lastInteractionAt} onChange={updateField} />
                  </section>

                  <section className="rounded-lg border border-surface-border bg-white p-4">
                    <label className="block">
                      <span className="tk-label">Notes</span>
                      <textarea className={fieldClass(fieldErrors.notes, 'min-h-[128px] resize-y')} value={form.notes} onChange={event => updateField('notes', event.target.value)} aria-invalid={Boolean(fieldErrors.notes)} />
                      <FieldError id="stakeholder-notes-error" message={fieldErrors.notes} />
                    </label>
                  </section>
                </div>

                <aside className="space-y-4">
                  <div className="rounded-lg border border-surface-border bg-surface-secondary p-4">
                    <div className="flex items-center gap-2">
                      <UserRound className="h-4 w-4 text-brand-blue" />
                      <h3 className="text-sm font-semibold text-ink">Stakeholder profile</h3>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-ink-secondary">Role, influence, relationship, and sentiment values power coverage gaps and org chart views.</p>
                  </div>

                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-surface-border bg-white p-4">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-surface-border text-brand-blue focus:ring-brand-blue"
                      checked={form.isSensitive}
                      onChange={event => {
                        setForm(current => ({ ...current, isSensitive: event.target.checked }))
                        setFormError('')
                      }}
                    />
                    <span>
                      <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                        <ShieldAlert className="h-4 w-4 text-brand-orange" />
                        Sensitive stakeholder
                      </span>
                      <span className="mt-2 block text-xs leading-5 text-ink-secondary">Sensitive fields are controlled by backend field-level access.</span>
                    </span>
                  </label>
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
                    {isSaving ? 'Saving...' : isEditing ? 'Save changes' : 'Create stakeholder'}
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
  field: StakeholderFormField
  value: string
  error?: string
  onChange: (field: StakeholderFormField, value: string) => void
  required?: boolean
  type?: string
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  return (
    <label className="block">
      <span className="tk-label">{label} {required ? <span className="text-rag-red">*</span> : null}</span>
      <input {...inputProps} type={type} className={fieldClass(error)} value={value} onChange={event => onChange(field, event.target.value)} aria-invalid={Boolean(error)} />
      <FieldError id={`stakeholder-${field}-error`} message={error} />
    </label>
  )
}

function mergeRoleOptions(options: StakeholderRoleOption[], roleSlugs: string[]) {
  const seen = new Set<string>()
  const merged: StakeholderRoleOption[] = []
  options.forEach(option => {
    if (seen.has(option.value)) return
    seen.add(option.value)
    merged.push(option)
  })
  roleSlugs.forEach(roleSlug => {
    if (!roleSlug || seen.has(roleSlug)) return
    seen.add(roleSlug)
    merged.push({ value: roleSlug, label: titleize(roleSlug) })
  })
  return merged
}

function SelectField({
  label,
  field,
  value,
  options,
  error,
  onChange,
  required = false,
}: {
  label: string
  field: StakeholderFormField
  value: string
  options: string[] | { value: string; label: string }[]
  error?: string
  onChange: (field: StakeholderFormField, value: string) => void
  required?: boolean
}) {
  return (
    <label className="block">
      <span className="tk-label">{label} {required ? <span className="text-rag-red">*</span> : null}</span>
      <select className={fieldClass(error)} value={value} onChange={event => onChange(field, event.target.value)} aria-invalid={Boolean(error)}>
        {!required ? <option value="">None</option> : null}
        {options.map(option => {
          const value = typeof option === 'string' ? option : option.value
          const label = typeof option === 'string' ? titleize(option) : option.label
          return <option key={value} value={value}>{label}</option>
        })}
      </select>
      <FieldError id={`stakeholder-${field}-error`} message={error} />
    </label>
  )
}

function initialForm(stakeholder: Stakeholder | null | undefined, defaultRole: string): StakeholderFormState {
  return {
    name: stakeholder?.name ?? '',
    title: stakeholder?.title ?? '',
    company: stakeholder?.company ?? '',
    email: stakeholder?.email ?? '',
    phone: stakeholder?.phone ?? '',
    linkedinUrl: stakeholder?.linkedinUrl ?? '',
    engagementId: stakeholder?.engagementId ?? '',
    reportsToStakeholderId: stakeholder?.reportsToStakeholderId ?? '',
    role: stakeholder?.role ?? defaultRole,
    influence: normalizeInfluence(stakeholder?.influence) ?? 'medium',
    relationshipStrength: normalizeRelationship(stakeholder?.relationshipStrength) ?? 'developing',
    sentiment: normalizeSentiment(stakeholder?.sentiment) ?? 'neutral',
    status: normalizeStatus(stakeholder?.status) ?? 'active',
    notes: stakeholder?.notes ?? '',
    lastInteractionAt: toDateTimeInput(stakeholder?.lastInteractionAt),
    isSensitive: stakeholder?.isSensitive ?? false,
  }
}

function validateForm(form: StakeholderFormState) {
  const fieldErrors: FieldErrors = {}
  if (!form.name.trim()) fieldErrors.name = 'Name is required'
  if (!form.role) fieldErrors.role = 'Role is required'
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) fieldErrors.email = 'Enter a valid email address'
  if (form.linkedinUrl.trim() && !isLinkedinUrl(form.linkedinUrl)) fieldErrors.linkedinUrl = 'Enter a valid LinkedIn URL'
  return { fieldErrors, formError: '' }
}

function buildPayload(form: StakeholderFormState) {
  return {
    name: form.name.trim(),
    title: emptyToNull(form.title),
    company: emptyToNull(form.company),
    email: emptyToNull(form.email),
    phone: emptyToNull(form.phone),
    linkedinUrl: form.linkedinUrl.trim() ? normalizeLinkedinUrl(form.linkedinUrl) : null,
    engagementId: emptyToNull(form.engagementId),
    reportsToStakeholderId: emptyToNull(form.reportsToStakeholderId),
    role: form.role,
    influence: form.influence,
    relationshipStrength: form.relationshipStrength,
    sentiment: form.sentiment,
    status: form.status,
    notes: emptyToNull(form.notes),
    lastInteractionAt: form.lastInteractionAt ? new Date(form.lastInteractionAt).toISOString() : null,
    isSensitive: form.isSensitive,
  }
}

function emptyToNull(value: string) {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function normalizeLinkedinUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function isLinkedinUrl(value: string) {
  try {
    const host = new URL(normalizeLinkedinUrl(value)).hostname.toLowerCase()
    return host === 'linkedin.com' || host.endsWith('.linkedin.com')
  } catch {
    return false
  }
}

function toDateTimeInput(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 16)
}

function fieldClass(error?: string, className?: string) {
  return cn('tk-input', error ? 'border-rag-red focus:border-rag-red focus:ring-rag-red/20' : '', className)
}

function titleize(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

function normalizeInfluence(value?: string): StakeholderInfluence | undefined {
  return influenceOptions.find(option => option === value)
}

function normalizeRelationship(value?: string): StakeholderRelationshipStrength | undefined {
  return relationshipOptions.find(option => option === value)
}

function normalizeSentiment(value?: string): StakeholderSentiment | undefined {
  return sentimentOptions.find(option => option === value)
}

function normalizeStatus(value?: string): StakeholderStatus | undefined {
  return statusOptions.find(option => option === value)
}
