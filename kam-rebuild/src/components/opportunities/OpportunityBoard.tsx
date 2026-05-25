import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, KeyboardSensor, PointerSensor, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { BriefcaseBusiness, MoveHorizontal } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { currentUser } from '@/data/mock'
import { useOpportunityStore } from '@/stores/opportunityStore'
import { Opportunity, Stage } from '@/types/opportunity'
import { cn } from '@/utils/cn'
import { emit } from '@/utils/emitTimelineEvent'
import { formatCompactCurrency } from '@/utils/formatters'
import { OpportunityCard } from '@/components/opportunities/OpportunityCard'

const STAGES: Stage[] = ['Identified', 'Qualified', 'Proposal Sent', 'Negotiation', 'Won', 'Lost']

function KanbanColumn({ stage, items }: { stage: Stage; items: Opportunity[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  const total = items.reduce((sum, item) => sum + item.estimatedValue, 0)

  return (
    <section ref={setNodeRef} className={cn('flex min-h-[520px] min-w-[300px] flex-col rounded-lg border border-surface-border bg-surface-secondary p-3 transition-colors', isOver ? 'border-brand-blue bg-blue-tint-20' : '')}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">{stage}</h2>
          <p className="mt-1 text-xs text-ink-secondary">{items.length} opportunities, {formatCompactCurrency(total)}</p>
        </div>
        <span className="flex min-h-[32px] min-w-[32px] items-center justify-center rounded-full bg-white px-2 text-xs font-semibold text-brand-blue">{items.length}</span>
      </header>
      <SortableContext items={items.map(item => item.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-1 flex-col gap-3">
          {items.length ? (
            items.map(item => <OpportunityCard key={item.id} opportunity={item} />)
          ) : (
            <EmptyState icon={BriefcaseBusiness} heading="No opportunities" body="Drop a card here to update the stage." className="flex-1 rounded-lg border border-dashed border-surface-border bg-white px-4 py-8" />
          )}
        </div>
      </SortableContext>
    </section>
  )
}

export function OpportunityBoard({ accountId, items }: { accountId?: string; items?: Opportunity[] }) {
  const [loading, setLoading] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const opportunities = useOpportunityStore(state => state.opportunities)
  const moveOpportunity = useOpportunityStore(state => state.moveOpportunity)
  const visible = items ?? (accountId ? opportunities.filter(item => item.accountId === accountId) : opportunities)
  const active = opportunities.find(item => item.id === activeId)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor))
  const pipelineValue = visible.filter(item => item.stage !== 'Won' && item.stage !== 'Lost').reduce((sum, item) => sum + item.estimatedValue, 0)

  const byStage = useMemo(
    () =>
      STAGES.reduce<Record<Stage, Opportunity[]>>((acc, stage) => {
        acc[stage] = visible.filter(item => item.stage === stage)
        return acc
      }, {} as Record<Stage, Opportunity[]>),
    [visible],
  )

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    if (!over) return
    const opportunity = opportunities.find(item => item.id === active.id)
    if (!opportunity) return
    const overId = String(over.id)
    const newStage = STAGES.includes(overId as Stage) ? (overId as Stage) : opportunities.find(item => item.id === overId)?.stage
    if (!newStage || newStage === opportunity.stage) return

    setLoading(true)
    moveOpportunity(opportunity.id, newStage)
    emit.opportunityStageChanged(opportunity.accountId, currentUser.id, currentUser.name, opportunity.id, opportunity.stage, newStage)
    if (newStage === 'Won') emit.opportunityWon(opportunity.accountId, currentUser.id, currentUser.name, opportunity.name, opportunity.id)
    if (newStage === 'Lost') emit.opportunityLost(opportunity.accountId, currentUser.id, currentUser.name, opportunity.name, opportunity.id)
    window.setTimeout(() => {
      setLoading(false)
      toast.success('Opportunity stage updated')
    }, 250)
  }

  if (loading && visible.length === 0) {
    return (
      <div className="grid gap-3 lg:grid-cols-3">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (items && visible.length === 0) {
    return (
      <section className="tk-card p-5">
        <EmptyState icon={BriefcaseBusiness} heading="No matching opportunities" body="Clear filters or adjust the account, owner, date, or value range." className="py-12" />
      </section>
    )
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <section className="tk-card overflow-hidden p-4">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Opportunity board</p>
            <h2 className="mt-1 text-base font-semibold text-ink">{visible.length} opportunities in view</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-surface-border bg-white px-3 py-1 text-xs font-semibold text-ink-secondary">Open pipeline {formatCompactCurrency(pipelineValue)}</span>
            <span className="inline-flex min-h-[32px] items-center gap-2 rounded-full bg-blue-tint-20 px-3 text-xs font-semibold text-brand-blue">
              <MoveHorizontal className="h-3.5 w-3.5" />
              Drag cards between stages
            </span>
            {loading ? <span className="rounded-full bg-brand-orange/10 px-3 py-1 text-xs font-semibold text-brand-orange">Updating</span> : null}
          </div>
        </div>
        <div className="overflow-x-auto pb-2">
          <div className="grid grid-flow-col auto-cols-[minmax(300px,1fr)] gap-3">
            {STAGES.map(stage => (
              <KanbanColumn key={stage} stage={stage} items={byStage[stage]} />
            ))}
          </div>
        </div>
      </section>
      <DragOverlay>{active ? <OpportunityCard opportunity={active} ghost /> : null}</DragOverlay>
    </DndContext>
  )
}
