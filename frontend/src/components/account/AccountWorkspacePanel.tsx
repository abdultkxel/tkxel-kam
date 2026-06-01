import * as Dialog from '@radix-ui/react-dialog'
import { ArrowRight, BookOpen, CalendarClock, CheckCircle2, FileText, GraduationCap, Loader2, PenLine, Plus, Send, ShieldAlert, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { AddGovernanceEventDialog } from '@/components/governance/AddGovernanceEventDialog'
import { CompleteGovernanceEventDialog } from '@/components/governance/CompleteGovernanceEventDialog'
import { Account } from '@/types/account'
import { useGovernanceStore } from '@/stores/governanceStore'
import { useV3Store } from '@/stores/v3Store'
import { RetentionPlan } from '@/types/v3'
import { GovernanceEventRecord } from '@/types/governance'
import { formatDate } from '@/utils/formatters'
import { useAuth } from '@/contexts/AuthContext'
import { ContentRecommendation, createSentContent, Escalation, listContentRecommendations, listEscalations, listSentContent, SentContent } from '@/services/contentGovernance'

export function AccountWorkspacePanel({ account, tab }: { account: Account; tab: string }) {
  const documents = useV3Store(state => state.sourceDocuments).filter(document => document.accountId === account.id)
  const plans = useV3Store(state => state.retentionPlans).filter(item => item.accountId === account.id)
  const governance = useGovernanceStore(state => state.events).filter(event => event.accountId === account.id)

  if (tab === 'Education') {
    return <EducationPanel account={account} />
  }
  if (tab === 'Escalation') {
    return <EscalationPanel account={account} />
  }
  if (tab === 'Governance') {
    return <GovernanceAccountPanel account={account} governance={governance} />
  }
  if (tab === 'Notes') {
    return <NotesPanel account={account} plans={plans} />
  }
  return (
    <WorkspaceList
      icon={FileText}
      eyebrow="Source evidence"
      title="Documents and citations"
      description="Charters, SOWs, extraction citations, and confidence signals used by Account Overview."
      action={{ label: 'Upload source', to: '/accounts/onboarding' }}
      accountName={account.name}
      items={documents.map(document => ({
        title: document.name,
        detail: document.citations[0]?.excerpt ?? 'No citation available yet.',
        meta: [document.type.replace('_', ' '), `${document.confidence}% confidence`],
        tone: document.confidence >= 80 ? 'green' : 'orange',
      }))}
    />
  )
}

function GovernanceAccountPanel({ account, governance }: { account: Account; governance: GovernanceEventRecord[] }) {
  const sortedGovernance = [...governance].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  return (
    <section className="tk-card overflow-hidden">
      <header className="border-b border-surface-border bg-surface-secondary p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-tint-20 text-brand-blue">
                <CalendarClock className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Governance cadence</p>
                <h3 className="text-base font-semibold text-ink">Governance details</h3>
              </div>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-secondary">
              QBRs, SteerCos, monthly reviews, executive reviews, agendas, attendee emails, decisions, and governance-local action items.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="tk-button-secondary shrink-0 bg-white" to="/dashboard">
              View calendar
              <ArrowRight className="h-4 w-4" />
            </Link>
            <AddGovernanceEventDialog defaultAccountId={account.id} lockAccount triggerClassName="tk-button-primary shrink-0" />
          </div>
        </div>
      </header>
      <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="grid gap-3">
          {sortedGovernance.length ? sortedGovernance.map(event => (
            <article key={event.id} className="rounded-lg border border-surface-border bg-white p-4 transition-colors hover:border-brand-blue/40">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-ink">{event.type} on {formatDate(event.date)}</h4>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-secondary">{event.agenda}</p>
                </div>
                <StatusBadge tone={event.status === 'overdue' ? 'red' : event.status === 'completed' ? 'green' : 'blue'} label={event.status} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-surface-secondary px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">{event.attendeeEmails.length} attendees</span>
                <span className="rounded-full bg-surface-secondary px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">Actions: {event.actionItems.length}</span>
                {event.ownerName ? <span className="rounded-full bg-surface-secondary px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">Owner: {event.ownerName}</span> : null}
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <GovernanceDetailList title="Attendees" items={event.attendeeEmails} empty="No attendee emails recorded." />
                <GovernanceDetailList title="Decisions" items={event.decisions.map(item => item.decisionText)} empty="No decisions captured yet." />
                <GovernanceDetailList title="Action items" items={event.actionItems} empty="No governance action items." />
                <GovernanceDetailList title="Notes" items={event.notes.map(item => item.body)} empty="No completion notes yet." />
              </div>
              {event.status !== 'completed' && event.status !== 'cancelled' ? (
                <div className="mt-4 flex justify-end">
                  <CompleteGovernanceEventDialog event={event} />
                </div>
              ) : null}
            </article>
          )) : (
            <EmptyWorkspaceState icon={CalendarClock} title="No governance events yet" body="Schedule the next QBR, SteerCo, monthly review, or executive review for this account." />
          )}
        </div>
        <WorkspaceContext
          title="Governance details"
          count={sortedGovernance.length}
          accountName={account.name}
          body="Governance events stay tied to this account, while calendar surfaces can merge them with renewal, score, and future event types."
        />
      </div>
    </section>
  )
}

function GovernanceDetailList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-secondary p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">{title}</p>
      <div className="mt-2 space-y-1">
        {items.length ? items.slice(0, 4).map(item => <p key={item} className="text-sm leading-5 text-ink-secondary">{item}</p>) : <p className="text-sm text-ink-tertiary">{empty}</p>}
      </div>
    </div>
  )
}

