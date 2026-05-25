import { AlertTriangle, CheckCircle2, FileSearch, FileText, Loader2, UploadCloud, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { PageHeader } from '@/components/ui/PageHeader'
import { useRole } from '@/hooks/useRole'
import { useAccountStore } from '@/stores/accountStore'
import { useTimelineStore } from '@/stores/timelineStore'
import { useV3Store } from '@/stores/v3Store'
import { AIExtractionDraft, SourceDocument } from '@/types/v3'
import { cn } from '@/utils/cn'
import { formatCompactCurrency, formatDate, formatRelative } from '@/utils/formatters'

export function Onboarding() {
  const user = useRole()
  const drafts = useV3Store(state => state.onboardingDrafts)
  const documents = useV3Store(state => state.sourceDocuments)
  const addMockUploadDraft = useV3Store(state => state.addMockUploadDraft)
  const approveDraft = useV3Store(state => state.approveDraft)
  const rejectDraft = useV3Store(state => state.rejectDraft)
  const importAccounts = useAccountStore(state => state.importAccounts)
  const addEntry = useTimelineStore(state => state.addEntry)
  const [selectedId, setSelectedId] = useState(drafts[0]?.id ?? '')
  const [fileNames, setFileNames] = useState<string[]>([])
  const [extracting, setExtracting] = useState(false)

  const selected = drafts.find(draft => draft.id === selectedId) ?? drafts[0]
  const selectedDocs = useMemo(
    () => selected ? documents.filter(document => selected.sourceDocumentIds.includes(document.id)) : [],
    [documents, selected],
  )

  async function runMockExtraction() {
    const names = fileNames.length ? fileNames : ['New Client Project Charter.pdf', 'New Client SOW.pdf']
    setExtracting(true)
    await new Promise(resolve => window.setTimeout(resolve, 700))
    const draftId = addMockUploadDraft(names, user.name)
    setSelectedId(draftId)
    setExtracting(false)
    toast.success('AI extraction draft created')
  }

  function approve(selectedDraft: AIExtractionDraft) {
    const approved = approveDraft(selectedDraft.id)
    if (!approved) return
    importAccounts([approved.accountDraft])
    addEntry({
      id: `tl-onboarding-${approved.id}`,
      accountId: approved.accountDraft.id,
      eventType: 'account_setup',
      module: 'kyc',
      title: 'Account onboarding approved from charter/SOW',
      description: `${approved.accountDraft.name} and ${approved.engagementDrafts.length} engagement draft were approved from source documents.`,
      performedBy: user.id,
      performedByName: user.name,
      timestamp: new Date().toISOString(),
      sourceRecordId: approved.id,
      sourceRecordType: 'ai_extraction_draft',
      sourceRecordRoute: `/accounts/${approved.accountDraft.id}`,
      metadata: { sourceDocumentIds: approved.sourceDocumentIds, confidence: approved.confidence },
      isSensitive: false,
      isSystemGenerated: true,
      isImmutable: true,
    })
    toast.success('Draft approved and Account Overview created')
  }

  function reject(selectedDraft: AIExtractionDraft) {
    rejectDraft(selectedDraft.id)
    toast.success('Draft rejected and retained for audit')
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
              {drafts.map(draft => (
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

        {selected ? (
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

                <ReviewCard title="AI-enriched KYC">
                  <div className="grid gap-3 md:grid-cols-2">
                    {Object.entries(selected.kycDraft.sections).map(([key, value]) => (
                      <Field key={key} label={key.replace(/([A-Z])/g, ' $1')} value={value} multiline />
                    ))}
                  </div>
                </ReviewCard>
              </section>

              <aside className="space-y-4">
                <ReviewCard title="Source documents">
                  <div className="space-y-2">
                    {selectedDocs.map(document => <DocumentRow key={document.id} document={document} />)}
                  </div>
                </ReviewCard>
                <ReviewCard title="AI research sources">
                  <div className="grid gap-2">
                    {selected.kycDraft.researchSources.map(source => (
                      <div key={source} className="rounded-lg border border-blue-tint-20 bg-blue-tint-20 p-3">
                        <p className="text-sm font-semibold text-brand-blue">{source}</p>
                        <p className="mt-1 text-xs text-ink-secondary">Used through AI/LLM Gateway with citation guardrails.</p>
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
                  <Link className="tk-button-primary w-full" to={`/accounts/${selected.accountDraft.id}`}>
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

function DraftBadge({ status }: { status: AIExtractionDraft['status'] }) {
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
