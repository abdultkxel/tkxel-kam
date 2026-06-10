import * as Dialog from '@radix-ui/react-dialog'
import { CalendarClock, Check, CheckCircle2, ClipboardCheck, ExternalLink, FileUp, Filter, LayoutGrid, Link as LinkIcon, List, Loader2, Plus, Save, X, XCircle } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { RuntimeCustomFields, customValuesForSubmit, requiredCustomFieldErrors } from '@/components/custom-fields/RuntimeCustomFields'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { useAuth } from '@/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'
import { listRuntimeCustomFields, RuntimeCustomField } from '@/services/contentGovernance'
import { addTaskEvidence, createTask, listTasks, PlaybookTask, TaskPriority, TaskStatus, updateTask } from '@/services/playbooksTasks'
import { useAccountStore } from '@/stores/accountStore'
import { cn } from '@/utils/cn'
import { formatDate, formatRelative } from '@/utils/formatters'

type DueFilter = 'all' | 'overdue' | 'today' | 'next7'
type TaskViewMode = 'kanban' | 'list'

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
  const accounts = useAccountStore(state => state.accounts)
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
  const [myItems, setMyItems] = useState(() => boolParam(searchParams.get('myItems') ?? searchParams.get('my_items')))
  const [sort, setSort] = useState<'due_at' | 'priority' | 'status' | 'updated_at'>('due_at')
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc')
  const [viewMode, setViewMode] = useState<TaskViewMode>(() => viewModeParam(searchParams.get('view')))
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const readOnly = user.role === 'leadership_viewer'
  const pageSize = 10

  useEffect(() => {
    setSearch(searchParams.get('search') ?? '')
    setAccountId(searchParams.get('accountId') ?? searchParams.get('account_id') ?? '')
    setStatus(searchParams.get('status') ?? '')
    setPriority(searchParams.get('priority') ?? '')
    setSourceType(searchParams.get('sourceType') ?? searchParams.get('source_type') ?? '')
    setDue(dueFilterParam(searchParams.get('due')))
    setMyItems(boolParam(searchParams.get('myItems') ?? searchParams.get('my_items')))
    setViewMode(viewModeParam(searchParams.get('view')))
    setPage(positivePage(searchParams.get('page')))
  }, [searchParams])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    setLoading(true)
    setError('')
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize), sort, direction })
    if (search) params.set('search', search)
    if (accountId) params.set('account_id', accountId)
    if (status) params.set('status', status)
    if (priority) params.set('priority', priority)
    if (sourceType) params.set('source_type', sourceType)
    if (myItems) params.set('my_items', 'true')
    const range = dueRange(due)
    if (range.due_from) params.set('due_from', range.due_from)
    if (range.due_to) params.set('due_to', range.due_to)
    listTasks(token, params)
      .then(response => {
        if (cancelled) return
        setTasks(response.items)
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
  }, [accountId, direction, due, myItems, page, priority, search, sort, sourceType, status, token])

  useEffect(() => {
    if (!token) return
    listRuntimeCustomFields(token, 'playbooks_tasks_calendar')
      .then(setCustomFields)
      .catch(() => setCustomFields([]))
  }, [token])

  const metrics = useMemo(() => {
    const open = tasks.filter(task => !['done', 'cancelled'].includes(task.status)).length
    const done = tasks.filter(task => task.status === 'done').length
    const blocked = tasks.filter(task => task.status === 'blocked').length
    const evidence = tasks.reduce((sum, task) => sum + task.evidence.length, 0)
    return { open, done, blocked, evidence }
  }, [tasks])

  function clearFilters() {
    setSearch('')
    setAccountId('')
    setStatus('')
    setPriority('')
    setSourceType('')
    setDue('all')
    setMyItems(false)
    setPage(1)
  }

  function upsertTask(task: PlaybookTask) {
    setTasks(items => items.map(item => (item.id === task.id ? task : item)))
  }

  async function changeStatus(task: PlaybookTask, nextStatus: TaskStatus, patch: Partial<PlaybookTask> = {}) {
    if (!token || readOnly) return
    try {
      const updated = await updateTask(token, task.id, {
        status: nextStatus,
        ...patch,
      })
      upsertTask(updated)
      toast.success(`Task marked ${nextStatus.replace('_', ' ')}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Task could not be updated')
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Activity execution"
        title="Tasks"
        description="Owner-backed playbook activities, manual tasks, evidence, due dates, and completion outcomes."
        actions={
          <>
            <button className="tk-button-secondary" onClick={clearFilters}>
              <Filter className="h-4 w-4" />
              Clear filters
            </button>
            <CreateTaskDialog token={token} accounts={accounts} currentUserId={user.id} readOnly={readOnly} customFields={customFields} onCreated={task => setTasks(items => [task, ...items])} />
          </>
        }
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <TaskMetric label="Open" value={metrics.open} tone="default" />
        <TaskMetric label="Completed" value={metrics.done} tone="success" />
        <TaskMetric label="Blocked" value={metrics.blocked} tone="warning" />
        <TaskMetric label="Evidence" value={metrics.evidence} tone="muted" />
      </div>

      <section className="tk-card mt-5 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          <label className="space-y-1 xl:col-span-2">
            <span className="tk-label text-xs">Search</span>
            <input className="tk-input" value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} placeholder="Search title, notes, evidence, owner" />
          </label>
          <label className="space-y-1">
            <span className="tk-label text-xs">Account</span>
            <select className="tk-input" value={accountId} onChange={event => { setAccountId(event.target.value); setPage(1) }}>
              <option value="">All accounts</option>
              {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="tk-label text-xs">Status</span>
            <select className="tk-input" value={status} onChange={event => { setStatus(event.target.value); setPage(1) }}>
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
            <select className="tk-input" value={priority} onChange={event => { setPriority(event.target.value); setPage(1) }}>
              <option value="">Any priority</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="tk-label text-xs">Due</span>
            <select className="tk-input" value={due} onChange={event => { setDue(event.target.value as DueFilter); setPage(1) }}>
              <option value="all">Any date</option>
              <option value="overdue">Overdue</option>
              <option value="today">Today</option>
              <option value="next7">Next 7 days</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="tk-label text-xs">Source</span>
            <select className="tk-input" value={sourceType} onChange={event => { setSourceType(event.target.value); setPage(1) }}>
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
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <label className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-surface-border bg-white px-3 text-sm font-semibold text-ink">
            <input type="checkbox" checked={myItems} onChange={event => { setMyItems(event.target.checked); setPage(1) }} className="peer sr-only" />
            <span className="flex h-5 w-5 items-center justify-center rounded-sm border border-surface-border bg-white text-white peer-checked:border-brand-blue peer-checked:bg-brand-blue">
              <Check className="h-3 w-3" />
            </span>
            My items
          </label>
          <div className="flex flex-wrap gap-2">
            <select className="tk-input w-auto" value={sort} onChange={event => setSort(event.target.value as typeof sort)} aria-label="Task sort">
              <option value="due_at">Due date</option>
              <option value="priority">Priority</option>
              <option value="status">Status</option>
              <option value="updated_at">Updated</option>
            </select>
            <select className="tk-input w-auto" value={direction} onChange={event => setDirection(event.target.value as typeof direction)} aria-label="Task sort direction">
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>
        </div>
      </section>

      <section className="mt-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">{viewMode === 'kanban' ? 'Task board' : 'Task list'}</p>
            <h2 className="text-base font-semibold text-ink">{total} matching tasks</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="inline-flex min-h-[44px] overflow-hidden rounded-md border border-surface-border bg-white p-1" aria-label="Task view mode">
              <button
                type="button"
                className={cn('inline-flex min-w-[112px] items-center justify-center gap-2 rounded px-3 text-sm font-semibold transition', viewMode === 'kanban' ? 'bg-brand-blue text-white shadow-sm' : 'text-ink-secondary hover:bg-surface-secondary hover:text-ink')}
                aria-pressed={viewMode === 'kanban'}
                onClick={() => setViewMode('kanban')}
              >
                <LayoutGrid className="h-4 w-4" />
                Kanban
              </button>
              <button
                type="button"
                className={cn('inline-flex min-w-[96px] items-center justify-center gap-2 rounded px-3 text-sm font-semibold transition', viewMode === 'list' ? 'bg-brand-blue text-white shadow-sm' : 'text-ink-secondary hover:bg-surface-secondary hover:text-ink')}
                aria-pressed={viewMode === 'list'}
                onClick={() => setViewMode('list')}
              >
                <List className="h-4 w-4" />
                List
              </button>
            </div>
            <button className="tk-button-secondary" disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</button>
            <button className="tk-button-secondary" disabled={page * pageSize >= total} onClick={() => setPage(value => value + 1)}>Next</button>
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
          viewMode === 'kanban' ? (
            <TaskKanbanBoard tasks={tasks} readOnly={readOnly} onStatus={changeStatus} />
          ) : (
            <div className="grid gap-4">
              {tasks.map(task => (
                <TaskCard key={task.id} task={task} token={token} readOnly={readOnly} onStatus={changeStatus} onUpdated={upsertTask} />
              ))}
            </div>
          )
        )}
      </section>
    </div>
  )
}

function TaskKanbanBoard({ tasks, readOnly, onStatus }: { tasks: PlaybookTask[]; readOnly: boolean; onStatus: (task: PlaybookTask, status: TaskStatus, patch?: Partial<PlaybookTask>) => Promise<void> }) {
  const grouped = useMemo(() => {
    return taskStatusColumns.map(column => ({
      ...column,
      tasks: tasks.filter(task => task.status === column.status),
    }))
  }, [tasks])

  return (
    <div className="overflow-x-auto pb-2">
      <div className="grid min-w-[1120px] grid-cols-5 gap-3 xl:min-w-0">
        {grouped.map(column => (
          <section key={column.status} className="flex min-h-[420px] flex-col rounded-lg border border-surface-border bg-surface-secondary">
            <div className="flex min-h-[58px] items-center justify-between border-b border-surface-border px-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-ink">{column.label}</h3>
                <p className="text-xs font-medium text-ink-secondary">{column.tasks.length} task{column.tasks.length === 1 ? '' : 's'}</p>
              </div>
              <span className={cn('inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-wider', statusClass(column.status))}>{column.status.replace('_', ' ')}</span>
            </div>
            <div className="grid flex-1 content-start gap-3 p-3">
              {column.tasks.length ? column.tasks.map(task => (
                <TaskKanbanCard key={task.id} task={task} readOnly={readOnly} onStatus={onStatus} />
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
  )
}

function TaskKanbanCard({ task, readOnly, onStatus }: { task: PlaybookTask; readOnly: boolean; onStatus: (task: PlaybookTask, status: TaskStatus, patch?: Partial<PlaybookTask>) => Promise<void> }) {
  const locked = readOnly || ['done', 'cancelled'].includes(task.status)
  const overdue = new Date(task.due_at) < new Date() && !['done', 'cancelled'].includes(task.status)

  return (
    <article className="rounded-md border border-surface-border bg-white p-3 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-wider', priorityClass(task.priority))}>{task.priority}</span>
        {overdue ? <span className="inline-flex rounded-full border border-rag-red/20 bg-rag-red/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-rag-red">Overdue</span> : null}
      </div>
      <h3 className="mt-3 line-clamp-2 text-sm font-semibold text-ink">{task.title}</h3>
      <p className="mt-2 line-clamp-3 text-xs leading-5 text-ink-secondary">{task.description || 'No task description recorded.'}</p>
      <div className="mt-3 grid gap-2 text-xs font-medium text-ink-secondary">
        <span className="truncate">{task.owner_name}</span>
        <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5 text-brand-orange" />{formatDate(task.due_at)}</span>
        <span className={cn('w-fit rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-wider', sourceClass(task.source_type))}>{sourceLabel(task.source_type)}</span>
      </div>
      <div className="mt-4 grid gap-2">
        <Link className="tk-button-secondary justify-center px-3 py-2 text-xs" to={`/accounts/${task.account_id}`}>
          <ExternalLink className="h-3.5 w-3.5" />
          Open account
        </Link>
        {task.status === 'open' ? (
          <button type="button" className="tk-button-secondary justify-center px-3 py-2 text-xs" onClick={() => onStatus(task, 'in_progress')} disabled={readOnly}>
            <ClipboardCheck className="h-3.5 w-3.5" />
            Start
          </button>
        ) : null}
        {!['done', 'cancelled'].includes(task.status) ? (
          <div className="grid grid-cols-2 gap-2">
            {task.status !== 'blocked' ? (
              <button type="button" className="tk-button-secondary justify-center px-3 py-2 text-xs text-brand-orange" onClick={() => onStatus(task, 'blocked')} disabled={readOnly}>
                Block
              </button>
            ) : (
              <button type="button" className="tk-button-secondary justify-center px-3 py-2 text-xs" onClick={() => onStatus(task, 'in_progress')} disabled={readOnly}>
                Resume
              </button>
            )}
            <button type="button" className="tk-button-primary justify-center px-3 py-2 text-xs" onClick={() => onStatus(task, 'done', { outcome: task.outcome || 'Completed from task board.' })} disabled={locked}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              Done
            </button>
          </div>
        ) : null}
      </div>
    </article>
  )
}

function TaskCard({ task, token, readOnly, onStatus, onUpdated }: { task: PlaybookTask; token: string | null; readOnly: boolean; onStatus: (task: PlaybookTask, status: TaskStatus, patch?: Partial<PlaybookTask>) => Promise<void>; onUpdated: (task: PlaybookTask) => void }) {
  const [notes, setNotes] = useState(task.notes ?? '')
  const [outcome, setOutcome] = useState(task.outcome ?? '')
  const locked = readOnly || ['done', 'cancelled'].includes(task.status)
  const overdue = new Date(task.due_at) < new Date() && !['done', 'cancelled'].includes(task.status)

  async function saveNotes() {
    if (!token || readOnly) return
    try {
      onUpdated(await updateTask(token, task.id, { notes, outcome }))
      toast.success('Task notes saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Task notes could not be saved')
    }
  }

  return (
    <article className="tk-card p-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-wider', statusClass(task.status))}>{task.status.replace('_', ' ')}</span>
            <span className={cn('inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-wider', priorityClass(task.priority))}>{task.priority}</span>
            <span className={cn('inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-wider', sourceClass(task.source_type))}>{sourceLabel(task.source_type)}</span>
            {overdue ? <span className="inline-flex rounded-full border border-rag-red/20 bg-rag-red/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-rag-red">Overdue</span> : null}
          </div>
          <h2 className="mt-3 text-base font-semibold text-ink">{task.title}</h2>
          <p className="mt-1 text-sm leading-6 text-ink-secondary">{task.description || 'No task description recorded.'}</p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-ink-secondary">
            <span>{task.owner_name}</span>
            <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5 text-brand-orange" />{formatDate(task.due_at)}</span>
            {task.completed_at ? <span>Completed {formatRelative(task.completed_at)}</span> : null}
            {task.success_criteria.length ? <span>{task.success_criteria.length} success criteria</span> : null}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-semibold text-ink-secondary">Notes</span>
              <textarea className="tk-input min-h-[92px]" value={notes} onChange={event => setNotes(event.target.value)} disabled={locked} placeholder="Add working notes" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold text-ink-secondary">Outcome</span>
              <textarea className="tk-input min-h-[92px]" value={outcome} onChange={event => setOutcome(event.target.value)} disabled={readOnly} placeholder="Capture completion outcome" />
            </label>
          </div>
          <EvidenceList task={task} token={token} readOnly={readOnly} onEvidenceAdded={() => undefined} />
        </div>
        <div className="flex flex-col gap-2 xl:items-stretch">
          <Link className="tk-button-secondary" to={`/accounts/${task.account_id}`}>
            <ExternalLink className="h-4 w-4" />
            Open account
          </Link>
          <button className="tk-button-secondary" onClick={saveNotes} disabled={readOnly || (notes === (task.notes ?? '') && outcome === (task.outcome ?? ''))}>
            <Save className="h-4 w-4" />
            Save notes
          </button>
          {task.status === 'open' ? (
            <button className="tk-button-secondary" onClick={() => onStatus(task, 'in_progress')} disabled={readOnly}>
              <ClipboardCheck className="h-4 w-4" />
              Start
            </button>
          ) : null}
          {!['done', 'cancelled'].includes(task.status) ? (
            <>
              <button className="tk-button-primary" onClick={() => onStatus(task, 'done', { outcome: outcome || task.outcome || 'Completed with evidence review.' })} disabled={readOnly}>
                <CheckCircle2 className="h-4 w-4" />
                Complete
              </button>
              <button className="tk-button-secondary text-brand-orange" onClick={() => onStatus(task, 'cancelled', { skipped_reason: notes || 'Cancelled from task review.' })} disabled={readOnly}>
                <XCircle className="h-4 w-4" />
                Cancel
              </button>
            </>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function EvidenceList({ task, token, readOnly }: { task: PlaybookTask; token: string | null; readOnly: boolean; onEvidenceAdded: () => void }) {
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  async function submitEvidence(type: 'note' | 'link' | 'file') {
    if (!token || readOnly) return
    setSaving(true)
    try {
      await addTaskEvidence(token, task.id, { evidence_type: type, body, url, file, title: type === 'file' ? file?.name : undefined })
      setBody('')
      setUrl('')
      setFile(null)
      toast.success('Evidence added; refresh tasks to see the latest evidence list')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Evidence could not be added')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-4 rounded-lg border border-surface-border bg-surface-secondary p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-ink">Evidence</h3>
          <div className="mt-2 grid gap-2">
            {task.evidence.length ? task.evidence.map(item => (
              <p key={item.id} className="rounded-md bg-white px-3 py-2 text-xs text-ink-secondary">
                <span className="font-semibold text-ink">{item.evidence_type}</span> | {item.body || item.url || item.file_name || 'Evidence'} by {item.created_by_name}
              </p>
            )) : <p className="text-xs text-ink-secondary">No evidence recorded yet.</p>}
          </div>
        </div>
        {!readOnly ? (
          <div className="grid min-w-[280px] gap-2">
            <textarea className="tk-input min-h-[68px]" value={body} onChange={event => setBody(event.target.value)} placeholder="Evidence note" />
            <div className="flex gap-2">
              <input className="tk-input min-w-0" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://evidence.example" />
              <button className="tk-icon-button" disabled={saving || !url} onClick={() => submitEvidence('link')} aria-label="Add link evidence"><LinkIcon className="h-4 w-4" /></button>
            </div>
            <div className="flex gap-2">
              <input type="file" className="tk-input min-w-0" onChange={event => setFile(event.target.files?.[0] ?? null)} />
              <button className="tk-icon-button" disabled={saving || !file} onClick={() => submitEvidence('file')} aria-label="Add file evidence"><FileUp className="h-4 w-4" /></button>
            </div>
            <button className="tk-button-secondary" disabled={saving || !body} onClick={() => submitEvidence('note')}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add note evidence
            </button>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function CreateTaskDialog({ token, accounts, currentUserId, readOnly, customFields, onCreated }: { token: string | null; accounts: ReturnType<typeof useAccountStore.getState>['accounts']; currentUserId: string; readOnly: boolean; customFields: RuntimeCustomField[]; onCreated: (task: PlaybookTask) => void }) {
  const [open, setOpen] = useState(false)
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({})
  const [customErrors, setCustomErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    account_id: accounts[0]?.id ?? '',
    owner_id: currentUserId,
    title: '',
    description: '',
    due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    priority: 'medium' as TaskPriority,
    status: 'open' as TaskStatus,
    notes: '',
  })

  useEffect(() => {
    if (!form.account_id && accounts[0]) setForm(current => ({ ...current, account_id: accounts[0].id }))
  }, [accounts, form.account_id])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!token || readOnly) return
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
    <Dialog.Root open={open} onOpenChange={setOpen}>
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
                <select className="tk-input" value={form.account_id} onChange={event => setForm(current => ({ ...current, account_id: event.target.value }))}>
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
        <span className={cn('flex h-11 w-11 items-center justify-center rounded-lg', toneClass)}><ClipboardCheck className="h-5 w-5" /></span>
      </div>
    </article>
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

function viewModeParam(value: string | null): TaskViewMode {
  return value === 'list' ? 'list' : 'kanban'
}

function boolParam(value: string | null): boolean {
  return value === 'true' || value === '1'
}

function positivePage(value: string | null): number {
  return Math.max(1, Number(value ?? '1') || 1)
}

function statusClass(status: TaskStatus) {
  if (status === 'done') return 'border-rag-green/20 bg-rag-green/10 text-rag-green'
  if (status === 'in_progress') return 'border-blue-tint-20 bg-blue-tint-20 text-brand-blue'
  if (status === 'blocked') return 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange'
  if (status === 'cancelled') return 'border-surface-border bg-surface-tertiary text-ink-secondary'
  return 'border-surface-border bg-surface-tertiary text-ink-secondary'
}

function priorityClass(priority: TaskPriority) {
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