function EducationPanel({ account }: { account: Account }) {
  const { token } = useAuth()
  const [recommendations, setRecommendations] = useState<ContentRecommendation[]>([])
  const [sentItems, setSentItems] = useState<SentContent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [selectedContentId, setSelectedContentId] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')

  useEffect(() => {
    if (!token) return
    let cancelled = false
    setLoading(true)
    setError('')
    Promise.all([listContentRecommendations(token, account.id), listSentContent(token, account.id, new URLSearchParams({ page: '1', page_size: '10' }))])
      .then(([nextRecommendations, sentPage]) => {
        if (cancelled) return
        setRecommendations(nextRecommendations)
        setSentItems(sentPage.items)
        setSelectedContentId(nextRecommendations[0]?.content.id ?? '')
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Education content could not load')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [account.id, token])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!token || !selectedContentId || !recipientName.trim()) return
    try {
      const created = await createSentContent(token, account.id, {
        content_item_id: selectedContentId,
        recipient_name: recipientName,
        recipient_email: recipientEmail || undefined,
      })
      setSentItems(current => [created, ...current])
      setOpen(false)
      setRecipientName('')
      setRecipientEmail('')
      toast.success('Content shared with client')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Content could not be shared')
    }
  }

  return (
    <section className="tk-card overflow-hidden">
      <header className="border-b border-surface-border bg-surface-secondary p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-tint-20 text-brand-blue">
                <GraduationCap className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Client education</p>
                <h3 className="text-base font-semibold text-ink">Recommendations and sent content</h3>
              </div>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-secondary">
              Review recommended education assets and record confirmed sharing actions in account history.
            </p>
          </div>
          <EducationUploadDialog
            open={open}
            onOpenChange={setOpen}
            recommendations={recommendations}
            selectedContentId={selectedContentId}
            onSelectedContentIdChange={setSelectedContentId}
            recipientName={recipientName}
            onRecipientNameChange={setRecipientName}
            recipientEmail={recipientEmail}
            onRecipientEmailChange={setRecipientEmail}
            onSubmit={submit}
          />
        </div>
      </header>
      <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="grid gap-3">
          {loading ? (
            <div className="flex min-h-[160px] items-center justify-center rounded-lg border border-surface-border text-sm font-semibold text-ink-secondary"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading education content</div>
          ) : error ? (
            <div className="rounded-lg border border-rag-red/20 bg-rag-red/10 p-4 text-sm font-semibold text-rag-red">{error}</div>
          ) : recommendations.length || sentItems.length ? (
            <>
              {recommendations.map(item => (
                <article key={item.content.id} className="rounded-lg border border-surface-border bg-white p-4 transition-colors hover:border-brand-blue/40">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-ink">{item.content.title}</h4>
                      <p className="mt-1 text-sm leading-6 text-ink-secondary">{item.rationale}</p>
                    </div>
                    <StatusBadge tone="blue" label={`${item.relevance_score}% match`} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-surface-secondary px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">{item.content.category}</span>
                    {item.content.tags.map(tag => <span key={tag} className="rounded-full bg-surface-secondary px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">{tag}</span>)}
                  </div>
                </article>
              ))}
              {sentItems.map(item => (
                <article key={item.id} className="rounded-lg border border-surface-border bg-white p-4 transition-colors hover:border-brand-blue/40">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-ink">{item.content_title_snapshot}</h4>
                  <p className="mt-1 text-sm leading-6 text-ink-secondary">Shared with {item.recipient_name} on {formatDate(item.shared_at)}.</p>
                </div>
                <StatusBadge tone="green" label="Shared" />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-surface-secondary px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">{item.content_type_snapshot}</span>
                <span className="rounded-full bg-blue-tint-20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-brand-blue">{item.follow_up_status.replace('_', ' ')}</span>
              </div>
            </article>
              ))}
            </>
          ) : (
            <EmptyWorkspaceState icon={GraduationCap} title="No education content yet" body="Add content in Admin, then recommendations and sent history will appear here." />
          )}
        </div>
        <WorkspaceContext title="Shared content" count={sentItems.length} accountName={account.name} body="Education records show what was shared and when the client received it." />
      </div>
    </section>
  )
}

function EducationUploadDialog({
  open,
  onOpenChange,
  recommendations,
  selectedContentId,
  onSelectedContentIdChange,
  recipientName,
  onRecipientNameChange,
  recipientEmail,
  onRecipientEmailChange,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  recommendations: ContentRecommendation[]
  selectedContentId: string
  onSelectedContentIdChange: (value: string) => void
  recipientName: string
  onRecipientNameChange: (value: string) => void
  recipientEmail: string
  onRecipientEmailChange: (value: string) => void
  onSubmit: (event: FormEvent) => void
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>
        <button type="button" className="tk-button-primary shrink-0">
          <Send className="h-4 w-4" />
          Share content
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-surface-border bg-white p-5 shadow-panel">
          <div className="flex items-start justify-between gap-4 border-b border-surface-border pb-4">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Client education</p>
              <Dialog.Title className="font-display text-2xl font-bold text-ink">Record shared content</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-secondary">Choose a recommended asset and record who received it.</Dialog.Description>
            </div>
            <Dialog.Close className="tk-icon-button" aria-label="Close content upload">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <form onSubmit={onSubmit} className="mt-5 space-y-4">
            <label className="space-y-1">
              <span className="tk-label text-xs">Content <span className="text-brand-orange">*</span></span>
              <select className="tk-input" value={selectedContentId} onChange={event => onSelectedContentIdChange(event.target.value)} required>
                {recommendations.map(item => <option key={item.content.id} value={item.content.id}>{item.content.title}</option>)}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="tk-label text-xs">Recipient name</span>
                <input className="tk-input" value={recipientName} onChange={event => onRecipientNameChange(event.target.value)} required />
              </label>
              <label className="space-y-1">
                <span className="tk-label text-xs">Recipient email</span>
                <input type="email" className="tk-input" value={recipientEmail} onChange={event => onRecipientEmailChange(event.target.value)} />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-surface-border pt-4">
              <Dialog.Close type="button" className="tk-button-secondary">Cancel</Dialog.Close>
              <button type="submit" className="tk-button-primary">
                <Send className="h-4 w-4" />
                Record share
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function EscalationPanel({ account }: { account: Account }) {
  const { token } = useAuth()
  const [items, setItems] = useState<Escalation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    let cancelled = false
    setLoading(true)
    setError('')
    listEscalations(token, new URLSearchParams({ account_id: account.id, page: '1', page_size: '10', sort: 'sla_due_at' }))
      .then(page => {
        if (!cancelled) setItems(page.items)
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Escalations could not load')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [account.id, token])

  if (loading) {
    return (
      <section className="tk-card flex min-h-[220px] items-center justify-center text-sm font-semibold text-ink-secondary">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading escalations
      </section>
    )
  }
  if (error) {
    return <section className="tk-card p-5 text-sm font-semibold text-rag-red">{error}</section>
  }
  return (
    <WorkspaceList
      icon={ShieldAlert}
      eyebrow="Risk response"
      title="Escalation management"
      description="Escalations, recovery context, SLA posture, and mitigation notes for this account."
      action={{ label: 'Open escalations', to: '/escalations' }}
      accountName={account.name}
      items={items.map(item => ({
        title: item.summary,
        detail: item.mitigation || item.impact,
        meta: [item.severity, item.status, `SLA ${formatDate(item.sla_due_at)}`],
        tone: item.severity === 'critical' ? 'red' : item.severity === 'high' ? 'orange' : 'blue',
      }))}
    />
  )
}

type AccountNote = {
  id: string
  title: string
  body: string
  createdAt: string
}

function NotesPanel({ account, plans }: { account: Account; plans: RetentionPlan[] }) {
  const [notes, setNotes] = useState<AccountNote[]>(() => [
    ...plans.map(plan => ({
      id: `plan-${plan.id}`,
      title: plan.title,
      body: plan.successCriteria.join(', '),
      createdAt: new Date().toISOString(),
    })),
  ])
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  function submit(event: FormEvent) {
    event.preventDefault()
    const cleanBody = body.trim()
    if (!cleanBody) return
    setNotes(current => [
      {
        id: `note-${Date.now()}`,
        title: title.trim() || 'Account note',
        body: cleanBody,
        createdAt: new Date().toISOString(),
      },
      ...current,
    ])
    setTitle('')
    setBody('')
    setOpen(false)
    toast.success('Note added')
  }

  return (
    <section className="tk-card overflow-hidden">
      <header className="border-b border-surface-border bg-surface-secondary p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-tint-20 text-brand-blue">
                <BookOpen className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Account notes</p>
                <h3 className="text-base font-semibold text-ink">Notes and planning context</h3>
              </div>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-secondary">
              Capture account-specific context, decisions, and follow-up notes without leaving Account Overview.
            </p>
          </div>
          <AddAccountNoteDialog
            open={open}
            onOpenChange={setOpen}
            title={title}
            body={body}
            onTitleChange={setTitle}
            onBodyChange={setBody}
            onSubmit={submit}
          />
        </div>
      </header>
      <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="grid gap-3">
          {notes.length ? notes.map(note => (
            <article key={note.id} className="rounded-lg border border-surface-border bg-white p-4 transition-colors hover:border-brand-blue/40">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-ink">{note.title}</h4>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-secondary">{note.body}</p>
                </div>
                <StatusBadge tone="blue" label="Note" />
              </div>
              <p className="mt-3 text-xs font-medium text-ink-tertiary">Added {formatDate(note.createdAt)}</p>
            </article>
          )) : (
            <EmptyWorkspaceState icon={BookOpen} title="No notes yet" body="Add a note to capture account planning context." />
          )}
        </div>
        <WorkspaceContext title="Notes" count={notes.length} accountName={account.name} body="Notes stay with this account and support timeline, handover, and review preparation." />
      </div>
    </section>
  )
}

function AddAccountNoteDialog({
  open,
  onOpenChange,
  title,
  body,
  onTitleChange,
  onBodyChange,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  body: string
  onTitleChange: (value: string) => void
  onBodyChange: (value: string) => void
  onSubmit: (event: FormEvent) => void
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>
        <button type="button" className="tk-button-primary shrink-0">
          <PenLine className="h-4 w-4" />
          Add note
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-surface-border bg-white p-5 shadow-panel">
          <div className="flex items-start justify-between gap-4 border-b border-surface-border pb-4">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Account notes</p>
              <Dialog.Title className="font-display text-2xl font-bold text-ink">Add note</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-secondary">Capture a planning note, decision, or client context update.</Dialog.Description>
            </div>
            <Dialog.Close className="tk-icon-button" aria-label="Close note dialog">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <form onSubmit={onSubmit} className="mt-5 space-y-4">
            <label className="space-y-1">
              <span className="tk-label text-xs">Title</span>
              <input className="tk-input" value={title} onChange={event => onTitleChange(event.target.value)} placeholder="Renewal prep, stakeholder update, delivery context" />
            </label>
            <label className="space-y-1">
              <span className="tk-label text-xs">Note <span className="text-brand-orange">*</span></span>
              <textarea className="tk-input min-h-[150px] resize-y" value={body} onChange={event => onBodyChange(event.target.value)} placeholder="Write the account note..." required />
            </label>
            <div className="flex justify-end gap-2 border-t border-surface-border pt-4">
              <Dialog.Close type="button" className="tk-button-secondary">Cancel</Dialog.Close>
              <button type="submit" className="tk-button-primary">
                <Plus className="h-4 w-4" />
                Save note
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function EmptyWorkspaceState({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-surface-border bg-surface-secondary p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-brand-blue">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h4 className="text-sm font-semibold text-ink">{title}</h4>
          <p className="mt-1 max-w-xl text-sm leading-6 text-ink-secondary">{body}</p>
        </div>
      </div>
    </div>
  )
}

function WorkspaceContext({ title, count, accountName, body }: { title: string; count: number; accountName: string; body: string }) {
  return (
    <aside className="rounded-lg border border-surface-border bg-white p-4">
      <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Account context</p>
      <div className="mt-4 grid gap-3">
        <ContextRow label="Workspace" value={title} />
        <ContextRow label="Records" value={count} />
        <ContextRow label="Account" value={accountName} />
      </div>
      <div className="mt-4 flex items-start gap-2 rounded-lg bg-blue-tint-20 p-3 text-sm leading-6 text-brand-blue">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{body}</span>
      </div>
    </aside>
  )
}

type WorkspaceItem = {
  title: string
  detail: string
  meta: string[]
  tone: 'blue' | 'green' | 'orange' | 'red'
}

function WorkspaceList({
  icon: Icon,
  eyebrow,
  title,
  description,
  action,
  accountName,
  items,
}: {
  icon: LucideIcon
  eyebrow: string
  title: string
  description: string
  action: { label: string; to: string }
  accountName: string
  items: WorkspaceItem[]
}) {
  return (
    <section className="tk-card overflow-hidden">
      <header className="border-b border-surface-border bg-surface-secondary p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-tint-20 text-brand-blue">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">{eyebrow}</p>
                <h3 className="text-base font-semibold text-ink">{title}</h3>
              </div>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-secondary">{description}</p>
          </div>
          <Link className="tk-button-secondary shrink-0 bg-white" to={action.to}>
            {action.label}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>
      <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="grid gap-3">
          {items.length ? items.map(item => (
            <article key={`${item.title}-${item.detail}`} className="rounded-lg border border-surface-border bg-white p-4 transition-colors hover:border-brand-blue/40">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-ink">{item.title}</h4>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-secondary">{item.detail}</p>
                </div>
                <StatusBadge tone={item.tone} label={item.meta[0] ?? 'Open'} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {item.meta.slice(1).map(meta => (
                  <span key={meta} className="rounded-full bg-surface-secondary px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
                    {meta}
                  </span>
                ))}
              </div>
            </article>
          )) : (
            <div className="rounded-lg border border-dashed border-surface-border bg-surface-secondary p-6">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-brand-blue">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <h4 className="text-sm font-semibold text-ink">No records yet</h4>
                  <p className="mt-1 max-w-xl text-sm leading-6 text-ink-secondary">Related account activity will appear here once documents, tasks, escalations, governance events, or plan notes are created.</p>
                </div>
              </div>
            </div>
          )}
        </div>
        <aside className="rounded-lg border border-surface-border bg-white p-4">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Account context</p>
          <div className="mt-4 grid gap-3">
            <ContextRow label="Workspace" value={title} />
            <ContextRow label="Records" value={items.length} />
            <ContextRow label="Account" value={accountName} />
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-blue-tint-20 p-3 text-sm leading-6 text-brand-blue">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Items here are tied to the current account and keep their source context for timeline review.</span>
          </div>
        </aside>
      </div>
    </section>
  )
}

function StatusBadge({ tone, label }: { tone: WorkspaceItem['tone']; label: string }) {
  const toneClass = {
    blue: 'border-blue-tint-20 bg-blue-tint-20 text-brand-blue',
    green: 'border-rag-green/20 bg-rag-green/10 text-rag-green',
    orange: 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange',
    red: 'border-rag-red/20 bg-rag-red/10 text-rag-red',
  }[tone]

  return <span className={`w-fit shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${toneClass}`}>{label}</span>
}

function ContextRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-surface-border pb-3 last:border-b-0 last:pb-0">
      <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">{label}</span>
      <span className="text-sm font-semibold text-ink">{value}</span>
    </div>
  )
}
