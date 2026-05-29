import { ReactNode } from 'react'

interface Props {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
}

export function PageHeader({ eyebrow, title, description, actions }: Props) {
  return (
    <div className="mb-6 rounded-lg border border-surface-border bg-white p-5 shadow-card">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {eyebrow ? <p className="mb-2 text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">{eyebrow}</p> : null}
          <h1 className="font-display text-3xl font-bold leading-tight text-ink">{title}</h1>
          {description ? <p className="mt-2 max-w-3xl text-sm text-ink-secondary">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">{actions}</div> : null}
      </div>
    </div>
  )
}
