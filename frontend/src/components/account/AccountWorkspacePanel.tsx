import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, ArrowRight, BookOpen, CalendarClock, CheckCircle2, Download, FileSearch, FileText, GraduationCap, Loader2, PenLine, Plus, RefreshCcw, Send, ShieldAlert, UploadCloud, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { FieldError } from '@/components/form/FieldError'
import { AddGovernanceEventDialog } from '@/components/governance/AddGovernanceEventDialog'
import { CompleteGovernanceEventDialog } from '@/components/governance/CompleteGovernanceEventDialog'
import { GovernanceEventActions } from '@/components/governance/GovernanceEventActions'
import { Account } from '@/types/account'
import { useGovernanceStore } from '@/stores/governanceStore'
import { useTimelineStore } from '@/stores/timelineStore'
import { useV3Store } from '@/stores/v3Store'
import { RetentionPlan, SourceDocument } from '@/types/v3'
import { GovernanceEventRecord } from '@/types/governance'
import { formatDate } from '@/utils/formatters'
import { useAuth } from '@/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'
import { ContentRecommendation, createSentContent, Escalation, listContentRecommendations, listEscalations, listSentContent, SentContent } from '@/services/contentGovernance'
import { downloadAccountAttachment, extractAccountAttachment, listAccountAttachments, uploadAccountAttachment } from '@/services/accountWorkspace'
import { ApiError } from '@/services/api'
import { createTimelineNote, getAccountTimeline } from '@/services/timeline'
import { TimelineEntry } from '@/types/timeline'
import { cn } from '@/utils/cn'
import { apiFieldErrors, clearFieldError, FieldErrors, hasFieldErrors } from '@/utils/formErrors'

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
  return <DocumentsPanel account={account} fallbackDocuments={documents} />
}

