import * as Dialog from '@radix-ui/react-dialog'
import { CalendarClock, Check, ClipboardCheck, ExternalLink, Filter, Loader2, Pencil, Plus, X } from 'lucide-react'
import { type DragEvent, FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { RuntimeCustomFieldValues, RuntimeCustomFields, customValuesForSubmit, requiredCustomFieldErrors } from '@/components/custom-fields/RuntimeCustomFields'
import { TaskDetailModal } from '@/components/tasks/TaskDetailModal'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { useAuth } from '@/contexts/AuthContext'
import { useCapabilities } from '@/hooks/useCapabilities'
import { useRole } from '@/hooks/useRole'
import { listAccounts } from '@/services/accountWorkspace'
import { listRuntimeCustomFields, RuntimeCustomField } from '@/services/contentGovernance'
import { createTask, listTasks, PlaybookTask, TaskPriority, TaskStatus, updateTask } from '@/services/playbooksTasks'
import type { Account } from '@/types/account'
import { cn } from '@/utils/cn'
import { formatDate } from '@/utils/formatters'

type DueFilter = 'all' | 'overdue' | 'today' | 'next7'

const taskStatusColumns: Array<{ status: TaskStatus; label: string }> = [
  { status: 'open', label: 'Open' },
  { status: 'in_progress', label: 'In progress' },
  { status: 'blocked', label: 'Blocked' },
  { status: 'done', label: 'Done' },
  { status: 'cancelled', label: 'Cancelled' },
]

export function Tasks() {
  const [searchParams] = useSearchParams()
  const { token } = useAuth()
  const user = useRole()
  const { capabilities } = useCapabilities()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountsError, setAccountsError] = useState('')
  const [tasks, setTasks] = useState<PlaybookTask[]>([])
  const [customFields, setCustomFields] = useState<RuntimeCustomField[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '')
  const [accountId, setAccountId] = useState(() => searchParams.get('accountId') ?? searchParams.get('account_id') ?? '')
  const [status, setStatus] = useState(() => searchParams.get('status') ?? '')
  const [priority, setPriority] = useState(() => searchParams.get('priority') ?? '')
  const [sourceType, setSourceType] = useState(() => searchParams.get('sourceType') ?? searchParams.get('source_type') ?? '')
  const [due, setDue] = useState<DueFilter>(() => dueFilterParam(searchParams.get('due')))
  const [total, setTotal] = useState(0)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const readOnly = !capabilities.can_manage_tasks_portfolio && !capabilities.permission_keys.includes('tasks:update_own')

  useEffect(() => {
    setSearch(searchParams.get('search') ?? '')
    setAccountId(searchParams.get('accountId') ?? searchParams.get('account_id') ?? '')
    setStatus(searchParams.get('status') ?? '')
    setPriority(searchParams.get('priority') ?? '')
    setSourceType(searchParams.get('sourceType') ?? searchParams.get('source_type') ?? '')
    setDue(dueFilterParam(searchParams.get('due')))
  }, [searchParams])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    setAccountsError('')
    const params = new URLSearchParams({ page: '1', page_size: '100' })
    if (user.id) params.set('assigned_user_id', user.id)
    listAccounts(token, params)
      .then(response => {
        if (!cancelled) setAccounts(response.items)
      })
      .catch(err => {
        if (!cancelled) setAccountsError(err instanceof Error ? err.message : 'Accounts could not load')
      })
    return () => {
      cancelled = true
    }
  }, [token, user.id])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    setLoading(true)
    setError('')
    const params = new URLSearchParams({ page: '1', page_size: '100', sort: 'due_at', direction: 'asc' })
    if (search) params.set('search', search)
    if (accountId) params.set('account_id', accountId)
    if (status) params.set('status', status)
    if (priority) params.set('priority', priority)
    if (sourceType) params.set('source_type', sourceType)
    const range = dueRange(due)
    if (range.due_from) params.set('due_from', range.due_from)
    if (range.due_to) params.set('due_to', range.due_to)
    listTasks(token, params)
      .then(response => {
        if (cancelled) return
        setTasks(response.items.map(normalizeTaskForWorkspace))
        setTotal(response.total)
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Tasks could not load')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [accountId, due, priority, search, sourceType, status, token])

  useEffect(() => {
    if (!token) return
    listRuntimeCustomFields(token, 'tasks')
      .then(setCustomFields)
      .catch(() => setCustomFields([]))
  }, [token])

  function clearFilters() {
    setSearch('')
    setAccountId('')
    setStatus('')
    setPriority('')
    setSourceType('')
    setDue('all')
  }

  function upsertTask(task: PlaybookTask) {
    setTasks(items => items.map(item => (item.id === task.id ? normalizeTaskForWorkspace(task) : item)))
  }

  function removeTask(taskId: string) {
    setTasks(items => items.filter(item => item.id !== taskId))
    setTotal(value => Math.max(0, value - 1))
  }

  async function moveTask(task: PlaybookTask, nextStatus: TaskStatus, reason: string) {
    if (!token || readOnly) return
    try {
      const patch: { outcome?: string; skipped_reason?: string } = {}
      if (nextStatus === 'cancelled' && !task.skipped_reason) patch.skipped_reason = reason
      if (nextStatus === 'done' && task.requires_evidence && !task.outcome && !task.evidence.length) patch.outcome = reason
      const updated = await updateTask(token, task.id, {
        status: nextStatus,
        status_change_reason: reason,
        ...patch,
      })
      upsertTask(updated)
      toast.success(`Task moved to ${nextStatus.replace('_', ' ')}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Task could not be moved')
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Activity execution"
        title="Tasks"
        description="Owner-backed playbook activities, manual tasks, evidence, due dates, and completion outcomes."
      />

      <section className="tk-card relative mt-5 p-4 pt-9">
        <button type="button" className="absolute right-4 top-3 inline-flex h-7 items-center gap-1 rounded-md border border-surface-border bg-white px-2 text-xs font-semibold text-ink-secondary transition hover:border-brand-blue/40 hover:bg-blue-tint-20 hover:text-brand-blue" onClick={clearFilters}>
          <Filter className="h-3.5 w-3.5" />
          Clear filters
        </button>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          <label className="space-y-1 xl:col-span-2">
            <span className="tk-label text-xs">Search</span>
            <input className="tk-input" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search title, notes, evidence, owner" />
          </label>
          <label className="space-y-1">
            <span className="tk-label text-xs">Account</span>
            <select className="tk-input" value={accountId} onChange={event => setAccountId(event.target.value)}>
              <option value="">All accounts</option>
              {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
            {accountsError ? <p className="text-xs font-semibold text-rag-red">{accountsError}</p> : null}
          </label>
          <label className="space-y-1">
            <span className="tk-label text-xs">Status</span>
            <select className="tk-input" value={status} onChange={event => setStatus(event.target.value)}>
              <option value="">Any status</option>
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="blocked">Blocked</option>
              <option value="done">Done</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="tk-label text-xs">Priority</span>
            <select className="tk-input" value={priority} onChange={event => setPriority(event.target.value)}>
              <option value="">Any priority</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="tk-label text-xs">Due</span>
            <select className="tk-input" value={due} onChange={event => setDue(event.target.value as DueFilter)}>
              <option value="all">Any date</option>
              <option value="overdue">Overdue</option>
              <option value="today">Today</option>
              <option value="next7">Next 7 days</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="tk-label text-xs">Source</span>
            <select className="tk-input" value={sourceType} onChange={event => setSourceType(event.target.value)}>
              <option value="">Any source</option>
              <option value="playbook">Playbook</option>
              <option value="manual">Manual</option>
              <option value="governance_event">Governance event</option>
              <option value="governance_action_item">Governance action</option>
              <option value="opportunity_action_item">Opportunity action</option>
              <option value="renewal">Renewal</option>
            </select>
          </label>
        </div>
      </section>

      <section className="mt-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Task board</p>
            <h2 className="text-base font-semibold text-ink">{total} matching tasks</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <CreateTaskDialog token={token} accounts={accounts} currentUserId={user.id} readOnly={readOnly} customFields={customFields} onCreated={task => setTasks(items => [normalizeTaskForWorkspace(task), ...items])} />
          </div>
        </div>

        {loading ? (
          <LoadingBlock />
        ) : error ? (
          <div className="rounded-lg border border-rag-red/20 bg-rag-red/10 p-4 text-sm font-semibold text-rag-red">{error}</div>
        ) : tasks.length === 0 ? (
          <div className="tk-card">
            <EmptyState icon={ClipboardCheck} heading="No tasks match these filters" body="Clear filters or create a task for the selected account." action={{ label: 'Clear filters', onClick: clearFilters }} />
          </div>
        ) : (
          <TaskKanbanBoard tasks={tasks} customFields={customFields} readOnly={readOnly} onMove={moveTask} onOpenTask={setSelectedTaskId} />
        )}
      </section>

      <TaskDetailModal
        taskId={selectedTaskId}
        open={Boolean(selectedTaskId)}
        readOnly={readOnly}
        onOpenChange={open => {
          if (!open) setSelectedTaskId(null)
        }}
        onTaskUpdated={upsertTask}
        onTaskDeleted={removeTask}
      />
    </div>
  )
}

function TaskKanbanBoard({ tasks, customFields, readOnly, onMove, onOpenTask }: { tasks: PlaybookTask[]; customFields: RuntimeCustomField[]; readOnly: boolean; onMove: (task: PlaybookTask, status: TaskStatus, reason: string) => Promise<void>; onOpenTask: (taskId: string) => void }) {
  const [draggingTaskId, setDraggingTaskId] = useState('')
  const [dropStatus, setDropStatus] = useState<TaskStatus | ''>('')
  const [pendingMove, setPendingMove] = useState<{ task: PlaybookTask; status: TaskStatus } | null>(null)
  const [moveReason, setMoveReason] = useState('')
  const [moving, setMoving] = useState(false)
  const grouped = useMemo(() => {
    return taskStatusColumns.map(column => ({
      ...column,
      tasks: tasks.filter(task => task.status === column.status),
    }))
  }, [tasks])

  function dropTask(event: DragEvent<HTMLElement>, status: TaskStatus) {
    event.preventDefault()
    setDropStatus('')
    if (readOnly) return
    const taskId = event.dataTransfer.getData('text/task-id') || draggingTaskId
    const task = tasks.find(item => item.id === taskId)
    if (!task || task.status === status) return
    setPendingMove({ task, status })
    setMoveReason('')
  }

  async function confirmMove(event: FormEvent) {
    event.preventDefault()
    if (!pendingMove) return
    const reason = moveReason.trim()
    if (!reason) {
      toast.error('Enter a reason before moving the task')
      return
    }
    setMoving(true)
    try {
      await onMove(pendingMove.task, pendingMove.status, reason)
      setPendingMove(null)
      setMoveReason('')
    } finally {
      setMoving(false)
    }
  }

  return (
    <>
      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[1120px] grid-cols-5 gap-3 xl:min-w-0">
          {grouped.map(column => (
            <section
              key={column.status}
              className={cn('flex min-h-[420px] flex-col rounded-lg border border-surface-border bg-surface-secondary transition-[border-color,box-shadow,background-color]', dropStatus === column.status ? 'border-brand-blue/60 bg-blue-tint-20/30 shadow-md' : '')}
              onDragOver={event => {
                if (readOnly) return
                event.preventDefault()
                setDropStatus(column.status)
              }}
              onDragLeave={() => setDropStatus(current => (current === column.status ? '' : current))}
              onDrop={event => dropTask(event, column.status)}
            >
              <div className="flex min-h-[58px] items-center justify-between border-b border-surface-border px-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-ink">{column.label}</h3>
                  <p className="text-xs font-medium text-ink-secondary">{column.tasks.length} task{column.tasks.length === 1 ? '' : 's'}</p>
                </div>
                <span className={cn('inline-flex rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-normal', statusClass(column.status))}>{column.status.replace('_', ' ')}</span>
              </div>
              <div className="grid flex-1 content-start gap-3 p-3">
                {column.tasks.length ? column.tasks.map(task => (
                  <TaskKanbanCard key={task.id} task={task} customFields={customFields} readOnly={readOnly} onOpenTask={onOpenTask} onDragStart={taskId => setDraggingTaskId(taskId)} onDragEnd={() => { setDraggingTaskId(''); setDropStatus('') }} />
                )) : (
                  <div className="rounded-md border border-dashed border-surface-border bg-white/60 p-4 text-center text-xs font-medium text-ink-secondary">
                    No tasks
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>

      <Dialog.Root open={Boolean(pendingMove)} onOpenChange={open => { if (!open && !moving) setPendingMove(null) }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(520px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-surface-border bg-white shadow-panel">
            <form onSubmit={confirmMove}>
              <div className="flex items-start justify-between gap-4 border-b border-surface-border p-5">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Task movement</p>
                  <Dialog.Title className="font-display text-2xl font-bold text-ink">Reason required</Dialog.Title>
                </div>
                <Dialog.Close className="tk-icon-button" aria-label="Close move reason form" disabled={moving}><X className="h-5 w-5" /></Dialog.Close>
              </div>
              <div className="grid gap-3 p-5">
                <p className="text-sm leading-6 text-ink-secondary">
                  Move <span className="font-semibold text-ink">{pendingMove?.task.title}</span> to <span className="font-semibold text-ink">{pendingMove?.status.replace('_', ' ')}</span>.
                </p>
                <label className="space-y-1">
                  <span className="tk-label text-xs">Reason *</span>
                  <textarea className="tk-input min-h-[120px]" value={moveReason} onChange={event => setMoveReason(event.target.value)} placeholder="Why is this task moving?" autoFocus />
                </label>
              </div>
              <div className="flex justify-end gap-2 border-t border-surface-border p-5">
                <Dialog.Close type="button" className="tk-button-secondary" disabled={moving}>Cancel</Dialog.Close>
                <button type="submit" className="tk-button-primary" disabled={moving || !moveReason.trim()}>
                  {moving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Move task
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}

function TaskKanbanCard({ task, customFields, readOnly, onOpenTask, onDragStart, onDragEnd }: { task: PlaybookTask; customFields: RuntimeCustomField[]; readOnly: boolean; onOpenTask: (taskId: string) => void; onDragStart: (taskId: string) => void; onDragEnd: () => void }) {
  const overdue = new Date(task.due_at) < new Date() && !['done', 'cancelled'].includes(task.status)

  return (
    <article
      className={cn('group relative cursor-pointer rounded-md border border-surface-border bg-white p-3 shadow-card transition hover:border-brand-blue/40 hover:shadow-md', readOnly ? '' : 'active:cursor-grabbing')}
      draggable={!readOnly}
      role="button"
      tabIndex={0}
      onClick={() => onOpenTask(task.id)}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpenTask(task.id)
        }
      }}
      onDragStart={event => {
        event.dataTransfer.setData('text/task-id', task.id)
        event.dataTransfer.effectAllowed = 'move'
        onDragStart(task.id)
      }}
      onDragEnd={onDragEnd}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-nowrap items-center gap-1 pr-16">
          <span className={cn('inline-flex shrink-0 rounded-full border px-1 py-0.5 text-[8px] font-semibold uppercase tracking-normal', priorityClass(task.priority))}>{task.priority}</span>
          {overdue ? <span className="inline-flex shrink-0 rounded-full border border-rag-red/20 bg-rag-red/10 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-normal text-rag-red">Overdue</span> : null}
        </div>
        <div className="absolute right-2 top-2 flex items-center gap-1">
          <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-surface-border bg-white text-ink-secondary transition hover:border-brand-blue/40 hover:bg-blue-tint-20 hover:text-brand-blue" onClick={event => { event.stopPropagation(); onOpenTask(task.id) }} aria-label="Edit task">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <Link className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-surface-border bg-white text-ink-secondary transition hover:border-brand-blue/40 hover:bg-blue-tint-20 hover:text-brand-blue" to={`/accounts/${task.account_id}`} onClick={event => event.stopPropagation()} aria-label="Open account">
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
      <h3 className="mt-3 line-clamp-2 text-sm font-semibold text-ink">{task.title}</h3>
      <p className="mt-2 line-clamp-3 text-xs leading-5 text-ink-secondary">{task.description || 'No task description recorded.'}</p>
      <div className="mt-3 grid gap-2 text-xs font-medium text-ink-secondary">
        <span className="truncate">{task.owner_name}</span>
        <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5 text-brand-orange" />{formatDate(task.due_at)}</span>
        <span className={cn('w-fit rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-normal', sourceClass(task.source_type))}>{sourceLabel(task.source_type)}</span>
      </div>
      <RuntimeCustomFieldValues fields={customFields} values={task.custom_field_values} variant="badges" className="mt-3" />
    </article>
  )
}

function CreateTaskDialog({ token, accounts, currentUserId, readOnly, customFields, onCreated }: { token: string | null; accounts: Account[]; currentUserId: string; readOnly: boolean; customFields: RuntimeCustomField[]; onCreated: (task: PlaybookTask) => void }) {
  const [open, setOpen] = useState(false)
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({})
  const [customErrors, setCustomErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(() => ({
    account_id: '',
    owner_id: currentUserId,
    title: '',
    description: '',
    due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    priority: 'medium' as TaskPriority,
    status: 'open' as TaskStatus,
    notes: '',
  }))

  function openTaskDialog(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) return
    setForm({
      account_id: '',
      owner_id: currentUserId,
      title: '',
      description: '',
      due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      priority: 'medium',
      status: 'open',
      notes: '',
    })
    setCustomValues({})
    setCustomErrors({})
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!token || readOnly) return
    if (!form.account_id) {
      toast.error('Select an account before creating a task')
      return
    }
    const errors = requiredCustomFieldErrors(customFields, customValues)
    setCustomErrors(errors)
    if (Object.keys(errors).length) return
    setSaving(true)
    try {
      const created = await createTask(token, {
        ...form,
        due_at: new Date(`${form.due_at}T12:00:00`).toISOString(),
        source_type: 'manual',
        custom_field_values: customValuesForSubmit(customFields, customValues),
      })
      onCreated(created)
      setOpen(false)
      toast.success('Task created')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Task could not be created')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={openTaskDialog}>
      <Dialog.Trigger asChild>
        <button type="button" className="tk-button-primary" disabled={readOnly}>
          <Plus className="h-4 w-4" />
          Add task
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(780px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-surface-border bg-white shadow-panel">
          <form onSubmit={submit}>
            <div className="flex items-start justify-between gap-4 border-b border-surface-border p-5">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Manual task</p>
                <Dialog.Title className="font-display text-2xl font-bold text-ink">Create task</Dialog.Title>
              </div>
              <Dialog.Close className="tk-icon-button" aria-label="Close task form"><X className="h-5 w-5" /></Dialog.Close>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <label className="space-y-1">
                <span className="tk-label text-xs">Account *</span>
                <select className="tk-input" value={form.account_id} onChange={event => setForm(current => ({ ...current, account_id: event.target.value }))} required>
                  <option value="" disabled>Select account</option>
                  {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </label>
              <label className="space-y-1">
                <span className="tk-label text-xs">Due date *</span>
                <input type="date" className="tk-input" value={form.due_at} onChange={event => setForm(current => ({ ...current, due_at: event.target.value }))} />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="tk-label text-xs">Title *</span>
                <input className="tk-input" value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="tk-label text-xs">Description</span>
                <textarea className="tk-input min-h-[80px]" value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} />
              </label>
              <label className="space-y-1">
                <span className="tk-label text-xs">Priority</span>
                <select className="tk-input" value={form.priority} onChange={event => setForm(current => ({ ...current, priority: event.target.value as TaskPriority }))}>
                  <option value="critical">Critical</option>
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="tk-label text-xs">Notes</span>
                <input className="tk-input" value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} />
              </label>
              <div className="md:col-span-2">
                <RuntimeCustomFields fields={customFields} values={customValues} errors={customErrors} onChange={(fieldKey, value) => setCustomValues(values => ({ ...values, [fieldKey]: value }))} />
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-surface-border p-5">
              <Dialog.Close type="button" className="tk-button-secondary">Cancel</Dialog.Close>
              <button type="submit" className="tk-button-primary" disabled={saving || !form.account_id || !form.title || !form.due_at}>
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

function LoadingBlock() {
  return (
    <div className="flex min-h-[260px] items-center justify-center text-sm font-semibold text-ink-secondary">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Loading tasks
    </div>
  )
}

function dueRange(due: DueFilter) {
  const now = new Date()
  if (due === 'overdue') return { due_to: now.toISOString() }
  if (due === 'today') {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    const end = new Date(now)
    end.setHours(23, 59, 59, 999)
    return { due_from: start.toISOString(), due_to: end.toISOString() }
  }
  if (due === 'next7') return { due_from: now.toISOString(), due_to: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000).toISOString() }
  return {}
}

function dueFilterParam(value: string | null): DueFilter {
  return value === 'overdue' || value === 'today' || value === 'next7' ? value : 'all'
}

function normalizeTaskForWorkspace(task: PlaybookTask): PlaybookTask {
  return { ...task, status: normalizeTaskStatus(task.status) }
}

function normalizeTaskStatus(status: TaskStatus): TaskStatus {
  if (status === 'todo') return 'open'
  if (status === 'skipped') return 'cancelled'
  return status
}

function statusClass(status: TaskStatus) {
  if (status === 'done') return 'border-rag-green/20 bg-rag-green/10 text-rag-green'
  if (status === 'in_progress') return 'border-blue-tint-20 bg-blue-tint-20 text-brand-blue'
  if (status === 'blocked') return 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange'
  if (status === 'cancelled') return 'border-surface-border bg-surface-tertiary text-ink-secondary'
  return 'border-surface-border bg-surface-tertiary text-ink-secondary'
}

function priorityClass(priority: TaskPriority) {
  if (priority === 'critical') return 'border-rag-red/20 bg-rag-red/10 text-rag-red'
  if (priority === 'urgent' || priority === 'high') return 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange'
  if (priority === 'medium') return 'border-blue-tint-20 bg-blue-tint-20 text-brand-blue'
  return 'border-surface-border bg-surface-tertiary text-ink-secondary'
}

function sourceLabel(sourceType: string) {
  const labels: Record<string, string> = {
    manual: 'Manual',
    playbook: 'Playbook',
    signal: 'Signal',
    governance_event: 'Governance event',
    governance_action_item: 'Governance action',
    opportunity_action_item: 'Opportunity action',
    renewal: 'Renewal',
    retention_recommendation: 'Retention recommendation',
  }
  return labels[sourceType] ?? sourceType.replace(/_/g, ' ')
}

function sourceClass(sourceType: string) {
  if (sourceType === 'opportunity_action_item') return 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange'
  if (sourceType === 'governance_action_item' || sourceType === 'governance_event') return 'border-rag-green/20 bg-rag-green/10 text-rag-green'
  if (sourceType === 'manual') return 'border-surface-border bg-surface-tertiary text-ink-secondary'
  return 'border-blue-tint-20 bg-blue-tint-20 text-brand-blue'
}
