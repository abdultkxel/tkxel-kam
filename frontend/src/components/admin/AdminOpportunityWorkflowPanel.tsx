import * as Dialog from '@radix-ui/react-dialog'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ArrowDown, ArrowUp, GitBranch, GripVertical, Loader2, Pencil, Plus, RefreshCw, X } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { FieldError } from '@/components/form/FieldError'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAuth } from '@/contexts/AuthContext'
import { ApiError } from '@/services/api'
import {
  createOpportunityStageConfig,
  listAdminOpportunityStages,
  listOpportunityStageTransitions,
  replaceOpportunityStageTransitions,
  updateOpportunityStageConfig,
} from '@/services/relationshipsPlanning'
import type { OpportunityStageConfig, OpportunityStageTransitionConfig } from '@/types/relationshipsPlanning'
import { apiFieldErrors, clearFieldError, FieldErrors } from '@/utils/formErrors'

const emptyStage = { slug: '', name: '', displayOrder: '10', isTerminal: false, requiresOutcomeReason: false }
const emptyTransition = { fromStage: '', toStage: '', requiresReason: false, allowReverse: false }
type StagePlacement = 'end' | 'start' | 'after'

const stagePlacementOptions: { value: StagePlacement; label: string }[] = [
  { value: 'end', label: 'At end' },
  { value: 'start', label: 'At start' },
  { value: 'after', label: 'After existing stage' },
]

