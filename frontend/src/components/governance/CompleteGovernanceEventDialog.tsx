import * as Dialog from '@radix-ui/react-dialog'
import { CheckCircle2, Loader2, X } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { toast } from 'sonner'
import { ApiError, ApiFieldError } from '@/services/api'
import { useAuth } from '@/contexts/AuthContext'
import { useGovernanceStore } from '@/stores/governanceStore'
import { GovernanceEventRecord } from '@/types/governance'

interface CompleteGovernanceEventDialogProps {
  event: GovernanceEventRecord
  triggerClassName?: string
  triggerLabel?: string
  onCompleted?: (event: GovernanceEventRecord) => void
}

export function CompleteGovernanceEventDialog({
  event,
  triggerClassName = 'tk-button-primary',
  triggerLabel = 'Complete event',
  onCompleted,
}: CompleteGovernanceEventDialogProps) {
  const { token } = useAuth()
  const completeEvent = useGovernanceStore(state => state.completeEvent)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notes, setNotes] = useState('')
  const [decisionText, setDecisionText] = useState('')
  const [actionTitle, setActionTitle] = useState('')
  const [actionDueDate, setActionDueDate] = useState('')
  const [actionOwnerEmail, setActionOwnerEmail] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  async function submit(formEvent: FormEvent) {
    formEvent.preventDefault()
    setFieldErrors({})

    if (!token) {
      toast.error('Sign in again before completing governance.')
      return
    }

    const nextErrors: Record<string, string> = {}
    if (!notes.trim()) nextErrors.notes = 'Add completion notes before marking governance complete.'
    if (!actionTitle.trim() && (actionDueDate || actionOwnerEmail.trim())) nextErrors.action_items = 'Add an action item before assigning an owner or due date.'
    if (actionTitle.trim() && !actionDueDate) nextErrors.action_items = 'Choose a due date for the governance action item.'
    if (actionTitle.trim() && !actionOwnerEmail.trim()) nextErrors.action_items = 'Add an owner email for the governance action item.'
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors)
      return
    }

    setSaving(true)
    try {
      const savedEvent = await completeEvent(token, event.id, {
        notes: notes.trim(),
        decisions: decisionText.trim() ? [{ decisionText: decisionText.trim() }] : [],
        actionItems: actionTitle.trim()
          ? [{
              title: actionTitle.trim(),
              ownerEmail: actionOwnerEmail.trim() || null,
              dueDate: new Date(`${actionDueDate}T17:00:00`).toISOString(),
            }]
          : [],
      })
      toast.success('Governance event completed')
      setOpen(false)
      resetForm()
      onCompleted?.(savedEvent)
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length) {
        setFieldErrors(normalizeFieldErrors(err.fieldErrors))
        toast.error(err.message)
      } else {
        toast.error(err instanceof Error ? err.message : 'Unable to complete governance event')
      }
    } finally {
      setSaving(false)
    }
  }

  function resetForm() {
    setNotes('')
    setDecisionText('')
    setActionTitle('')
    setActionDueDate('')
    setActionOwnerEmail('')
    setFieldErrors({})
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" className={triggerClassName}>
          <CheckCircle2 className="h-4 w-4" />
          {triggerLabel}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(620px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-surface-border bg-white p-5 shadow-panel">
          <div className="flex items-start justify-between gap-4 border-b border-surface-border pb-4">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Governance</p>
              <Dialog.Title className="font-display text-2xl font-bold text-ink">Complete {event.type}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-secondary">Capture meeting notes, optional decisions, and governance-local action items.</Dialog.Description>
            </div>
            <Dialog.Close className="tk-icon-button" aria-label="Close complete governance dialog">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <form onSubmit={submit} className="mt-5 space-y-4">
            <label className="space-y-1">
              <span className="tk-label text-xs">Completion notes</span>
              <textarea className="tk-input min-h-[130px] resize-y" value={notes} onChange={item => setNotes(item.target.value)} placeholder="Summarize outcomes, risks, follow-ups, and client commitments." />
              <InlineError message={fieldErrors.notes} />
            </label>
            <label className="space-y-1">
              <span className="tk-label text-xs">Decision</span>
              <input className="tk-input" value={decisionText} onChange={item => setDecisionText(item.target.value)} placeholder="Budget owner confirmed, recovery cadence approved" />
              <InlineError message={fieldErrors.decisions} />
            </label>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
              <label className="space-y-1">
                <span className="tk-label text-xs">Action item</span>
                <input className="tk-input" value={actionTitle} onChange={item => setActionTitle(item.target.value)} placeholder="Share roadmap deck, confirm sponsor reset" />
              </label>
              <label className="space-y-1">
                <span className="tk-label text-xs">Due date</span>
                <input type="date" className="tk-input" value={actionDueDate} onChange={item => setActionDueDate(item.target.value)} />
              </label>
            </div>
            <label className="space-y-1">
              <span className="tk-label text-xs">Action owner email</span>
              <input type="text" inputMode="email" className="tk-input" value={actionOwnerEmail} onChange={item => setActionOwnerEmail(item.target.value)} placeholder="owner@example.com" />
              <InlineError message={fieldErrors.action_items} />
            </label>
            <div className="flex justify-end gap-2 border-t border-surface-border pt-4">
              <Dialog.Close type="button" className="tk-button-secondary">Cancel</Dialog.Close>
              <button type="submit" className="tk-button-primary" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Save completion
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function normalizeFieldErrors(errors: ApiFieldError[]) {
  return errors.reduce<Record<string, string>>((acc, error) => {
    acc[error.field.split('.')[0]] = error.message
    return acc
  }, {})
}

function InlineError({ message }: { message?: string }) {
  return message ? <p className="text-xs font-semibold text-rag-red">{message}</p> : null
}
