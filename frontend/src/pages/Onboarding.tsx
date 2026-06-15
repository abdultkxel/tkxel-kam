import { AlertTriangle, CheckCircle2, Download, FileSearch, FileText, Loader2, RefreshCw, UploadCloud, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/contexts/AuthContext'
import { useCapabilities } from '@/hooks/useCapabilities'
import { useRole } from '@/hooks/useRole'
import { ApiError } from '@/services/api'
import {
  approveOnboardingDraft,
  createOnboardingDraftFromUpload,
  downloadOnboardingDraftDocument,
  getOnboardingDraft,
  listOnboardingAccountManagers,
  listOnboardingDrafts,
  OnboardingAccountManager,
  OnboardingDraftView,
  rejectOnboardingDraft,
  retryOnboardingDraftDocumentExtraction,
  updateOnboardingDraft,
} from '@/services/accountWorkspace'
import { SourceDocument } from '@/types/v3'
import { cn } from '@/utils/cn'
import { formatCompactCurrency, formatDate, formatRelative } from '@/utils/formatters'
import { allProjectCharterFiles, PROJECT_CHARTER_ACCEPT } from '@/utils/projectCharterFiles'

type DraftEditState = {
  accountName: string
  projectName: string
  companyUrl: string
  linkedinUrl: string
  managerId: string
}

const emptyDraftEdits: DraftEditState = {
  accountName: '',
  projectName: '',
  companyUrl: '',
  linkedinUrl: '',
  managerId: '',
}

export function Onboarding() {
  const user = useRole()
  const { capabilities } = useCapabilities()
  const { token } = useAuth()
  const [drafts, setDrafts] = useState<OnboardingDraftView[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [accountManagers, setAccountManagers] = useState<OnboardingAccountManager[]>([])
  const [selectedManagerId, setSelectedManagerId] = useState('')
  const [loadingManagers, setLoadingManagers] = useState(false)
  const [draftEdits, setDraftEdits] = useState<DraftEditState>(emptyDraftEdits)
  const [draftEditErrors, setDraftEditErrors] = useState<Partial<Record<keyof DraftEditState, string>>>({})
  const [savingDraft, setSavingDraft] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [retryingDocumentId, setRetryingDocumentId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const selected = drafts.find(draft => draft.id === selectedId) ?? drafts[0]
  const selectedDocs = useMemo(() => selected?.sourceDocuments ?? [], [selected])
  const assignableManagers = assignableAccountManagers(accountManagers, user, capabilities.can_assign_account_owners)
  const intakeManager = assignableManagers.find(manager => manager.id === selectedManagerId)
  const selectedOwnerId = selected?.accountDraft.ownerId && selected.accountDraft.ownerId !== 'pending-owner' ? selected.accountDraft.ownerId : ''
  const selectedOwnerMissing = selected?.status === 'ready_for_review' && !selectedOwnerId
  const canApproveOnboarding = capabilities.can_approve_onboarding

  useEffect(() => {
    if (!selected) return
    setDraftEdits({
      accountName: selected.accountDraft.name ?? '',
      projectName: selected.accountDraft.projectName ?? '',
      companyUrl: selected.accountDraft.companyUrl ?? '',
      linkedinUrl: selected.accountDraft.linkedinUrl ?? '',
      managerId: selectedOwnerId,
    })
    setDraftEditErrors({})
  }, [selected?.id, selectedOwnerId])

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

  useEffect(() => {
    if (!token) return
    let active = true
    setLoadingManagers(true)
    listOnboardingAccountManagers(token)
      .then(managers => {
        if (!active) return
        setAccountManagers(managers)
        setSelectedManagerId(current => current || defaultAccountManagerId(assignableAccountManagers(managers, user, capabilities.can_assign_account_owners), user, capabilities.can_assign_account_owners))
      })
      .catch(() => {
        if (active) setAccountManagers([])
      })
      .finally(() => {
        if (active) setLoadingManagers(false)
      })
    return () => {
      active = false
    }
  }, [capabilities.can_assign_account_owners, token, user])

  async function runDocumentExtraction() {
    if (!token) {
      toast.error('Please log in again before creating a draft')
      return
    }
    if (!files.length) {
      toast.error('Select at least one Excel project charter')
      return
    }
    if (!allProjectCharterFiles(files)) {
      toast.error('Only Excel project charter files are allowed')
      return
    }
    if (!intakeManager) {
      toast.error('Select an account manager before creating a draft')
      return
    }
    setExtracting(true)
    try {
      const draft = await createOnboardingDraftFromUpload(token, {
        files,
        managerId: intakeManager.id,
        managerEmail: intakeManager.email,
        managerName: intakeManager.name,
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
    if (!selectedDraft.accountDraft.ownerId || selectedDraft.accountDraft.ownerId === 'pending-owner') {
      toast.error('Assign an account manager before approving this draft')
      return
    }
    try {
      const approved = await approveOnboardingDraft(token, selectedDraft.id)
      setDrafts(current => current.map(item => (item.id === approved.id ? approved : item)))
      toast.success('Draft approved and Account Overview created')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Draft could not be approved')
    }
  }

  function updateDraftEdit(field: keyof DraftEditState, value: string) {
    setDraftEdits(current => ({ ...current, [field]: value }))
    setDraftEditErrors(current => ({ ...current, [field]: undefined }))
  }

  function validateDraftEdits() {
    const nextErrors: Partial<Record<keyof DraftEditState, string>> = {}
    if (!draftEdits.accountName.trim()) nextErrors.accountName = 'Account name is required'
    if (!draftEdits.projectName.trim()) nextErrors.projectName = 'Project name is required'
    if (draftEdits.linkedinUrl.trim() && !isLinkedinUrl(draftEdits.linkedinUrl)) nextErrors.linkedinUrl = 'Enter a valid LinkedIn URL'
    if (!draftEdits.managerId || !assignableManagers.some(manager => manager.id === draftEdits.managerId)) nextErrors.managerId = 'Select an account manager'
    setDraftEditErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  function applyDraftEditApiErrors(error: unknown) {
    if (!(error instanceof ApiError) || !error.fieldErrors.length) return
    const nextErrors: Partial<Record<keyof DraftEditState, string>> = {}
    for (const fieldError of error.fieldErrors) {
      const field = mapDraftEditApiField(fieldError.field)
      if (field) nextErrors[field] = fieldError.message
    }
    setDraftEditErrors(current => ({ ...current, ...nextErrors }))
  }

  async function saveDraftEdits(draft: OnboardingDraftView) {
    if (!token || draft.status !== 'ready_for_review' || !validateDraftEdits()) return
    const manager = assignableManagers.find(item => item.id === draftEdits.managerId)
    if (!manager) return
    setSavingDraft(true)
    try {
      const updated = await updateOnboardingDraft(token, draft.id, {
        accountName: draftEdits.accountName.trim(),
        projectName: draftEdits.projectName.trim(),
        companyUrl: draftEdits.companyUrl.trim(),
        linkedinUrl: draftEdits.linkedinUrl.trim(),
        managerId: manager.id,
        managerName: manager.name,
        managerEmail: manager.email,
      })
      setDrafts(current => current.map(item => (item.id === updated.id ? updated : item)))
      setDraftEdits({
        accountName: updated.accountDraft.name ?? '',
        projectName: updated.accountDraft.projectName ?? '',
        companyUrl: updated.accountDraft.companyUrl ?? '',
        linkedinUrl: updated.accountDraft.linkedinUrl ?? '',
        managerId: updated.accountDraft.ownerId && updated.accountDraft.ownerId !== 'pending-owner' ? updated.accountDraft.ownerId : '',
      })
      toast.success('Draft changes saved')
    } catch (err) {
      applyDraftEditApiErrors(err)
      toast.error(err instanceof Error ? err.message : 'Draft changes could not be saved')
    } finally {
      setSavingDraft(false)
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
        title="Project Charter Intake"
        description="Account Managers upload Excel project charters; Account Managers and KAM Heads edit, approve, or reject the draft before records become official."
      />

      <div className={cn('grid gap-5', selected ? 'xl:grid-cols-1' : 'xl:grid-cols-[360px_minmax(0,1fr)]')}>
        {!selected ? (
          <aside className="space-y-4">
            <section className="tk-card p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-tint-20 text-brand-blue">
                  <UploadCloud className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-ink">Upload project charter</h2>
                  <p className="mt-1 text-sm text-ink-secondary">Upload one or more Excel project charter files. Other formats are not accepted here.</p>
                </div>
              </div>
              <label className="mt-4 flex min-h-[132px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-brand-blue/40 bg-blue-tint-20 p-4 text-center">
                <FileSearch className="h-6 w-6 text-brand-blue" />
                <span className="mt-2 text-sm font-semibold text-ink">Select Excel charter files</span>
                <span className="mt-1 text-xs text-ink-secondary">Only Excel project charter files are allowed: XLSX, XLSM, or XLS.</span>
                <input
                  type="file"
                  multiple
                  accept={PROJECT_CHARTER_ACCEPT}
                  className="sr-only"
                  onChange={event => {
                    const selectedFiles = Array.from(event.target.files ?? [])
                    if (!allProjectCharterFiles(selectedFiles)) {
                      setFiles([])
                      toast.error('Only Excel project charter files are allowed')
                      event.currentTarget.value = ''
                      return
                    }
                    setFiles(selectedFiles)
                  }}
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
              <label className="mt-4 block space-y-1">
                <span className="tk-label text-xs">Account Manager <span className="text-brand-orange">*</span></span>
                <select
                  className="tk-input"
                  value={selectedManagerId}
                  onChange={event => setSelectedManagerId(event.target.value)}
                  disabled={loadingManagers}
                >
                  <option value="">{loadingManagers ? 'Loading account managers...' : 'Select account manager'}</option>
                  {assignableManagers.map(manager => (
                    <option key={manager.id} value={manager.id}>{manager.name} - {manager.email}</option>
                  ))}
                </select>
              </label>
              <button className="tk-button-primary mt-4 w-full" onClick={runDocumentExtraction} disabled={extracting || !files.length || !intakeManager}>
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
                  className="w-full rounded-lg border border-surface-border bg-white p-3 text-left transition-colors hover:bg-surface-tertiary"
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
        ) : null}

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
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Charter extraction review</p>
                  <h2 className="font-display text-3xl font-bold text-ink">{selected.accountDraft.name}</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-secondary">
                    Review account, engagement, and KYC fields before any record becomes official. Extracted output stays draft until Account Manager or KAM Head approval.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="tk-button-secondary" onClick={() => reject(selected)} disabled={!canApproveOnboarding || selected.status !== 'ready_for_review'}>
                    <XCircle className="h-4 w-4" />
                    Reject
                  </button>
                  <button className="tk-button-primary" onClick={() => approve(selected)} disabled={!canApproveOnboarding || selected.status !== 'ready_for_review' || selectedOwnerMissing}>
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
                  {selected.status === 'ready_for_review' ? (
                    <form
                      className="space-y-4"
                      onSubmit={event => {
                        event.preventDefault()
                        void saveDraftEdits(selected)
                      }}
                    >
                      <div className="grid gap-3 md:grid-cols-2">
                        <DraftTextInput label="Account name" value={draftEdits.accountName} error={draftEditErrors.accountName} onChange={value => updateDraftEdit('accountName', value)} />
                        <DraftTextInput label="Project name" value={draftEdits.projectName} error={draftEditErrors.projectName} onChange={value => updateDraftEdit('projectName', value)} />
                        <DraftTextInput label="Company URL" value={draftEdits.companyUrl} error={draftEditErrors.companyUrl} onChange={value => updateDraftEdit('companyUrl', value)} placeholder="https://customer.example.com" />
                        <DraftTextInput label="LinkedIn URL" value={draftEdits.linkedinUrl} error={draftEditErrors.linkedinUrl} onChange={value => updateDraftEdit('linkedinUrl', value)} placeholder="https://www.linkedin.com/company/customer" />
                      </div>
                      <label className="block space-y-1">
                        <span className={cn('tk-label text-xs', draftEditErrors.managerId ? 'text-rag-red' : '')}>
                          Assigned Account Manager <span className="text-brand-orange">*</span>
                        </span>
                        <select
                          className={cn('tk-input', (selectedOwnerMissing || draftEditErrors.managerId) ? 'border-brand-orange focus:border-brand-orange focus:ring-brand-orange/30' : '')}
                          value={draftEdits.managerId}
                          onChange={event => updateDraftEdit('managerId', event.target.value)}
                          disabled={loadingManagers || savingDraft}
                        >
                          <option value="">{loadingManagers ? 'Loading account managers...' : 'Select account manager'}</option>
                          {assignableManagers.map(manager => (
                            <option key={manager.id} value={manager.id}>{manager.name} - {manager.email}</option>
                          ))}
                        </select>
                        {draftEditErrors.managerId ? <p className="text-xs text-rag-red">{draftEditErrors.managerId}</p> : null}
                        {selectedOwnerMissing ? <p className="text-xs text-brand-orange">Save an account manager before approval.</p> : null}
                      </label>
                      <div className="flex justify-end">
                        <button className="tk-button-primary" type="submit" disabled={savingDraft}>
                          {savingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                          Save draft changes
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label="Project" value={selected.accountDraft.projectName ?? 'Not provided'} />
                      <Field label="Company URL" value={selected.accountDraft.companyUrl ?? 'Not provided'} />
                      <Field label="LinkedIn URL" value={selected.accountDraft.linkedinUrl ?? 'Not provided'} />
                      <Field label="Lifecycle" value={selected.accountDraft.stage} />
                      <Field label="Segment" value={selected.accountDraft.segment} />
                      <Field label="Owner" value={selected.accountDraft.ownerName} />
                      <Field label="Region / tags" value={selected.accountDraft.tags.join(', ')} />
                    </div>
                  )}
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
                    <Field label="LinkedIn URL" value={selected.accountDraft.linkedinUrl ?? 'Not provided'} />
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

function DraftTextInput({
  label,
  value,
  error,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  error?: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <label className="space-y-1">
      <span className={cn('tk-label text-xs', error ? 'text-rag-red' : '')}>{label}</span>
      <input
        className={cn('tk-input', error ? 'border-rag-red focus:border-rag-red focus:ring-rag-red/30' : '')}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
      />
      {error ? <p className="text-xs text-rag-red">{error}</p> : null}
    </label>
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

function defaultAccountManagerId(managers: OnboardingAccountManager[], currentUser: { id: string; email: string }, canAssignOwners: boolean) {
  if (canAssignOwners) return ''
  const self = managers.find(manager => manager.id === currentUser.id || manager.email.toLowerCase() === currentUser.email.toLowerCase())
  return self?.id ?? ''
}

function assignableAccountManagers(managers: OnboardingAccountManager[], currentUser: { id: string; email: string }, canAssignOwners: boolean) {
  if (canAssignOwners) return managers
  return managers.filter(manager => manager.id === currentUser.id || manager.email.toLowerCase() === currentUser.email.toLowerCase())
}

function normalizeUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function isLinkedinUrl(value: string) {
  try {
    const host = new URL(normalizeUrl(value)).hostname.toLowerCase()
    return host === 'linkedin.com' || host.endsWith('.linkedin.com')
  } catch {
    return false
  }
}

function mapDraftEditApiField(field: string): keyof DraftEditState | undefined {
  const fieldMap: Record<string, keyof DraftEditState> = {
    account_name: 'accountName',
    project_name: 'projectName',
    company_url: 'companyUrl',
    linkedin_url: 'linkedinUrl',
    primary_owner_id: 'managerId',
    primary_owner_name: 'managerId',
    primary_owner_email: 'managerId',
  }
  return fieldMap[field]
}