export function AdminOpportunityWorkflowPanel() {
  const { token } = useAuth()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [stages, setStages] = useState<OpportunityStageConfig[]>([])
  const [transitions, setTransitions] = useState<OpportunityStageTransitionConfig[]>([])
  const [stageForm, setStageForm] = useState(emptyStage)
  const [editingStageId, setEditingStageId] = useState<string | null>(null)
  const [stageDialogOpen, setStageDialogOpen] = useState(false)
  const [stagePlacement, setStagePlacement] = useState<StagePlacement>('end')
  const [stagePlacementAfterId, setStagePlacementAfterId] = useState('')
  const [reorderDialogOpen, setReorderDialogOpen] = useState(false)
  const [draftStageOrder, setDraftStageOrder] = useState<OpportunityStageConfig[]>([])
  const [transitionForm, setTransitionForm] = useState(emptyTransition)
  const [transitionDialogOpen, setTransitionDialogOpen] = useState(false)

  const activeStages = useMemo(() => stages.filter(item => item.isActive), [stages])
  const stageByName = useMemo(() => new Map(stages.map(item => [item.name, item])), [stages])
  const transitionGroups = useMemo(() => {
    const sourceNames = uniqueStrings([...stages.map(item => item.name), ...transitions.map(item => item.fromStage)])
    return sourceNames.map(sourceName => ({
      sourceName,
      stage: stageByName.get(sourceName),
      transitions: transitions.filter(item => item.fromStage === sourceName),
    }))
  }, [stageByName, stages, transitions])
  const nextStageDisplayOrder = useMemo(() => Math.max(0, ...stages.map(item => item.displayOrder)) + 10, [stages])
  const stageDndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  useEffect(() => {
    if (!token) return
    void loadWorkflow()
  }, [token])

  async function loadWorkflow() {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const [stageItems, transitionItems] = await Promise.all([
        listAdminOpportunityStages(token),
        listOpportunityStageTransitions(token),
      ])
      setStages(stageItems)
      setTransitions(transitionItems)
      setStageForm(current => (current.name || current.slug ? current : { ...current, displayOrder: String(nextDisplayOrder(stageItems)) }))
      setTransitionForm(current => ({ ...current, fromStage: current.fromStage || stageItems[0]?.name || '', toStage: current.toStage || stageItems[1]?.name || '' }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opportunity workflow settings could not load')
    } finally {
      setLoading(false)
    }
  }

  async function submitStage(event: FormEvent) {
    event.preventDefault()
    if (!token) return
    await saveWithErrors('stage', async () => {
      const payload = {
        slug: stageForm.slug,
        name: stageForm.name,
        displayOrder: Number(stageForm.displayOrder || nextStageDisplayOrder),
        isTerminal: stageForm.isTerminal,
        requiresOutcomeReason: stageForm.requiresOutcomeReason,
      }
      if (editingStageId) {
        await updateOpportunityStageConfig(token, editingStageId, payload)
      } else {
        const savedStage = await createOpportunityStageConfig(token, payload)
        const orderedStages = insertStageByPlacement(stages, savedStage, stagePlacement, stagePlacementAfterId)
        await patchStageOrder(orderedStages)
      }
      const wasEditing = Boolean(editingStageId)
      setStageForm(emptyStage)
      setEditingStageId(null)
      setStageDialogOpen(false)
      toast.success(wasEditing ? 'Opportunity stage updated' : 'Opportunity stage saved')
      await loadWorkflow()
    }, { display_order: 'displayOrder', is_terminal: 'isTerminal', requires_outcome_reason: 'requiresOutcomeReason' })
  }

  async function submitTransition(event: FormEvent) {
    event.preventDefault()
    if (!token) return
    await saveWithErrors('transition', async () => {
      if (!transitionForm.fromStage) throw fieldError('transition.fromStage', 'From stage is required.')
      if (!transitionForm.toStage) throw fieldError('transition.toStage', 'To stage is required.')
      if (transitionForm.fromStage === transitionForm.toStage) throw fieldError('transition.toStage', 'Choose a different destination stage.')
      if (transitions.some(item => item.fromStage === transitionForm.fromStage && item.toStage === transitionForm.toStage)) {
        throw fieldError('transition.toStage', 'This transition already exists.')
      }
      const nextTransitions = [
        ...transitions.map(item => ({ fromStage: item.fromStage, toStage: item.toStage, isActive: item.isActive, requiresReason: item.requiresReason })),
        { fromStage: transitionForm.fromStage, toStage: transitionForm.toStage, isActive: true, requiresReason: transitionForm.requiresReason },
      ]
      if (transitionForm.allowReverse && !transitions.some(item => item.fromStage === transitionForm.toStage && item.toStage === transitionForm.fromStage)) {
        nextTransitions.push({ fromStage: transitionForm.toStage, toStage: transitionForm.fromStage, isActive: true, requiresReason: transitionForm.requiresReason })
      }
      await replaceOpportunityStageTransitions(token, nextTransitions)
      setTransitionForm(emptyTransition)
      setTransitionDialogOpen(false)
      toast.success('Transition saved')
      await loadWorkflow()
    })
  }

  function startAddingTransition(fromStage: string) {
    const toOptions = availableTransitionTargets(fromStage)
    setTransitionForm({ fromStage, toStage: toOptions[0]?.value ?? '', requiresReason: false, allowReverse: false })
    setFieldErrors(current => removePrefix(current, 'transition'))
    setTransitionDialogOpen(true)
  }

  function cancelAddingTransition() {
    if (saving) return
    setTransitionForm(emptyTransition)
    setFieldErrors(current => removePrefix(current, 'transition'))
    setTransitionDialogOpen(false)
  }

  function updateTransitionSource(fromStage: string) {
    const toOptions = availableTransitionTargets(fromStage)
    setTransitionForm(current => {
      const currentToStageStillAllowed = toOptions.some(option => option.value === current.toStage)
      return { ...current, fromStage, toStage: currentToStageStillAllowed ? current.toStage : toOptions[0]?.value ?? '' }
    })
    setFieldErrors(current => clearFieldError(clearFieldError(current, 'transition.fromStage'), 'transition.toStage'))
  }

  function availableTransitionTargets(fromStage: string) {
    return activeStages
      .filter(stage => stage.name !== fromStage)
      .filter(stage => !transitions.some(item => item.fromStage === fromStage && item.toStage === stage.name))
      .map(stage => ({ value: stage.name, label: stage.name }))
  }

  async function removeTransition(item: OpportunityStageTransitionConfig) {
    if (!token) return
    const nextTransitions = transitions
      .filter(transition => transition.id !== item.id)
      .map(transition => ({ fromStage: transition.fromStage, toStage: transition.toStage, isActive: transition.isActive, requiresReason: transition.requiresReason }))
    await saveToggle(async () => replaceOpportunityStageTransitions(token, nextTransitions), 'Transition removed')
  }

  async function toggleTransitionReason(item: OpportunityStageTransitionConfig) {
    if (!token) return
    const nextTransitions = transitions.map(transition => ({
      fromStage: transition.fromStage,
      toStage: transition.toStage,
      isActive: transition.isActive,
      requiresReason: transition.id === item.id ? !transition.requiresReason : transition.requiresReason,
    }))
    await saveToggle(async () => replaceOpportunityStageTransitions(token, nextTransitions), 'Transition updated')
  }

  async function toggleStage(item: OpportunityStageConfig) {
    if (!token) return
    if (item.isActive && item.inUseCount > 0) {
      toast.error(`Move ${item.inUseCount} opportunity record(s) out of ${item.name} before deactivating it.`)
      return
    }
    await saveToggle(async () => updateOpportunityStageConfig(token, item.id, { isActive: !item.isActive }), 'Stage status updated')
  }

  function startAddingStage() {
    setEditingStageId(null)
    setStageForm({ ...emptyStage, displayOrder: String(nextStageDisplayOrder) })
    setStagePlacement('end')
    setStagePlacementAfterId(stages[0]?.id ?? '')
    setFieldErrors(current => removePrefix(current, 'stage'))
    setStageDialogOpen(true)
  }

  function startEditingStage(item: OpportunityStageConfig) {
    setEditingStageId(item.id)
    setStageForm({
      slug: item.slug,
      name: item.name,
      displayOrder: String(item.displayOrder ?? 0),
      isTerminal: item.isTerminal,
      requiresOutcomeReason: item.requiresOutcomeReason,
    })
    setFieldErrors(current => removePrefix(current, 'stage'))
    setStageDialogOpen(true)
  }

  function cancelEditingStage() {
    if (saving) return
    setEditingStageId(null)
    setStageForm(emptyStage)
    setStagePlacement('end')
    setStagePlacementAfterId('')
    setFieldErrors(current => removePrefix(current, 'stage'))
    setStageDialogOpen(false)
  }

  function openStageReorderDialog() {
    setDraftStageOrder(stages)
    setReorderDialogOpen(true)
  }

  function cancelStageReorder() {
    if (saving) return
    setDraftStageOrder([])
    setReorderDialogOpen(false)
  }

  function moveDraftStage(stageId: string, direction: 'up' | 'down') {
    setDraftStageOrder(current => {
      const currentIndex = current.findIndex(stage => stage.id === stageId)
      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= current.length) return current
      return arrayMove(current, currentIndex, targetIndex)
    })
  }

  function handleStageDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setDraftStageOrder(current => {
      const oldIndex = current.findIndex(stage => stage.id === active.id)
      const newIndex = current.findIndex(stage => stage.id === over.id)
      if (oldIndex < 0 || newIndex < 0) return current
      return arrayMove(current, oldIndex, newIndex)
    })
  }

  async function submitStageReorder(event: FormEvent) {
    event.preventDefault()
    if (!token) return
    await saveWithErrors('stage', async () => {
      await patchStageOrder(draftStageOrder)
      setDraftStageOrder([])
      setReorderDialogOpen(false)
      toast.success('Stage order updated')
      await loadWorkflow()
    }, { display_order: 'displayOrder' })
  }

  async function patchStageOrder(orderedStages: OpportunityStageConfig[]) {
    if (!token) return
    const updates = normalizedStageUpdates(orderedStages)
    await Promise.all(updates.map(update => updateOpportunityStageConfig(token, update.stage.id, { displayOrder: update.displayOrder })))
  }

  async function saveToggle(action: () => Promise<unknown>, success: string) {
    setSaving(true)
    try {
      await action()
      toast.success(success)
      await loadWorkflow()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Status could not be updated')
    } finally {
      setSaving(false)
    }
  }

  async function saveWithErrors(prefix: string, action: () => Promise<void>, aliases: Record<string, string> = {}) {
    setSaving(true)
    setFieldErrors(removePrefix(fieldErrors, prefix))
    try {
      await action()
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(current => ({ ...removePrefix(current, prefix), ...prefixErrors(prefix, apiFieldErrors(err, aliases)) }))
        toast.error(err.message)
      } else if (err instanceof Error && err.name === 'FieldValidationError') {
        setFieldErrors(current => ({ ...removePrefix(current, prefix), [err.message.split('|')[0]]: err.message.split('|')[1] }))
      } else {
        toast.error(err instanceof Error ? err.message : 'Settings could not be saved')
      }
    } finally {
      setSaving(false)
    }
  }

  function updateStage(field: keyof typeof stageForm, value: string | boolean) {
    setStageForm(current => ({ ...current, [field]: value }))
    setFieldErrors(current => clearFieldError(current, `stage.${field}`))
  }

  function updateStagePlacement(value: StagePlacement) {
    setStagePlacement(value)
    if (value === 'after' && !stagePlacementAfterId) setStagePlacementAfterId(stages[0]?.id ?? '')
    setStageForm(current => ({ ...current, displayOrder: String(nextStageDisplayOrder) }))
    setFieldErrors(current => clearFieldError(current, 'stage.placementAfterId'))
  }

  function updateTransition(field: keyof typeof transitionForm, value: string | boolean) {
    setTransitionForm(current => ({ ...current, [field]: value }))
    setFieldErrors(current => clearFieldError(current, `transition.${field}`))
  }

  if (loading) {
    return (
      <section className="tk-card flex min-h-[220px] items-center justify-center gap-2 p-6 text-sm font-semibold text-ink-secondary">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading opportunity workflow
      </section>
    )
  }

  if (error) {
    return (
      <section className="tk-card flex min-h-[220px] flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-semibold text-rag-red">{error}</p>
        <button type="button" className="tk-button-secondary" onClick={loadWorkflow}>
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </section>
    )
  }

  const editingStage = editingStageId ? stages.find(item => item.id === editingStageId) ?? null : null
  const stageNameLocked = Boolean(editingStage?.inUseCount)
  const transitionTargetOptions = availableTransitionTargets(transitionForm.fromStage)

  return (
    <>
      <Dialog.Root open={stageDialogOpen} onOpenChange={open => { if (!open) cancelEditingStage() }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-surface-border bg-white shadow-panel">
            <form onSubmit={submitStage}>
              <div className="flex items-start justify-between gap-4 border-b border-surface-border p-5">
                <div>
                  <Dialog.Title className="font-display text-2xl font-bold text-ink">{editingStageId ? 'Edit stage' : 'Add stage'}</Dialog.Title>
                  <Dialog.Description className="mt-1 text-sm text-ink-secondary">Opportunity pipeline stage configuration</Dialog.Description>
                </div>
                <Dialog.Close className="tk-icon-button shrink-0" aria-label="Close stage dialog" disabled={saving}>
                  <X className="h-5 w-5" />
                </Dialog.Close>
              </div>
              <div className="grid max-h-[calc(92vh-170px)] gap-4 overflow-y-auto p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextInput
                    label="Name"
                    placeholder="Qualified"
                    value={stageForm.name}
                    error={fieldErrors['stage.name']}
                    disabled={stageNameLocked}
                    title={stageNameLocked ? 'Move linked opportunities out of this stage before renaming it.' : undefined}
                    onChange={value => updateStage('name', value)}
                  />
                  <TextInput label="Slug" placeholder="qualified" value={stageForm.slug} error={fieldErrors['stage.slug']} onChange={value => updateStage('slug', value)} />
                </div>
                {!editingStageId ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <SelectInput label="Placement" value={stagePlacement} options={stagePlacementOptions} onChange={value => updateStagePlacement(value as StagePlacement)} />
                    {stagePlacement === 'after' ? (
                      <SelectInput
                        label="After stage"
                        value={stagePlacementAfterId}
                        error={fieldErrors['stage.placementAfterId']}
                        options={stages.map(item => ({ value: item.id, label: item.name }))}
                        onChange={value => {
                          setStagePlacementAfterId(value)
                          setFieldErrors(current => clearFieldError(current, 'stage.placementAfterId'))
                        }}
                      />
                    ) : null}
                  </div>
                ) : null}
                <div className="grid gap-2 rounded-lg border border-surface-border bg-surface-secondary p-3 sm:grid-cols-2">
                  <CheckInput label="Terminal" checked={stageForm.isTerminal} onChange={value => updateStage('isTerminal', value)} />
                  <CheckInput label="Outcome reason" checked={stageForm.requiresOutcomeReason} onChange={value => updateStage('requiresOutcomeReason', value)} />
                </div>
              </div>
              <div className="flex flex-col-reverse gap-2 border-t border-surface-border bg-surface-tertiary p-4 sm:flex-row sm:justify-end">
                <button type="button" className="tk-button-secondary justify-center sm:w-auto" onClick={cancelEditingStage} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="tk-button-primary justify-center sm:w-auto" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {editingStageId ? 'Save stage' : 'Add stage'}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={reorderDialogOpen} onOpenChange={open => { if (!open) cancelStageReorder() }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[min(720px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-surface-border bg-white shadow-panel">
            <form onSubmit={submitStageReorder}>
              <div className="flex items-start justify-between gap-4 border-b border-surface-border p-5">
                <div>
                  <Dialog.Title className="font-display text-2xl font-bold text-ink">Reorder stages</Dialog.Title>
                  <Dialog.Description className="mt-1 text-sm text-ink-secondary">Drag stages into the order used by the opportunity board.</Dialog.Description>
                </div>
                <Dialog.Close className="tk-icon-button shrink-0" aria-label="Close reorder dialog" disabled={saving}>
                  <X className="h-5 w-5" />
                </Dialog.Close>
              </div>
              <div className="max-h-[calc(92vh-190px)] overflow-y-auto p-5">
                <DndContext sensors={stageDndSensors} collisionDetection={closestCenter} onDragEnd={handleStageDragEnd}>
                  <SortableContext items={draftStageOrder.map(item => item.id)} strategy={verticalListSortingStrategy}>
                    <ol className="grid gap-2">
                      {draftStageOrder.map((item, index) => (
                        <SortableStageRow key={item.id} stage={item} index={index} total={draftStageOrder.length} onMove={moveDraftStage} />
                      ))}
                    </ol>
                  </SortableContext>
                </DndContext>
              </div>
              <div className="flex flex-col-reverse gap-2 border-t border-surface-border bg-surface-tertiary p-4 sm:flex-row sm:justify-end">
                <button type="button" className="tk-button-secondary justify-center sm:w-auto" onClick={cancelStageReorder} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="tk-button-primary justify-center sm:w-auto" disabled={saving || !draftStageOrder.length}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <GripVertical className="h-4 w-4" />}
                  Save order
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={transitionDialogOpen} onOpenChange={open => { if (!open) cancelAddingTransition() }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-surface-border bg-white shadow-panel">
            <form onSubmit={submitTransition}>
              <div className="flex items-start justify-between gap-4 border-b border-surface-border p-5">
                <div>
                  <Dialog.Title className="font-display text-2xl font-bold text-ink">Add transition</Dialog.Title>
                  <Dialog.Description className="mt-1 text-sm text-ink-secondary">Allowed movement between opportunity stages</Dialog.Description>
                </div>
                <Dialog.Close className="tk-icon-button shrink-0" aria-label="Close transition dialog" disabled={saving}>
                  <X className="h-5 w-5" />
                </Dialog.Close>
              </div>
              <div className="grid max-h-[calc(92vh-170px)] gap-4 overflow-y-auto p-5">
                <SelectInput label="From stage" value={transitionForm.fromStage} error={fieldErrors['transition.fromStage']} options={activeStages.map(item => ({ value: item.name, label: item.name }))} onChange={updateTransitionSource} />
                <SelectInput label="To stage" value={transitionForm.toStage} error={fieldErrors['transition.toStage']} options={transitionTargetOptions} onChange={value => updateTransition('toStage', value)} />
                <CheckInput label="Reason required" checked={transitionForm.requiresReason} onChange={value => updateTransition('requiresReason', value)} />
                <CheckInput label="Also allow reverse move" checked={transitionForm.allowReverse} onChange={value => updateTransition('allowReverse', value)} />
              </div>
              <div className="flex flex-col-reverse gap-2 border-t border-surface-border bg-surface-tertiary p-4 sm:flex-row sm:justify-end">
                <button type="button" className="tk-button-secondary justify-center sm:w-auto" onClick={cancelAddingTransition} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="tk-button-primary justify-center sm:w-auto" disabled={saving || !transitionTargetOptions.length}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add transition
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <section className="tk-card overflow-hidden" aria-label="Stages and transitions">
        <div className="flex items-center gap-3 border-b border-surface-border p-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-tint-20 text-brand-blue"><GitBranch className="h-5 w-5" /></span>
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Opportunity workflow</p>
            <h2 className="text-base font-semibold text-ink">Stages and transitions</h2>
          </div>
        </div>
        <div className="flex flex-col gap-3 border-b border-surface-border p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-ink">Pipeline stages</h3>
            <p className="mt-1 text-sm text-ink-secondary">
              {stages.length} configured · {activeStages.length} active · {stages.reduce((sum, item) => sum + item.inUseCount, 0)} linked records
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" className="tk-button-secondary justify-center sm:w-auto" onClick={openStageReorderDialog} disabled={!stages.length}>
              <GripVertical className="h-4 w-4" />
              Reorder stages
            </button>
            <button type="button" className="tk-button-primary justify-center sm:w-auto" onClick={startAddingStage}>
              <Plus className="h-4 w-4" />
              Add stage
            </button>
          </div>
        </div>

        <div className="divide-y divide-surface-border">
          <div className="hidden bg-surface-secondary px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-secondary xl:grid xl:grid-cols-[76px_minmax(180px,1.2fr)_minmax(150px,0.8fr)_96px_112px_minmax(160px,1fr)_160px] xl:gap-4">
            <span>Position</span>
            <span>Stage</span>
            <span>Slug</span>
            <span>Linked</span>
            <span>Status</span>
            <span>Flags</span>
            <span>Actions</span>
          </div>
          {stages.map((item, index) => (
            <div key={item.id} className={`grid gap-3 px-4 py-3 xl:grid-cols-[76px_minmax(180px,1.2fr)_minmax(150px,0.8fr)_96px_112px_minmax(160px,1fr)_160px] xl:items-center xl:gap-4 ${item.isActive ? 'bg-white' : 'bg-surface-tertiary/70'}`}>
              <MetaField label="Position">
                <span className="font-semibold text-ink">#{index + 1}</span>
                <span className="ml-2 text-xs text-ink-secondary">order {item.displayOrder}</span>
              </MetaField>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">{item.name}</span>
                {item.isActive && item.inUseCount > 0 ? <span className="mt-1 block text-xs text-ink-secondary">Locked while records use this stage</span> : null}
              </span>
              <MetaField label="Slug">{item.slug}</MetaField>
              <MetaField label="Linked">{item.inUseCount}</MetaField>
              <span className="flex xl:justify-start">
                <StatusButton active={item.isActive} disabled={item.isActive && item.inUseCount > 0} onClick={() => toggleStage(item)} ariaLabel={item.isActive && item.inUseCount > 0 ? `${item.name} has linked opportunities` : `${item.isActive ? 'Disable' : 'Enable'} ${item.name}`} />
              </span>
              <span className="flex min-h-[32px] flex-wrap items-center gap-2">
                {item.isTerminal ? <Badge label="Terminal" /> : null}
                {item.requiresOutcomeReason ? <Badge label="Outcome reason" /> : null}
                {!item.isTerminal && !item.requiresOutcomeReason ? <span className="text-sm text-ink-secondary">None</span> : null}
              </span>
              <span className="flex xl:justify-start">
                <button type="button" className="tk-button-secondary h-9 px-3 text-xs" onClick={() => startEditingStage(item)} aria-label={`Edit ${item.name}`}>
                  <Pencil className="h-4 w-4" />
                  Edit
                </button>
              </span>
            </div>
          ))}
          {!stages.length ? <EmptyState icon={GitBranch} heading="No stages configured" body="Add the first opportunity stage." className="py-8" /> : null}
        </div>

        <div className="flex flex-col gap-1 border-t border-surface-border bg-surface-tertiary px-4 py-3">
          <h3 className="text-sm font-semibold text-ink">Stage transitions</h3>
          <p className="text-sm text-ink-secondary">{transitions.length} configured movement {transitions.length === 1 ? 'rule' : 'rules'}</p>
        </div>
        <div className="divide-y divide-surface-border">
          {transitionGroups.map(group => {
            const sourceInactive = group.stage ? !group.stage.isActive : true
            const canAddTransition = Boolean(group.stage?.isActive && availableTransitionTargets(group.sourceName).length)
            return (
              <div key={group.sourceName} className={`grid gap-3 px-4 py-3 lg:grid-cols-[minmax(180px,0.45fr)_minmax(220px,1fr)_150px] lg:items-start lg:gap-4 ${sourceInactive ? 'bg-surface-tertiary/70' : 'bg-white'}`}>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">{group.sourceName}</span>
                  <span className="mt-1 block text-xs text-ink-secondary">{group.stage ? (group.stage.isActive ? 'Active source stage' : 'Inactive source stage') : 'Stage no longer exists'}</span>
                </span>
                <div className="flex min-w-0 flex-wrap gap-2">
                  {group.transitions.map(item => (
                    <span key={item.id} className="inline-flex min-h-[34px] max-w-full items-center gap-1 rounded-full border border-surface-border bg-white pl-3 pr-1 text-xs font-semibold text-ink">
                      <span className="truncate">{item.toStage}</span>
                      <button type="button" className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${item.requiresReason ? 'bg-blue-tint-20 text-brand-blue' : 'bg-surface-tertiary text-ink-secondary'}`} onClick={() => toggleTransitionReason(item)} aria-label={`${item.requiresReason ? 'Clear' : 'Require'} reason for ${item.fromStage} to ${item.toStage}`}>
                        {item.requiresReason ? 'Reason' : 'No reason'}
                      </button>
                      <button type="button" className="rounded-full p-1 text-ink-secondary hover:bg-surface-secondary hover:text-rag-red" onClick={() => removeTransition(item)} aria-label={`Remove transition ${item.fromStage} to ${item.toStage}`}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                  {!group.transitions.length ? <span className="text-sm text-ink-secondary">No outgoing transitions</span> : null}
                </div>
                <span className="flex lg:justify-end">
                  <button type="button" className="tk-button-secondary h-9 px-3 text-xs" onClick={() => startAddingTransition(group.sourceName)} disabled={!canAddTransition} aria-label={`Add transition from ${group.sourceName}`} title={!group.stage?.isActive ? 'Only active stages can receive new transitions.' : canAddTransition ? `Add transition from ${group.sourceName}` : 'All available destinations are already linked.'}>
                    <Plus className="h-4 w-4" />
                    Add transition
                  </button>
                </span>
              </div>
            )
          })}
          {!transitionGroups.length ? <EmptyState icon={GitBranch} heading="No transition groups" body="Create stages before linking allowed movement." className="py-8" /> : null}
        </div>
      </section>
    </>
  )
}

function SortableStageRow({
  stage,
  index,
  total,
  onMove,
}: {
  stage: OpportunityStageConfig
  index: number
  total: number
  onMove: (stageId: string, direction: 'up' | 'down') => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id })
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})` : undefined,
    transition: transition ?? 'transform 150ms ease-out',
  }

  return (
    <li ref={setNodeRef} style={style} className={`grid gap-3 rounded-lg border border-surface-border bg-white p-3 shadow-sm sm:grid-cols-[44px_1fr_auto] sm:items-center ${isDragging ? 'ring-2 ring-brand-blue/30' : ''}`}>
      <button type="button" className="tk-icon-button cursor-grab" {...attributes} {...listeners} aria-label={`Drag ${stage.name}`}>
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">#{index + 1} {stage.name}</span>
        <span className="mt-1 block break-words text-xs text-ink-secondary">
          {stage.slug} · {stage.inUseCount} linked · {stage.isActive ? 'active' : 'inactive'}
        </span>
      </span>
      <span className="flex gap-2 sm:justify-end">
        <button type="button" className="tk-button-secondary h-9 px-3 text-xs" onClick={() => onMove(stage.id, 'up')} disabled={index === 0} aria-label={`Move up ${stage.name}`}>
          <ArrowUp className="h-4 w-4" />
          Up
        </button>
        <button type="button" className="tk-button-secondary h-9 px-3 text-xs" onClick={() => onMove(stage.id, 'down')} disabled={index === total - 1} aria-label={`Move down ${stage.name}`}>
          <ArrowDown className="h-4 w-4" />
          Down
        </button>
      </span>
    </li>
  )
}

function TextInput({
  label,
  value,
  error,
  onChange,
  type = 'text',
  placeholder,
  disabled = false,
  title,
}: {
  label: string
  value: string
  error?: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
  disabled?: boolean
  title?: string
}) {
  return (
    <label className="grid min-w-0 gap-1">
      <span className="tk-label text-xs">{label}</span>
      <input type={type} className="tk-input min-w-0 disabled:cursor-not-allowed disabled:bg-surface-tertiary disabled:text-ink-secondary" value={value} placeholder={placeholder} aria-invalid={Boolean(error)} disabled={disabled} title={title} onChange={event => onChange(event.target.value)} />
      <FieldError id={`${label.toLowerCase().replace(/\s+/g, '-')}-error`} message={error} />
    </label>
  )
}

function SelectInput({ label, value, error, options, onChange }: { label: string; value: string; error?: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return (
    <label className="grid min-w-0 gap-1">
      <span className="tk-label text-xs">{label}</span>
      <select className="tk-input min-w-0" value={value} aria-invalid={Boolean(error)} onChange={event => onChange(event.target.value)}>
        <option value="">Select</option>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <FieldError id={`${label.toLowerCase().replace(/\s+/g, '-')}-error`} message={error} />
    </label>
  )
}

function CheckInput({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex min-h-[44px] items-end gap-2 pb-2 text-sm font-semibold text-ink">
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
      {label}
    </label>
  )
}

function StatusButton({ active, onClick, ariaLabel, disabled = false }: { active: boolean; onClick: () => void; ariaLabel?: string; disabled?: boolean }) {
  return (
    <button type="button" className={active ? 'rounded-full bg-rag-green/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-rag-green disabled:cursor-not-allowed disabled:opacity-50' : 'rounded-full bg-surface-tertiary px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-secondary disabled:cursor-not-allowed disabled:opacity-50'} onClick={onClick} aria-label={ariaLabel} title={ariaLabel} disabled={disabled}>
      {active ? 'Active' : 'Inactive'}
    </button>
  )
}

function Badge({ label }: { label: string }) {
  return <span className="rounded-full bg-blue-tint-20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-brand-blue">{label}</span>
}

function MetaField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="min-w-0 text-sm text-ink-secondary">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-ink-secondary xl:hidden">{label}</span>
      <span className="block break-words">{children}</span>
    </span>
  )
}

function nextDisplayOrder(items: { displayOrder: number }[]) {
  return Math.max(0, ...items.map(item => item.displayOrder)) + 10
}

function insertStageByPlacement(stages: OpportunityStageConfig[], stage: OpportunityStageConfig, placement: StagePlacement, afterStageId: string) {
  const withoutStage = stages.filter(item => item.id !== stage.id)
  if (placement === 'start') return [stage, ...withoutStage]
  if (placement === 'after') {
    const afterIndex = withoutStage.findIndex(item => item.id === afterStageId)
    if (afterIndex >= 0) {
      const nextStages = [...withoutStage]
      nextStages.splice(afterIndex + 1, 0, stage)
      return nextStages
    }
  }
  return [...withoutStage, stage]
}

function normalizedStageUpdates(stages: OpportunityStageConfig[]) {
  return stages
    .map((stage, index) => ({ stage, displayOrder: (index + 1) * 10 }))
    .filter(update => update.stage.displayOrder !== update.displayOrder)
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function prefixErrors(prefix: string, errors: FieldErrors) {
  return Object.fromEntries(Object.entries(errors).map(([field, message]) => [`${prefix}.${field}`, message]))
}

function removePrefix(errors: FieldErrors, prefix: string) {
  return Object.fromEntries(Object.entries(errors).filter(([field]) => !field.startsWith(`${prefix}.`)))
}

function fieldError(field: string, message: string) {
  const error = new Error(`${field}|${message}`)
  error.name = 'FieldValidationError'
  return error
}
