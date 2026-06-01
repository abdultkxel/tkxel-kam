import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, CalendarClock, History, Loader2, MessageSquarePlus, Pencil, Save, ShieldAlert, Sparkles, UserRound, X } from 'lucide-react'
import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { FieldError } from '@/components/form/FieldError'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useCreateStakeholderInteraction, useStakeholderInteractions } from '@/hooks/useStakeholders'
import type { Account } from '@/types/account'
import type {
  Stakeholder,
  StakeholderInteractionCreatePayload,
  StakeholderRelationshipStrength,
  StakeholderSentiment,
} from '@/types/stakeholder'
import { cn } from '@/utils/cn'
import { apiFieldErrors, clearFieldError, hasFieldErrors } from '@/utils/formErrors'
import type { FieldErrors } from '@/utils/formErrors'

type BadgeTone = 'green' | 'amber' | 'red' | 'blue' | 'gray' | 'purple'
type InteractionFormField = 'interactionType' | 'interactionDate' | 'summary' | 'outcome' | 'sentimentAfter' | 'relationshipStrengthAfter'

interface InteractionFormState {
  interactionType: string
  interactionDate: string
  summary: string
  outcome: string
  sentimentAfter: string
  relationshipStrengthAfter: string
}

interface Props {
  account: Pick<Account, 'id' | 'name'>
  stakeholder: Stakeholder | null
  open: boolean
  canManage: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (stakeholder: Stakeholder) => void
  onChanged?: () => Promise<unknown> | unknown
}

const interactionTypes = ['note', 'email', 'call', 'meeting', 'executive_review', 'governance_touchpoint']
const sentimentOptions: StakeholderSentiment[] = ['negative', 'neutral', 'positive', 'champion']
const relationshipOptions: StakeholderRelationshipStrength[] = ['unknown', 'weak', 'developing', 'strong', 'champion']

const fieldAliases = {
  interaction_type: 'interactionType',
  interaction_date: 'interactionDate',
  sentiment_after: 'sentimentAfter',
  relationship_strength_after: 'relationshipStrengthAfter',
}

