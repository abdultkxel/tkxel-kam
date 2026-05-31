import * as Dialog from '@radix-ui/react-dialog'
import { CalendarPlus, Loader2, Plus, Trash2, X } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ApiError, ApiFieldError } from '@/services/api'
import { useAuth } from '@/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'
import { useAccountStore } from '@/stores/accountStore'
import { useGovernanceStore } from '@/stores/governanceStore'
import { GovernanceEventRecord, GovernanceEventType } from '@/types/governance'

type FieldErrors = Record<string, string>

interface AddGovernanceEventDialogProps {
  triggerClassName?: string
  triggerLabel?: string
  defaultAccountId?: string
  lockAccount?: boolean
  onCreated?: (event: GovernanceEventRecord) => void
}

export function AddGovernanceEventDialog({
  triggerClassName = 'tk-button-primary',
  triggerLabel = 'Add governance event',
  defaultAccountId,
  lockAccount = false,
  onCreated,
}: AddGovernanceEventDialogProps) {
  const accounts = useAccountStore(state => state.accounts)
  const accountsLoaded = useAccountStore(state => state.accountsLoaded)
  const accountsLoading = useAccountStore(state => state.accountsLoading)
  const accountsError = useAccountStore(state => state.accountsError)
  const createEvent = useGovernanceStore(state => state.createEvent)
  const { token } = useAuth()
  const user = useRole()
  const initialAccountId = defaultAccountId ?? ''
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [accountId, setAccountId] = useState(initialAccountId)
  const [type, setType] = useState<GovernanceEventType>('QBR')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [time, setTime] = useState('10:00')
  const [agenda, setAgenda] = useState('')
  const [attendeeEmails, setAttendeeEmails] = useState<string[]>([''])
  const selectedAccount = useMemo(() => accounts.find(item => item.id === accountId), [accountId, accounts])

  useEffect(() => {
    if (open) setAccountId(defaultAccountId ?? '')
  }, [defaultAccountId, open])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setFieldErrors({})

    if (!token) {
      toast.error('Sign in again before scheduling governance.')
      return
    }

    const account = accounts.find(item => item.id === accountId)
    const nextErrors = validateForm({ accountId, account, agenda, date, time })
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors)
      return
    }

    setSaving(true)
    try {
      const scheduledAt = new Date(`${date}T${time}:00`).toISOString()
      const savedEvent = await createEvent(token, {
        accountId,
        governanceType: type,
        scheduledAt,
        agenda: agenda.trim(),
        ownerId: account?.ownerId || user.id,
        attendeeEmails: cleanAttendeeEmails(attendeeEmails),
      })
      toast.success('Governance event added')
      setOpen(false)
      resetForm(defaultAccountId ?? '')
      onCreated?.(savedEvent)
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length) {
        setFieldErrors(normalizeApiFieldErrors(err.fieldErrors))
        toast.error(err.message)
      } else {
        toast.error(err instanceof Error ? err.message : 'Unable to add governance event')
      }
    } finally {
      setSaving(false)
    }
  }

  function resetForm(nextAccountId: string) {
    setAccountId(nextAccountId)
    setType('QBR')
    setDate(new Date().toISOString().slice(0, 10))
    setTime('10:00')
    setAgenda('')
    setAttendeeEmails([''])
    setFieldErrors({})
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
        <button className={triggerClassName}>
          <CalendarPlus className="h-4 w-4" />
          {triggerLabel}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[min(94vw,680px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-surface-border bg-white p-6 shadow-panel">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Governance</p>
              <Dialog.Title className="font-display text-2xl font-bold text-ink">Add governance event</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-secondary">Creates a governance record, calendar projection, and linked account timeline entry.</Dialog.Description>
            </div>
            <Dialog.Close className="tk-icon-button" aria-label="Close governance event">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <form onSubmit={submit} className="grid gap-4">
            <label className="space-y-1">
              <span className="tk-label">Account</span>
              <select className="tk-input" value={accountId} disabled={lockAccount || accountsLoading} onChange={event => setAccountId(event.target.value)}>
                <option value="">{accountsLoading && !accountsLoaded ? 'Loading accounts...' : 'Choose account'}</option>
                {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
              {!accountsLoading && accountsLoaded && !accounts.length ? <p className="text-xs font-semibold text-rag-red">No backend accounts are available. Create or approve an account before scheduling governance.</p> : null}
              {accountsError ? <p className="text-xs font-semibold text-rag-red">{accountsError}</p> : null}
              <FieldError message={fieldErrors.account_id} />
            </label>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="space-y-1">
                <span className="tk-label">Event type</span>
                <select className="tk-input" value={type} onChange={event => setType(event.target.value as GovernanceEventType)}>
                  <option>QBR</option>
                  <option>SteerCo</option>
                  <option>Monthly Review</option>
                  <option>Executive Review</option>
                </select>
                <FieldError message={fieldErrors.governance_type} />
              </label>
              <label className="space-y-1">
                <span className="tk-label">Date</span>
                <input type="date" className="tk-input" value={date} onChange={event => setDate(event.target.value)} />
                <FieldError message={fieldErrors.scheduled_at} />
              </label>
              <label className="space-y-1">
                <span className="tk-label">Time</span>
                <input type="time" className="tk-input" value={time} onChange={event => setTime(event.target.value)} />
              </label>
            </div>
            <label className="space-y-1">
              <span className="tk-label">Agenda</span>
              <textarea className="tk-input min-h-[120px]" value={agenda} onChange={event => setAgenda(event.target.value)} placeholder="Roadmap alignment, renewal decisions, risks, and follow-up actions." />
              <FieldError message={fieldErrors.agenda} />
            </label>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="tk-label">Attendee emails</span>
                  <p className="mt-1 text-xs text-ink-secondary">Use email addresses for now until the people directory is available.</p>
                </div>
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
                      onChange={event => updateAttendeeEmail(index, event.target.value)}
                      placeholder={index === 0 ? 'client.owner@example.com' : 'another.attendee@example.com'}
                    />
                    <button type="button" className="tk-icon-button" onClick={() => removeAttendeeEmail(index)} aria-label="Remove attendee email">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <FieldError message={fieldErrors.attendee_emails} />
            </div>
            <div className="rounded-lg border border-surface-border bg-surface-secondary p-3 text-xs leading-5 text-ink-secondary">
              Owner: <span className="font-semibold text-ink">{selectedAccount?.ownerName ?? user.name}</span>
            </div>
            <div className="flex justify-end gap-2">
              <Dialog.Close type="button" className="tk-button-secondary">Cancel</Dialog.Close>
              <button type="submit" className="tk-button-primary" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
                Save event
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function validateForm({
  accountId,
  account,
  agenda,
  date,
  time,
}: {
  accountId: string
  account: unknown
  agenda: string
  date: string
  time: string
}) {
  const errors: FieldErrors = {}
  if (!accountId || !account) errors.account_id = 'Choose an account before scheduling governance.'
  if (!date || !time) errors.scheduled_at = 'Choose the governance date and time.'
  if (!agenda.trim()) errors.agenda = 'Add an agenda so attendees know what will be reviewed.'
  return errors
}

function cleanAttendeeEmails(emails: string[]) {
  return Array.from(new Set(emails.map(email => email.trim().toLowerCase()).filter(Boolean)))
}

function normalizeApiFieldErrors(errors: ApiFieldError[]) {
  return errors.reduce<FieldErrors>((acc, error) => {
    const field = error.field.split('.')[0]
    acc[field] = error.message
    return acc
  }, {})
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs font-semibold text-rag-red">{message}</p> : null
}
