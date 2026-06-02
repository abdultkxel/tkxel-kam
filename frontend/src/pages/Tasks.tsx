import * as Dialog from '@radix-ui/react-dialog'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { addDays, isAfter, isBefore, isSameDay } from 'date-fns'
import { CalendarClock, CheckCircle2, ClipboardCheck, ExternalLink, Filter, GripVertical, Loader2, Play, Plus, X, XCircle } from 'lucide-react'
import { nanoid } from 'nanoid'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { useAuth } from '@/contexts/AuthContext'
import { users } from '@/data/mock'
import { useRole } from '@/hooks/useRole'
import {
  addTaskEvidence,
  createTask as createRemoteTask,
  listAttentionSignals,
  listPlaybookTemplates,
  listTasks,
  PlaybookTemplate,
  SignalRead,
  TaskRead,
  updateSignalStatus as updateRemoteSignalStatus,
  updateTask as updateRemoteTask,
} from '@/services/scoringSignalsTasks'
import { useAccountStore } from '@/stores/accountStore'
import { useScoreActivityStore } from '@/stores/scoreActivityStore'
import { useV3Store } from '@/stores/v3Store'
import { Account } from '@/types/account'
import { ScoreActivityLane, ScoreActivityPriority, ScoreActivityTask, ScoreActivityTemplate, ScoreCalculatorId } from '@/types/scoreActivity'
import { SignalRecord } from '@/types/v3'
import { cn } from '@/utils/cn'
import { emitTimelineEvent } from '@/utils/emitTimelineEvent'
import { formatDate, formatRelative } from '@/utils/formatters'
import { emitScoreActivityCompletion } from '@/utils/scoreActivityActions'

const calculatorLabels: Record<ScoreCalculatorId, string> = {
  relationship: 'Relationship',
  contract: 'Contract',
  resource: 'Resource',
  csat: 'CSAT',
  risk: 'Risk',
}

type DueFilter = 'all' | 'overdue' | 'today' | 'next7'
type LaneKey = ScoreActivityLane

type LaneCard =
  | {
      id: string
      kind: 'task'
      lane: LaneKey
      task: ScoreActivityTask
    }
  | {
      id: string
      kind: 'signal'
      lane: LaneKey
      signal: SignalRecord
    }

const laneOrder: { key: LaneKey; title: string; description: string }[] = [
  { key: 'needs_review', title: 'Needs Review', description: 'New work waiting for owner triage.' },
  { key: 'due_soon', title: 'Due Soon', description: 'Open work due in the next 7 days.' },
  { key: 'in_progress', title: 'In Progress', description: 'Work already accepted or underway.' },
  { key: 'at_risk', title: 'At Risk / Blocked', description: 'Overdue, warning, or critical items.' },
  { key: 'done', title: 'Done', description: 'Completed, skipped, resolved, or dismissed.' },
]

const laneTitleByKey = Object.fromEntries(laneOrder.map(lane => [lane.key, lane.title])) as Record<LaneKey, string>

