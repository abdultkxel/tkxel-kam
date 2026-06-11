import * as Dialog from '@radix-ui/react-dialog'
import { format } from 'date-fns'
import { Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ApiError, ApiFieldError } from '@/services/api'
import { useAuth } from '@/contexts/AuthContext'
import { useGovernanceStore } from '@/stores/governanceStore'
import { GovernanceEventRecord, GovernanceEventType } from '@/types/governance'

type FieldErrors = Record<string, string>

interface EditGovernanceEventDialogProps {
  event: GovernanceEventRecord
  triggerClassName?: string
  triggerLabel?: string
  triggerAriaLabel?: string
  onSaved?: (event: GovernanceEventRecord) => void
}

export function EditGovernanceEventDialog({
  event,
  triggerClassName = 'tk-button-secondary',
  triggerLabel = 'Edit',
  triggerAriaLabel,
  onSaved,
}: EditGovernanceEventDialogProps) {
  const { token } = useAuth()
  const updateEvent = useGovernanceStore(state => state.updateEvent)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [type, setType] = useState<GovernanceEventType>(event.type)
  const [date, setDate] = useState(toDateInput(event.date))
  const [time, setTime] = useState(toTimeInput(event.date))
  const [agenda, setAgenda] = useState(event.agenda)
  const [attendeeEmails, setAttendeeEmails] = useState<string[]>(event.attendeeEmails.length ? event.attendeeEmails : [''])
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  useEffect(() => {
    if (!open) return
    setType(event.type)
    setDate(toDateInput(event.date))
    setTime(toTimeInput(event.date))
    setAgenda(event.agenda)
    setAttendeeEmails(event.attendeeEmails.length ? event.attendeeEmails : [''])
    setFieldErrors({})
  }, [event, open])

  async function submit(formEvent: FormEvent) {
    formEvent.preventDefault()
    setFieldErrors({})

    if (!token) {
      toast.error('Sign in again before editing governance.')
      return
    }

    const nextErrors: FieldErrors = {}
    if (!date || !time) nextErrors.scheduled_at = 'Choose the governance date and time.'
    if (!agenda.trim()) nextErrors.agenda = 'Add an agenda so attendees know what will be reviewed.'
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors)
      return
    }

    setSaving(true)
    try {
      const savedEvent = await updateEvent(token, event.id, {
        governanceType: type,
        scheduledAt: new Date(`${date}T${time}:00`).toISOString(),
        agenda: agenda.trim(),
        attendeeEmails: cleanAttendeeEmails(attendeeEmails),
      })
      toast.success('Governance event updated')
      setOpen(false)
      onSaved?.(savedEvent)
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length) {
        setFieldErrors(normalizeFieldErrors(err.fieldErrors))
        toast.error(err.message)
      } else {
        toast.error(err instanceof Error ? err.message : 'Unable to update governance event')
      }
    } finally {
      setSaving(false)
    }
  }

  function updateAttendeeEmail(index: number, value: string) {
    setAttendeeEmails(current => current.map((item, itemIndex) => (itemIndex === index ? value : item)))
  }

  function removeAttendeeEmail(index: number) {
    setAttendeeEmails(current => current.length === 1 ? [''] : current.filter((_, itemIndex) => itemIndex !== index))
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" className={triggerClassName} aria-label={triggerAriaLabel} title={triggerAriaLabel ?? triggerLabel}>
          <Pencil className="h-4 w-4" />
          {triggerLabel ? <span>{triggerLabel}</span> : null}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[min(94vw,680px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-surface-border bg-white p-6 shadow-panel">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Governance</p>
              <Dialog.Title className="font-display text-2xl font-bold text-ink">Edit governance event</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-secondary">Update the event type, schedule, agenda, and attendee emails.</Dialog.Description>
            </div>
            <Dialog.Close className="tk-icon-button" aria-label="Close edit governance event">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <form onSubmit={submit} className="grid gap-4">
            <div className="rounded-lg border border-surface-border bg-surface-secondary p-3 text-xs leading-5 text-ink-secondary">
              Account: <span className="font-semibold text-ink">{event.accountName}</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="space-y-1">
                <span className="tk-label">Event type</span>
                <select className="tk-input" value={type} onChange={item => setType(item.target.value as GovernanceEventType)}>
                  <option>QBR</option>
                  <option>SteerCo</option>
                  <option>Monthly Review</option>
                  <option>Executive Review</option>
                </select>
                <InlineError message={fieldErrors.governance_type} />
              </label>
              <label className="space-y-1">
                <span className="tk-label">Date</span>
                <input type="date" className="tk-input" value={date} onChange={item => setDate(item.target.value)} />
                <InlineError message={fieldErrors.scheduled_at} />
              </label>
              <label className="space-y-1">
                <span className="tk-label">Time</span>
                <input type="time" className="tk-input" value={time} onChange={item => setTime(item.target.value)} />
              </label>
            </div>
            <label className="space-y-1">
              <span className="tk-label">Agenda</span>
              <textarea className="tk-input min-h-[120px]" value={agenda} onChange={item => setAgenda(item.target.value)} />
              <InlineError message={fieldErrors.agenda} />
            </label>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="tk-label">Attendee emails</span>
                <button type="button" className="tk-button-secondary" onClick={() => setAttendeeEmails(current => [...current, ''])}>
                  <Plus className="h-4 w-4" />
                  Add email
                </button>
              </div>
              <div className="grid gap-2">
                {attendeeEmails.map((email, index) => (
                  <div key={index} className="grid grid-cols-[minmax(0,1fr)_44px] gap-2">
                    <input
                      type="text"
                      inputMode="email"
                      className="tk-input"
                      value={email}
                      onChange={item => updateAttendeeEmail(index, item.target.value)}
                      placeholder={index === 0 ? 'client.owner@example.com' : 'another.attendee@example.com'}
                    />
                    <button type="button" className="tk-icon-button" onClick={() => removeAttendeeEmail(index)} aria-label="Remove attendee email">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <InlineError message={fieldErrors.attendee_emails} />
            </div>
            <div className="flex justify-end gap-2">
              <Dialog.Close type="button" className="tk-button-secondary">Cancel</Dialog.Close>
              <button type="submit" className="tk-button-primary" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                Save changes
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function toDateInput(value: string) {
  return format(new Date(value), 'yyyy-MM-dd')
}

function toTimeInput(value: string) {
  return format(new Date(value), 'HH:mm')
}

function cleanAttendeeEmails(emails: string[]) {
  return Array.from(new Set(emails.map(email => email.trim().toLowerCase()).filter(Boolean)))
}

function normalizeFieldErrors(errors: ApiFieldError[]) {
  return errors.reduce<FieldErrors>((acc, error) => {
    acc[error.field.split('.')[0]] = error.message
    return acc
  }, {})
}

function InlineError({ message }: { message?: string }) {
  return message ? <p className="text-xs font-semibold text-rag-red">{message}</p> : null
}
