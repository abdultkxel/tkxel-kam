import * as Dialog from '@radix-ui/react-dialog'
import { CheckCircle2, FileText, Loader2, Plus, Trash2, X } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ApiError, ApiFieldError } from '@/services/api'
import { useAuth } from '@/contexts/AuthContext'
import { listMeetingArtifacts, MeetingArtifact } from '@/services/meetingCapture'
import { useGovernanceStore } from '@/stores/governanceStore'
import { GovernanceEventRecord } from '@/types/governance'

interface CompleteGovernanceEventDialogProps {
  event: GovernanceEventRecord
  triggerClassName?: string
  triggerLabel?: string
  onCompleted?: (event: GovernanceEventRecord) => void
}

interface ActionDraft {
  id: string
  selected: boolean
  title: string
  dueDate: string
  createTask: boolean
}

export function CompleteGovernanceEventDialog({
  event,
  triggerClassName = 'tk-button-primary',
  triggerLabel = 'Complete event',
  onCompleted,
}: CompleteGovernanceEventDialogProps) {
  const { token } = useAuth()
  const completeEvent = useGovernanceStore(state => state.completeEvent)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadingMeetings, setLoadingMeetings] = useState(false)
  const [meetingOptions, setMeetingOptions] = useState<MeetingArtifact[]>([])
  const [meetingArtifactId, setMeetingArtifactId] = useState('')
  const [notes, setNotes] = useState('')
  const [decisionText, setDecisionText] = useState('')
  const [actionDrafts, setActionDrafts] = useState<ActionDraft[]>([])
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open || !token) return
    setLoadingMeetings(true)
    listMeetingArtifacts(token, { provider: 'fathom', pageSize: 25 })
      .then(result => setMeetingOptions(result.items))
      .catch(err => toast.error(err instanceof Error ? err.message : 'Unable to load meeting notes'))
      .finally(() => setLoadingMeetings(false))
  }, [open, token])

  async function submit(formEvent: FormEvent) {
    formEvent.preventDefault()
    setFieldErrors({})

    if (!token) {
      toast.error('Sign in again before completing governance.')
      return
    }

    const nextErrors: Record<string, string> = {}
    if (!notes.trim()) nextErrors.notes = 'Add completion notes before marking governance complete.'
    const selectedActions = actionDrafts.filter(item => item.selected)
    if (selectedActions.some(item => !item.title.trim())) nextErrors.action_items = 'Add a title for each selected action item.'
    if (selectedActions.some(item => !item.dueDate)) nextErrors.action_items = 'Choose a due date for each selected action item.'
    if (selectedActions.length && !event.ownerId && !event.ownerEmail) nextErrors.action_items = 'Governance owner is required before creating action items.'
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors)
      return
    }

    setSaving(true)
    try {
      const savedEvent = await completeEvent(token, event.id, {
        meetingArtifactId: meetingArtifactId || null,
        notes: notes.trim(),
        decisions: decisionText.trim() ? [{ decisionText: decisionText.trim() }] : [],
        actionItems: selectedActions.map(item => ({
          title: item.title.trim(),
          ownerId: event.ownerId || null,
          ownerEmail: event.ownerEmail ?? null,
          dueDate: new Date(`${item.dueDate}T17:00:00`).toISOString(),
          createTask: item.createTask,
        })),
      })
      toast.success('Governance event completed')
      setOpen(false)
      resetForm()
      onCompleted?.(savedEvent)
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length) {
        setFieldErrors(normalizeFieldErrors(err.fieldErrors))
        toast.error(err.message)
      } else {
        toast.error(err instanceof Error ? err.message : 'Unable to complete governance event')
      }
    } finally {
      setSaving(false)
    }
  }

  function resetForm() {
    setMeetingArtifactId('')
    setNotes('')
    setDecisionText('')
    setActionDrafts([])
    setFieldErrors({})
  }

  function useSelectedMeeting() {
    const meeting = meetingOptions.find(item => item.id === meetingArtifactId)
    if (!meeting) return
    if (meeting.summary) setNotes(meeting.summary.replace(/#/g, '').trim())
    setActionDrafts(meeting.actionItems.map((item, index) => buildActionDraft(item, index)))
  }

  function addActionDraft() {
    setActionDrafts(items => [...items, buildActionDraft('', items.length)])
  }

  function updateActionDraft(index: number, updates: Partial<ActionDraft>) {
    setActionDrafts(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...updates } : item))
  }

  function removeActionDraft(index: number) {
    setActionDrafts(items => items.filter((_, itemIndex) => itemIndex !== index))
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" className={triggerClassName}>
          <CheckCircle2 className="h-4 w-4" />
          {triggerLabel}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[min(820px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-surface-border bg-white p-5 shadow-panel">
          <div className="flex items-start justify-between gap-4 border-b border-surface-border pb-4">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Governance</p>
              <Dialog.Title className="font-display text-2xl font-bold text-ink">Complete {event.type}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-secondary">Capture meeting notes, optional decisions, and governance-local action items.</Dialog.Description>
            </div>
            <Dialog.Close className="tk-icon-button" aria-label="Close complete governance dialog">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <form onSubmit={submit} className="mt-5 space-y-5">
            <div className="space-y-2 rounded-lg border border-surface-border bg-surface-tertiary p-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-brand-blue" />
                <p className="text-sm font-semibold text-ink">Fathom meeting</p>
                {loadingMeetings ? <Loader2 className="h-4 w-4 animate-spin text-brand-blue" /> : null}
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <select className="tk-input" value={meetingArtifactId} onChange={item => setMeetingArtifactId(item.target.value)}>
                  <option value="">No meeting selected</option>
                  {meetingOptions.map(meeting => (
                    <option key={meeting.id} value={meeting.id}>{meeting.title}</option>
                  ))}
                </select>
                <button type="button" className="tk-button-secondary" onClick={useSelectedMeeting} disabled={!meetingArtifactId}>
                  Use notes
                </button>
              </div>
              <InlineError message={fieldErrors.meeting_artifact_id} />
            </div>
            <label className="space-y-1">
              <span className="tk-label text-xs">Completion notes</span>
              <textarea className="tk-input min-h-[130px] resize-y" value={notes} onChange={item => setNotes(item.target.value)} placeholder="Summarize outcomes, risks, follow-ups, and client commitments." />
              <InlineError message={fieldErrors.notes} />
            </label>
            <label className="space-y-1">
              <span className="tk-label text-xs">Decision</span>
              <input className="tk-input" value={decisionText} onChange={item => setDecisionText(item.target.value)} placeholder="Budget owner confirmed, recovery cadence approved" />
              <InlineError message={fieldErrors.decisions} />
            </label>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="tk-label text-xs">Action items</span>
                <button type="button" className="tk-button-secondary" onClick={addActionDraft}>
                  <Plus className="h-4 w-4" />
                  Add
                </button>
              </div>
              {actionDrafts.length ? actionDrafts.map((item, index) => (
                <div key={item.id} className="grid gap-2 rounded-lg border border-surface-border p-3 sm:grid-cols-[auto_minmax(0,1fr)_150px_auto_auto] sm:items-end">
                  <label className="flex min-h-[44px] items-center justify-center" title="Include action item">
                    <input type="checkbox" checked={item.selected} onChange={event => updateActionDraft(index, { selected: event.target.checked })} />
                  </label>
                  <label className="space-y-1">
                    <span className="tk-label text-xs">Title</span>
                    <input className="tk-input" value={item.title} onChange={event => updateActionDraft(index, { title: event.target.value })} placeholder="Share roadmap deck" />
                  </label>
                  <label className="space-y-1">
                    <span className="tk-label text-xs">Due date</span>
                    <input type="date" className="tk-input" value={item.dueDate} onChange={event => updateActionDraft(index, { dueDate: event.target.value })} />
                  </label>
                  <label className="flex min-h-[44px] items-center gap-2 text-xs font-semibold text-ink-secondary">
                    <input type="checkbox" checked={item.createTask} onChange={event => updateActionDraft(index, { createTask: event.target.checked })} />
                    Task
                  </label>
                  <button type="button" className="tk-icon-button" onClick={() => removeActionDraft(index)} aria-label="Remove action item">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )) : (
                <div className="rounded-lg border border-dashed border-surface-border p-4 text-sm text-ink-secondary">
                  No action items selected.
                </div>
              )}
              <InlineError message={fieldErrors.action_items} />
            </div>
            <div className="flex justify-end gap-2 border-t border-surface-border pt-4">
              <Dialog.Close type="button" className="tk-button-secondary">Cancel</Dialog.Close>
              <button type="submit" className="tk-button-primary" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Save completion
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function normalizeFieldErrors(errors: ApiFieldError[]) {
  return errors.reduce<Record<string, string>>((acc, error) => {
    acc[error.field.split('.')[0]] = error.message
    return acc
  }, {})
}

function InlineError({ message }: { message?: string }) {
  return message ? <p className="text-xs font-semibold text-rag-red">{message}</p> : null
}

function buildActionDraft(title: string, index: number): ActionDraft {
  return {
    id: `${Date.now()}-${index}-${title}`,
    selected: true,
    title,
    dueDate: defaultDueDate(),
    createTask: true,
  }
}

function defaultDueDate() {
  const value = new Date()
  value.setDate(value.getDate() + 7)
  return value.toISOString().slice(0, 10)
}