function DocumentsPanel({ account, fallbackDocuments }: { account: Account; fallbackDocuments: SourceDocument[] }) {
  const { token } = useAuth()
  const [documents, setDocuments] = useState<SourceDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [extractingId, setExtractingId] = useState('')
  const [downloadingId, setDownloadingId] = useState('')
  const [error, setError] = useState('')
  const [sourceType, setSourceType] = useState<SourceDocument['type']>('sow')
  const [isSensitive, setIsSensitive] = useState(false)

  useEffect(() => {
    if (!token) {
      setDocuments(fallbackDocuments)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    const params = new URLSearchParams({ page: '1', page_size: '50', sort: 'uploaded_date', direction: 'desc' })
    listAccountAttachments(token, account.id, params)
      .then(page => {
        if (!cancelled) setDocuments(page.items)
      })
      .catch(err => {
        if (!cancelled) {
          setDocuments(fallbackDocuments)
          setError(err instanceof Error ? err.message : 'Source documents could not load')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [account.id, fallbackDocuments, token])

  async function refreshDocuments() {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const page = await listAccountAttachments(token, account.id, new URLSearchParams({ page: '1', page_size: '50', sort: 'uploaded_date', direction: 'desc' }))
      setDocuments(page.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Source documents could not refresh')
    } finally {
      setLoading(false)
    }
  }

  async function uploadFiles(files: FileList | null) {
    if (!token || !files?.length) return
    setUploading(true)
    setError('')
    try {
      const uploaded: SourceDocument[] = []
      for (const file of Array.from(files)) {
        uploaded.push(await uploadAccountAttachment(token, account.id, { file, sourceType, isSensitive, extractNow: true }))
      }
      setDocuments(current => [...uploaded, ...current.filter(item => !uploaded.some(document => document.id === item.id))])
      toast.success(uploaded.length === 1 ? 'Source document uploaded and extracted' : `${uploaded.length} source documents uploaded and extracted`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Source document upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function extractDocument(document: SourceDocument) {
    if (!token) return
    setExtractingId(document.id)
    setError('')
    try {
      await extractAccountAttachment(token, account.id, document.id, true)
      await refreshDocuments()
      toast.success('Source document extracted')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Source document extraction failed')
    } finally {
      setExtractingId('')
    }
  }

  async function downloadDocument(document: SourceDocument) {
    if (!token) return
    setDownloadingId(document.id)
    setError('')
    try {
      await downloadAccountAttachment(token, account.id, document)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Source document download failed')
    } finally {
      setDownloadingId('')
    }
  }

  return (
    <section className="tk-card overflow-hidden">
      <header className="border-b border-surface-border bg-surface-secondary p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-tint-20 text-brand-blue">
                <FileText className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Source evidence</p>
                <h3 className="text-base font-semibold text-ink">Documents and citations</h3>
              </div>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-secondary">
              Upload real SOW, charter, PDF, DOCX, or text files here. Extracted chunks are used by AI KYC retrieval for reference-depth KYC drafts.
            </p>
          </div>
          <button type="button" className="tk-button-secondary shrink-0 bg-white" onClick={refreshDocuments} disabled={loading || uploading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            Refresh
          </button>
        </div>
      </header>

      <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-3">
          {error ? (
            <div className="flex items-start gap-2 rounded-lg border border-rag-red/20 bg-rag-red/10 p-3 text-sm text-rag-red">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
          {loading ? <DocumentsLoading /> : null}
          {!loading && documents.length ? documents.map(document => (
            <article key={document.id} className="rounded-lg border border-surface-border bg-white p-4 transition-colors hover:border-brand-blue/40">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-ink">{document.name}</h4>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-secondary">
                    {document.citations[0]?.excerpt || document.extractionError || extractionDescription(document)}
                  </p>
                </div>
                <StatusBadge tone={document.status === 'parsed' ? 'green' : document.extractionError ? 'red' : 'orange'} label={document.extractionStatus?.replace(/_/g, ' ') || document.status.replace(/_/g, ' ')} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <DocumentMeta value={document.type.replace(/_/g, ' ')} />
                <DocumentMeta value={`${document.confidence}% confidence`} />
                <DocumentMeta value={`${document.pages || 0} page${document.pages === 1 ? '' : 's'}`} />
                {document.sizeBytes ? <DocumentMeta value={formatBytes(document.sizeBytes)} /> : null}
                {document.ocrStatus ? <DocumentMeta value={`OCR ${document.ocrStatus.replace(/_/g, ' ')}`} /> : null}
                {document.extractedTextChecksum ? <DocumentMeta value="Text extracted" /> : null}
              </div>
              {document.fileName || document.status !== 'parsed' || document.extractionError ? (
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  {document.fileName ? (
                    <button type="button" className="tk-button-secondary bg-white" onClick={() => void downloadDocument(document)} disabled={Boolean(downloadingId)}>
                      {downloadingId === document.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      Download
                    </button>
                  ) : null}
                  {document.status !== 'parsed' || document.extractionError ? (
                    <button type="button" className="tk-button-secondary bg-white" onClick={() => void extractDocument(document)} disabled={Boolean(extractingId)}>
                      {extractingId === document.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
                      Extract text
                    </button>
                  ) : null}
                </div>
              ) : null}
            </article>
          )) : null}
          {!loading && !documents.length ? (
            <div className="rounded-lg border border-dashed border-surface-border bg-surface-secondary p-6">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-brand-blue">
                  <FileText className="h-5 w-5" />
                </span>
                <div>
                  <h4 className="text-sm font-semibold text-ink">No source documents yet</h4>
                  <p className="mt-1 max-w-xl text-sm leading-6 text-ink-secondary">Upload the client SOW, project charter, or reference attachments before creating a full KYC draft.</p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="rounded-lg border border-surface-border bg-white p-4">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Upload source</p>
          <div className="mt-4 grid gap-3">
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Source type</span>
              <select className="tk-input" value={sourceType} onChange={event => setSourceType(event.target.value as SourceDocument['type'])} disabled={uploading}>
                <option value="sow">SOW</option>
                <option value="project_charter">Project charter</option>
                <option value="attachment">Attachment</option>
                <option value="commercial_note">Commercial note</option>
                <option value="research">Research</option>
              </select>
            </label>
            <label className="flex min-h-[132px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-brand-blue/40 bg-surface-secondary p-4 text-center transition-colors hover:bg-blue-tint-20">
              {uploading ? <Loader2 className="h-6 w-6 animate-spin text-brand-blue" /> : <UploadCloud className="h-6 w-6 text-brand-blue" />}
              <span className="mt-2 text-sm font-semibold text-ink">{uploading ? 'Uploading and extracting...' : 'Upload PDF, DOCX, TXT, or CSV'}</span>
              <span className="mt-1 text-xs leading-5 text-ink-secondary">Files are stored locally, extracted, chunked, and used in the next AI KYC run.</span>
              <input
                type="file"
                multiple
                className="sr-only"
                accept=".pdf,.docx,.txt,.csv"
                disabled={uploading}
                onChange={event => {
                  void uploadFiles(event.target.files)
                  event.target.value = ''
                }}
              />
            </label>
            <label className="flex items-start gap-2 rounded-lg border border-surface-border p-3 text-sm text-ink-secondary">
              <input type="checkbox" className="mt-1" checked={isSensitive} onChange={event => setIsSensitive(event.target.checked)} disabled={uploading} />
              <span>Restrict this source to roles allowed to view sensitive KYC context.</span>
            </label>
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-blue-tint-20 p-3 text-sm leading-6 text-brand-blue">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>After upload, go to KYC and create a new draft so Qwen reads the extracted document chunks.</span>
          </div>
        </aside>
      </div>
    </section>
  )
}

function DocumentsLoading() {
  return (
    <div className="rounded-lg border border-surface-border bg-white p-4">
      <div className="flex items-center gap-3 text-sm font-semibold text-ink-secondary">
        <Loader2 className="h-4 w-4 animate-spin text-brand-blue" />
        Loading source documents
      </div>
    </div>
  )
}

function DocumentMeta({ value }: { value: string }) {
  return (
    <span className="rounded-full bg-surface-secondary px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
      {value}
    </span>
  )
}

function extractionDescription(document: SourceDocument) {
  if (document.status === 'parsed') return 'Extracted text is available for AI KYC retrieval.'
  if (document.extractionStatus === 'queued' || document.extractionStatus === 'running') return 'Text extraction is in progress.'
  return 'Text extraction is needed before this source can provide full KYC context.'
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
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
            <Link className="tk-button-secondary shrink-0 bg-white" to="/dashboard#governance-calendar">
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
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge tone={event.status === 'overdue' ? 'red' : event.status === 'completed' ? 'green' : 'blue'} label={event.status} />
                  <GovernanceEventActions event={event} />
                </div>
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
    if (!token) return
    if (!selectedContentId) {
      toast.error('Select content before recording a share')
      return
    }
    if (!recipientName.trim()) {
      toast.error('Recipient name is required')
      return
    }
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
              <select className="tk-input" value={selectedContentId} onChange={event => onSelectedContentIdChange(event.target.value)}>
                {recommendations.map(item => <option key={item.content.id} value={item.content.id}>{item.content.title}</option>)}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="tk-label text-xs">Recipient name</span>
                <input className="tk-input" value={recipientName} onChange={event => onRecipientNameChange(event.target.value)} />
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
  const { token } = useAuth()
  const user = useRole()
  const addTimelineEntry = useTimelineStore(state => state.addEntry)
  const planNotes = useMemo<AccountNote[]>(() => [
    ...plans.map(plan => ({
      id: `plan-${plan.id}`,
      title: plan.title,
      body: plan.successCriteria.join(', '),
      createdAt: new Date().toISOString(),
    })),
  ], [plans])
  const [notes, setNotes] = useState<AccountNote[]>(planNotes)
  const [loading, setLoading] = useState(Boolean(token))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  useEffect(() => {
    if (!token) {
      setNotes(planNotes)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    getAccountTimeline(token, account.id, { event_type: 'manual_note', direction: 'desc', page: 1, page_size: 50 })
      .then(result => {
        if (cancelled) return
        setNotes([...result.items.map(timelineEntryToNote), ...planNotes])
      })
      .catch(err => {
        if (cancelled) return
        setNotes(planNotes)
        setError(err instanceof Error ? err.message : 'Notes could not be loaded')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [account.id, planNotes, token])

  async function refreshNotes() {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const result = await getAccountTimeline(token, account.id, { event_type: 'manual_note', direction: 'desc', page: 1, page_size: 50 })
      setNotes([...result.items.map(timelineEntryToNote), ...planNotes])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Notes could not be refreshed')
    } finally {
      setLoading(false)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const cleanTitle = title.trim()
    const cleanBody = body.trim()
    const nextFieldErrors = validateNoteFields(cleanTitle, cleanBody)

    if (hasFieldErrors(nextFieldErrors)) {
      setFieldErrors(nextFieldErrors)
      setFormError('Fix the highlighted fields before saving.')
      toast.error('Fix the highlighted validation errors')
      return
    }
    if (!token) {
      setFormError('You must be signed in to save notes.')
      toast.error('You must be signed in to save notes')
      return
    }
    setSaving(true)
    setFormError('')
    setFieldErrors({})
    try {
      const entry = await createTimelineNote(token, account.id, {
        event_type: 'manual_note',
        title: cleanTitle || 'Account note',
        description: cleanBody,
        event_at: new Date().toISOString(),
        owner_id: user.id,
        mentions: [],
        attachments: [],
        is_sensitive: false,
        tags: ['manual', 'notes'],
      })
      addTimelineEntry(entry)
      setNotes(current => [timelineEntryToNote(entry), ...current.filter(note => note.id !== entry.id)])
      setTitle('')
      setBody('')
      setOpen(false)
      toast.success('Note saved')
    } catch (err) {
      const nextErrors = apiFieldErrors(err, noteFieldAliases)
      const hiddenFieldMessage = firstHiddenNoteFieldMessage(nextErrors)
      const message = err instanceof ApiError
        ? hiddenFieldMessage || (hasFieldErrors(nextErrors) ? 'Fix the highlighted fields before saving.' : err.message)
        : 'Note could not be saved'
      setFieldErrors(nextErrors)
      setFormError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  function updateTitle(value: string) {
    setTitle(value)
    setFieldErrors(errors => clearFieldError(errors, 'title'))
    setFormError('')
  }

  function updateBody(value: string) {
    setBody(value)
    setFieldErrors(errors => clearFieldError(errors, 'body'))
    setFormError('')
  }

  function handleDialogOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    setFormError('')
    setFieldErrors({})
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
          <div className="flex flex-wrap gap-2">
            <button type="button" className="tk-button-secondary shrink-0 bg-white" onClick={() => void refreshNotes()} disabled={!token || loading || saving}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              Refresh
            </button>
            <AddAccountNoteDialog
              open={open}
              onOpenChange={handleDialogOpenChange}
              title={title}
              body={body}
              saving={saving}
              formError={formError}
              fieldErrors={fieldErrors}
              onTitleChange={updateTitle}
              onBodyChange={updateBody}
              onSubmit={submit}
            />
          </div>
        </div>
      </header>
      <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="grid gap-3">
          {error ? (
            <div className="flex items-start gap-2 rounded-lg border border-rag-red/20 bg-rag-red/10 p-3 text-sm text-rag-red">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
          {loading ? (
            <div className="rounded-lg border border-surface-border bg-white p-4">
              <div className="flex items-center gap-3 text-sm font-semibold text-ink-secondary">
                <Loader2 className="h-4 w-4 animate-spin text-brand-blue" />
                Loading notes
              </div>
            </div>
          ) : null}
          {!loading && notes.length ? notes.map(note => (
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
          )) : null}
          {!loading && !notes.length ? (
            <EmptyWorkspaceState icon={BookOpen} title="No notes yet" body="Add a note to capture account planning context." />
          ) : null}
        </div>
        <WorkspaceContext title="Notes" count={notes.length} accountName={account.name} body="Notes stay with this account and support timeline, handover, and review preparation." />
      </div>
    </section>
  )
}

const noteFieldAliases = {
  description: 'body',
  event_type: 'eventType',
  owner_id: 'ownerId',
} satisfies Record<string, string>

function validateNoteFields(title: string, body: string): FieldErrors {
  const errors: FieldErrors = {}
  if (title.length > 220) errors.title = 'Title must be 220 characters or fewer.'
  if (!body) errors.body = 'Note is required.'
  else if (body.length < 3) errors.body = 'Note must be at least 3 characters.'
  else if (body.length > 2000) errors.body = 'Note must be 2000 characters or fewer.'
  return errors
}

function firstHiddenNoteFieldMessage(fieldErrors: FieldErrors) {
  const hiddenError = Object.entries(fieldErrors).find(([field]) => field !== 'title' && field !== 'body')
  return hiddenError?.[1] ?? ''
}

function timelineEntryToNote(entry: TimelineEntry): AccountNote {
  return {
    id: entry.id,
    title: entry.title || 'Account note',
    body: entry.description,
    createdAt: entry.timestamp,
  }
}

function AddAccountNoteDialog({
  open,
  onOpenChange,
  title,
  body,
  saving,
  formError,
  fieldErrors,
  onTitleChange,
  onBodyChange,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  body: string
  saving: boolean
  formError: string
  fieldErrors: FieldErrors
  onTitleChange: (value: string) => void
  onBodyChange: (value: string) => void
  onSubmit: (event: FormEvent) => void | Promise<void>
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
            {formError ? (
              <div className="flex items-start gap-2 rounded-lg border border-rag-red/20 bg-rag-red/10 p-3 text-sm font-semibold text-rag-red">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            ) : null}
            <label className="space-y-1">
              <span className={cn('tk-label text-xs', fieldErrors.title && 'text-rag-red')}>Title</span>
              <input
                className={noteInputClass(fieldErrors.title)}
                value={title}
                onChange={event => onTitleChange(event.target.value)}
                placeholder="Renewal prep, stakeholder update, delivery context"
                aria-invalid={Boolean(fieldErrors.title)}
                aria-describedby={fieldErrors.title ? 'account-note-title-error' : undefined}
              />
              <FieldError id="account-note-title-error" message={fieldErrors.title} />
            </label>
            <label className="space-y-1">
              <span className={cn('tk-label text-xs', fieldErrors.body && 'text-rag-red')}>Note <span className="text-brand-orange">*</span></span>
              <textarea
                className={noteInputClass(fieldErrors.body, 'min-h-[150px] resize-y')}
                value={body}
                onChange={event => onBodyChange(event.target.value)}
                placeholder="Write the account note..."
                aria-invalid={Boolean(fieldErrors.body)}
                aria-describedby={fieldErrors.body ? 'account-note-body-error' : undefined}
              />
              <div className="flex flex-wrap items-start justify-between gap-2">
                <FieldError id="account-note-body-error" message={fieldErrors.body} />
                <p className={cn('ml-auto text-xs font-semibold text-ink-tertiary', body.length > 2000 && 'text-rag-red')}>{body.length}/2000</p>
              </div>
            </label>
            <div className="flex justify-end gap-2 border-t border-surface-border pt-4">
              <Dialog.Close type="button" className="tk-button-secondary">Cancel</Dialog.Close>
              <button type="submit" className="tk-button-primary" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {saving ? 'Saving...' : 'Save note'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function noteInputClass(error?: string, extra?: string) {
  return cn('tk-input', error && 'border-rag-red focus:border-rag-red focus:ring-rag-red/20', extra)
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
