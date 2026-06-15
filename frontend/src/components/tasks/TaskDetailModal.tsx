import * as Dialog from '@radix-ui/react-dialog'
import { CalendarClock, Loader2, MessageSquareText, Save, Send, Trash2, X } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { addTaskEvidence, deleteTask, getTask, listTaskHistory, PlaybookTask, TaskHistory, TaskPriority, updateTask } from '@/services/playbooksTasks'
import { cn } from '@/utils/cn'
import { formatDate, formatRelative, titleize } from '@/utils/formatters'

interface TaskDetailModalProps {
  taskId: string | null
  open: boolean
  readOnly: boolean
  onOpenChange: (open: boolean) => void
  onTaskUpdated: (task: PlaybookTask) => void
  onTaskDeleted: (taskId: string) => void
}

interface TaskEditForm {
  title: string
  description: string
  due_at: string
  priority: TaskPriority
  notes: string
  outcome: string
}

export function TaskDetailModal({ taskId, open, readOnly, onOpenChange, onTaskUpdated, onTaskDeleted }: TaskDetailModalProps) {
  const { token } = useAuth()
  const [task, setTask] = useState<PlaybookTask | null>(null)
  const [history, setHistory] = useState<TaskHistory[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [comment, setComment] = useState('')
  const [savingTask, setSavingTask] = useState(false)
  const [savingComment, setSavingComment] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false)
  const [editForm, setEditForm] = useState<TaskEditForm>({
    title: '',
    description: '',
    due_at: '',
    priority: 'medium' as TaskPriority,
    notes: '',
    outcome: '',
  })
  const comments = useMemo(() => (task?.evidence ?? []).filter(item => item.evidence_type === 'note'), [task])
  const savedForm = useMemo(() => {
    if (!task) return null
    return normalizeEditForm({
      title: task.title,
      description: task.description ?? '',
      due_at: task.due_at.slice(0, 10),
      priority: task.priority,
      notes: task.notes ?? '',
      outcome: task.outcome ?? '',
    })
  }, [task])
  const currentForm = useMemo(() => normalizeEditForm(editForm), [editForm])
  const hasTaskChanges = Boolean(savedForm && !sameEditForm(savedForm, currentForm))
  const canSaveTask = !readOnly && Boolean(taskId) && Boolean(editForm.title.trim()) && Boolean(editForm.due_at) && hasTaskChanges

  useEffect(() => {
    if (!open) {
      setComment('')
      setError('')
      setConfirmCloseOpen(false)
      return
    }
    if (!token || !taskId) return
    let cancelled = false
    setLoading(true)
    setError('')
    Promise.all([
      getTask(token, taskId),
      listTaskHistory(token, taskId),
    ])
      .then(([taskResponse, historyResponse]) => {
        if (cancelled) return
        setTask(taskResponse)
        setHistory(historyResponse.items)
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Task could not load')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, taskId, token])

  useEffect(() => {
    if (!task) return
    setEditForm({
      title: task.title,
      description: task.description ?? '',
      due_at: task.due_at.slice(0, 10),
      priority: task.priority,
      notes: task.notes ?? '',
      outcome: task.outcome ?? '',
    })
  }, [task])

  async function refreshTask() {
    if (!token || !taskId) return
    const [taskResponse, historyResponse] = await Promise.all([getTask(token, taskId), listTaskHistory(token, taskId)])
    setTask(taskResponse)
      setHistory(historyResponse.items)
    onTaskUpdated(taskResponse)
  }

  async function saveTask({ closeAfterSave = false }: { closeAfterSave?: boolean } = {}) {
    if (!token || !taskId || !canSaveTask) return false
    setSavingTask(true)
    try {
      const updated = await updateTask(token, taskId, {
        title: editForm.title.trim(),
        description: editForm.description.trim() || null,
        due_at: new Date(`${editForm.due_at}T12:00:00`).toISOString(),
        priority: editForm.priority,
        notes: editForm.notes.trim() || null,
        outcome: editForm.outcome.trim() || null,
      })
      setTask(updated)
      onTaskUpdated(updated)
      toast.success('Task updated')
      if (closeAfterSave) {
        setConfirmCloseOpen(false)
        onOpenChange(false)
      }
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Task could not be updated')
      return false
    } finally {
      setSavingTask(false)
    }
  }

  async function submitTask(event: FormEvent) {
    event.preventDefault()
    await saveTask()
  }

  async function submitComment(event: FormEvent) {
    event.preventDefault()
    if (!token || !taskId || readOnly || !comment.trim()) return
    setSavingComment(true)
    try {
      await addTaskEvidence(token, taskId, { evidence_type: 'note', title: 'Comment', body: comment.trim() })
      setComment('')
      await refreshTask()
      toast.success('Comment added')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Comment could not be added')
    } finally {
      setSavingComment(false)
    }
  }

  async function confirmDelete() {
    if (!token || !taskId || !task || readOnly) return
    if (!window.confirm(`Delete task "${task.title}"? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await deleteTask(token, taskId)
      onTaskDeleted(taskId)
      onOpenChange(false)
      toast.success('Task deleted')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Task could not be deleted')
    } finally {
      setDeleting(false)
    }
  }

  function requestClose() {
    if (hasTaskChanges && !savingTask && !deleting) {
      setConfirmCloseOpen(true)
      return
    }
    onOpenChange(false)
  }

  function discardAndClose() {
    setConfirmCloseOpen(false)
    onOpenChange(false)
  }

  return (
    <>
    <Dialog.Root open={open} onOpenChange={nextOpen => {
      if (nextOpen) {
        onOpenChange(true)
        return
      }
      requestClose()
    }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[75vh] w-[min(810px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-surface-border bg-white shadow-panel"
          onEscapeKeyDown={event => {
            if (hasTaskChanges) {
              event.preventDefault()
              setConfirmCloseOpen(true)
            }
          }}
          onPointerDownOutside={event => {
            if (hasTaskChanges) {
              event.preventDefault()
              setConfirmCloseOpen(true)
            }
          }}
          onInteractOutside={event => {
            if (hasTaskChanges) event.preventDefault()
          }}
        >
          <div className="flex flex-col gap-4 border-b border-surface-border p-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Task detail</p>
              <Dialog.Title className="truncate font-display text-2xl font-bold text-ink">
                {task?.title || 'Task detail'}
              </Dialog.Title>
              <Dialog.Description className="sr-only">Task detail</Dialog.Description>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
              {!readOnly && task ? (
                <button type="button" className="tk-icon-button text-rag-red hover:border-rag-red/30 hover:bg-rag-red/10" onClick={confirmDelete} disabled={deleting} aria-label="Delete task">
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              ) : null}
              <button type="button" className="tk-icon-button" aria-label="Close task detail" onClick={requestClose}><X className="h-5 w-5" /></button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex min-h-[360px] items-center justify-center text-sm font-semibold text-ink-secondary">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading task
              </div>
            ) : error || !task ? (
              <div className="p-5">
                <p className="rounded-lg border border-rag-red/20 bg-rag-red/10 p-4 text-sm font-semibold text-rag-red">{error || 'Task was not found'}</p>
              </div>
            ) : (
              <div className="grid gap-5 p-5">
                <section className="rounded-lg border border-surface-border bg-white p-5">
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span className={cn('inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-wider', statusClass(task.status))}>{titleize(task.status)}</span>
                    <span className={cn('inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-wider', priorityClass(task.priority))}>{titleize(task.priority)}</span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-surface-border bg-surface-secondary px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
                      <CalendarClock className="h-3.5 w-3.5 text-brand-orange" />
                      {formatDate(task.due_at)}
                    </span>
                  </div>

                  <form onSubmit={submitTask}>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="space-y-1 md:col-span-2">
                        <span className="tk-label text-xs">Title *</span>
                        <input className="tk-input" value={editForm.title} onChange={event => setEditForm(current => ({ ...current, title: event.target.value }))} disabled={readOnly || savingTask} />
                      </label>
                      <label className="space-y-1 md:col-span-2">
                        <span className="tk-label text-xs">Description</span>
                        <textarea className="tk-input min-h-[92px]" value={editForm.description} onChange={event => setEditForm(current => ({ ...current, description: event.target.value }))} disabled={readOnly || savingTask} />
                      </label>
                      <label className="space-y-1">
                        <span className="tk-label text-xs">Due date *</span>
                        <input type="date" className="tk-input" value={editForm.due_at} onChange={event => setEditForm(current => ({ ...current, due_at: event.target.value }))} disabled={readOnly || savingTask} />
                      </label>
                      <label className="space-y-1">
                        <span className="tk-label text-xs">Priority</span>
                        <select className="tk-input" value={editForm.priority} onChange={event => setEditForm(current => ({ ...current, priority: event.target.value as TaskPriority }))} disabled={readOnly || savingTask}>
                          <option value="critical">Critical</option>
                          <option value="urgent">Urgent</option>
                          <option value="high">High</option>
                          <option value="medium">Medium</option>
                          <option value="low">Low</option>
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="tk-label text-xs">Notes</span>
                        <textarea className="tk-input min-h-[96px]" value={editForm.notes} onChange={event => setEditForm(current => ({ ...current, notes: event.target.value }))} disabled={readOnly || savingTask} />
                      </label>
                      <label className="space-y-1">
                        <span className="tk-label text-xs">Outcome</span>
                        <textarea className="tk-input min-h-[96px]" value={editForm.outcome} onChange={event => setEditForm(current => ({ ...current, outcome: event.target.value }))} disabled={readOnly || savingTask} />
                      </label>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <dl className="grid flex-1 gap-3 sm:grid-cols-3">
                        <DetailStat label="Owner" value={task.owner_name} />
                        <DetailStat label="Source" value={titleize(task.source_type)} />
                        <DetailStat label="Updated" value={formatRelative(task.updated_at)} />
                      </dl>
                      {!readOnly ? (
                        <button type="submit" className="tk-button-primary" disabled={savingTask || !canSaveTask}>
                          {savingTask ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          Save changes
                        </button>
                      ) : null}
                    </div>
                  </form>
                </section>

                <section className="grid gap-5 xl:grid-cols-[minmax(0,0.75fr)_minmax(360px,0.55fr)]">
                  <div className="overflow-hidden rounded-lg border border-surface-border bg-white">
                    <div className="border-b border-surface-border p-5">
                      <h2 className="text-lg font-semibold text-ink">Comments</h2>
                    </div>
                    <div className="divide-y divide-surface-border">
                      {comments.length ? comments.map(item => (
                        <article key={item.id} className="p-5">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-ink">{item.created_by_name}</p>
                            <p className="text-xs font-medium text-ink-secondary">{formatRelative(item.created_at)}</p>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-ink-secondary">{item.body || item.title || 'Comment'}</p>
                        </article>
                      )) : <p className="p-5 text-sm text-ink-secondary">No comments yet.</p>}
                    </div>
                    {!readOnly ? (
                      <form onSubmit={submitComment} className="border-t border-surface-border bg-surface-secondary p-5">
                        <label className="space-y-1">
                          <span className="tk-label text-xs">Add comment</span>
                          <textarea className="tk-input min-h-[96px]" value={comment} onChange={event => setComment(event.target.value)} placeholder="Add an update or decision note" />
                        </label>
                        <div className="mt-3 flex justify-end">
                          <button type="submit" className="tk-button-primary" disabled={savingComment || !comment.trim()}>
                            {savingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            Add comment
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </div>

                  <div className="overflow-hidden rounded-lg border border-surface-border bg-white">
                    <div className="border-b border-surface-border p-5">
                      <h2 className="text-lg font-semibold text-ink">History</h2>
                    </div>
                    <div className="divide-y divide-surface-border">
                      {history.length ? history.map(item => (
                        <article key={item.id} className="p-5">
                          <div className="flex items-start gap-3">
                            <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-tint-20 text-brand-blue">
                              <MessageSquareText className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-ink">{historyTitle(item)}</p>
                              <p className="mt-1 text-xs font-medium text-ink-secondary">{item.actor_name} | {formatRelative(item.created_at)}</p>
                              {(item.reason || item.note) ? <p className="mt-2 rounded-md bg-surface-secondary p-3 text-sm leading-6 text-ink-secondary">{item.reason || item.note}</p> : null}
                            </div>
                          </div>
                        </article>
                      )) : <p className="p-5 text-sm text-ink-secondary">No history recorded yet.</p>}
                    </div>
                  </div>
                </section>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>

    <Dialog.Root open={confirmCloseOpen} onOpenChange={setConfirmCloseOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-ink/20" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[70] w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-surface-border bg-white p-5 shadow-panel">
          <Dialog.Title className="font-display text-xl font-bold text-ink">Unsaved changes</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-6 text-ink-secondary">
            Save your task changes before closing so the updates are not lost.
          </Dialog.Description>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" className="tk-button-secondary" onClick={() => setConfirmCloseOpen(false)}>Keep editing</button>
            <button type="button" className="tk-button-secondary text-rag-red" onClick={discardAndClose}>Discard</button>
            <button type="button" className="tk-button-primary" onClick={() => saveTask({ closeAfterSave: true })} disabled={savingTask || !canSaveTask}>
              {savingTask ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save changes
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    </>
  )
}

function normalizeEditForm(form: TaskEditForm) {
  return {
    title: form.title.trim(),
    description: form.description.trim(),
    due_at: form.due_at,
    priority: form.priority,
    notes: form.notes.trim(),
    outcome: form.outcome.trim(),
  }
}

function sameEditForm(left: ReturnType<typeof normalizeEditForm>, right: ReturnType<typeof normalizeEditForm>) {
  return (
    left.title === right.title
    && left.description === right.description
    && left.due_at === right.due_at
    && left.priority === right.priority
    && left.notes === right.notes
    && left.outcome === right.outcome
  )
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-secondary p-3">
      <dt className="text-[10px] font-extrabold uppercase tracking-widest text-ink-secondary">{label}</dt>
      <dd className="mt-2 truncate text-sm font-semibold text-ink">{value}</dd>
    </div>
  )
}

function historyTitle(item: TaskHistory) {
  if (item.event_type === 'status_change') return `Moved from ${titleize(item.previous_status || 'unknown')} to ${titleize(item.new_status || 'unknown')}`
  if (item.event_type === 'created') return 'Task created'
  if (item.event_type === 'comment_added') return 'Comment added'
  if (item.event_type === 'evidence_added') return 'Evidence added'
  return titleize(item.event_type)
}

function statusClass(status: string) {
  if (status === 'done') return 'border-rag-green/20 bg-rag-green/10 text-rag-green'
  if (status === 'in_progress') return 'border-blue-tint-20 bg-blue-tint-20 text-brand-blue'
  if (status === 'blocked') return 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange'
  if (status === 'cancelled' || status === 'skipped') return 'border-surface-border bg-surface-tertiary text-ink-secondary'
  return 'border-surface-border bg-surface-tertiary text-ink-secondary'
}

function priorityClass(priority: string) {
  if (priority === 'critical') return 'border-rag-red/20 bg-rag-red/10 text-rag-red'
  if (priority === 'urgent' || priority === 'high') return 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange'
  if (priority === 'medium') return 'border-blue-tint-20 bg-blue-tint-20 text-brand-blue'
  return 'border-surface-border bg-surface-tertiary text-ink-secondary'
}
