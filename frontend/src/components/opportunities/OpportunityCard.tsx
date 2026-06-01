import { useSortable } from '@dnd-kit/sortable'
import { CalendarDays, Eye, GripVertical, ListTodo, Tags, UserRound } from 'lucide-react'
import { Opportunity, Stage } from '@/types/opportunity'
import { cn } from '@/utils/cn'
import { formatCurrency, formatDate } from '@/utils/formatters'

const stageTone: Record<Stage, string> = {
  Identified: 'border-brand-blue/20 bg-blue-tint-20 text-brand-blue',
  Qualified: 'border-brand-blue-dark/20 bg-blue-tint-20 text-brand-blue-dark',
  'Proposal Sent': 'border-surface-border bg-surface-tertiary text-ink-secondary',
  Negotiation: 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange',
  Won: 'border-rag-green/20 bg-rag-green/10 text-rag-green',
  Lost: 'border-rag-red/20 bg-rag-red/10 text-rag-red',
}

export function OpportunityCard({ opportunity, ghost = false, onOpen }: { opportunity: Opportunity; ghost?: boolean; onOpen?: (opportunity: Opportunity) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: opportunity.id })
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})` : undefined,
    transition: transition ?? 'transform 150ms ease-out',
    opacity: isDragging || ghost ? 0.8 : 1,
  }

  return (
    <article ref={setNodeRef} style={style} className={cn('rounded-lg border border-surface-border bg-white p-4 shadow-card transition-colors hover:border-brand-blue/40', isDragging ? 'ring-2 ring-brand-blue/30' : '')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-5 text-ink">{opportunity.name}</h3>
          <p className="mt-1 text-xs text-ink-secondary">{opportunity.accountName}</p>
        </div>
        <div className="-mr-2 -mt-2 flex items-center gap-1">
          {onOpen ? (
            <button type="button" className="tk-icon-button" onClick={() => onOpen(opportunity)} aria-label={`Open ${opportunity.name}`} title="Open details">
              <Eye className="h-4 w-4" />
            </button>
          ) : null}
          <button type="button" className="tk-icon-button cursor-grab" {...attributes} {...listeners} aria-label={`Drag ${opportunity.name}`}>
            <GripVertical className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider', stageTone[opportunity.stage])}>{opportunity.stage}</span>
        <span className="font-display text-lg font-bold text-ink">{formatCurrency(opportunity.estimatedValue)}</span>
      </div>
      <div className="mt-3 grid gap-2 border-t border-surface-border pt-3 text-xs text-ink-secondary">
        <div className="flex items-center gap-2">
          <Tags className="h-3.5 w-3.5 text-brand-blue" />
          <span className="truncate">{opportunity.typeName ?? 'Opportunity'}{opportunity.serviceLine ? ` · ${opportunity.serviceLine}` : ''}</span>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-3.5 w-3.5 text-brand-blue" />
          <span>Target {formatDate(opportunity.closeDate)}</span>
        </div>
        {opportunity.sourceContext ? (
          <div className="flex items-center gap-2">
            <ListTodo className="h-3.5 w-3.5 text-brand-blue" />
            <span className="truncate">Source {opportunity.sourceContext.replace(/_/g, ' ')}</span>
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <UserRound className="h-3.5 w-3.5 text-brand-blue" />
          <span>{opportunity.ownerName}</span>
        </div>
        {opportunity.nextStep ? (
          <div className="flex items-start gap-2">
            <ListTodo className="mt-0.5 h-3.5 w-3.5 text-brand-blue" />
            <span className="line-clamp-2">{opportunity.nextStep}</span>
          </div>
        ) : null}
      </div>
    </article>
  )
}
