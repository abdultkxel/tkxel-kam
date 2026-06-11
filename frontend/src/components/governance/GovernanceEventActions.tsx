import * as Dialog from '@radix-ui/react-dialog'
import { Loader2, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { useGovernanceStore } from '@/stores/governanceStore'
import { GovernanceEventRecord } from '@/types/governance'
import { formatDate } from '@/utils/formatters'
import { EditGovernanceEventDialog } from '@/components/governance/EditGovernanceEventDialog'

export function GovernanceEventActions({ event }: { event: GovernanceEventRecord }) {
  return (
    <div className="flex items-center gap-1">
      <EditGovernanceEventDialog
        event={event}
        triggerClassName="tk-icon-button"
        triggerLabel=""
        triggerAriaLabel={`Edit ${event.type} governance event`}
      />
      <DeleteGovernanceEventDialog event={event} />
    </div>
  )
}

interface DeleteGovernanceEventDialogProps {
  event: GovernanceEventRecord
  triggerClassName?: string
  triggerLabel?: string
  onDeleted?: () => void
}

export function DeleteGovernanceEventDialog({
  event,
  triggerClassName = 'tk-icon-button text-rag-red hover:border-rag-red/40',
  triggerLabel = '',
  onDeleted,
}: DeleteGovernanceEventDialogProps) {
  const { token } = useAuth()
  const deleteEvent = useGovernanceStore(state => state.deleteEvent)
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function confirmDelete() {
    if (!token) {
      toast.error('Sign in again before deleting governance.')
      return
    }
    setDeleting(true)
    try {
      await deleteEvent(token, event.id)
      toast.success('Governance event deleted')
      setOpen(false)
      onDeleted?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to delete governance event')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" className={triggerClassName} aria-label={triggerLabel ? undefined : `Delete ${event.type} governance event`} title="Delete governance event">
          <Trash2 className="h-4 w-4" />
          {triggerLabel ? <span>{triggerLabel}</span> : null}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(94vw,460px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-surface-border bg-white p-6 shadow-panel">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-rag-red">Delete governance</p>
              <Dialog.Title className="font-display text-2xl font-bold text-ink">Delete governance event?</Dialog.Title>
              <Dialog.Description className="mt-2 text-sm leading-6 text-ink-secondary">
                {event.type} on {formatDate(event.date)} will be removed from this account. Linked governance reminder and action tasks will be cancelled.
              </Dialog.Description>
            </div>
            <Dialog.Close className="tk-icon-button" aria-label="Close delete confirmation">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <div className="flex justify-end gap-2">
            <Dialog.Close type="button" className="tk-button-secondary">Cancel</Dialog.Close>
            <button type="button" className="tk-button-primary bg-rag-red hover:bg-rag-red/90" disabled={deleting} onClick={confirmDelete}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete event
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
