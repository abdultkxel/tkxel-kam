import { ReactNode } from 'react'

interface Props {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
}

export function PageHeader({ eyebrow, title, description, actions }: Props) {
  return (
    <div className="mb-6 min-w-0 overflow-hidden rounded-lg border border-surface-border bg-white p-4 shadow-card sm:p-5">
      <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-full">
          {eyebrow ? <p className="mb-2 text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">{eyebrow}</p> : null}
          <h1 className="break-words font-display text-2xl font-bold leading-tight text-ink sm:text-3xl">{title}</h1>
          {description ? <p className="mt-2 max-w-3xl break-words text-sm text-ink-secondary">{description}</p> : null}
        </div>
        {actions ? <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto lg:shrink-0 lg:justify-end">{actions}</div> : null}
      </div>
    </div>
  )
}
