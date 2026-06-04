import * as Dialog from '@radix-ui/react-dialog'
import { Copy, ExternalLink, KeyRound, Loader2, Plus, RefreshCw, Video, X } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ApiError, ApiFieldError } from '@/services/api'
import {
  createMeetingArtifact,
  listMeetingArtifacts,
  MeetingArtifact,
  readPersonalFathomConnection,
  syncPersonalFathomMeetings,
  updatePersonalFathomConnection,
  UserFathomConnection,
} from '@/services/meetingCapture'
import { useAccountStore } from '@/stores/accountStore'
import { useUIStore } from '@/stores/uiStore'
import { useAuth } from '@/contexts/AuthContext'

export function MeetingCapturePanel() {
  const open = useUIStore(state => state.meetingCaptureOpen)
  const setOpen = useUIStore(state => state.setMeetingCaptureOpen)
  const accounts = useAccountStore(state => state.accounts)
  const { token } = useAuth()
  const [connection, setConnection] = useState<UserFathomConnection | null>(null)
  const [meetings, setMeetings] = useState<MeetingArtifact[]>([])
  const [apiKey, setApiKey] = useState('')
  const [title, setTitle] = useState('')
  const [meetingUrl, setMeetingUrl] = useState('')
  const [accountId, setAccountId] = useState('')
  const [loading, setLoading] = useState(false)
  const [savingConnection, setSavingConnection] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [savingMeeting, setSavingMeeting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open || !token) return
    void loadPanel()
  }, [open, token])

  async function loadPanel() {
    if (!token) return
    setLoading(true)
    try {
      const [connectionResult, meetingsResult] = await Promise.all([
        readPersonalFathomConnection(token),
        listMeetingArtifacts(token, { provider: 'fathom', pageSize: 20 }),
      ])
      setConnection(connectionResult)
      setMeetings(meetingsResult.items)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to load meeting capture')
    } finally {
      setLoading(false)
    }
  }

  async function saveConnection(formEvent: FormEvent) {
    formEvent.preventDefault()
    if (!token) return
    setSavingConnection(true)
    try {
      const saved = await updatePersonalFathomConnection(token, { enabled: true, apiKey })
      setConnection(saved)
      setApiKey('')
      toast.success('Fathom connected')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to save Fathom connection')
    } finally {
      setSavingConnection(false)
    }
  }

  async function syncMeetings() {
    if (!token) return
    setSyncing(true)
    try {
      const result = await syncPersonalFathomMeetings(token)
      toast.success(result.message)
      await loadPanel()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to sync Fathom meetings')
    } finally {
      setSyncing(false)
    }
  }

  async function createMeeting(formEvent: FormEvent) {
    formEvent.preventDefault()
    setFieldErrors({})
    if (!token) return
    if (!title.trim() && !meetingUrl.trim()) {
      setFieldErrors({ title: 'Add a meeting title or link.' })
      return
    }
    setSavingMeeting(true)
    try {
      const saved = await createMeetingArtifact(token, {
        title,
        meetingUrl,
        accountId: accountId || null,
      })
      setMeetings(items => [saved, ...items.filter(item => item.id !== saved.id)])
      resetMeetingForm()
      toast.success('Meeting saved')
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length) {
        setFieldErrors(normalizeFieldErrors(err.fieldErrors))
        toast.error(err.message)
      } else {
        toast.error(err instanceof Error ? err.message : 'Unable to save meeting')
      }
    } finally {
      setSavingMeeting(false)
    }
  }

  function resetMeetingForm() {
    setTitle('')
    setMeetingUrl('')
    setAccountId('')
    setFieldErrors({})
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/25 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex h-[100dvh] w-full max-w-[720px] flex-col overflow-hidden border-l border-surface-border bg-white shadow-panel">
          <div className="border-b border-surface-border px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Fathom</p>
                <Dialog.Title className="font-display text-2xl font-bold text-ink">Meeting capture</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-ink-secondary">Personal notes, summaries, and action items.</Dialog.Description>
              </div>
              <Dialog.Close className="tk-icon-button shrink-0" aria-label="Close meeting capture">
                <X className="h-5 w-5" />
              </Dialog.Close>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <form onSubmit={saveConnection} className="space-y-3 border-b border-surface-border pb-5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">Personal Fathom</p>
                  <p className="text-xs text-ink-secondary">{connection?.credentialStatus.configured ? 'Connected' : 'Not connected'}</p>
                </div>
                <button type="button" className="tk-button-secondary" onClick={syncMeetings} disabled={syncing || !connection?.credentialStatus.configured}>
                  {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Sync
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <label className="space-y-1">
                  <span className="tk-label text-xs">API key</span>
                  <input className="tk-input" type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={connection?.credentialStatus.configured ? 'Saved key is masked' : 'Fathom API key'} />
                </label>
                <button type="submit" className="tk-button-primary self-end" disabled={savingConnection}>
                  {savingConnection ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  Save
                </button>
              </div>
              {connection?.lastError ? <p className="text-xs font-semibold text-rag-red">{connection.lastError}</p> : null}
            </form>

            <form onSubmit={createMeeting} className="space-y-3 border-b border-surface-border py-5">
              <div className="flex items-center gap-2">
                <Video className="h-4 w-4 text-brand-blue" />
                <p className="text-sm font-semibold text-ink">Add meeting</p>
              </div>
              <label className="space-y-1">
                <span className="tk-label text-xs">Title</span>
                <input className="tk-input" value={title} onChange={event => setTitle(event.target.value)} placeholder="Client governance call" />
                <InlineError message={fieldErrors.title} />
              </label>
              <label className="space-y-1">
                <span className="tk-label text-xs">Meeting or Fathom link</span>
                <input className="tk-input" value={meetingUrl} onChange={event => setMeetingUrl(event.target.value)} placeholder="https://fathom.video/share/..." />
                <InlineError message={fieldErrors.meeting_url} />
              </label>
              <label className="space-y-1">
                <span className="tk-label text-xs">Account</span>
                <select className="tk-input" value={accountId} onChange={event => setAccountId(event.target.value)}>
                  <option value="">No account link</option>
                  {accounts.map(account => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
                <InlineError message={fieldErrors.account_id} />
              </label>
              <div className="flex justify-end gap-2">
                <button type="button" className="tk-button-secondary" onClick={resetMeetingForm}>Clear</button>
                <button type="submit" className="tk-button-primary" disabled={savingMeeting}>
                  {savingMeeting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Save meeting
                </button>
              </div>
            </form>

            <div className="space-y-3 pt-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-ink">My meetings</p>
                {loading ? <Loader2 className="h-4 w-4 animate-spin text-brand-blue" /> : null}
              </div>
              {meetings.length ? meetings.map(meeting => (
                <MeetingItem key={meeting.id} meeting={meeting} />
              )) : (
                <div className="rounded-lg border border-dashed border-surface-border p-5 text-sm text-ink-secondary">
                  No meetings captured yet.
                </div>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function MeetingItem({ meeting }: { meeting: MeetingArtifact }) {
  const link = meeting.sourceLink || meeting.meetingUrl
  const copyText = [
    meeting.title,
    meeting.summary,
    meeting.actionItems.length ? `Action items:\n${meeting.actionItems.map(item => `- ${item}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n')

  async function copyMeeting() {
    await navigator.clipboard?.writeText(copyText)
    toast.success('Meeting copied')
  }

  return (
    <article className="rounded-lg border border-surface-border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{meeting.title}</p>
          <p className="mt-1 text-xs text-ink-secondary">{formatMeetingDate(meeting.occurredAt ?? meeting.scheduledAt ?? meeting.createdAt)} · {meeting.status.replace(/_/g, ' ')}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" className="tk-icon-button" onClick={copyMeeting} aria-label={`Copy ${meeting.title}`} title="Copy">
            <Copy className="h-4 w-4" />
          </button>
          {link ? (
            <a className="tk-icon-button" href={link} target="_blank" rel="noreferrer" aria-label={`Open ${meeting.title}`} title="Open">
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : null}
        </div>
      </div>
      {meeting.summary ? <p className="mt-3 line-clamp-3 text-sm text-ink-secondary">{meeting.summary.replace(/#/g, '').trim()}</p> : null}
      {meeting.actionItems.length ? (
        <ul className="mt-3 space-y-1 text-sm text-ink-secondary">
          {meeting.actionItems.slice(0, 3).map(item => <li key={item}>- {item}</li>)}
        </ul>
      ) : null}
    </article>
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

function formatMeetingDate(value?: string | null) {
  if (!value) return 'No date'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}
