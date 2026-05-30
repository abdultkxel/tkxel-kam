import { AlertTriangle, CheckCircle2, FileSearch, FileText, Loader2, UploadCloud, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'
import { approveOnboardingDraft, createOnboardingDraft, listOnboardingDrafts, OnboardingDraftView, rejectOnboardingDraft } from '@/services/accountWorkspace'
import { SourceDocument } from '@/types/v3'
import { cn } from '@/utils/cn'
import { formatCompactCurrency, formatDate, formatRelative } from '@/utils/formatters'

export function Onboarding() {
  const user = useRole()
  const { token } = useAuth()
  const [drafts, setDrafts] = useState<OnboardingDraftView[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [fileNames, setFileNames] = useState<string[]>([])
  const [extracting, setExtracting] = useState(false)
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

  async function runMockExtraction() {
    const names = fileNames.length ? fileNames : ['New Client Project Charter.pdf', 'New Client SOW.pdf']
    if (!token) {
      toast.error('Please log in again before creating a draft')
      return
    }
    setExtracting(true)
    try {
      const draft = await createOnboardingDraft(token, {
        accountName: cleanDocumentName(names[0]),
        projectName: cleanProjectName(names.find(name => /sow|statement/i.test(name)) ?? names[0]),
        companyUrl: `https://${slugify(cleanDocumentName(names[0]))}.com`,
        managerEmail: user.email,
        managerName: user.name,
        fileNames: names,
      })
      setDrafts(current => [draft, ...current.filter(item => item.id !== draft.id)])
      setSelectedId(draft.id)
      toast.success('AI extraction draft created')
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
                <p className="mt-1 text-sm text-ink-secondary">Mock intake accepts multiple charters and SOWs for one client.</p>
              </div>
            </div>
            <label className="mt-4 flex min-h-[132px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-brand-blue/40 bg-blue-tint-20 p-4 text-center">
              <FileSearch className="h-6 w-6 text-brand-blue" />
              <span className="mt-2 text-sm font-semibold text-ink">Select charter/SOW files</span>
              <span className="mt-1 text-xs text-ink-secondary">PDF/DOCX names are used for prototype extraction.</span>
              <input
                type="file"
                multiple
                className="sr-only"
                onChange={event => setFileNames(Array.from(event.target.files ?? []).map(file => file.name))}
              />
            </label>
            {fileNames.length ? (
              <div className="mt-3 space-y-2">
                {fileNames.map(name => (
                  <div key={name} className="flex items-center gap-2 rounded-md bg-surface-secondary p-2 text-xs font-medium text-ink-secondary">
                    <FileText className="h-4 w-4 text-brand-blue" />
                    {name}
                  </div>
                ))}
              </div>
            ) : null}
            <button className="tk-button-primary mt-4 w-full" onClick={runMockExtraction} disabled={extracting}>
              {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
              Run AI extraction
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
                    {selectedDocs.map(document => <DocumentRow key={document.id} document={document} />)}
                  </div>
                </ReviewCard>
                <ReviewCard title="Source citations">
                  <div className="grid gap-2">
                    {selected.sourceDocuments.flatMap(document => document.citations).map(citation => (
                      <div key={citation.id} className="rounded-lg border border-blue-tint-20 bg-blue-tint-20 p-3">
                        <p className="text-sm font-semibold text-brand-blue">{citation.label}</p>
                        <p className="mt-1 text-xs text-ink-secondary">{citation.excerpt}</p>
                      </div>
                    ))}
                  </div>
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

function DocumentRow({ document }: { document: SourceDocument }) {
  return (
    <div className="rounded-lg border border-surface-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">{document.name}</p>
          <p className="mt-1 text-xs text-ink-secondary">{document.type.replace('_', ' ')} | {document.pages} pages | {formatRelative(document.uploadedAt)}</p>
        </div>
        <span className="rounded-full border border-blue-tint-20 bg-blue-tint-20 px-2 py-0.5 text-[11px] font-semibold text-brand-blue">{document.confidence}%</span>
      </div>
      {document.citations.slice(0, 1).map(citation => (
        <p key={citation.id} className="mt-3 rounded-md bg-surface-secondary p-2 text-xs leading-5 text-ink-secondary">{citation.label}, page {citation.page}: {citation.excerpt}</p>
      ))}
    </div>
  )
}

function cleanDocumentName(name: string) {
  const base = stripDocumentExtension(name)
  const cleaned = base
    .replace(/\b(project charter|charter|statement of work|sow|msa|contract|renewal|growth|services|service|q[1-4]|20\d{2})\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return toTitleCase(cleaned || base || 'New Client')
}

function cleanProjectName(name: string) {
  const base = stripDocumentExtension(name)
  const cleaned = base.replace(/\b(project charter|charter|statement of work|sow)\b/gi, ' ').replace(/\s+/g, ' ').trim()
  return toTitleCase(cleaned || 'New client engagement')
}

function stripDocumentExtension(name: string) {
  return name.replace(/\.(pdf|docx?)$/i, '').replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim()
}

function toTitleCase(value: string) {
  return value.toLowerCase().replace(/\b[a-z]/g, char => char.toUpperCase())
}

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'new-client'
}
