import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, X } from 'lucide-react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  isBusy?: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  isBusy = false,
  onOpenChange,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(460px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-surface-border bg-white p-5 shadow-panel">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-rag-red/10 text-rag-red">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <Dialog.Title className="text-base font-semibold text-ink">{title}</Dialog.Title>
                <Dialog.Description className="mt-2 text-sm leading-6 text-ink-secondary">{description}</Dialog.Description>
              </div>
            </div>
            <Dialog.Close className="tk-icon-button shrink-0" aria-label="Close confirmation">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close type="button" className="tk-button-secondary" disabled={isBusy}>
              Cancel
            </Dialog.Close>
            <button type="button" className="tk-button-primary bg-rag-red hover:bg-rag-red/90" onClick={onConfirm} disabled={isBusy}>
              {isBusy ? 'Deleting' : confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
