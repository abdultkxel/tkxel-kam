import { LucideIcon } from 'lucide-react'
import { cn } from '@/utils/cn'

interface Props {
  icon: LucideIcon
  heading: string
  body: string
  action?: { label: string; onClick: () => void }
  className?: string
}

export function EmptyState({ icon: Icon, heading, body, action, className }: Props) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-8 py-16 text-center', className)}>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-tertiary">
        <Icon className="h-6 w-6 text-ink-tertiary" />
      </div>
      <h3 className="mb-1 text-sm font-semibold text-ink">{heading}</h3>
      <p className="max-w-xs text-sm text-ink-secondary">{body}</p>
      {action ? (
        <button onClick={action.onClick} className="tk-button-primary mt-4">
          {action.label}
        </button>
      ) : null}
    </div>
  )
}
