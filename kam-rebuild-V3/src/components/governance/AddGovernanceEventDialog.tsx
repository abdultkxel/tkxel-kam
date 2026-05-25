import * as Dialog from '@radix-ui/react-dialog'
import { CalendarPlus, Loader2, X } from 'lucide-react'
import { nanoid } from 'nanoid'
import { FormEvent, useState } from 'react'
import { toast } from 'sonner'
import { useRole } from '@/hooks/useRole'
import { useAccountStore } from '@/stores/accountStore'
import { useGovernanceStore } from '@/stores/governanceStore'
import { GovernanceEventType } from '@/types/governance'
import { emitTimelineEvent } from '@/utils/emitTimelineEvent'

export function AddGovernanceEventDialog({ triggerClassName = 'tk-button-primary' }: { triggerClassName?: string }) {
  const accounts = useAccountStore(state => state.accounts)
  const addEvent = useGovernanceStore(state => state.addEvent)
  const user = useRole()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [type, setType] = useState<GovernanceEventType>('QBR')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [agenda, setAgenda] = useState('')
  const [attendees, setAttendees] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    const account = accounts.find(item => item.id === accountId)
    if (!account || !agenda.trim()) return
    setSaving(true)
    await new Promise(resolve => window.setTimeout(resolve, 300))
    const id = `gov-${nanoid(8)}`
    const timestamp = new Date(`${date}T10:00:00`).toISOString()
    addEvent({
      id,
      accountId: account.id,
      accountName: account.name,
      ownerId: account.ownerId,
      type,
      date: timestamp,
      agenda,
      attendees: attendees.split(',').map(item => item.trim()).filter(Boolean),
      actionItems: [],
      status: new Date(timestamp) < new Date() ? 'overdue' : 'upcoming',
    })
    emitTimelineEvent({
      accountId: account.id,
      eventType: 'governance_event',
      module: 'governance',
      title: `${type} scheduled`,
      description: agenda,
      performedBy: user.id,
      performedByName: user.name,
      timestamp,
      sourceRecordId: id,
      sourceRecordType: 'governance',
      sourceRecordRoute: '/governance',
      metadata: { attendees: attendees.split(',').map(item => item.trim()).filter(Boolean) },
      isSensitive: false,
      isSystemGenerated: true,
      isImmutable: false,
    })
    setSaving(false)
    setOpen(false)
    setAgenda('')
    setAttendees('')
    toast.success('Governance event added')
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className={triggerClassName}>
          <CalendarPlus className="h-4 w-4" />
          Add governance event
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(94vw,620px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-surface-border bg-white p-6 shadow-panel">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Governance</p>
              <Dialog.Title className="font-display text-2xl font-bold text-ink">Add governance event</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-secondary">Creates a governance record and linked account timeline event.</Dialog.Description>
            </div>
            <Dialog.Close className="tk-icon-button" aria-label="Close governance event">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <form onSubmit={submit} className="grid gap-4">
            <label className="space-y-1">
              <span className="tk-label">Account</span>
              <select className="tk-input" value={accountId} onChange={event => setAccountId(event.target.value)}>
                {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="tk-label">Event type</span>
                <select className="tk-input" value={type} onChange={event => setType(event.target.value as GovernanceEventType)}>
                  <option>QBR</option>
                  <option>SteerCo</option>
                  <option>Executive Review</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="tk-label">Date</span>
                <input type="date" className="tk-input" value={date} onChange={event => setDate(event.target.value)} />
              </label>
            </div>
            <label className="space-y-1">
              <span className="tk-label">Agenda</span>
              <textarea className="tk-input min-h-[120px]" value={agenda} onChange={event => setAgenda(event.target.value)} required />
            </label>
            <label className="space-y-1">
              <span className="tk-label">Attendees</span>
              <input className="tk-input" value={attendees} onChange={event => setAttendees(event.target.value)} placeholder="Comma-separated names" />
            </label>
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
