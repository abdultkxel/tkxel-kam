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
    <div className={cn('tk-card mb-4 p-3', className)}>
      <div className="flex items-center justify-between gap-3 md:hidden">
        <button className="tk-button-secondary" onClick={() => setOpen(value => !value)}>
          <SlidersHorizontal className="h-4 w-4" />
          Filters
        </button>
        {onClear ? (
          <button className="tk-icon-button" onClick={onClear} aria-label="Clear filters">
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <div className={cn('mt-3 grid grid-cols-1 gap-3 md:mt-0 md:grid md:items-end', contentClassName ?? 'md:grid-cols-5', open ? 'grid' : 'hidden md:grid')}>
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
