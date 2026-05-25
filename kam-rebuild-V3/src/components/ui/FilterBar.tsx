import { SlidersHorizontal, X } from 'lucide-react'
import { ReactNode, useState } from 'react'
import { cn } from '@/utils/cn'

export function FilterBar({
  children,
  onClear,
  className,
  contentClassName,
}: {
  children: ReactNode
  onClear?: () => void
  className?: string
  contentClassName?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className={cn('tk-card mb-4 p-3 sm:p-4', className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="hidden items-center gap-2 md:flex">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-surface-tertiary text-brand-blue">
            <SlidersHorizontal className="h-4 w-4" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Filters</p>
            <p className="text-sm text-ink-secondary">Refine the current view</p>
          </div>
        </div>
        <button className="tk-button-secondary md:hidden" onClick={() => setOpen(value => !value)}>
          <SlidersHorizontal className="h-4 w-4" />
          Filters
        </button>
        {onClear ? (
          <button className="tk-icon-button md:hidden" onClick={onClear} aria-label="Clear filters">
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <div className={cn('mt-3 grid grid-cols-1 gap-3 md:grid md:items-end', contentClassName ?? 'md:grid-cols-5', open ? 'grid' : 'hidden md:grid')}>
        {children}
        {onClear ? (
          <button className="tk-button-secondary" onClick={onClear}>
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  )
}