export function StakeholderDetailPanel({ account, stakeholder, open, canManage, onOpenChange, onEdit, onChanged }: Props) {
  const stakeholderId = open ? stakeholder?.id : undefined
  const { interactions, isLoading, error, refetch } = useStakeholderInteractions(stakeholderId)
  const { createStakeholderInteraction, isLoading: savingInteraction } = useCreateStakeholderInteraction(stakeholderId)
  const [form, setForm] = useState<InteractionFormState>(() => initialInteractionForm())
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState('')
  const relationshipWillChange = Boolean(form.sentimentAfter || form.relationshipStrengthAfter)

  useEffect(() => {
    if (!open) return
    setForm(initialInteractionForm())
    setFieldErrors({})
    setFormError('')
  }, [open, stakeholder?.id])

  const sortedInteractions = useMemo(
    () => [...interactions].sort((a, b) => new Date(b.interactionDate).getTime() - new Date(a.interactionDate).getTime()),
    [interactions],
  )

  function updateField(field: InteractionFormField, value: string) {
    setForm(current => ({ ...current, [field]: value }))
    setFieldErrors(errors => clearFieldError(errors, field))
    setFormError('')
  }

  async function submitInteraction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!stakeholder) return
    const validation = validateInteractionForm(form)
    setFieldErrors(validation.fieldErrors)
    setFormError(validation.formError)
    if (validation.formError || hasFieldErrors(validation.fieldErrors)) return

    try {
      await createStakeholderInteraction(buildInteractionPayload(form))
      setForm(initialInteractionForm())
      toast.success('Stakeholder interaction added')
      await Promise.allSettled([refetch(), Promise.resolve().then(() => onChanged?.())])
    } catch (error) {
      const nextFieldErrors = apiFieldErrors(error, fieldAliases)
      setFieldErrors(nextFieldErrors)
      if (hasFieldErrors(nextFieldErrors)) {
        setFormError('')
        return
      }
      const message = error instanceof Error ? error.message : 'Interaction could not be saved'
      setFormError(message)
      toast.error(message)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={value => !savingInteraction && onOpenChange(value)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex h-[100dvh] w-[min(980px,100vw)] flex-col overflow-hidden border-l border-surface-border bg-white shadow-panel">
          <div className="flex items-start justify-between gap-4 border-b border-surface-border bg-white p-5">
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Stakeholder detail</p>
              <Dialog.Title className="font-display text-2xl font-bold text-ink">{stakeholder?.name ?? 'Stakeholder'}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-secondary">{stakeholder?.title || stakeholder?.company || account.name}</Dialog.Description>
            </div>
            <div className="flex shrink-0 gap-2">
              {stakeholder && canManage ? (
                <button type="button" className="tk-icon-button" aria-label={`Edit ${stakeholder.name}`} onClick={() => onEdit(stakeholder)}>
                  <Pencil className="h-5 w-5" />
                </button>
              ) : null}
              <Dialog.Close className="tk-icon-button" aria-label="Close stakeholder detail" disabled={savingInteraction}>
                <X className="h-5 w-5" />
              </Dialog.Close>
            </div>
          </div>

          {stakeholder ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-5">
                  <section className="rounded-lg border border-surface-border bg-white p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={roleTone(stakeholder.role)}>{titleize(stakeholder.role)}</Badge>
                      <Badge tone={statusTone(stakeholder.status)}>{titleize(stakeholder.status)}</Badge>
                      {stakeholder.isSensitive ? <Badge tone="amber">Sensitive</Badge> : null}
                      {stakeholder.sensitiveFieldsRedacted ? <Badge tone="gray">Redacted</Badge> : null}
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <ProfileField label="Influence" value={titleize(stakeholder.influence)} tone={influenceTone(stakeholder.influence)} />
                      <ProfileField label="Relationship" value={titleize(stakeholder.relationshipStrength)} tone={relationshipTone(stakeholder.relationshipStrength)} />
                      <ProfileField label="Sentiment" value={titleize(stakeholder.sentiment)} tone={sentimentTone(stakeholder.sentiment)} />
                      <ProfileField label="Political risk" value={titleize(stakeholder.politicalRisk)} tone={politicalRiskTone(stakeholder.politicalRisk)} />
                      <ProfileField label="Last interaction" value={stakeholder.lastInteractionAt ? formatDateTime(stakeholder.lastInteractionAt) : 'No activity recorded'} />
                      <ProfileField label="Reports to" value={stakeholder.reportsToStakeholderId ? 'Mapped stakeholder' : 'Unmapped'} />
                    </div>
                  </section>

                  <section className="rounded-lg border border-surface-border bg-white p-4">
                    <div className="flex items-center gap-2">
                      <UserRound className="h-4 w-4 text-brand-blue" />
                      <h3 className="text-sm font-semibold text-ink">Profile</h3>
                    </div>
                    <dl className="mt-4 grid gap-3 md:grid-cols-2">
                      <DetailLine label="Title" value={stakeholder.title} />
                      <DetailLine label="Company" value={stakeholder.company} />
                      <DetailLine label="Email" value={stakeholder.email} />
                      <DetailLine label="Phone" value={stakeholder.phone} />
                      <DetailLine label="Engagement" value={stakeholder.engagementId ? 'Engagement-linked' : 'Account-level'} />
                      <DetailLine label="Created" value={formatDateTime(stakeholder.createdAt)} />
                    </dl>
                    <div className="mt-4 rounded-md bg-surface-secondary p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">Notes</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink">{stakeholder.notes || 'No notes recorded.'}</p>
                    </div>
                  </section>

                  <InteractionTimeline
                    interactions={sortedInteractions}
                    isLoading={isLoading && !interactions.length}
                    error={error}
                    onRetry={() => void refetch()}
                  />
                </div>

                <aside className="space-y-5">
                  <form onSubmit={submitInteraction} className="rounded-lg border border-surface-border bg-white p-4" noValidate>
                    <div className="flex items-center gap-2">
                      <MessageSquarePlus className="h-4 w-4 text-brand-blue" />
                      <h3 className="text-sm font-semibold text-ink">Add interaction</h3>
                    </div>
                    <div className="mt-4 grid gap-3">
                      <label className="block">
                        <span className="tk-label">Type</span>
                        <select className={fieldClass(fieldErrors.interactionType)} value={form.interactionType} onChange={event => updateField('interactionType', event.target.value)} aria-invalid={Boolean(fieldErrors.interactionType)}>
                          {interactionTypes.map(type => <option key={type} value={type}>{titleize(type)}</option>)}
                        </select>
                        <FieldError id="interaction-type-error" message={fieldErrors.interactionType} />
                      </label>
                      <label className="block">
                        <span className="tk-label">Date</span>
                        <input type="datetime-local" className={fieldClass(fieldErrors.interactionDate)} value={form.interactionDate} onChange={event => updateField('interactionDate', event.target.value)} aria-invalid={Boolean(fieldErrors.interactionDate)} />
                        <FieldError id="interaction-date-error" message={fieldErrors.interactionDate} />
                      </label>
                      <label className="block">
                        <span className="tk-label">Summary <span className="text-rag-red">*</span></span>
                        <textarea className={fieldClass(fieldErrors.summary, 'min-h-[112px] resize-y')} value={form.summary} onChange={event => updateField('summary', event.target.value)} aria-invalid={Boolean(fieldErrors.summary)} />
                        <FieldError id="interaction-summary-error" message={fieldErrors.summary} />
                      </label>
                      <label className="block">
                        <span className="tk-label">Outcome</span>
                        <textarea className={fieldClass(fieldErrors.outcome, 'min-h-[84px] resize-y')} value={form.outcome} onChange={event => updateField('outcome', event.target.value)} aria-invalid={Boolean(fieldErrors.outcome)} />
                        <FieldError id="interaction-outcome-error" message={fieldErrors.outcome} />
                      </label>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                        <label className="block">
                          <span className="tk-label">Sentiment after</span>
                          <select className={fieldClass(fieldErrors.sentimentAfter)} value={form.sentimentAfter} onChange={event => updateField('sentimentAfter', event.target.value)} aria-invalid={Boolean(fieldErrors.sentimentAfter)}>
                            <option value="">No change</option>
                            {sentimentOptions.map(value => <option key={value} value={value}>{titleize(value)}</option>)}
                          </select>
                          <FieldError id="interaction-sentiment-error" message={fieldErrors.sentimentAfter} />
                        </label>
                        <label className="block">
                          <span className="tk-label">Relationship after</span>
                          <select className={fieldClass(fieldErrors.relationshipStrengthAfter)} value={form.relationshipStrengthAfter} onChange={event => updateField('relationshipStrengthAfter', event.target.value)} aria-invalid={Boolean(fieldErrors.relationshipStrengthAfter)}>
                            <option value="">No change</option>
                            {relationshipOptions.map(value => <option key={value} value={value}>{titleize(value)}</option>)}
                          </select>
                          <FieldError id="interaction-relationship-error" message={fieldErrors.relationshipStrengthAfter} />
                        </label>
                      </div>
                      {relationshipWillChange ? (
                        <div className="flex gap-2 rounded-md border border-brand-orange/20 bg-brand-orange/10 p-3 text-xs leading-5 text-ink-secondary">
                          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-orange" />
                          <span>Selected after-values may update relationship intelligence for this stakeholder.</span>
                        </div>
                      ) : null}
                      {formError ? <p className="rounded-md border border-rag-red/20 bg-rag-red/10 px-3 py-2 text-sm font-medium text-rag-red">{formError}</p> : null}
                      <button type="submit" className="tk-button-primary justify-center" disabled={savingInteraction}>
                        {savingInteraction ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {savingInteraction ? 'Saving...' : 'Add interaction'}
                      </button>
                    </div>
                  </form>

                  <div className="rounded-lg border border-surface-border bg-surface-secondary p-4">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 text-brand-orange" />
                      <h3 className="text-sm font-semibold text-ink">Relationship signals</h3>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-ink-secondary">Interaction history feeds last-touch recency, sentiment movement, relationship strength, coverage gaps, org chart context, and account timeline history.</p>
                  </div>
                </aside>
              </div>
            </div>
          ) : (
            <div className="p-5">
              <EmptyState icon={UserRound} heading="No stakeholder selected" body="Choose a stakeholder from the list to view details and interactions." />
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function InteractionTimeline({
  interactions,
  isLoading,
  error,
  onRetry,
}: {
  interactions: ReturnType<typeof useStakeholderInteractions>['interactions']
  isLoading: boolean
  error: Error | null
  onRetry: () => void
}) {
  return (
    <section className="rounded-lg border border-surface-border bg-white p-4">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-brand-blue" />
        <h3 className="text-sm font-semibold text-ink">Interaction timeline</h3>
      </div>
      <div className="mt-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : error ? (
          <EmptyState icon={AlertTriangle} heading="Interactions could not be loaded" body={error.message} action={{ label: 'Retry', onClick: onRetry }} className="rounded-lg border border-surface-border bg-surface-secondary" />
        ) : interactions.length === 0 ? (
          <EmptyState icon={MessageSquarePlus} heading="No interactions yet" body="Add the first stakeholder interaction from this panel." className="rounded-lg border border-surface-border bg-surface-secondary" />
        ) : (
          <ol className="space-y-3">
            {interactions.map(interaction => (
              <li key={interaction.id} className="rounded-lg border border-surface-border bg-white p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="blue">{titleize(interaction.interactionType)}</Badge>
                      {interaction.sentimentAfter ? <Badge tone={sentimentTone(interaction.sentimentAfter)}>{titleize(interaction.sentimentAfter)}</Badge> : null}
                      {interaction.relationshipStrengthAfter ? <Badge tone={relationshipTone(interaction.relationshipStrengthAfter)}>{titleize(interaction.relationshipStrengthAfter)}</Badge> : null}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-ink">{interaction.summary || 'No summary recorded.'}</p>
                    {interaction.outcome ? <p className="mt-2 text-xs leading-5 text-ink-secondary">{interaction.outcome}</p> : null}
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-ink-secondary">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {formatDateTime(interaction.interactionDate)}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}

function ProfileField({ label, value, tone }: { label: string; value: string; tone?: BadgeTone }) {
  return (
    <div className="rounded-md bg-surface-secondary p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">{label}</p>
      <div className="mt-2">{tone ? <Badge tone={tone}>{value}</Badge> : <p className="text-sm font-semibold text-ink">{value}</p>}</div>
    </div>
  )
}

function DetailLine({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-ink">{value || 'Not recorded'}</dd>
    </div>
  )
}

function initialInteractionForm(): InteractionFormState {
  return {
    interactionType: 'note',
    interactionDate: toDateTimeInput(new Date().toISOString()),
    summary: '',
    outcome: '',
    sentimentAfter: '',
    relationshipStrengthAfter: '',
  }
}

function validateInteractionForm(form: InteractionFormState) {
  const fieldErrors: FieldErrors = {}
  if (!form.summary.trim()) fieldErrors.summary = 'Summary is required'
  if (form.summary.trim().length > 4000) fieldErrors.summary = 'Summary must be 4000 characters or fewer'
  if (!form.interactionType.trim()) fieldErrors.interactionType = 'Type is required'
  if (!form.interactionDate) fieldErrors.interactionDate = 'Date is required'
  else if (Number.isNaN(new Date(form.interactionDate).getTime())) fieldErrors.interactionDate = 'Enter a valid date'
  return { fieldErrors, formError: '' }
}

function buildInteractionPayload(form: InteractionFormState): StakeholderInteractionCreatePayload {
  return {
    interactionType: form.interactionType.trim(),
    interactionDate: new Date(form.interactionDate).toISOString(),
    summary: form.summary.trim(),
    outcome: emptyToNull(form.outcome),
    sentimentAfter: form.sentimentAfter || null,
    relationshipStrengthAfter: form.relationshipStrengthAfter || null,
  }
}

function emptyToNull(value: string) {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
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

function Badge({ tone, children }: { tone: BadgeTone; children: string }) {
  const toneClass: Record<BadgeTone, string> = {
    green: 'border-rag-green/20 bg-rag-green/10 text-rag-green',
    amber: 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange',
    red: 'border-rag-red/20 bg-rag-red/10 text-rag-red',
    blue: 'border-brand-blue/20 bg-blue-tint-20 text-brand-blue',
    gray: 'border-surface-border bg-surface-tertiary text-ink-secondary',
    purple: 'border-purple-500/20 bg-purple-50 text-purple-700',
  }
  return <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider', toneClass[tone])}>{children}</span>
}

function roleTone(role: string): BadgeTone {
  if (role === 'executive_sponsor') return 'purple'
  if (role === 'economic_buyer' || role === 'commercial_owner') return 'blue'
  if (role === 'technical_decision_maker') return 'green'
  return 'gray'
}

function statusTone(status: string): BadgeTone {
  if (status === 'active') return 'green'
  if (status === 'do_not_contact') return 'red'
  if (status === 'left_company') return 'gray'
  return 'amber'
}

function influenceTone(influence: string): BadgeTone {
  if (influence === 'critical') return 'red'
  if (influence === 'high') return 'amber'
  if (influence === 'medium') return 'blue'
  return 'gray'
}

function relationshipTone(relationship: string): BadgeTone {
  if (relationship === 'champion' || relationship === 'strong') return 'green'
  if (relationship === 'developing') return 'blue'
  if (relationship === 'weak') return 'amber'
  return 'gray'
}

function sentimentTone(sentiment: string): BadgeTone {
  if (sentiment === 'champion' || sentiment === 'positive') return 'green'
  if (sentiment === 'negative') return 'red'
  return 'gray'
}

function politicalRiskTone(risk: string): BadgeTone {
  if (risk === 'high' || risk === 'critical') return 'red'
  if (risk === 'medium') return 'amber'
  if (risk === 'low') return 'green'
  return 'gray'
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Invalid date'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date)
}

function titleize(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}
