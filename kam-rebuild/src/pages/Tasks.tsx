import { addDays, isAfter, isBefore, isSameDay } from 'date-fns'
import { CalendarClock, CheckCircle2, ClipboardCheck, ExternalLink, Filter, Play, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { useRole } from '@/hooks/useRole'
import { useScoreActivityStore } from '@/stores/scoreActivityStore'
import { ScoreActivityTask, ScoreCalculatorId } from '@/types/scoreActivity'
import { cn } from '@/utils/cn'
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

export function Tasks() {
  const user = useRole()
  const tasks = useScoreActivityStore(state => state.tasks)
  const updateTask = useScoreActivityStore(state => state.updateTask)
  const [accountId, setAccountId] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [calculator, setCalculator] = useState('')
  const [status, setStatus] = useState('')
  const [due, setDue] = useState<DueFilter>('all')
  const [priority, setPriority] = useState('')

  const accounts = useMemo(
    () => Array.from(new Map(tasks.map(task => [task.accountId, task.accountName])).entries()),
    [tasks],
  )
  const owners = useMemo(
    () => Array.from(new Map(tasks.map(task => [task.ownerId, task.ownerName])).entries()),
    [tasks],
  )
  const filtered = useMemo(
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
  const openTasks = tasks.filter(task => task.status !== 'done' && task.status !== 'skipped').length
  const dueSoon = tasks.filter(task => matchesDueFilter(task, 'next7') && task.status !== 'done' && task.status !== 'skipped').length
  const completed = tasks.filter(task => task.status === 'done').length
  const skipped = tasks.filter(task => task.status === 'skipped').length

  function clearFilters() {
    setAccountId('')
    setOwnerId('')
    setCalculator('')
    setStatus('')
    setDue('all')
    setPriority('')
  }

  function updateEvidence(taskId: string, evidenceNote: string) {
    updateTask(taskId, { evidenceNote })
  }

  function startTask(task: ScoreActivityTask) {
    updateTask(task.id, { status: 'in_progress' })
    toast.success('Task moved to in progress')
  }

  function completeTask(task: ScoreActivityTask) {
    const evidenceNote = task.evidenceNote?.trim() || `Evidence captured for ${task.title}.`
    const completedAt = new Date().toISOString()
    const entry = emitScoreActivityCompletion(task, user, evidenceNote)
    updateTask(task.id, {
      status: 'done',
      evidenceNote,
      completedAt,
      skippedReason: undefined,
      sourceTimelineEntryId: entry.id,
    })
    toast.success('Task completed and recorded in timeline')
  }

  function skipTask(task: ScoreActivityTask) {
    updateTask(task.id, {
      status: 'skipped',
      skippedReason: task.evidenceNote?.trim() || task.skippedReason || 'Skipped from task review.',
    })
    toast.success('Task skipped with reason retained')
  }

  return (
    <div>
      <PageHeader
        eyebrow="Score-linked work"
        title="Tasks"
        description="Evidence-first activities tied to calculator criteria across every account."
        actions={
          <button className="tk-button-secondary" onClick={clearFilters}>
            <Filter className="h-4 w-4" />
            Clear filters
          </button>
        }
      />

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
            <span className="tk-label text-xs">Status</span>
            <select className="tk-input" value={status} onChange={event => setStatus(event.target.value)}>
              <option value="">Any status</option>
              <option value="todo">Todo</option>
              <option value="in_progress">In progress</option>
              <option value="done">Done</option>
              <option value="skipped">Skipped</option>
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
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
        </div>
      </section>

      <section className="mt-5 space-y-3">
        {filtered.length ? filtered.map(task => (
          <TaskRow
            key={task.id}
            task={task}
            onEvidenceChange={updateEvidence}
            onStart={startTask}
            onComplete={completeTask}
            onSkip={skipTask}
          />
        )) : (
          <div className="tk-card">
            <EmptyState icon={ClipboardCheck} heading="No tasks match these filters" body="Clear filters or select a broader account, status, or due date window." action={{ label: 'Clear filters', onClick: clearFilters }} />
          </div>
        )}
      </section>
    </div>
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
          <Link className="tk-button-secondary" to={`/accounts/${task.accountId}?tab=health`}>
            <ExternalLink className="h-4 w-4" />
            Health tab
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

function matchesDueFilter(task: ScoreActivityTask, due: DueFilter) {
  const taskDate = new Date(task.dueDate)
  const now = new Date()
  if (due === 'overdue') return isBefore(taskDate, now) && task.status !== 'done' && task.status !== 'skipped'
  if (due === 'today') return isSameDay(taskDate, now)
  if (due === 'next7') return isAfter(taskDate, now) && isBefore(taskDate, addDays(now, 8))
  return true
}

function statusClass(status: ScoreActivityTask['status']) {
  if (status === 'done') return 'border-rag-green/20 bg-rag-green/10 text-rag-green'
  if (status === 'in_progress') return 'border-blue-tint-20 bg-blue-tint-20 text-brand-blue'
  if (status === 'skipped') return 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange'
  return 'border-surface-border bg-surface-tertiary text-ink-secondary'
}

function priorityClass(priority: ScoreActivityTask['priority']) {
  if (priority === 'high') return 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange'
  if (priority === 'medium') return 'border-blue-tint-20 bg-blue-tint-20 text-brand-blue'
  return 'border-surface-border bg-surface-tertiary text-ink-secondary'
}
