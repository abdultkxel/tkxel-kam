import * as Dialog from '@radix-ui/react-dialog'
import { CheckCircle2, FileText, Loader2, Plus, Trash2, X } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ApiError, ApiFieldError } from '@/services/api'
import { useAuth } from '@/contexts/AuthContext'
import {
  readPersonalFathomConnection,
  readPersonalFirefliesConnection,
  resolveFathomMeeting,
  resolveFirefliesMeeting,
  type MeetingArtifact,
  type MeetingCaptureProvider,
  type UserMeetingConnection,
} from '@/services/meetingCapture'
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

const meetingProviderCopy: Record<MeetingCaptureProvider, { label: string; shortLabel: string; placeholder: string; missingMessage: string; loadedMessage: string }> = {
  fathom: {
    label: 'Fathom meeting',
    shortLabel: 'Fathom',
    placeholder: 'Fathom recording ID or share URL',
    missingMessage: 'Enter a Fathom recording ID or share URL.',
    loadedMessage: 'Fathom meeting loaded',
  },
  fireflies: {
    label: 'Fireflies transcript',
    shortLabel: 'Fireflies',
    placeholder: 'Fireflies transcript ID or transcript URL',
    missingMessage: 'Enter a Fireflies transcript ID or transcript URL.',
    loadedMessage: 'Fireflies meeting loaded',
  },
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
  const [fetchingMeeting, setFetchingMeeting] = useState(false)
  const [meetingProvider, setMeetingProvider] = useState<MeetingCaptureProvider>('fathom')
  const [meetingConnections, setMeetingConnections] = useState<Partial<Record<MeetingCaptureProvider, UserMeetingConnection>>>({})
  const [meetingIdentifier, setMeetingIdentifier] = useState('')
  const [fetchedMeeting, setFetchedMeeting] = useState<MeetingArtifact | null>(null)
  const [meetingArtifactId, setMeetingArtifactId] = useState('')
  const [notes, setNotes] = useState('')
  const [decisionText, setDecisionText] = useState('')
  const [actionDrafts, setActionDrafts] = useState<ActionDraft[]>([])
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open || !token) return
    let active = true
    Promise.allSettled([readPersonalFathomConnection(token), readPersonalFirefliesConnection(token)]).then(results => {
      if (!active) return
      const nextConnections: Partial<Record<MeetingCaptureProvider, UserMeetingConnection>> = {}
      const fathom = results[0].status === 'fulfilled' ? results[0].value : null
      const fireflies = results[1].status === 'fulfilled' ? results[1].value : null
      if (fathom) nextConnections.fathom = fathom
      if (fireflies) nextConnections.fireflies = fireflies
      setMeetingConnections(nextConnections)
      if (isConnectionReady(fathom)) setMeetingProvider('fathom')
      else if (isConnectionReady(fireflies)) setMeetingProvider('fireflies')
    })
    return () => {
      active = false
    }
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
    setMeetingIdentifier('')
    setFetchedMeeting(null)
    setMeetingArtifactId('')
    setNotes('')
    setDecisionText('')
    setActionDrafts([])
    setFieldErrors({})
  }

  async function fetchMeetingArtifact() {
    setFieldErrors(errors => {
      const next = { ...errors }
      delete next.identifier
      delete next.meeting_artifact_id
      return next
    })
    if (!token) {
      toast.error(`Sign in again before fetching ${meetingProviderCopy[meetingProvider].shortLabel} notes.`)
      return
    }
    if (!meetingIdentifier.trim()) {
      setFieldErrors(errors => ({ ...errors, identifier: meetingProviderCopy[meetingProvider].missingMessage }))
      return
    }
    setFetchingMeeting(true)
    try {
      const resolver = meetingProvider === 'fireflies' ? resolveFirefliesMeeting : resolveFathomMeeting
      const meeting = await resolver(token, {
        identifier: meetingIdentifier,
        accountId: event.accountId,
        engagementId: event.engagementId ?? null,
        linkedObjectType: 'governance_event',
        linkedObjectId: event.id,
      })
      setFetchedMeeting(meeting)
      setMeetingArtifactId(meeting.id)
      if (meeting.summary) setNotes(meeting.summary.replace(/#/g, '').trim())
      setActionDrafts(meeting.actionItems.map((item, index) => buildActionDraft(item, index)))
      toast.success(meetingProviderCopy[meetingProvider].loadedMessage)
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length) {
        setFieldErrors(errors => ({ ...errors, ...normalizeFieldErrors(err.fieldErrors) }))
        toast.error(err.message)
      } else {
        toast.error(err instanceof Error ? err.message : `Unable to fetch ${meetingProviderCopy[meetingProvider].shortLabel} meeting`)
      }
    } finally {
      setFetchingMeeting(false)
    }
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
                <p className="text-sm font-semibold text-ink">Meeting import</p>
                {fetchingMeeting ? <Loader2 className="h-4 w-4 animate-spin text-brand-blue" /> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {(['fathom', 'fireflies'] as MeetingCaptureProvider[]).map(provider => {
                  const connection = meetingConnections[provider]
                  const selected = meetingProvider === provider
                  return (
                    <button
                      key={provider}
                      type="button"
                      className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${selected ? 'border-brand-blue bg-blue-50 text-brand-blue' : 'border-surface-border bg-white text-ink-secondary hover:border-brand-blue/50 hover:text-ink'}`}
                      onClick={() => {
                        setMeetingProvider(provider)
                        setMeetingIdentifier('')
                        setFetchedMeeting(null)
                        setMeetingArtifactId('')
                        setFieldErrors(errors => {
                          const next = { ...errors }
                          delete next.identifier
                          delete next.meeting_artifact_id
                          return next
                        })
                      }}
                    >
                      {meetingProviderCopy[provider].shortLabel}
                      {isConnectionReady(connection) ? <span className="ml-2 text-[10px] uppercase text-rag-green">Connected</span> : null}
                    </button>
                  )
                })}
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <input
                  className="tk-input"
                  value={meetingIdentifier}
                  onChange={event => {
                    setMeetingIdentifier(event.target.value)
                    setFetchedMeeting(null)
                    setMeetingArtifactId('')
                    setFieldErrors(errors => {
                      if (!errors.identifier) return errors
                      const next = { ...errors }
                      delete next.identifier
                      return next
                    })
                  }}
                  placeholder={meetingProviderCopy[meetingProvider].placeholder}
                  aria-invalid={Boolean(fieldErrors.identifier)}
                  aria-describedby={fieldErrors.identifier ? 'governance-meeting-identifier-error' : undefined}
                />
                <button type="button" className="tk-button-secondary" onClick={fetchMeetingArtifact} disabled={fetchingMeeting}>
                  {fetchingMeeting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  Fetch meeting
                </button>
              </div>
              {fetchedMeeting ? (
                <div className="rounded-md border border-surface-border bg-white px-3 py-2 text-sm text-ink-secondary">
                  Loaded <span className="font-semibold text-ink">{fetchedMeeting.title}</span>
                  {fetchedMeeting.sourceLink || fetchedMeeting.meetingUrl ? (
                    <a className="ml-2 font-semibold text-brand-blue hover:underline" href={fetchedMeeting.sourceLink ?? fetchedMeeting.meetingUrl ?? undefined} target="_blank" rel="noreferrer">
                      Open in {meetingProviderCopy[fetchedMeeting.provider].shortLabel}
                    </a>
                  ) : null}
                </div>
              ) : null}
              <InlineError id="governance-meeting-identifier-error" message={fieldErrors.identifier || fieldErrors.meeting_artifact_id} />
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

function isConnectionReady(connection: UserMeetingConnection | null | undefined) {
  return Boolean(connection?.enabled && connection.credentialStatus.configured)
}

function InlineError({ id, message }: { id?: string; message?: string }) {
  return message ? <p id={id} className="text-xs font-semibold text-rag-red">{message}</p> : null
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
