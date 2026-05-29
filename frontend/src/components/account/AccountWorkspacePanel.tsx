import * as Dialog from '@radix-ui/react-dialog'
import { ArrowRight, BookOpen, CalendarClock, CheckCircle2, FileText, GraduationCap, PenLine, Plus, ShieldAlert, Upload, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Account } from '@/types/account'
import { useGovernanceStore } from '@/stores/governanceStore'
import { useV3Store } from '@/stores/v3Store'
import { EducationContent, RetentionPlan } from '@/types/v3'
import { formatDate } from '@/utils/formatters'

export function AccountWorkspacePanel({ account, tab }: { account: Account; tab: string }) {
  const documents = useV3Store(state => state.sourceDocuments).filter(document => document.accountId === account.id)
  const content = useV3Store(state => state.educationContent).filter(item => item.recommendedFor === account.name)
  const escalations = useV3Store(state => state.escalationRecords).filter(item => item.accountId === account.id)
  const plans = useV3Store(state => state.retentionPlans).filter(item => item.accountId === account.id)
  const governance = useGovernanceStore(state => state.events).filter(event => event.accountId === account.id)

  if (tab === 'Education') {
    return <EducationPanel account={account} content={content} />
  }
  if (tab === 'Escalation') {
    return (
      <WorkspaceList
        icon={ShieldAlert}
        eyebrow="Risk response"
        title="Escalation management"
        description="Escalations, recovery context, SLA posture, and mitigation notes for this account."
        action={{ label: 'Review escalation', to: '/tasks' }}
        accountName={account.name}
        items={escalations.map(item => ({
          title: item.title,
          detail: item.mitigation,
          meta: [item.severity, item.status, `SLA ${formatDate(item.slaDue)}`],
          tone: item.severity === 'red' ? 'red' : 'orange',
        }))}
      />
    )
  }
  if (tab === 'Governance') {
    return (
      <WorkspaceList
        icon={CalendarClock}
        eyebrow="Governance cadence"
        title="Governance details"
        description="QBRs, SteerCos, executive reviews, agendas, attendees, and action items."
        action={{ label: 'View calendar', to: '/dashboard' }}
        accountName={account.name}
        items={governance.map(item => ({
          title: `${item.type} on ${formatDate(item.date)}`,
          detail: item.agenda,
          meta: [item.status, `${item.attendees.length} attendees`, `Actions: ${item.actionItems.length}`],
          tone: item.status === 'overdue' ? 'red' : item.status === 'completed' ? 'green' : 'blue',
        }))}
      />
    )
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

type SharedContentItem = {
  id: string
  title: string
  stage: string
  tags: string[]
  lastShared?: string
}

function EducationPanel({ account, content }: { account: Account; content: EducationContent[] }) {
  const [items, setItems] = useState<SharedContentItem[]>(content)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [sharedOn, setSharedOn] = useState(new Date().toISOString().slice(0, 10))
  const [contentType, setContentType] = useState('Playbook excerpt')

  function submit(event: FormEvent) {
    event.preventDefault()
    const cleanTitle = title.trim()
    if (!cleanTitle) return
    setItems(current => [
      {
        id: `content-${Date.now()}`,
        title: cleanTitle,
        stage: account.stage,
        tags: [contentType, 'Client shared'],
        lastShared: new Date(`${sharedOn}T12:00:00`).toISOString(),
      },
      ...current,
    ])
    setTitle('')
    setContentType('Playbook excerpt')
    setSharedOn(new Date().toISOString().slice(0, 10))
    setOpen(false)
    toast.success('Content shared with client')
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
                <h3 className="text-base font-semibold text-ink">Shared content</h3>
              </div>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-secondary">
              Track content uploaded or shared with the client, including the exact shared date for account history.
            </p>
          </div>
          <EducationUploadDialog
            open={open}
            onOpenChange={setOpen}
            title={title}
            onTitleChange={setTitle}
            sharedOn={sharedOn}
            onSharedOnChange={setSharedOn}
            contentType={contentType}
            onContentTypeChange={setContentType}
            onSubmit={submit}
          />
        </div>
      </header>
      <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="grid gap-3">
          {items.length ? items.map(item => (
            <article key={item.id} className="rounded-lg border border-surface-border bg-white p-4 transition-colors hover:border-brand-blue/40">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-ink">{item.title}</h4>
                  <p className="mt-1 text-sm leading-6 text-ink-secondary">
                    {item.lastShared ? `Shared with ${account.name} on ${formatDate(item.lastShared)}.` : 'Recommended for the current stage, not shared yet.'}
                  </p>
                </div>
                <StatusBadge tone={item.lastShared ? 'green' : 'blue'} label={item.lastShared ? 'Shared' : 'Recommended'} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-surface-secondary px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">{item.stage}</span>
                {item.lastShared ? <span className="rounded-full bg-blue-tint-20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-brand-blue">Shared date: {formatDate(item.lastShared)}</span> : null}
                {item.tags.map(tag => (
                  <span key={tag} className="rounded-full bg-surface-secondary px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">{tag}</span>
                ))}
              </div>
            </article>
          )) : (
            <EmptyWorkspaceState icon={GraduationCap} title="No content shared yet" body="Upload a content item once it has been sent to the client." />
          )}
        </div>
        <WorkspaceContext title="Shared content" count={items.length} accountName={account.name} body="Education records show what was shared and when the client received it." />
      </div>
    </section>
  )
}

function EducationUploadDialog({
  open,
  onOpenChange,
  title,
  onTitleChange,
  sharedOn,
  onSharedOnChange,
  contentType,
  onContentTypeChange,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  onTitleChange: (value: string) => void
  sharedOn: string
  onSharedOnChange: (value: string) => void
  contentType: string
  onContentTypeChange: (value: string) => void
  onSubmit: (event: FormEvent) => void
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>
        <button type="button" className="tk-button-primary shrink-0">
          <Upload className="h-4 w-4" />
          Upload content
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-surface-border bg-white p-5 shadow-panel">
          <div className="flex items-start justify-between gap-4 border-b border-surface-border pb-4">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Client education</p>
              <Dialog.Title className="font-display text-2xl font-bold text-ink">Upload shared content</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-ink-secondary">Record the asset and the date it was shared with the client.</Dialog.Description>
            </div>
            <Dialog.Close className="tk-icon-button" aria-label="Close content upload">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <form onSubmit={onSubmit} className="mt-5 space-y-4">
            <label className="space-y-1">
              <span className="tk-label text-xs">Content title <span className="text-brand-orange">*</span></span>
              <input className="tk-input" value={title} onChange={event => onTitleChange(event.target.value)} placeholder="QBR prep deck, security overview, case study" required />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="tk-label text-xs">Shared date</span>
                <input type="date" className="tk-input" value={sharedOn} onChange={event => onSharedOnChange(event.target.value)} />
              </label>
              <label className="space-y-1">
                <span className="tk-label text-xs">Content type</span>
                <select className="tk-input" value={contentType} onChange={event => onContentTypeChange(event.target.value)}>
                  <option>Playbook excerpt</option>
                  <option>Case study</option>
                  <option>Deck</option>
                  <option>Technical brief</option>
                  <option>Commercial note</option>
                </select>
              </label>
            </div>
            <label className="flex min-h-[108px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-brand-blue/40 bg-blue-tint-20 p-4 text-center">
              <Upload className="h-5 w-5 text-brand-blue" />
              <span className="mt-2 text-sm font-semibold text-ink">Attach file</span>
              <span className="mt-1 text-xs text-ink-secondary">Prototype upload, file is not persisted.</span>
              <input type="file" className="sr-only" />
            </label>
            <div className="flex justify-end gap-2 border-t border-surface-border pt-4">
              <Dialog.Close type="button" className="tk-button-secondary">Cancel</Dialog.Close>
              <button type="submit" className="tk-button-primary">
                <Plus className="h-4 w-4" />
                Add content
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
