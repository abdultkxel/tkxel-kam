import { AlertTriangle, CheckCircle2, Download, FileSearch, FileText, Loader2, RefreshCw, UploadCloud, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'
import { approveOnboardingDraft, createOnboardingDraftFromUpload, downloadOnboardingDraftDocument, getOnboardingDraft, listOnboardingDrafts, OnboardingDraftView, rejectOnboardingDraft, retryOnboardingDraftDocumentExtraction } from '@/services/accountWorkspace'
import { SourceDocument } from '@/types/v3'
import { cn } from '@/utils/cn'
import { formatCompactCurrency, formatDate, formatRelative } from '@/utils/formatters'

export function Onboarding() {
  const user = useRole()
  const { token } = useAuth()
  const [drafts, setDrafts] = useState<OnboardingDraftView[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [extracting, setExtracting] = useState(false)
  const [retryingDocumentId, setRetryingDocumentId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const selected = drafts.find(draft => draft.id === selectedId) ?? drafts[0]
  const selectedDocs = useMemo(() => selected?.sourceDocuments ?? [], [selected])

  useEffect(() => {
    if (!token) return
    let active = true
    setLoading(true)
    setError('')
    listOnboardingDrafts(token, new URLSearchParams({ page: '1', page_size: '25' }))
      .then(result => {
        if (!active) return
        setDrafts(result.items)
        setSelectedId(current => current || result.items[0]?.id || '')
      })
      .catch(err => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Unable to load onboarding drafts')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [token])

  async function runDocumentExtraction() {
    if (!token) {
      toast.error('Please log in again before creating a draft')
      return
    }
    if (!files.length) {
      toast.error('Select at least one SOW, charter, or source document')
      return
    }
    setExtracting(true)
    try {
      const draft = await createOnboardingDraftFromUpload(token, {
        files,
        managerEmail: user.email,
        managerName: user.name,
      })
      setDrafts(current => [draft, ...current.filter(item => item.id !== draft.id)])
      setSelectedId(draft.id)
      setFiles([])
      toast.success('Source-backed draft created from uploaded document text')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Draft could not be created')
    } finally {
      setExtracting(false)
    }
  }

  async function approve(selectedDraft: OnboardingDraftView) {
    if (!token) return
    try {
      const approved = await approveOnboardingDraft(token, selectedDraft.id)
      setDrafts(current => current.map(item => (item.id === approved.id ? approved : item)))
      toast.success('Draft approved and Account Overview created')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Draft could not be approved')
    }
  }

  async function reject(selectedDraft: OnboardingDraftView) {
    if (!token) return
    try {
      const rejected = await rejectOnboardingDraft(token, selectedDraft.id, 'Rejected from onboarding review.')
      setDrafts(current => current.map(item => (item.id === rejected.id ? rejected : item)))
      toast.success('Draft rejected and retained for audit')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Draft could not be rejected')
    }
  }

  async function retryDocumentExtraction(selectedDraft: OnboardingDraftView, document: SourceDocument) {
    if (!token) return
    setRetryingDocumentId(document.id)
    try {
      await retryOnboardingDraftDocumentExtraction(token, selectedDraft.id, document.id, true)
      const refreshed = await getOnboardingDraft(token, selectedDraft.id)
      setDrafts(current => current.map(item => (item.id === refreshed.id ? refreshed : item)))
      toast.success('Source extraction retried')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Source extraction could not be retried')
    } finally {
      setRetryingDocumentId('')
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Accounts -> Onboarding"
        title="Charter/SOW Intake"
        description="KAM Head uploads project charters and SOWs, reviews AI extraction, then approves account, engagement, and KYC drafts."
      />

      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="tk-card p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-tint-20 text-brand-blue">
                <UploadCloud className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-ink">Upload source documents</h2>
                <p className="mt-1 text-sm text-ink-secondary">Upload one or more charters or SOWs. Draft fields are extracted from document text.</p>
              </div>
            </div>
            <label className="mt-4 flex min-h-[132px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-brand-blue/40 bg-blue-tint-20 p-4 text-center">
              <FileSearch className="h-6 w-6 text-brand-blue" />
              <span className="mt-2 text-sm font-semibold text-ink">Select charter/SOW files</span>
              <span className="mt-1 text-xs text-ink-secondary">PDF, DOCX, TXT, and CSV files are stored and parsed for review.</span>
              <input
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.txt,.csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/csv"
                className="sr-only"
                onChange={event => setFiles(Array.from(event.target.files ?? []))}
              />
            </label>
            {files.length ? (
              <div className="mt-3 space-y-2">
                {files.map(file => (
                  <div key={`${file.name}-${file.size}`} className="flex items-center gap-2 rounded-md bg-surface-secondary p-2 text-xs font-medium text-ink-secondary">
                    <FileText className="h-4 w-4 text-brand-blue" />
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <button className="tk-button-primary mt-4 w-full" onClick={runDocumentExtraction} disabled={extracting || !files.length}>
              {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
              Extract from uploaded SOW
            </button>
          </section>

          <section className="tk-card p-4">
            <h2 className="text-sm font-semibold text-ink">Draft queue</h2>
            <div className="mt-3 space-y-2">
              {loading ? (
                <>
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </>
              ) : error ? (
                <div className="rounded-lg border border-rag-red/20 bg-rag-red/10 p-3 text-sm text-rag-red">{error}</div>
              ) : drafts.length === 0 ? (
                <div className="rounded-lg border border-surface-border bg-surface-secondary p-3 text-sm text-ink-secondary">No onboarding drafts yet.</div>
              ) : drafts.map(draft => (
                <button
                  key={draft.id}
                  className={cn('w-full rounded-lg border p-3 text-left transition-colors', selected?.id === draft.id ? 'border-brand-blue bg-blue-tint-20' : 'border-surface-border bg-white hover:bg-surface-tertiary')}
                  onClick={() => setSelectedId(draft.id)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-ink">{draft.accountDraft.name}</span>
                    <DraftBadge status={draft.status} />
                  </div>
                  <p className="mt-1 text-xs text-ink-secondary">{draft.engagementDrafts.length} engagement draft | {draft.confidence}% confidence</p>
                </button>
              ))}
            </div>
          </section>
        </aside>

        {loading && !selected ? (
          <main className="space-y-5">
            <Skeleton className="h-56 w-full" />
            <Skeleton className="h-96 w-full" />
          </main>
        ) : error && !selected ? (
          <EmptyState icon={AlertTriangle} heading="Onboarding drafts could not be loaded" body={error} />
        ) : selected ? (
          <main className="space-y-5">
            <section className="tk-card p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">AI extraction review</p>
                  <h2 className="font-display text-3xl font-bold text-ink">{selected.accountDraft.name}</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-secondary">
                    Review account, engagement, and KYC fields before any record becomes official. AI output stays draft until KAM Head approval.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="tk-button-secondary" onClick={() => reject(selected)} disabled={selected.status !== 'ready_for_review'}>
                    <XCircle className="h-4 w-4" />
                    Reject
                  </button>
                  <button className="tk-button-primary" onClick={() => approve(selected)} disabled={selected.status !== 'ready_for_review'}>
                    <CheckCircle2 className="h-4 w-4" />
                    Approve draft
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-4">
                <ReviewMetric label="Confidence" value={`${selected.confidence}%`} tone="blue" />
                <ReviewMetric label="ARR Draft" value={formatCompactCurrency(selected.accountDraft.arr)} tone="dark" />
                <ReviewMetric label="Engagements" value={selected.engagementDrafts.length} tone="dark" />
                <ReviewMetric label="Missing fields" value={selected.missingFields.length} tone="orange" />
              </div>
            </section>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <section className="space-y-4">
                <ReviewCard title="Draft account">
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Lifecycle" value={selected.accountDraft.stage} />
                    <Field label="Segment" value={selected.accountDraft.segment} />
                    <Field label="Owner" value={selected.accountDraft.ownerName} />
                    <Field label="Region / tags" value={selected.accountDraft.tags.join(', ')} />
                  </div>
                </ReviewCard>

                {selected.engagementDrafts.map(engagement => (
                  <ReviewCard key={engagement.id} title={engagement.name}>
                    <div className="grid gap-3 md:grid-cols-3">
                      <Field label="Value" value={formatCompactCurrency(engagement.value)} />
                      <Field label="SOW end" value={formatDate(engagement.renewalTerms.endDate)} />
                      <Field label="Notice deadline" value={formatDate(engagement.renewalTerms.noticeDeadline)} />
                      <Field label="Auto-renewal" value={engagement.renewalTerms.autoRenewal ? 'Yes' : 'No'} />
                      <Field label="Confidence" value={`${engagement.renewalTerms.confidence}%`} />
                      <Field label="Ops Lead" value={engagement.opsLeadName} />
                    </div>
                    <p className="mt-3 rounded-lg border border-brand-orange/20 bg-brand-orange/10 p-3 text-sm text-brand-orange">
                      {engagement.renewalTerms.sourceCitation}
                    </p>
                  </ReviewCard>
                ))}

                <ReviewCard title="Source-backed account context">
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Project" value={selected.accountDraft.projectName ?? 'Not provided'} />
                    <Field label="Company URL" value={selected.accountDraft.companyUrl ?? 'Not provided'} />
                    <Field label="Evidence" value={selected.sourceDocuments[0]?.citations[0]?.excerpt ?? 'No citation excerpt recorded'} multiline />
                    <Field label="Created by" value={selected.createdByName} />
                  </div>
                </ReviewCard>
              </section>

              <aside className="space-y-4">
                <ReviewCard title="Source documents">
                  <div className="space-y-2">
                    {selectedDocs.map(document => (
                      <DocumentRow
                        key={document.id}
                        document={document}
                        onDownload={token ? () => downloadOnboardingDraftDocument(token, selected.id, document).catch(err => toast.error(err instanceof Error ? err.message : 'Document could not be downloaded')) : undefined}
                        onRetry={token && selected.status === 'ready_for_review' ? () => retryDocumentExtraction(selected, document) : undefined}
                        retrying={retryingDocumentId === document.id}
                      />
                    ))}
                  </div>
                </ReviewCard>
                <ReviewCard title="Source citations">
                  {selected.sourceDocuments.some(document => document.citations.length) ? (
                    <div className="grid gap-2">
                      {selected.sourceDocuments.flatMap(document => document.citations.map(citation => ({ citation, document }))).map(({ citation, document }) => (
                        <div key={citation.id} className="rounded-lg border border-blue-tint-20 bg-blue-tint-20 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-brand-blue">{citation.fieldKey ? formatFieldKey(citation.fieldKey) : citation.label}</p>
                              <p className="mt-0.5 text-[11px] font-medium text-ink-secondary">{document.name} · page {citation.page}</p>
                            </div>
                            <span className="shrink-0 rounded-full border border-white/70 bg-white px-2 py-0.5 text-[11px] font-semibold text-brand-blue">{citation.confidence ?? document.confidence}%</span>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-ink-secondary">{citation.excerpt}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-surface-border bg-surface-secondary p-3 text-sm text-ink-secondary">No source citations were extracted yet.</div>
                  )}
                </ReviewCard>
                <ReviewCard title="Review blockers">
                  <div className="space-y-3">
                    {[...selected.missingFields, ...selected.conflicts].map(item => (
                      <div key={item} className="flex gap-2 rounded-lg border border-brand-orange/20 bg-brand-orange/10 p-3 text-sm text-brand-orange">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        {item}
                      </div>
                    ))}
                  </div>
                </ReviewCard>
                {selected.status === 'approved' ? (
                  <Link className="tk-button-primary w-full" to={`/accounts/${selected.approvedAccountId ?? selected.accountDraft.id}`}>
                    Open Account Overview
                  </Link>
                ) : null}
              </aside>
            </div>
          </main>
        ) : null}
      </div>
    </div>
  )
}

function DraftBadge({ status }: { status: OnboardingDraftView['status'] }) {
  return (
    <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider', status === 'approved' ? 'border-rag-green/20 bg-rag-green/10 text-rag-green' : status === 'rejected' ? 'border-rag-red/20 bg-rag-red/10 text-rag-red' : 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange')}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function ReviewMetric({ label, value, tone }: { label: string; value: string | number; tone: 'blue' | 'orange' | 'dark' }) {
  const toneClass = tone === 'blue' ? 'text-brand-blue' : tone === 'orange' ? 'text-brand-orange' : 'text-ink'
  return (
    <div className="rounded-lg bg-surface-secondary p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">{label}</p>
      <p className={`mt-1 font-display text-3xl font-bold ${toneClass}`}>{value}</p>
    </div>
  )
}

function ReviewCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="tk-card p-5">
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Field({ label, value, multiline = false }: { label: string; value: ReactNode; multiline?: boolean }) {
  return (
    <div className="rounded-lg border border-surface-border bg-white p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">{label}</p>
      <p className={cn('mt-1 text-sm font-medium text-ink', multiline ? 'leading-6' : '')}>{value}</p>
    </div>
  )
}

function DocumentRow({ document, onDownload, onRetry, retrying = false }: { document: SourceDocument; onDownload?: () => void; onRetry?: () => void; retrying?: boolean }) {
  const canRetry = Boolean(onRetry && ['failed', 'needs_review', 'ocr_required'].includes(document.extractionStatus ?? ''))
  return (
    <div className="rounded-lg border border-surface-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">{document.name}</p>
          <p className="mt-1 text-xs text-ink-secondary">{document.type.replace('_', ' ')} | {document.pages} pages | {formatRelative(document.uploadedAt)}</p>
        </div>
        <div className="flex items-center gap-2">
          {canRetry ? (
            <button className="tk-icon-button" type="button" onClick={onRetry} disabled={retrying} title="Retry extraction" aria-label="Retry extraction">
              {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </button>
          ) : null}
          {onDownload ? (
            <button className="tk-icon-button" type="button" onClick={onDownload} title="Download source document" aria-label="Download source document">
              <Download className="h-4 w-4" />
            </button>
          ) : null}
          <span className="rounded-full border border-blue-tint-20 bg-blue-tint-20 px-2 py-0.5 text-[11px] font-semibold text-brand-blue">{document.confidence}%</span>
        </div>
      </div>
      {document.extractionStatus && document.extractionStatus !== 'completed' ? (
        <p className="mt-2 rounded-md bg-surface-secondary p-2 text-xs font-medium text-ink-secondary">
          Extraction status: {document.extractionStatus.replace(/_/g, ' ')}
          {document.extractionError ? ` · ${document.extractionError}` : ''}
        </p>
      ) : null}
      {document.citations.slice(0, 1).map(citation => (
        <p key={citation.id} className="mt-3 rounded-md bg-surface-secondary p-2 text-xs leading-5 text-ink-secondary">
          <span className="font-semibold text-ink">{citation.fieldKey ? formatFieldKey(citation.fieldKey) : citation.label}</span>
          {' '}· page {citation.page} · {citation.confidence ?? document.confidence}% confidence: {citation.excerpt}
        </p>
      ))}
    </div>
  )
}

function formatFieldKey(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
}