export function Tasks() {
  const { token } = useAuth()
  const user = useRole()
  const localTasks = useScoreActivityStore(state => state.tasks)
  const localTemplates = useScoreActivityStore(state => state.templates)
  const localAttentionSignals = useV3Store(state => state.signals)
  const updateLocalSignalStatus = useV3Store(state => state.updateSignalStatus)
  const accountsForCreate = useAccountStore(state => state.accounts)
  const addTask = useScoreActivityStore(state => state.addTask)
  const updateLocalTask = useScoreActivityStore(state => state.updateTask)
  const [remoteTasks, setRemoteTasks] = useState<ScoreActivityTask[]>([])
  const [remoteSignals, setRemoteSignals] = useState<SignalRecord[]>([])
  const [remoteTemplates, setRemoteTemplates] = useState<ScoreActivityTemplate[]>([])
  const [loading, setLoading] = useState(Boolean(token))
  const [error, setError] = useState('')
  const [accountId, setAccountId] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [calculator, setCalculator] = useState('')
  const [status, setStatus] = useState('')
  const [due, setDue] = useState<DueFilter>('all')
  const [priority, setPriority] = useState('')
  const [activeCard, setActiveCard] = useState<LaneCard | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  )

  const useRemoteData = Boolean(token)
  const tasks = useRemoteData ? remoteTasks : localTasks
  const templates = useRemoteData ? remoteTemplates : localTemplates
  const attentionSignals = useRemoteData ? remoteSignals : localAttentionSignals

  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }
    void loadRemoteWork()
  }, [accountsForCreate, token])

  async function loadRemoteWork() {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const [taskPage, signalPage, templatePage] = await Promise.all([
        listTasks(token, { page: 1, page_size: 100, sort: 'due_at', direction: 'asc' }),
        listAttentionSignals(token, { page: 1, page_size: 100 }),
        listPlaybookTemplates(token, { page: 1, page_size: 100, active_state: 'active', status: 'active' }),
      ])
      setRemoteTasks(taskPage.items.map(task => mapApiTask(task, accountsForCreate)))
      setRemoteSignals(signalPage.items.map(signal => mapApiSignal(signal, accountsForCreate)))
      setRemoteTemplates(templatePage.items.map(mapApiTemplate))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load tasks and signals')
    } finally {
      setLoading(false)
    }
  }

  const accounts = useMemo(
    () => Array.from(new Map<string, string>([...tasks.map(task => [task.accountId, task.accountName] as const), ...attentionSignals.map(signal => [signal.accountId, signal.accountName] as const)]).entries()),
    [attentionSignals, tasks],
  )
  const owners = useMemo(
    () => Array.from(new Map<string, string>([...tasks.map(task => [task.ownerId, task.ownerName] as const), ...attentionSignals.map(signal => [signal.ownerId, signal.ownerName] as const)]).entries()),
    [attentionSignals, tasks],
  )
  const filteredTasks = useMemo(
    () =>
      tasks
        .filter(task => !accountId || task.accountId === accountId)
        .filter(task => !ownerId || task.ownerId === ownerId)
        .filter(task => !calculator || task.calculatorId === calculator)
        .filter(task => !status || task.status === status)
        .filter(task => !priority || task.priority === priority)
        .filter(task => matchesDueFilter(task, due))
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()),
    [accountId, calculator, due, ownerId, priority, status, tasks],
  )
  const filteredSignals = useMemo(
    () =>
      attentionSignals
        .filter(signal => !accountId || signal.accountId === accountId)
        .filter(signal => !ownerId || signal.ownerId === ownerId)
        .filter(signal => !calculator)
        .filter(signal => !status || signal.status === status)
        .filter(signal => !priority || signalPriority(signal) === priority)
        .filter(signal => matchesSignalDueFilter(signal, due))
        .sort((a, b) => new Date(a.dueAt ?? a.createdAt).getTime() - new Date(b.dueAt ?? b.createdAt).getTime()),
    [accountId, attentionSignals, calculator, due, ownerId, priority, status],
  )
  const lanes = useMemo(() => buildTaskLanes(filteredTasks, filteredSignals), [filteredSignals, filteredTasks])
  const laneCardCount = lanes.reduce((sum, lane) => sum + lane.cards.length, 0)
  const openSignalCount = attentionSignals.filter(signal => !['resolved', 'dismissed'].includes(signal.status)).length
  const openTasks = tasks.filter(task => task.status !== 'done' && task.status !== 'skipped').length + openSignalCount
  const dueSoon = tasks.filter(task => matchesDueFilter(task, 'next7') && task.status !== 'done' && task.status !== 'skipped').length + attentionSignals.filter(signal => matchesSignalDueFilter(signal, 'next7') && !['resolved', 'dismissed'].includes(signal.status)).length
  const completed = tasks.filter(task => task.status === 'done').length + attentionSignals.filter(signal => signal.status === 'resolved').length
  const skipped = tasks.filter(task => task.status === 'skipped').length + attentionSignals.filter(signal => signal.status === 'dismissed').length

  function clearFilters() {
    setAccountId('')
    setOwnerId('')
    setCalculator('')
    setStatus('')
    setDue('all')
    setPriority('')
  }

  async function handleCreateTask(task: ScoreActivityTask) {
    if (token) {
      try {
        const created = await createRemoteTask(token, {
          account_id: task.accountId,
          title: task.title,
          description: task.description,
          owner_id: task.ownerId,
          due_at: task.dueDate,
          status: 'todo',
          priority: task.priority,
          source_type: 'manual',
          notes: task.evidenceNote,
        })
        setRemoteTasks(current => [mapApiTask(created, accountsForCreate), ...current])
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Task could not be created'
        setError(message)
        throw new Error(message)
      }
      return
    }
    addTask(task)
  }

  function updateEvidence(taskId: string, evidenceNote: string) {
    if (token) {
      setRemoteTasks(current => current.map(task => (task.id === taskId ? { ...task, evidenceNote } : task)))
      return
    }
    updateLocalTask(taskId, { evidenceNote })
  }

  async function startTask(task: ScoreActivityTask) {
    if (token) {
      try {
        const updated = await updateRemoteTask(token, task.id, { status: 'in_progress' })
        setRemoteTasks(current => current.map(item => (item.id === task.id ? mapApiTask(updated, accountsForCreate) : item)))
        toast.success('Task moved to in progress')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Task could not be updated')
      }
      return
    }
    updateLocalTask(task.id, { status: 'in_progress', workflowLane: 'in_progress' })
    toast.success('Task moved to in progress')
  }

  async function completeTask(task: ScoreActivityTask) {
    const evidenceNote = task.evidenceNote?.trim() || `Evidence captured for ${task.title}.`
    if (token) {
      try {
        if (evidenceNote) await addTaskEvidence(token, task.id, { evidence_type: 'note', note: evidenceNote })
        const updated = await updateRemoteTask(token, task.id, { status: 'done', outcome: evidenceNote })
        setRemoteTasks(current => current.map(item => (item.id === task.id ? mapApiTask(updated, accountsForCreate) : item)))
        toast.success('Task completed and recorded')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Task could not be completed')
      }
      return
    }
    const completedAt = new Date().toISOString()
    const entry = emitScoreActivityCompletion(task, user, evidenceNote)
    updateLocalTask(task.id, {
      status: 'done',
      workflowLane: 'done',
      evidenceNote,
      completedAt,
      skippedReason: undefined,
      sourceTimelineEntryId: entry.id,
    })
    toast.success('Task completed and recorded in timeline')
  }

  async function skipTask(task: ScoreActivityTask) {
    const skipReason = task.evidenceNote?.trim() || task.skippedReason || 'Skipped from task review.'
    if (token) {
      try {
        const updated = await updateRemoteTask(token, task.id, { status: 'skipped', skip_reason: skipReason })
        setRemoteTasks(current => current.map(item => (item.id === task.id ? mapApiTask(updated, accountsForCreate) : item)))
        toast.success('Task skipped with reason retained')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Task could not be skipped')
      }
      return
    }
    updateLocalTask(task.id, {
      status: 'skipped',
      workflowLane: 'done',
      skippedReason: skipReason,
    })
    toast.success('Task skipped with reason retained')
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveCard((event.active.data.current?.card as LaneCard | undefined) ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    const card = event.active.data.current?.card as LaneCard | undefined
    const laneKey = event.over?.id as LaneKey | undefined
    setActiveCard(null)
    if (!card || card.kind !== 'task' || !laneKey || !isLaneKey(laneKey) || card.lane === laneKey) return
    void moveTaskToLane(card.task, laneKey)
  }

  async function moveTaskToLane(task: ScoreActivityTask, lane: LaneKey) {
    const patch: Partial<ScoreActivityTask> = { workflowLane: lane }
    if (lane === 'done') {
      patch.status = 'done'
      patch.completedAt = task.completedAt ?? new Date().toISOString()
      patch.skippedReason = undefined
    } else if (lane === 'in_progress') {
      patch.status = 'in_progress'
      patch.completedAt = undefined
      patch.skippedReason = undefined
    } else {
      patch.status = 'todo'
      patch.completedAt = undefined
      patch.skippedReason = undefined
      if (lane === 'at_risk' && task.priority === 'low') patch.priority = 'medium'
    }
    if (token) {
      try {
        const updated = await updateRemoteTask(token, task.id, {
          status: patch.status,
          priority: patch.priority,
          outcome: patch.status === 'done' ? task.evidenceNote || 'Completed from board lane move.' : undefined,
        })
        setRemoteTasks(current => current.map(item => (item.id === task.id ? mapApiTask(updated, accountsForCreate) : item)))
        toast.success(`Task moved to ${laneTitleByKey[lane]}`)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Task could not be moved')
      }
      return
    }
    updateLocalTask(task.id, patch)
    toast.success(`Task moved to ${laneTitleByKey[lane]}`)
  }

  async function reviewSignal(signal: SignalRecord) {
    if (token) {
      try {
        const updated = await updateRemoteSignalStatus(token, signal.id, 'reviewed')
        setRemoteSignals(current => current.map(item => (item.id === signal.id ? mapApiSignal(updated, accountsForCreate) : item)))
        toast.success('Signal marked reviewed')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Signal could not be reviewed')
      }
      return
    }
    updateLocalSignalStatus(signal.id, 'reviewed')
    toast.success('Signal marked reviewed')
  }

  async function resolveSignal(signal: SignalRecord) {
    if (token) {
      try {
        const updated = await updateRemoteSignalStatus(token, signal.id, 'resolved', 'Resolved from task board.')
        setRemoteSignals(current => current.map(item => (item.id === signal.id ? mapApiSignal(updated, accountsForCreate) : item)))
        toast.success('Signal resolved')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Signal could not be resolved')
      }
      return
    }
    updateLocalSignalStatus(signal.id, 'resolved')
    toast.success('Signal resolved')
  }

  return (
    <div>
      <PageHeader
        eyebrow="Score-linked work"
        title="Tasks"
        description="Evidence-first activities tied to calculator criteria across every account."
        actions={
          <>
            <button className="tk-button-secondary" onClick={clearFilters}>
              <Filter className="h-4 w-4" />
              Clear filters
            </button>
            <AddTaskDialog accounts={accountsForCreate} templates={templates} onCreate={handleCreateTask} currentUserId={user.id} currentUserName={user.name} persistLocalTimeline={!token} />
          </>
        }
      />

      {loading ? (
        <div className="mb-5 rounded-lg border border-surface-border bg-surface-tertiary p-4 text-sm text-ink-secondary">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin text-brand-blue" />
          Loading tasks, signals, and playbooks...
        </div>
      ) : null}
      {error ? (
        <div className="mb-5 rounded-lg border border-rag-red/20 bg-rag-red/10 p-4 text-sm text-rag-red">
          <p className="font-semibold">Task data could not be loaded</p>
          <p>{error}</p>
          <button className="tk-button-secondary mt-2 bg-white" onClick={loadRemoteWork}>Retry</button>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <TaskMetric label="Open" value={openTasks} tone="default" />
        <TaskMetric label="Due in 7 days" value={dueSoon} tone="warning" />
        <TaskMetric label="Completed" value={completed} tone="success" />
        <TaskMetric label="Skipped" value={skipped} tone="muted" />
      </div>

      <section className="tk-card mt-5 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="space-y-1">
            <span className="tk-label text-xs">Account</span>
            <select className="tk-input" value={accountId} onChange={event => setAccountId(event.target.value)}>
              <option value="">All accounts</option>
              {accounts.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="tk-label text-xs">Owner</span>
            <select className="tk-input" value={ownerId} onChange={event => setOwnerId(event.target.value)}>
              <option value="">All owners</option>
              {owners.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="tk-label text-xs">Calculator</span>
            <select className="tk-input" value={calculator} onChange={event => setCalculator(event.target.value)}>
              <option value="">All calculators</option>
              {Object.entries(calculatorLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="tk-label text-xs">Status / lifecycle</span>
            <select className="tk-input" value={status} onChange={event => setStatus(event.target.value)}>
              <option value="">Any status</option>
              <optgroup label="Tasks">
                <option value="todo">Todo</option>
                <option value="in_progress">In progress</option>
                <option value="blocked">Blocked</option>
                <option value="done">Done</option>
                <option value="skipped">Skipped</option>
              </optgroup>
              <optgroup label="Attention signals">
                <option value="new">New</option>
                <option value="reviewed">Reviewed</option>
                <option value="accepted">Accepted</option>
                <option value="converted">Converted</option>
                <option value="resolved">Resolved</option>
                <option value="dismissed">Dismissed</option>
              </optgroup>
            </select>
          </label>
          <label className="space-y-1">
            <span className="tk-label text-xs">Due date</span>
            <select className="tk-input" value={due} onChange={event => setDue(event.target.value as DueFilter)}>
              <option value="all">Any date</option>
              <option value="overdue">Overdue</option>
              <option value="today">Today</option>
              <option value="next7">Next 7 days</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="tk-label text-xs">Priority</span>
            <select className="tk-input" value={priority} onChange={event => setPriority(event.target.value)}>
              <option value="">Any priority</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
        </div>
      </section>

      <section className="mt-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Execution lanes</p>
            <h2 className="text-base font-semibold text-ink">Score tasks and attention signals</h2>
            <p className="mt-1 text-sm text-ink-secondary">Filtered work is grouped by workflow state so KAMs can triage, move, and close items quickly.</p>
          </div>
          <span className="rounded-full border border-blue-tint-20 bg-blue-tint-20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-brand-blue">
            {laneCardCount} visible items
          </span>
        </div>
        {laneCardCount ? (
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveCard(null)}>
            <div className="grid gap-4 xl:grid-cols-5">
              {lanes.map(lane => (
                <TaskLaneColumn
                  key={lane.key}
                  lane={lane}
                  onEvidenceChange={updateEvidence}
                  onStartTask={startTask}
                  onCompleteTask={completeTask}
                  onSkipTask={skipTask}
                  onReviewSignal={reviewSignal}
                  onResolveSignal={resolveSignal}
                />
              ))}
            </div>
            <DragOverlay>
              {activeCard?.kind === 'task' ? <TaskDragPreview card={activeCard} /> : null}
            </DragOverlay>
          </DndContext>
        ) : (
          <div className="tk-card">
            <EmptyState icon={ClipboardCheck} heading="No tasks match these filters" body="Clear filters or select a broader account, status, or due date window." action={{ label: 'Clear filters', onClick: clearFilters }} />
          </div>
        )}
      </section>
    </div>
  )
}

function TaskLaneColumn({
  lane,
  onEvidenceChange,
  onStartTask,
  onCompleteTask,
  onSkipTask,
  onReviewSignal,
  onResolveSignal,
}: {
  lane: { key: LaneKey; title: string; description: string; cards: LaneCard[] }
  onEvidenceChange: (taskId: string, evidenceNote: string) => void
  onStartTask: (task: ScoreActivityTask) => void
  onCompleteTask: (task: ScoreActivityTask) => void
  onSkipTask: (task: ScoreActivityTask) => void
  onReviewSignal: (signal: SignalRecord) => void
  onResolveSignal: (signal: SignalRecord) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: lane.key })

  return (
    <section
      ref={setNodeRef}
      aria-label={`${lane.title} lane`}
      data-task-lane={lane.key}
      className={cn(
        'min-h-[360px] rounded-lg border bg-surface-secondary p-3 transition-colors',
        isOver ? 'border-brand-blue bg-blue-tint-20/40' : 'border-surface-border',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">{lane.title}</h3>
          <p className="mt-1 text-xs leading-5 text-ink-secondary">{lane.description}</p>
          <p className="mt-1 text-[11px] font-medium text-brand-blue">Drag task cards here to reprioritize.</p>
        </div>
        <span className="rounded-full border border-surface-border bg-white px-2 py-1 text-[11px] font-semibold text-ink-secondary">{lane.cards.length}</span>
      </div>
      <div className="mt-3 space-y-3">
        {lane.cards.length ? lane.cards.map(card => (
          <TaskLaneCard
            key={card.id}
            card={card}
            onEvidenceChange={onEvidenceChange}
            onStartTask={onStartTask}
            onCompleteTask={onCompleteTask}
            onSkipTask={onSkipTask}
            onReviewSignal={onReviewSignal}
            onResolveSignal={onResolveSignal}
          />
        )) : (
          <div className="rounded-lg border border-dashed border-surface-border bg-white p-4 text-center">
            <p className="text-xs font-medium text-ink-secondary">No items in this lane</p>
          </div>
        )}
      </div>
    </section>
  )
}

function TaskLaneCard({
  card,
  onEvidenceChange,
  onStartTask,
  onCompleteTask,
  onSkipTask,
  onReviewSignal,
  onResolveSignal,
}: {
  card: LaneCard
  onEvidenceChange: (taskId: string, evidenceNote: string) => void
  onStartTask: (task: ScoreActivityTask) => void
  onCompleteTask: (task: ScoreActivityTask) => void
  onSkipTask: (task: ScoreActivityTask) => void
  onReviewSignal: (signal: SignalRecord) => void
  onResolveSignal: (signal: SignalRecord) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    data: { card },
    disabled: card.kind !== 'task',
  })
  const dragStyle =
    card.kind === 'task'
      ? {
          transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
          opacity: isDragging ? 0.45 : undefined,
        }
      : undefined

  if (card.kind === 'signal') {
    const signal = card.signal
    const closed = signal.status === 'resolved' || signal.status === 'dismissed'
    const sourceRoute = signal.sourceRecordRoute === '/attention' ? '/tasks' : signal.sourceRecordRoute

    return (
      <article className={cn('rounded-lg border bg-white p-3 shadow-card', signal.severity === 'critical' ? 'border-rag-red/20' : signal.severity === 'warning' ? 'border-brand-orange/20' : 'border-surface-border')}>
        <div className="flex flex-wrap gap-1.5">
          <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', signalStatusClass(signal.status))}>{signal.status}</span>
          <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', signalSeverityClass(signal.severity))}>{signal.severity}</span>
          <span className="rounded-full border border-surface-border bg-surface-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">{signal.type.replace('_', ' ')}</span>
        </div>
        <h4 className="mt-3 text-sm font-semibold leading-5 text-ink">{signal.headline}</h4>
        <p className="mt-1 text-xs leading-5 text-ink-secondary">{signal.detail}</p>
        <div className="mt-3 space-y-1 text-xs font-medium text-ink-secondary">
          <p>{signal.accountName}</p>
          {signal.engagementName ? <p>{signal.engagementName}</p> : null}
          {signal.dueAt ? <p className="text-brand-orange">Due {formatDate(signal.dueAt)}</p> : null}
        </div>
        <div className="mt-3 grid gap-2">
          <Link className="tk-button-secondary min-h-[44px] bg-white text-xs" to={sourceRoute}>
            <ExternalLink className="h-4 w-4" />
            View source
          </Link>
          {signal.status === 'new' ? (
            <button className="tk-button-secondary min-h-[44px] bg-white text-xs" onClick={() => onReviewSignal(signal)}>
              <Play className="h-4 w-4" />
              Mark reviewed
            </button>
          ) : null}
          {!closed ? (
            <button className="tk-button-primary min-h-[44px] text-xs" onClick={() => onResolveSignal(signal)}>
              <CheckCircle2 className="h-4 w-4" />
              Resolve
            </button>
          ) : null}
        </div>
      </article>
    )
  }

  const task = card.task
  const locked = task.status === 'done' || task.status === 'skipped'
  const overdue = isTaskOverdue(task)
  const isKycAgentTask = task.criterionId === 'kyc_agent_refresh'

  return (
    <article
      ref={setNodeRef}
      style={dragStyle}
      className={cn(
        'rounded-lg border bg-white p-3 shadow-card transition-shadow',
        isDragging ? 'shadow-panel' : '',
        overdue ? 'border-rag-red/20' : task.priority === 'high' ? 'border-brand-orange/20' : 'border-surface-border',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', statusClass(task.status))}>{task.status.replace('_', ' ')}</span>
          <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', priorityClass(task.priority))}>{task.priority}</span>
          <span className="rounded-full border border-blue-tint-20 bg-blue-tint-20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-blue">{isKycAgentTask ? 'KYC' : calculatorLabels[task.calculatorId]}</span>
        </div>
        <button
          type="button"
          className="flex h-11 w-11 shrink-0 cursor-grab items-center justify-center rounded-md border border-surface-border bg-white text-ink-secondary transition-colors hover:bg-surface-tertiary active:cursor-grabbing"
          aria-label={`Drag task: ${task.title}`}
          title="Drag task"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>
      <h4 className="mt-3 text-sm font-semibold leading-5 text-ink">{task.title}</h4>
      <p className="mt-1 text-xs leading-5 text-ink-secondary">{task.description}</p>
      <div className="mt-3 space-y-1 text-xs font-medium text-ink-secondary">
        <p>{task.accountName}</p>
        <p>{task.ownerName}</p>
        <p className={overdue ? 'text-rag-red' : 'text-brand-orange'}>Due {formatDate(task.dueDate)}</p>
      </div>
      <label className="mt-3 block space-y-1">
        <span className="text-[11px] font-semibold text-ink-secondary">{task.status === 'skipped' ? 'Skip reason' : 'Evidence'}</span>
        <textarea
          className="tk-input min-h-[68px] text-xs"
          value={task.status === 'skipped' ? task.skippedReason ?? '' : task.evidenceNote ?? ''}
          onChange={event => onEvidenceChange(task.id, event.target.value)}
          disabled={locked}
          placeholder="Add evidence before closing."
        />
      </label>
      <div className="mt-3 grid gap-2">
        <Link className="tk-button-secondary min-h-[44px] bg-white text-xs" to={`/accounts/${task.accountId}?tab=${isKycAgentTask ? 'kyc' : 'health'}`}>
          <ExternalLink className="h-4 w-4" />
          {isKycAgentTask ? 'KYC review' : 'Health tab'}
        </Link>
        {task.status === 'todo' ? (
          <button className="tk-button-secondary min-h-[44px] bg-white text-xs" onClick={() => onStartTask(task)}>
            <Play className="h-4 w-4" />
            Mark in progress
          </button>
        ) : null}
        {task.status !== 'done' && task.status !== 'skipped' ? (
          <button className="tk-button-primary min-h-[44px] text-xs" onClick={() => onCompleteTask(task)}>
            <CheckCircle2 className="h-4 w-4" />
            Complete with evidence
          </button>
        ) : null}
        {task.status !== 'done' && task.status !== 'skipped' ? (
          <button className="tk-button-secondary min-h-[44px] bg-white text-xs text-brand-orange" onClick={() => onSkipTask(task)}>
            <XCircle className="h-4 w-4" />
            Skip with reason
          </button>
        ) : null}
      </div>
    </article>
  )
}

function TaskDragPreview({ card }: { card: Extract<LaneCard, { kind: 'task' }> }) {
  const task = card.task
  return (
    <article className="w-[280px] rounded-lg border border-brand-blue bg-white p-3 shadow-ai">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', statusClass(task.status))}>{task.status.replace('_', ' ')}</span>
          <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', priorityClass(task.priority))}>{task.priority}</span>
        </div>
        <GripVertical className="h-4 w-4 text-brand-blue" />
      </div>
      <h4 className="mt-3 text-sm font-semibold leading-5 text-ink">{task.title}</h4>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-ink-secondary">{task.accountName} | Due {formatDate(task.dueDate)}</p>
    </article>
  )
}

function AddTaskDialog({
  accounts,
  templates,
  onCreate,
  currentUserId,
  currentUserName,
  persistLocalTimeline,
}: {
  accounts: Account[]
  templates: ScoreActivityTemplate[]
  onCreate: (task: ScoreActivityTask) => void | Promise<void>
  currentUserId: string
  currentUserName: string
  persistLocalTimeline: boolean
}) {
  const [open, setOpen] = useState(false)
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '')
  const [ownerId, setOwnerId] = useState(currentUserId)
  const [title, setTitle] = useState(templates[0]?.title ?? '')
  const [dueDate, setDueDate] = useState(() => addDays(new Date(), 7).toISOString().slice(0, 10))
  const [priority, setPriority] = useState<ScoreActivityPriority>(templates[0]?.defaultPriority ?? 'medium')
  const [saving, setSaving] = useState(false)
  const selectedAccount = accounts.find(account => account.id === accountId)
  const selectedTemplate = templates.find(template => template.id === templateId)
  const selectedOwner = users.find(user => user.id === ownerId) ?? users.find(user => user.id === currentUserId)
  const canSubmit = Boolean(selectedAccount && selectedTemplate && selectedOwner && title.trim() && dueDate)

  function chooseTemplate(id: string) {
    const template = templates.find(item => item.id === id)
    setTemplateId(id)
    if (!template) return
    setTitle(template.title)
    setPriority(template.defaultPriority)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!selectedAccount || !selectedTemplate || !selectedOwner || !canSubmit) return
    setSaving(true)
    await new Promise(resolve => window.setTimeout(resolve, 300))
    const task: ScoreActivityTask = {
      id: `sat-${nanoid(6)}`,
      templateId: selectedTemplate.id,
      accountId: selectedAccount.id,
      accountName: selectedAccount.name,
      ownerId: selectedOwner.id,
      ownerName: selectedOwner.name,
      calculatorId: selectedTemplate.calculatorId,
      criterionId: selectedTemplate.criterionId,
      title: title.trim(),
      description: selectedTemplate.description,
      dueDate: new Date(`${dueDate}T12:00:00`).toISOString(),
      status: 'todo',
      priority,
      workflowLane: 'needs_review',
      createdAt: new Date().toISOString(),
    }
    try {
      await onCreate(task)
      if (persistLocalTimeline) {
        emitTimelineEvent({
          accountId: selectedAccount.id,
          eventType: 'manual_note',
          module: 'activity',
          title: `Task created: ${task.title}`,
          description: `Score-linked activity created for ${calculatorLabels[task.calculatorId]}. Owner: ${task.ownerName}.`,
          performedBy: currentUserId,
          performedByName: currentUserName,
          sourceRecordId: task.id,
          sourceRecordType: 'score_activity_task',
          sourceRecordRoute: `/tasks`,
          metadata: { taskId: task.id, calculatorId: task.calculatorId, criterionId: task.criterionId },
          isSensitive: false,
          isSystemGenerated: false,
          isImmutable: false,
        })
      }
      setOpen(false)
      toast.success('Task created')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Task could not be created')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" className="tk-button-primary">
          <Plus className="h-4 w-4" />
          Add task
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(760px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-surface-border bg-white shadow-panel">
          <form onSubmit={submit}>
            <div className="flex items-start justify-between gap-4 border-b border-surface-border p-5">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Task create flow</p>
                <Dialog.Title className="font-display text-2xl font-bold text-ink">Add score-linked task</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-ink-secondary">Create evidence work tied to a calculator criterion and account health review.</Dialog.Description>
              </div>
              <Dialog.Close className="tk-icon-button" aria-label="Close task form">
                <X className="h-5 w-5" />
              </Dialog.Close>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <label className="space-y-1">
                <span className="tk-label text-xs">Account <span className="text-brand-orange">*</span></span>
                <select className="tk-input" value={accountId} onChange={event => setAccountId(event.target.value)}>
                  {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </label>
              <label className="space-y-1">
                <span className="tk-label text-xs">Owner</span>
                <select className="tk-input" value={ownerId} onChange={event => setOwnerId(event.target.value)}>
                  {users.map(owner => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
                </select>
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="tk-label text-xs">Activity template</span>
                <select className="tk-input" value={templateId} onChange={event => chooseTemplate(event.target.value)}>
                  {templates.map(template => <option key={template.id} value={template.id}>{calculatorLabels[template.calculatorId]} | {template.title}</option>)}
                </select>
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="tk-label text-xs">Task title <span className="text-brand-orange">*</span></span>
                <input className="tk-input" value={title} onChange={event => setTitle(event.target.value)} placeholder="Confirm executive sponsor alignment" />
              </label>
              <label className="space-y-1">
                <span className="tk-label text-xs">Due date <span className="text-brand-orange">*</span></span>
                <input type="date" className="tk-input" value={dueDate} onChange={event => setDueDate(event.target.value)} />
              </label>
              <label className="space-y-1">
                <span className="tk-label text-xs">Priority</span>
                <select className="tk-input" value={priority} onChange={event => setPriority(event.target.value as ScoreActivityPriority)}>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </label>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-surface-border p-5">
              <Dialog.Close type="button" className="tk-button-secondary">Cancel</Dialog.Close>
              <button type="submit" className="tk-button-primary" disabled={!canSubmit || saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Create task
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function TaskRow({
  task,
  onEvidenceChange,
  onStart,
  onComplete,
  onSkip,
}: {
  task: ScoreActivityTask
  onEvidenceChange: (taskId: string, evidenceNote: string) => void
  onStart: (task: ScoreActivityTask) => void
  onComplete: (task: ScoreActivityTask) => void
  onSkip: (task: ScoreActivityTask) => void
}) {
  const locked = task.status === 'done' || task.status === 'skipped'
  const overdue = isBefore(new Date(task.dueDate), new Date()) && task.status !== 'done' && task.status !== 'skipped'
  const isKycAgentTask = task.criterionId === 'kyc_agent_refresh'

  return (
    <article className="tk-card p-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-wider', statusClass(task.status))}>
              {task.status.replace('_', ' ')}
            </span>
            <span className={cn('inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-wider', priorityClass(task.priority))}>
              {task.priority}
            </span>
            <span className="inline-flex rounded-full border border-blue-tint-20 bg-blue-tint-20 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-brand-blue">
              {calculatorLabels[task.calculatorId]}
            </span>
            {overdue ? (
              <span className="inline-flex rounded-full border border-rag-red/20 bg-rag-red/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-rag-red">
                Overdue
              </span>
            ) : null}
          </div>
          <h2 className="mt-3 text-base font-semibold text-ink">{task.title}</h2>
          <p className="mt-1 text-sm leading-6 text-ink-secondary">{task.description}</p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-ink-secondary">
            <span>{task.accountName}</span>
            <span>{task.ownerName}</span>
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5 text-brand-orange" />
              {formatDate(task.dueDate)}
            </span>
            {task.completedAt ? <span>Completed {formatRelative(task.completedAt)}</span> : null}
          </div>
          <label className="mt-4 block space-y-1">
            <span className="text-xs font-semibold text-ink-secondary">{task.status === 'skipped' ? 'Skip reason' : 'Evidence or skip reason'}</span>
            <textarea
              className="tk-input min-h-[80px]"
              value={task.status === 'skipped' ? task.skippedReason ?? '' : task.evidenceNote ?? ''}
              onChange={event => onEvidenceChange(task.id, event.target.value)}
              disabled={locked}
              placeholder="Capture the client signal, document reference, or reason this activity is not applicable."
            />
          </label>
        </div>
        <div className="flex flex-col gap-2 xl:items-stretch">
          <Link className="tk-button-secondary" to={`/accounts/${task.accountId}?tab=${isKycAgentTask ? 'kyc' : 'health'}`}>
            <ExternalLink className="h-4 w-4" />
            {isKycAgentTask ? 'KYC review' : 'Health tab'}
          </Link>
          {task.status === 'todo' ? (
            <button className="tk-button-secondary" onClick={() => onStart(task)}>
              <Play className="h-4 w-4" />
              Mark in progress
            </button>
          ) : null}
          {task.status !== 'done' && task.status !== 'skipped' ? (
            <button className="tk-button-primary" onClick={() => onComplete(task)}>
              <CheckCircle2 className="h-4 w-4" />
              Complete with evidence
            </button>
          ) : null}
          {task.status !== 'done' && task.status !== 'skipped' ? (
            <button className="tk-button-secondary text-brand-orange" onClick={() => onSkip(task)}>
              <XCircle className="h-4 w-4" />
              Skip with reason
            </button>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function TaskMetric({ label, value, tone }: { label: string; value: number; tone: 'default' | 'warning' | 'success' | 'muted' }) {
  const toneClass = {
    default: 'bg-blue-tint-20 text-brand-blue',
    warning: 'bg-brand-orange/10 text-brand-orange',
    success: 'bg-rag-green/10 text-rag-green',
    muted: 'bg-surface-tertiary text-ink-secondary',
  }[tone]

  return (
    <article className="tk-card p-4">
      <p className="text-[10px] font-extrabold uppercase tracking-widest text-ink-secondary">{label}</p>
      <div className="mt-3 flex items-center justify-between">
        <p className="font-display text-3xl font-bold text-ink">{value}</p>
        <span className={cn('flex h-11 w-11 items-center justify-center rounded-lg', toneClass)}>
          <ClipboardCheck className="h-5 w-5" />
        </span>
      </div>
    </article>
  )
}

function buildTaskLanes(tasks: ScoreActivityTask[], signals: SignalRecord[]) {
  const cards: LaneCard[] = [
    ...tasks.map(task => ({ id: `task-${task.id}`, kind: 'task' as const, lane: taskLane(task), task })),
    ...signals.map(signal => ({ id: `signal-${signal.id}`, kind: 'signal' as const, lane: signalLane(signal), signal })),
  ]
  const dashboardCards = dashboardRelevantCards(cards)

  return laneOrder.map(lane => ({
    ...lane,
    cards: dashboardCards
      .filter(card => card.lane === lane.key)
      .sort(sortLaneCards),
  }))
}

function dashboardRelevantCards(cards: LaneCard[]) {
  const manuallyPlaced = cards
    .filter(card => card.kind === 'task' && card.task.workflowLane)
    .sort(sortDashboardCards)
  const openCards = cards.filter(card => card.lane !== 'done')
  const primary = openCards
    .filter(card => card.lane === 'at_risk' || card.lane === 'due_soon' || cardUrgency(card) <= 1)
    .filter(card => !manuallyPlaced.some(item => item.id === card.id))
    .sort(sortDashboardCards)
  const secondary = openCards
    .filter(card => !primary.some(item => item.id === card.id))
    .filter(card => !manuallyPlaced.some(item => item.id === card.id))
    .sort(sortDashboardCards)
  const closed = cards
    .filter(card => card.lane === 'done')
    .filter(card => !manuallyPlaced.some(item => item.id === card.id))
    .sort(sortDashboardCards)
  const curated = [...manuallyPlaced, ...primary, ...secondary, ...closed]
  return curated.slice(0, 10)
}

function sortDashboardCards(a: LaneCard, b: LaneCard) {
  const lanePriority: Record<LaneKey, number> = {
    at_risk: 0,
    due_soon: 1,
    in_progress: 2,
    needs_review: 3,
    done: 4,
  }
  return lanePriority[a.lane] - lanePriority[b.lane] || sortLaneCards(a, b)
}

function taskLane(task: ScoreActivityTask): LaneKey {
  if (task.workflowLane) return task.workflowLane
  if (task.status === 'done' || task.status === 'skipped') return 'done'
  if (isTaskOverdue(task)) return 'at_risk'
  if (task.status === 'in_progress') return 'in_progress'
  if (isTaskDueSoon(task)) return 'due_soon'
  return 'needs_review'
}

function isLaneKey(value: string): value is LaneKey {
  return laneOrder.some(lane => lane.key === value)
}

function signalLane(signal: SignalRecord): LaneKey {
  if (signal.status === 'resolved' || signal.status === 'dismissed') return 'done'
  if (signal.status === 'accepted' || signal.status === 'converted') return 'in_progress'
  if (signal.severity === 'critical' || signal.severity === 'warning' || isSignalOverdue(signal)) return 'at_risk'
  if (isSignalDueSoon(signal)) return 'due_soon'
  return 'needs_review'
}

function sortLaneCards(a: LaneCard, b: LaneCard) {
  return cardUrgency(a) - cardUrgency(b) || new Date(cardDueDate(a) ?? cardCreatedAt(a)).getTime() - new Date(cardDueDate(b) ?? cardCreatedAt(b)).getTime()
}

function cardUrgency(card: LaneCard) {
  if (card.kind === 'signal') {
    if (card.signal.severity === 'critical') return 0
    if (card.signal.severity === 'warning') return 1
    return 2
  }
  const priority = { critical: 0, high: 1, medium: 2, low: 3 }
  return priority[card.task.priority]
}

function cardDueDate(card: LaneCard) {
  return card.kind === 'signal' ? card.signal.dueAt : card.task.dueDate
}

function cardCreatedAt(card: LaneCard) {
  return card.kind === 'signal' ? card.signal.createdAt : card.task.createdAt
}

function isTaskOverdue(task: ScoreActivityTask) {
  return isBefore(new Date(task.dueDate), new Date()) && task.status !== 'done' && task.status !== 'skipped'
}

function isTaskDueSoon(task: ScoreActivityTask) {
  return matchesDueFilter(task, 'next7') && task.status !== 'done' && task.status !== 'skipped'
}

function isSignalOverdue(signal: SignalRecord) {
  return Boolean(signal.dueAt && isBefore(new Date(signal.dueAt), new Date()) && signal.status !== 'resolved' && signal.status !== 'dismissed')
}

function isSignalDueSoon(signal: SignalRecord) {
  return matchesSignalDueFilter(signal, 'next7') && signal.status !== 'resolved' && signal.status !== 'dismissed'
}

function matchesDueFilter(task: ScoreActivityTask, due: DueFilter) {
  const taskDate = new Date(task.dueDate)
  const now = new Date()
  if (due === 'overdue') return isBefore(taskDate, now) && task.status !== 'done' && task.status !== 'skipped'
  if (due === 'today') return isSameDay(taskDate, now)
  if (due === 'next7') return (isAfter(taskDate, now) || isSameDay(taskDate, now)) && isBefore(taskDate, addDays(now, 8))
  return true
}

function matchesSignalDueFilter(signal: SignalRecord, due: DueFilter) {
  if (!signal.dueAt) return due === 'all'
  const signalDate = new Date(signal.dueAt)
  const now = new Date()
  if (due === 'overdue') return isBefore(signalDate, now) && signal.status !== 'resolved' && signal.status !== 'dismissed'
  if (due === 'today') return isSameDay(signalDate, now)
  if (due === 'next7') return (isAfter(signalDate, now) || isSameDay(signalDate, now)) && isBefore(signalDate, addDays(now, 8))
  return true
}

function signalPriority(signal: SignalRecord): ScoreActivityPriority {
  if (signal.severity === 'critical') return 'critical'
  if (signal.severity === 'warning') return 'medium'
  return 'low'
}

function mapApiTask(task: TaskRead, accounts: Account[]): ScoreActivityTask {
  const account = accounts.find(item => item.id === task.account_id)
  const evidenceNote = task.outcome || task.notes || task.evidence_json.map(item => String(item.note ?? item.url ?? '')).filter(Boolean).join('\n')
  return {
    id: task.id,
    templateId: task.playbook_execution_id ?? task.source_record_id ?? task.id,
    accountId: task.account_id,
    accountName: account?.name ?? 'Account',
    ownerId: task.owner_id ?? '',
    ownerName: task.owner_name ?? 'Unassigned',
    calculatorId: 'relationship',
    criterionId: task.source_type,
    title: task.title,
    description: task.description ?? '',
    dueDate: task.due_at,
    status: task.status,
    priority: task.priority,
    workflowLane: task.status === 'blocked' ? 'at_risk' : undefined,
    evidenceNote,
    completedAt: task.completed_at ?? undefined,
    skippedReason: task.skip_reason ?? undefined,
    sourceTimelineEntryId: task.source_record_id ?? undefined,
    createdAt: task.created_at,
  }
}

function mapApiSignal(signal: SignalRead, accounts: Account[]): SignalRecord {
  const account = accounts.find(item => item.id === signal.account_id)
  return {
    id: signal.id,
    accountId: signal.account_id,
    accountName: account?.name ?? 'Account',
    engagementId: signal.engagement_id ?? undefined,
    type: signal.signal_type as SignalRecord['type'],
    severity: signal.severity,
    status: signal.status,
    ownerId: signal.owner_id ?? '',
    ownerName: signal.owner_name ?? 'Unassigned',
    headline: signal.title,
    detail: signal.detail,
    reasonCodes: signal.reason_codes.map(item => item.label || item.code),
    evidence: signal.evidence_json.map(item => String(item.label ?? item.value ?? item.type ?? 'Evidence')),
    sourceRecordRoute: signal.source_record_route ?? '/attention-center',
    createdAt: signal.created_at,
    dueAt: signal.due_at ?? undefined,
    slaAgeDays: signal.due_at ? Math.max(0, Math.floor((Date.now() - new Date(signal.due_at).getTime()) / 86_400_000)) : 0,
    recommendedPlaybook: '',
  }
}

function mapApiTemplate(template: PlaybookTemplate): ScoreActivityTemplate {
  const firstActivity = template.activities_json[0] ?? {}
  return {
    id: template.id,
    calculatorId: 'relationship',
    criterionId: template.slug,
    title: String(firstActivity.title ?? template.name),
    description: String(firstActivity.description ?? template.objective),
    defaultPriority: normalizePriority(firstActivity.priority),
    defaultDueOffsetDays: Number(firstActivity.due_offset_days ?? 7),
  }
}

function normalizePriority(value: unknown): ScoreActivityPriority {
  if (value === 'critical' || value === 'high' || value === 'medium' || value === 'low') return value
  return 'medium'
}

function signalStatusClass(status: SignalRecord['status']) {
  if (status === 'resolved') return 'border-rag-green/20 bg-rag-green/10 text-rag-green'
  if (status === 'dismissed') return 'border-surface-border bg-surface-tertiary text-ink-secondary'
  if (status === 'accepted' || status === 'converted') return 'border-blue-tint-20 bg-blue-tint-20 text-brand-blue'
  return 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange'
}

function signalSeverityClass(severity: SignalRecord['severity']) {
  if (severity === 'critical') return 'border-rag-red/20 bg-rag-red/10 text-rag-red'
  if (severity === 'warning') return 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange'
  return 'border-blue-tint-20 bg-blue-tint-20 text-brand-blue'
}

function statusClass(status: ScoreActivityTask['status']) {
  if (status === 'done') return 'border-rag-green/20 bg-rag-green/10 text-rag-green'
  if (status === 'in_progress') return 'border-blue-tint-20 bg-blue-tint-20 text-brand-blue'
  if (status === 'blocked') return 'border-rag-red/20 bg-rag-red/10 text-rag-red'
  if (status === 'skipped') return 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange'
  return 'border-surface-border bg-surface-tertiary text-ink-secondary'
}

function priorityClass(priority: ScoreActivityTask['priority']) {
  if (priority === 'critical') return 'border-rag-red/20 bg-rag-red/10 text-rag-red'
  if (priority === 'high') return 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange'
  if (priority === 'medium') return 'border-blue-tint-20 bg-blue-tint-20 text-brand-blue'
  return 'border-surface-border bg-surface-tertiary text-ink-secondary'
}
