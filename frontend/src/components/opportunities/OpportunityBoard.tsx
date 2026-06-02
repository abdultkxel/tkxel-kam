import * as Dialog from '@radix-ui/react-dialog'
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, KeyboardSensor, PointerSensor, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { BriefcaseBusiness, Loader2, MoveHorizontal, X } from 'lucide-react'
import { FormEvent, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/contexts/AuthContext'
import { useOpportunityStore } from '@/stores/opportunityStore'
import { Opportunity, Stage } from '@/types/opportunity'
import { cn } from '@/utils/cn'
import { formatCompactCurrency } from '@/utils/formatters'
import { OpportunityCard } from '@/components/opportunities/OpportunityCard'

const FALLBACK_STAGES: Stage[] = ['Identified', 'Qualified', 'Proposal Sent', 'Negotiation', 'Won', 'Lost']

function KanbanColumn({ stage, items, onOpen }: { stage: Stage; items: Opportunity[]; onOpen?: (opportunity: Opportunity) => void }) {
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
            items.map(item => <OpportunityCard key={item.id} opportunity={item} onOpen={onOpen} />)
          ) : (
            <EmptyState icon={BriefcaseBusiness} heading="No opportunities" body="Drop a card here to update the stage." className="flex-1 rounded-lg border border-dashed border-surface-border bg-white px-4 py-8" />
          )}
        </div>
      </SortableContext>
    </section>
  )
}

export function OpportunityBoard({ accountId, items, onOpen }: { accountId?: string; items?: Opportunity[]; onOpen?: (opportunity: Opportunity) => void }) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [pendingMove, setPendingMove] = useState<{ opportunity: Opportunity; stage: Stage } | null>(null)
  const [moveReason, setMoveReason] = useState('')
  const { token } = useAuth()
  const opportunities = useOpportunityStore(state => state.opportunities)
  const stages = useOpportunityStore(state => state.stages)
  const movingIds = useOpportunityStore(state => state.movingIds)
  const loading = useOpportunityStore(state => state.loading)
  const moveOpportunityStage = useOpportunityStore(state => state.moveOpportunityStage)
  const visible = items ?? (accountId ? opportunities.filter(item => item.accountId === accountId) : opportunities)
  const active = visible.find(item => item.id === activeId)
  const stageNames = stages.length ? stages.map(stage => stage.name) : FALLBACK_STAGES
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor))
  const pipelineValue = visible.filter(item => item.stage !== 'Won' && item.stage !== 'Lost').reduce((sum, item) => sum + item.estimatedValue, 0)

  const byStage = useMemo(
    () =>
      stageNames.reduce<Record<Stage, Opportunity[]>>((acc, stage) => {
        acc[stage] = visible.filter(item => item.stage === stage)
        return acc
      }, {} as Record<Stage, Opportunity[]>),
    [stageNames, visible],
  )

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    if (!over) return
    const opportunity = visible.find(item => item.id === active.id)
    if (!opportunity) return
    const overId = String(over.id)
    const newStage = stageNames.includes(overId as Stage) ? (overId as Stage) : visible.find(item => item.id === overId)?.stage
    if (!newStage || newStage === opportunity.stage) return

    if (!token) {
      toast.error('Sign in again to update opportunity stage')
      return
    }
    if (newStage === 'Won' || newStage === 'Lost') {
      setPendingMove({ opportunity, stage: newStage })
      setMoveReason(opportunity.outcomeReason ?? '')
      return
    }
    await commitStageMove(opportunity, newStage)
  }

  async function commitStageMove(opportunity: Opportunity, stage: Stage, outcomeReason?: string | null) {
    if (!token) return
    try {
      await moveOpportunityStage(token, opportunity.id, stage, outcomeReason ? `${stage} reason captured` : null, outcomeReason)
      toast.success(stage === 'Won' || stage === 'Lost' ? `Opportunity marked ${stage}` : 'Opportunity stage updated')
      setPendingMove(null)
      setMoveReason('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to update opportunity stage')
    }
  }

  async function submitTerminalMove(event: FormEvent) {
    event.preventDefault()
    if (!pendingMove) return
    await commitStageMove(pendingMove.opportunity, pendingMove.stage, moveReason.trim() || null)
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
            {movingIds.length ? <span className="rounded-full bg-brand-orange/10 px-3 py-1 text-xs font-semibold text-brand-orange">Updating</span> : null}
          </div>
        </div>
        <div className="overflow-x-auto pb-2">
          <div className="grid grid-flow-col auto-cols-[minmax(300px,1fr)] gap-3">
            {stageNames.map(stage => (
              <KanbanColumn key={stage} stage={stage} items={byStage[stage] ?? []} onOpen={onOpen} />
            ))}
          </div>
        </div>
      </section>
      <DragOverlay>{active ? <OpportunityCard opportunity={active} ghost /> : null}</DragOverlay>
      <Dialog.Root open={Boolean(pendingMove)} onOpenChange={open => {
        if (!open) {
          setPendingMove(null)
          setMoveReason('')
        }
      }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(520px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-surface-border bg-white shadow-panel">
            <form onSubmit={submitTerminalMove}>
              <div className="flex items-start justify-between gap-4 border-b border-surface-border p-5">
                <div>
                  <Dialog.Title className="text-lg font-bold text-ink">Mark opportunity {pendingMove?.stage}</Dialog.Title>
                  <Dialog.Description className="mt-1 text-sm text-ink-secondary">Capture the commercial reason so win/loss history stays useful.</Dialog.Description>
                </div>
                <button type="button" className="tk-icon-button" aria-label="Cancel stage move" onClick={() => setPendingMove(null)}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-5">
                <label className="space-y-1">
                  <span className="tk-label text-xs">Outcome reason</span>
                  <textarea className="tk-input min-h-[110px]" value={moveReason} onChange={event => setMoveReason(event.target.value)} placeholder="Budget approved, lost to incumbent, deferred to next quarter..." />
                </label>
              </div>
              <div className="flex flex-wrap justify-end gap-2 border-t border-surface-border p-5">
                <button type="button" className="tk-button-secondary" onClick={() => setPendingMove(null)}>Cancel</button>
                <button type="submit" className="tk-button-primary" disabled={pendingMove ? movingIds.includes(pendingMove.opportunity.id) : false}>
                  {pendingMove && movingIds.includes(pendingMove.opportunity.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoveHorizontal className="h-4 w-4" />}
                  Move to {pendingMove?.stage}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </DndContext>
  )
}
