import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileSearch,
  History,
  Loader2,
  PlusCircle,
  RefreshCcw,
  Save,
  Search,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { DocumentExtractionReviewPanel, DocumentReviewSource } from '@/components/account/DocumentExtractionReviewPanel'
import { useAuth } from '@/contexts/AuthContext'
import { ApiError } from '@/services/api'
import { createAccountAttachmentPreviewUrl, listAccountAttachments } from '@/services/accountWorkspace'
import {
  approveKycDraft,
  createKycDraft,
  getKycDefaultPrompt,
  getKycFreshness,
  listKycAgentRuns,
  listKycDrafts,
  listKycSnapshots,
  rejectKycDraft,
  refreshKycAgentRun,
  retryKycAgentRun,
  runPendingKycJobs,
  restoreKycSnapshot,
  updateKycDraft,
} from '@/services/kyc'
import { Account } from '@/types/account'
import { KycAgentRun, KycDraft, KycDraftStatus, KycFreshness, KycPage, KycSnapshot } from '@/types/kyc'
import { SourceDocument } from '@/types/v3'
import { EmptyState } from '@/components/ui/EmptyState'
import { RichTextEditor } from '@/components/ui/RichTextEditor'
import { cn } from '@/utils/cn'

const DRAFT_PAGE_SIZE = 5
const SNAPSHOT_PAGE_SIZE = 3

type ActionState = 'initial' | 'refresh' | 'create' | 'save' | 'approve' | 'reject' | 'restore' | 'retryRun' | 'rerunRun' | 'runPending' | ''

export function KYCAssistedReview({ account }: { account: Account }) {
  const { token, user } = useAuth()
  const [drafts, setDrafts] = useState<KycPage<KycDraft> | null>(null)
  const [snapshots, setSnapshots] = useState<KycPage<KycSnapshot> | null>(null)
  const [freshness, setFreshness] = useState<KycFreshness | null>(null)
  const [latestRun, setLatestRun] = useState<KycAgentRun | null>(null)
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null)
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [ackLowConfidence, setAckLowConfidence] = useState(false)
  const [ackConflicts, setAckConflicts] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [reviewNotes, setReviewNotes] = useState('')
  const [detailedDescription, setDetailedDescription] = useState('')
  const [kycPrompt, setKycPrompt] = useState('')
  const [promptSourceDocumentIds, setPromptSourceDocumentIds] = useState<string[]>([])
  const [promptLoading, setPromptLoading] = useState(false)
  const [promptError, setPromptError] = useState('')
  const [sourceDocuments, setSourceDocuments] = useState<SourceDocument[]>([])
  const [selectedSourceDocumentId, setSelectedSourceDocumentId] = useState('')
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState('')
  const [sourcePreviewError, setSourcePreviewError] = useState('')
  const [sourceReviewHtml, setSourceReviewHtml] = useState('')
  const [rejectionReason, setRejectionReason] = useState('')
  const [rejectModalOpen, setRejectModalOpen] = useState(false)
  const [restoreSnapshot, setRestoreSnapshot] = useState<KycSnapshot | null>(null)
  const [restoreReason, setRestoreReason] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<KycDraftStatus | 'all'>('all')
  const [sortOption, setSortOption] = useState('created_at:desc')
  const [draftPage, setDraftPage] = useState(1)
  const [snapshotPage, setSnapshotPage] = useState(1)
  const [loading, setLoading] = useState<ActionState>('initial')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<string[]>([])

  const activeDraft = useMemo(
    () => drafts?.items.find(draft => draft.id === activeDraftId) ?? drafts?.items[0] ?? null,
    [activeDraftId, drafts],
  )
  const groupedFields = useMemo(() => groupFields(activeDraft), [activeDraft])
  const lowConfidenceFields = useMemo(() => activeDraft?.fields.filter(field => !field.missing && field.confidence < 70) ?? [], [activeDraft])
  const canEditDraft = activeDraft?.status === 'ready_for_review'
  const isSuperAdmin = user?.role === 'super_admin'
  const completion = activeDraft?.completeness ?? freshness?.completeness ?? 0
  const confidence = activeDraft?.confidence ?? freshness?.confidence ?? 0
  const sourceCoverage = activeDraft?.source_coverage ?? freshness?.source_coverage ?? 0
  const hasInitialLoading = loading === 'initial' && !drafts
  const { sort, direction } = parseSort(sortOption)
  const sourceDocumentKey = activeDraft?.source_document_ids.join('|') ?? ''
  const selectedSourceDocument = useMemo(
    () => sourceDocuments.find(document => document.id === selectedSourceDocumentId) ?? sourceDocuments[0] ?? null,
    [selectedSourceDocumentId, sourceDocuments],
  )
  const aiGeneratedKycHtml = useMemo(
    () => buildAiGeneratedKycHtml(activeDraft, latestRun),
    [activeDraft, latestRun],
  )
  const aiDebugLogsHtml = useMemo(
    () => buildAiDebugLogsHtml(activeDraft, latestRun),
    [activeDraft, latestRun],
  )

  const loadKyc = useCallback(
    async (mode: ActionState = 'refresh') => {
      if (!token) {
        setError('Sign in to review KYC data.')
        setLoading('')
        return
      }
      setLoading(mode)
      setError(null)
      try {
        const [draftPageResponse, snapshotPageResponse, freshnessResponse, runPageResponse] = await Promise.all([
          listKycDrafts(token, account.id, {
            search: searchTerm.trim(),
            status: statusFilter,
            sort,
            direction,
            page: draftPage,
            page_size: DRAFT_PAGE_SIZE,
          }),
          listKycSnapshots(token, account.id, {
            sort: 'approved_at',
            direction: 'desc',
            page: snapshotPage,
            page_size: SNAPSHOT_PAGE_SIZE,
          }),
          getKycFreshness(token, account.id),
          listKycAgentRuns(token, account.id, {
            page: 1,
            page_size: 1,
            sort: 'created_at',
            direction: 'desc',
          }),
        ])
        setDrafts(draftPageResponse)
        setSnapshots(snapshotPageResponse)
        setFreshness(freshnessResponse)
        setLatestRun(runPageResponse.items[0] ?? null)
        setActiveDraftId(current => {
          if (current && draftPageResponse.items.some(item => item.id === current)) return current
          return draftPageResponse.items.find(item => item.status === 'ready_for_review')?.id ?? draftPageResponse.items[0]?.id ?? null
        })
      } catch (requestError) {
        setError(errorMessage(requestError))
      } finally {
        setLoading('')
      }
    },
    [account.id, direction, draftPage, searchTerm, snapshotPage, sort, statusFilter, token],
  )

  useEffect(() => {
    void loadKyc('initial')
  }, [loadKyc])

  useEffect(() => {
    if (!token) return
    let active = true
    setPromptLoading(true)
    setPromptError('')
    getKycDefaultPrompt(token, account.id)
      .then(response => {
        if (!active) return
        setKycPrompt(response.prompt)
        setPromptSourceDocumentIds(response.source_document_ids)
      })
      .catch(error => {
        if (!active) return
        setPromptError(errorMessage(error))
      })
      .finally(() => {
        if (active) setPromptLoading(false)
      })
    return () => {
      active = false
    }
  }, [account.id, token])

  useEffect(() => {
    if (!latestRun || !['pending', 'running'].includes(latestRun.status)) return
    const timer = window.setInterval(() => {
      void loadKyc('')
    }, 5000)
    return () => window.clearInterval(timer)
  }, [latestRun?.id, latestRun?.status, loadKyc])

  useEffect(() => {
    if (!activeDraft) {
      setFieldValues({})
      setAckLowConfidence(false)
      setAckConflicts(false)
      setOverrideReason('')
      setReviewNotes('')
      setDetailedDescription('')
      setSourceDocuments([])
      setSelectedSourceDocumentId('')
      setSourcePreviewUrl('')
      setSourcePreviewError('')
      setSourceReviewHtml('')
      setRejectionReason('')
      return
    }
    setFieldValues(Object.fromEntries(activeDraft.fields.map(field => [field.key, field.value ?? ''])))
    setAckLowConfidence(activeDraft.low_confidence_acknowledged)
    setAckConflicts(activeDraft.conflicts_acknowledged)
    setOverrideReason(activeDraft.override_reason ?? '')
    setReviewNotes(activeDraft.review_notes ?? '')
    setDetailedDescription(activeDraft.detailed_description ?? '')
    setRejectionReason(activeDraft.rejection_reason ?? '')
    setFieldErrors([])
  }, [activeDraft])

  useEffect(() => {
    if (!token || !activeDraft || !activeDraft.source_document_ids.length) {
      setSourceDocuments([])
      setSelectedSourceDocumentId('')
      return
    }
    let active = true
    const allowedIds = new Set(activeDraft.source_document_ids)
    listAccountAttachments(token, account.id, new URLSearchParams({ page: '1', page_size: '100', sort: 'uploaded_date', direction: 'desc' }))
      .then(page => {
        if (!active) return
        const matched = page.items.filter(document => allowedIds.has(document.id))
        setSourceDocuments(matched)
        setSelectedSourceDocumentId(current => (current && matched.some(document => document.id === current) ? current : matched[0]?.id ?? ''))
      })
      .catch(() => {
        if (!active) return
        setSourceDocuments([])
        setSelectedSourceDocumentId('')
      })
    return () => {
      active = false
    }
  }, [account.id, activeDraft, sourceDocumentKey, token])

  useEffect(() => {
    if (!activeDraft) {
      setSourceReviewHtml('')
      return
    }
    setSourceReviewHtml(buildKycRuntimeReviewHtml(activeDraft, selectedSourceDocument))
  }, [activeDraft, selectedSourceDocument])

  useEffect(() => {
    if (!token || !selectedSourceDocument) {
      setSourcePreviewUrl('')
      setSourcePreviewError('')
      return
    }
    let active = true
    let objectUrl = ''
    setSourcePreviewError('')
    createAccountAttachmentPreviewUrl(token, account.id, selectedSourceDocument)
      .then(url => {
        if (!active) {
          if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url)
          return
        }
        objectUrl = url
        setSourcePreviewUrl(url)
      })
      .catch(error => {
        if (active) {
          setSourcePreviewUrl('')
          setSourcePreviewError(error instanceof Error ? error.message : 'Source document preview failed')
        }
      })
    return () => {
      active = false
      if (objectUrl && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(objectUrl)
    }
  }, [account.id, selectedSourceDocument, token])

  function updateField(fieldKey: string, value: string) {
    setFieldValues(values => ({ ...values, [fieldKey]: value }))
  }

  async function createDraft() {
    if (!token) return
    setLoading('create')
    setFieldErrors([])
    setError(null)
    try {
      const draft = await createKycDraft(token, account.id, {
        trigger_source: 'kyc_page',
        source_document_ids: promptSourceDocumentIds,
        notes: reviewNotes || undefined,
        prompt: kycPrompt || undefined,
      })
      toast.success('KYC draft queued from editable prompt')
      setDraftPage(1)
      setActiveDraftId(draft.id)
      await loadKyc('refresh')
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setLoading('')
    }
  }

  async function saveEdits() {
    if (!token || !activeDraft) return
    setLoading('save')
    setFieldErrors([])
    setError(null)
    try {
      const updated = await updateKycDraft(token, account.id, activeDraft.id, {
        fields: activeDraft.fields.map(field => ({ key: field.key, value: fieldValues[field.key] ?? '', reviewed: true })),
        low_confidence_acknowledged: ackLowConfidence,
        conflicts_acknowledged: ackConflicts,
        override_reason: overrideReason || null,
        review_notes: reviewNotes || null,
        detailed_description: detailedDescription || '',
      })
      toast.success('KYC review edits saved')
      setActiveDraftId(updated.id)
      await loadKyc('refresh')
    } catch (requestError) {
      handleMutationError(requestError)
    } finally {
      setLoading('')
    }
  }

  async function approveDraft() {
    if (!token || !activeDraft) return
    const approvalOverrideReason = overrideReason || (activeDraft.missing_fields.length ? 'Approved from simplified KYC review after field-level verification.' : null)
    setLoading('approve')
    setFieldErrors([])
    setError(null)
    try {
      await approveKycDraft(token, account.id, activeDraft.id, {
        low_confidence_acknowledged: ackLowConfidence || lowConfidenceFields.length > 0,
        conflicts_acknowledged: ackConflicts || activeDraft.conflicts.length > 0,
        override_reason: approvalOverrideReason,
        change_summary: activeDraft.difference_summary,
      })
      toast.success('KYC approved')
      await loadKyc('refresh')
    } catch (requestError) {
      handleMutationError(requestError)
    } finally {
      setLoading('')
    }
  }

  async function rejectDraft() {
    if (!token || !activeDraft) return
    if (!rejectionReason.trim()) {
      setFieldErrors(['Rejection reason is required.'])
      return
    }
    setLoading('reject')
    setFieldErrors([])
    setError(null)
    try {
      await rejectKycDraft(token, account.id, activeDraft.id, { reason: rejectionReason })
      toast.success('KYC rejected')
      setRejectModalOpen(false)
      await loadKyc('refresh')
    } catch (requestError) {
      handleMutationError(requestError)
    } finally {
      setLoading('')
    }
  }

  async function runPendingNow() {
    if (!token) return
    setLoading('runPending')
    setError(null)
    try {
      const result = await runPendingKycJobs(token, 1)
      toast.success(result.processed_count ? 'Pending KYC job processed' : 'No pending KYC jobs found')
      await loadKyc('refresh')
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setLoading('')
    }
  }

  async function retryLatestRun() {
    if (!token || !latestRun) return
    setLoading('retryRun')
    setError(null)
    try {
      await retryKycAgentRun(token, account.id, latestRun.id)
      toast.success('KYC retry queued.')
      await loadKyc('refresh')
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setLoading('')
    }
  }

  async function rerunLatestRun() {
    if (!token || !latestRun) return
    setLoading('rerunRun')
    setError(null)
    try {
      await refreshKycAgentRun(token, account.id, latestRun.id)
      toast.success('KYC re-run queued.')
      await loadKyc('refresh')
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setLoading('')
    }
  }

  async function restoreSnapshotAsActive() {
    if (!token || !restoreSnapshot) return
    if (!restoreReason.trim()) {
      setFieldErrors(['Restore reason is required.'])
      return
    }
    setLoading('restore')
    setFieldErrors([])
    setError(null)
    try {
      const restored = await restoreKycSnapshot(token, account.id, restoreSnapshot.id, { reason: restoreReason })
      toast.success(`KYC version ${restoreSnapshot.version} restored as version ${restored.version}`)
      setRestoreSnapshot(null)
      setRestoreReason('')
      await loadKyc('refresh')
    } catch (requestError) {
      handleMutationError(requestError)
    } finally {
      setLoading('')
    }
  }

  function handleMutationError(requestError: unknown) {
    setError(errorMessage(requestError))
    if (requestError instanceof ApiError && requestError.fieldErrors.length) {
      setFieldErrors(requestError.fieldErrors.map(item => item.message))
    }
  }

  return (
    <div className="space-y-4">
      <section className="tk-card overflow-hidden">
        <div className="border-b border-surface-border bg-surface-secondary p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">AI-assisted KYC review</p>
              <h3 className="mt-1 text-lg font-semibold text-ink">{account.name} KYC workspace</h3>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-secondary">
                {freshness?.has_approved_snapshot ? `Snapshot v${freshness.snapshot_version} is ${freshness.freshness_status}.` : 'No approved KYC snapshot exists yet.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="tk-button-secondary bg-white" onClick={() => void loadKyc('refresh')} disabled={Boolean(loading)}>
                {loading === 'refresh' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                Refresh
              </button>
              <button type="button" className="tk-button-secondary bg-white" onClick={createDraft} disabled={Boolean(loading)}>
                {loading === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
                New draft
              </button>
              <button type="button" className="tk-button-secondary bg-white" onClick={saveEdits} disabled={!canEditDraft || Boolean(loading)}>
                {loading === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save edits
              </button>
              <button type="button" className="tk-button-secondary bg-white" onClick={() => setRejectModalOpen(true)} disabled={!canEditDraft || Boolean(loading)}>
                {loading === 'reject' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Reject
              </button>
              <button type="button" className="tk-button-primary" onClick={approveDraft} disabled={!canEditDraft || Boolean(loading)}>
                {loading === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Approve KYC
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-0 divide-y divide-surface-border md:grid-cols-4 md:divide-x md:divide-y-0">
          <KYCStat label="Completeness" value={completion} suffix="%" />
          <KYCStat label="AI confidence" value={confidence} suffix="%" />
          <KYCStat label="Source coverage" value={sourceCoverage} suffix="%" />
          <KYCStat label="Missing fields" value={activeDraft?.missing_fields.length ?? freshness?.missing_fields.length ?? 0} tone={(activeDraft?.missing_fields.length ?? freshness?.missing_fields.length ?? 0) ? 'orange' : 'green'} />
        </div>
      </section>

      {isSuperAdmin ? (
      <section className="tk-card p-5">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Editable KYC prompt</p>
          <h3 className="mt-1 text-base font-semibold text-ink">Run KYC for this account</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-secondary">
            The prompt is prepared from account details, SOW/charter extraction, stakeholders, engagement records, and prior KYC context. Edit it before running OpenAI.
          </p>
        </div>
        {promptError ? (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-brand-orange/20 bg-brand-orange/10 p-3 text-sm text-brand-orange">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {promptError}
          </div>
        ) : null}
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="flex min-h-0 flex-col">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Prompt</span>
              <textarea
                className="mt-2 h-[260px] w-full resize-none rounded-lg border border-surface-border bg-white px-3 py-2 text-sm leading-6 text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20"
                value={promptLoading ? 'Preparing source-backed KYC prompt...' : kycPrompt}
                onChange={event => setKycPrompt(event.target.value)}
                disabled={promptLoading || Boolean(loading)}
                placeholder="Prompt will be prepared from account details and uploaded SOW/charter evidence."
                aria-label="Editable KYC prompt"
              />
            </label>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-ink-secondary">
                Source documents selected: {promptSourceDocumentIds.length || 'all available account sources'}
              </p>
              <button type="button" className="tk-button-primary shrink-0" onClick={createDraft} disabled={Boolean(loading) || promptLoading || !kycPrompt.trim()}>
                {loading === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
                Run KYC
              </button>
            </div>
          </div>
          <div className="min-h-0">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">OpenAI response</span>
              <span className="rounded-md bg-surface-secondary px-2 py-1 text-[11px] font-semibold text-ink-secondary">
                {openAiResponseLabel(latestRun)}
              </span>
            </div>
            <RichTextEditor
              value={aiGeneratedKycHtml}
              onChange={() => undefined}
              disabled
              placeholder="Run KYC to show the OpenAI response and mapped KYC output here."
              ariaLabel="OpenAI KYC response"
              editorHeight="260px"
            />
          </div>
        </div>
      </section>
      ) : null}

      {isSuperAdmin && (latestRun || activeDraft) ? (
        <details className="tk-card overflow-hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-b border-surface-border bg-surface-secondary p-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">Provider details</p>
              <h3 className="mt-1 text-sm font-semibold text-ink">Advanced run status, generated body, and logs</h3>
            </div>
            <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-ink-secondary">Open / close</span>
          </summary>
          {latestRun ? (
            <div className="border-b border-surface-border p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">AI run status</p>
              <p className="mt-1 text-sm font-semibold text-ink">
                {latestRun.status.replace(/_/g, ' ')}
                {latestRun.model_name ? ` · ${latestRun.model_name}` : ''}
              </p>
              <p className="mt-1 text-xs leading-5 text-ink-secondary">
                {providerText(latestRun)} Source coverage: {sourceCoverageSummary(latestRun)}.
              </p>
            </div>
            {latestRun.status === 'pending' ? (
              <button type="button" className="tk-button-secondary bg-white" onClick={runPendingNow} disabled={Boolean(loading)}>
                {loading === 'runPending' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                Run pending job
              </button>
            ) : null}
            {['failed', 'partial', 'cancelled'].includes(latestRun.status) ? (
              <button type="button" className="tk-button-secondary bg-white" onClick={retryLatestRun} disabled={Boolean(loading)}>
                {loading === 'retryRun' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                Retry KYC run
              </button>
            ) : null}
            {['complete', 'running'].includes(latestRun.status) ? (
              <button type="button" className="tk-button-secondary bg-white" onClick={rerunLatestRun} disabled={Boolean(loading)}>
                {loading === 'rerunRun' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                Re-run KYC
              </button>
            ) : null}
              </div>
            </div>
          ) : null}
          {activeDraft ? (
            <div className="p-5">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">AI output</p>
                  <h3 className="mt-1 text-base font-semibold text-ink">Generated KYC body and logs</h3>
                  <p className="mt-1 text-sm leading-6 text-ink-secondary">
                    Full generated KYC response from the selected draft/run, plus current extracted fields, citations, and provider logs.
                  </p>
                </div>
                <span className="rounded-md bg-surface-secondary px-2 py-1 text-xs font-semibold text-ink-secondary">
                  {runMatchesDraft(latestRun, activeDraft) && latestRun?.model_name ? latestRun.model_name : 'Stored draft response'}
                </span>
              </div>
              <div className="mt-3 grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-secondary">Generated KYC body</p>
                  <RichTextEditor
                    value={aiGeneratedKycHtml}
                    onChange={() => undefined}
                    disabled
                    placeholder="Create or retry a KYC draft, then refresh after the AI run completes."
                    ariaLabel="Generated KYC body"
                    editorHeight="520px"
                  />
                </div>
                <aside>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-secondary">Prompt, response, and processing logs</p>
                  <RichTextEditor
                    value={aiDebugLogsHtml}
                    onChange={() => undefined}
                    disabled
                    placeholder="Prompt and raw response logs will appear after a new KYC or web research run completes."
                    ariaLabel="AI KYC logs"
                    editorHeight="520px"
                  />
                </aside>
              </div>
            </div>
          ) : null}
        </details>
      ) : null}

      {isSuperAdmin && activeDraft ? (
        <DocumentExtractionReviewPanel
          title="Runtime source and KYC extraction review"
          eyebrow="KYC source review"
          documentName={selectedSourceDocument?.fileName || selectedSourceDocument?.name || sourceContextSources(activeDraft)[0]?.name}
          previewUrl={sourcePreviewUrl}
          mimeType={selectedSourceDocument?.mimeType}
          extractedHtml={sourceReviewHtml}
          onExtractedHtmlChange={setSourceReviewHtml}
          sources={sourceDocuments.length ? sourceDocuments.map(sourceDocumentToReviewSource) : sourceContextSources(activeDraft)}
          selectedSourceId={selectedSourceDocumentId}
          onSelectSource={setSelectedSourceDocumentId}
          previewError={sourcePreviewError}
        />
      ) : null}

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-rag-red/20 bg-rag-red/10 p-3 text-sm text-rag-red">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {fieldErrors.length ? (
        <div className="rounded-lg border border-brand-orange/20 bg-brand-orange/10 p-3">
          <div className="flex items-start gap-2 text-sm font-semibold text-brand-orange">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Review required before approval
          </div>
          <ul className="mt-2 space-y-1 text-sm leading-6 text-ink-secondary">
            {fieldErrors.map(item => <li key={item}>{item}</li>)}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-4">
          {hasInitialLoading ? <LoadingPanel /> : null}

          {!hasInitialLoading && !activeDraft ? (
            <section className="tk-card">
              <EmptyState
                icon={FileSearch}
                heading="No KYC drafts found"
                body="Create a source-backed KYC draft for this account."
                action={{ label: loading === 'create' ? 'Creating...' : 'Create KYC draft', onClick: createDraft }}
              />
            </section>
          ) : null}

          {activeDraft ? (
            <>
              <section className="tk-card p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill status={activeDraft.status} />
                      <span className="text-xs font-medium text-ink-secondary">Created {formatDateTime(activeDraft.created_at)}</span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-ink-secondary">{activeDraft.ai_disclaimer}</p>
                  </div>
                </div>
              </section>

              {groupedFields.map((group, groupIndex) => (
                <article key={group.key} className="tk-card overflow-hidden">
                  <header className="border-b border-surface-border p-5">
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-tint-20 text-sm font-bold text-brand-blue">
                        {groupIndex + 1}
                      </span>
                      <div>
                        <h4 className="text-base font-semibold text-ink">{group.title}</h4>
                        <p className="mt-1 text-sm text-ink-secondary">{group.fields.length} field{group.fields.length === 1 ? '' : 's'}</p>
                      </div>
                    </div>
                  </header>
                  <div className="grid gap-3 p-5">
                    {group.fields.map(field => (
                      <label key={field.key} className="block rounded-lg border border-surface-border bg-white p-3 transition-colors focus-within:border-brand-blue focus-within:ring-2 focus-within:ring-brand-blue/20">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">{field.label}</span>
                          {field.is_required ? <Badge tone="blue">Required</Badge> : null}
                          {field.missing || !fieldValues[field.key]?.trim() ? <Badge tone="orange">Missing</Badge> : null}
                          {field.confidence < 70 ? <Badge tone="orange">{`${field.confidence}%`}</Badge> : <Badge tone="green">{`${field.confidence}%`}</Badge>}
                          {field.is_sensitive ? <Badge tone="blue">Restricted</Badge> : null}
                        </span>
                        <div className="mt-2">
                          <RichTextEditor
                            value={fieldValues[field.key] ?? ''}
                            onChange={value => updateField(field.key, value)}
                            disabled={!canEditDraft}
                            ariaLabel={field.label}
                            clickToEdit
                          />
                        </div>
                        <span className="mt-2 flex items-start gap-2 text-xs leading-5 text-ink-secondary">
                          <FileSearch className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-blue" />
                          {citationText(field)}
                        </span>
                        {field.previous_value && field.previous_value !== fieldValues[field.key] ? (
                          <span className="mt-2 block rounded-md bg-surface-secondary p-2 text-xs leading-5 text-ink-secondary">
                            Previous approved value: {field.previous_value}
                          </span>
                        ) : null}
                      </label>
                    ))}
                  </div>
                </article>
              ))}
            </>
          ) : null}

        </section>

        <aside className="space-y-4">
          <section className="tk-card p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-ink">Draft queue</h3>
              <span className="text-xs font-semibold text-ink-secondary">{drafts?.total ?? 0} total</span>
            </div>
            <div className="mt-3 grid gap-2">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
                <input
                  className="tk-input pl-9"
                  value={searchTerm}
                  onChange={event => {
                    setSearchTerm(event.target.value)
                    setDraftPage(1)
                  }}
                  placeholder="Search drafts"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <select className="tk-input" value={statusFilter} onChange={event => { setStatusFilter(event.target.value as KycDraftStatus | 'all'); setDraftPage(1) }}>
                  <option value="all">All statuses</option>
                  <option value="ready_for_review">Ready</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
                <select className="tk-input" value={sortOption} onChange={event => { setSortOption(event.target.value); setDraftPage(1) }}>
                  <option value="created_at:desc">Newest</option>
                  <option value="updated_at:desc">Recently edited</option>
                  <option value="confidence:desc">Confidence</option>
                  <option value="completeness:desc">Completeness</option>
                </select>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {drafts?.items.map(draft => (
                <button
                  type="button"
                  key={draft.id}
                  className={cn(
                    'w-full rounded-lg border p-3 text-left transition-colors hover:bg-surface-secondary',
                    activeDraft?.id === draft.id ? 'border-brand-blue bg-blue-tint-20' : 'border-surface-border bg-white',
                  )}
                  onClick={() => setActiveDraftId(draft.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <StatusPill status={draft.status} />
                    <span className="text-xs font-semibold text-ink-secondary">{draft.completeness}%</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-ink">{draft.trigger_source.replace(/_/g, ' ')}</p>
                  <p className="mt-1 text-xs text-ink-secondary">{formatDateTime(draft.created_at)}</p>
                </button>
              ))}
              {drafts && !drafts.items.length ? (
                <p className="rounded-lg border border-dashed border-surface-border p-4 text-sm text-ink-secondary">No drafts match the current filters.</p>
              ) : null}
            </div>
            <PaginationControls page={drafts?.page ?? draftPage} pages={drafts?.pages ?? 1} onPrevious={() => setDraftPage(page => Math.max(1, page - 1))} onNext={() => setDraftPage(page => Math.min(drafts?.pages ?? page + 1, page + 1))} />
          </section>

          {activeDraft?.difference_summary.length ? (
            <section className="tk-card p-5">
              <h3 className="text-base font-semibold text-ink">Changes from previous snapshot</h3>
              <div className="mt-3 space-y-2">
                {activeDraft.difference_summary.map(item => (
                  <div key={item} className="rounded-lg border border-surface-border bg-white p-3 text-sm leading-5 text-ink-secondary">
                    {item}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="tk-card p-5">
            <h3 className="text-base font-semibold text-ink">Research sources</h3>
            <div className="mt-3 grid gap-2">
              {(activeDraft?.research_sources ?? []).map(source => (
                <div key={source} className="flex items-center gap-2 rounded-lg border border-blue-tint-20 bg-blue-tint-20 p-3 text-sm font-semibold text-brand-blue">
                  <ShieldCheck className="h-4 w-4" />
                  {source}
                </div>
              ))}
              {activeDraft && !activeDraft.research_sources.length ? <p className="text-sm text-ink-secondary">No external research sources recorded.</p> : null}
            </div>
          </section>

          <section className="tk-card p-5">
            <h3 className="text-base font-semibold text-ink">Review issues</h3>
            <div className="mt-3 space-y-2">
              {activeDraft ? [...activeDraft.missing_fields, ...activeDraft.conflicts].map(item => (
                <div key={item} className="flex items-start gap-2 rounded-lg border border-brand-orange/20 bg-brand-orange/10 p-3 text-sm leading-5 text-brand-orange">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {item}
                </div>
              )) : null}
              {activeDraft && !activeDraft.missing_fields.length && !activeDraft.conflicts.length ? (
                <div className="flex items-center gap-2 rounded-lg border border-rag-green/20 bg-rag-green/10 p-3 text-sm font-semibold text-rag-green">
                  <CheckCircle2 className="h-4 w-4" />
                  No open review issues
                </div>
              ) : null}
            </div>
          </section>

          <section className="tk-card p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-ink">Snapshot history</h3>
              <History className="h-4 w-4 text-ink-tertiary" />
            </div>
            <div className="mt-3 space-y-2">
              {snapshots?.items.map(snapshot => (
                <div key={snapshot.id} className="rounded-lg border border-surface-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink">Version {snapshot.version}</p>
                    <span className="text-xs font-semibold text-ink-secondary">{snapshot.completeness}%</span>
                  </div>
                  <p className="mt-1 text-xs text-ink-secondary">Approved by {snapshot.approved_by_name}</p>
                  <p className="mt-1 text-xs text-ink-secondary">{formatDateTime(snapshot.approved_at)}</p>
                  {snapshot.version !== freshness?.snapshot_version ? (
                    <button type="button" className="tk-button-secondary mt-3 w-full bg-white text-xs" onClick={() => { setRestoreSnapshot(snapshot); setRestoreReason('') }} disabled={Boolean(loading)}>
                      Restore as active
                    </button>
                  ) : (
                    <p className="mt-3 rounded-md bg-rag-green/10 px-2 py-1 text-center text-[11px] font-semibold uppercase tracking-wider text-rag-green">Active version</p>
                  )}
                </div>
              ))}
              {snapshots && !snapshots.items.length ? <p className="rounded-lg border border-dashed border-surface-border p-4 text-sm text-ink-secondary">No approved snapshots yet.</p> : null}
            </div>
            <PaginationControls page={snapshots?.page ?? snapshotPage} pages={snapshots?.pages ?? 1} onPrevious={() => setSnapshotPage(page => Math.max(1, page - 1))} onNext={() => setSnapshotPage(page => Math.min(snapshots?.pages ?? page + 1, page + 1))} />
          </section>
        </aside>
      </div>

      {rejectModalOpen && activeDraft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-labelledby="kyc-reject-title">
          <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
            <div className="border-b border-surface-border p-5">
              <h3 id="kyc-reject-title" className="text-base font-semibold text-ink">Reject KYC draft</h3>
              <p className="mt-1 text-sm leading-6 text-ink-secondary">Record a clear reason so the rejection is visible in audit, timeline, and run history.</p>
            </div>
            <div className="p-5">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Rejection reason</span>
                <div className="mt-2">
                  <RichTextEditor value={rejectionReason} onChange={setRejectionReason} ariaLabel="Rejection reason" />
                </div>
              </label>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-surface-border p-5 sm:flex-row sm:justify-end">
              <button type="button" className="tk-button-secondary bg-white" onClick={() => setRejectModalOpen(false)} disabled={Boolean(loading)}>
                Cancel
              </button>
              <button type="button" className="tk-button-primary bg-rag-red hover:bg-rag-red/90" onClick={rejectDraft} disabled={Boolean(loading)}>
                {loading === 'reject' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Reject KYC
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {restoreSnapshot ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-labelledby="kyc-restore-title">
          <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
            <div className="border-b border-surface-border p-5">
              <h3 id="kyc-restore-title" className="text-base font-semibold text-ink">Restore KYC version {restoreSnapshot.version}</h3>
              <p className="mt-1 text-sm leading-6 text-ink-secondary">
                This will create a new immutable snapshot copied from version {restoreSnapshot.version}. The new version becomes the active KYC.
              </p>
            </div>
            <div className="p-5">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Restore reason</span>
                <div className="mt-2">
                  <RichTextEditor value={restoreReason} onChange={setRestoreReason} ariaLabel="Restore reason" />
                </div>
              </label>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-surface-border p-5 sm:flex-row sm:justify-end">
              <button type="button" className="tk-button-secondary bg-white" onClick={() => setRestoreSnapshot(null)} disabled={Boolean(loading)}>
                Cancel
              </button>
              <button type="button" className="tk-button-primary" onClick={restoreSnapshotAsActive} disabled={Boolean(loading)}>
                {loading === 'restore' ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
                Restore as active
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function sourceDocumentToReviewSource(document: SourceDocument): DocumentReviewSource {
  return {
    id: document.id,
    name: document.fileName || document.name,
    status: document.extractionStatus || document.status,
    confidence: document.confidence,
    pages: document.pages,
  }
}

function sourceContextSources(draft: KycDraft): DocumentReviewSource[] {
  const documents = Array.isArray(draft.source_context.source_documents) ? draft.source_context.source_documents : []
  return documents.flatMap(item => {
    if (!isRecord(item)) return []
    return [{
      id: typeof item.id === 'string' ? item.id : undefined,
      name: typeof item.title === 'string' ? item.title : 'Source document',
      status: typeof item.source_type === 'string' ? item.source_type : 'source',
      confidence: typeof item.confidence === 'number' ? item.confidence : undefined,
    }]
  })
}

function buildKycRuntimeReviewHtml(draft: KycDraft, document: SourceDocument | null) {
  const documentId = document?.id
  const relatedFields = documentId
    ? draft.fields.filter(field => field.citations.some(citation => citation.source_document_id === documentId))
    : draft.fields
  const fields = (relatedFields.length ? relatedFields : draft.fields).slice(0, 20)
  const fieldItems = fields.map(field => (
    `<li><strong>${escapeHtml(field.label)}</strong> · ${field.confidence}% confidence<br/>${escapeHtml(toPlainText(field.value || 'No value extracted yet.'))}</li>`
  )).join('')
  const citations = draft.citations
    .filter(citation => !documentId || citation.source_document_id === documentId)
    .slice(0, 16)
  const citationItems = citations.map(citation => (
    `<li><strong>${escapeHtml(citation.label)}</strong>${citation.page_number ? ` · page ${citation.page_number}` : ''}: ${escapeHtml(citation.excerpt)}</li>`
  )).join('')
  const issues = [...draft.missing_fields.map(item => `Missing: ${item}`), ...draft.conflicts.map(item => `Conflict: ${item}`)]

  return [
    document?.extractedText?.trim()
      ? `<h4>Full extracted PDF text</h4><h5>${escapeHtml(document.fileName || document.name)}</h5><p>${textWithLineBreaks(document.extractedText)}</p>`
      : '<h4>Full extracted PDF text</h4><p>No extracted document text is available for the selected source yet.</p>',
    '<h4>KYC runtime extraction review</h4>',
    '<ul>',
    `<li><strong>Status:</strong> ${escapeHtml(draft.status.replace(/_/g, ' '))}</li>`,
    `<li><strong>Completeness:</strong> ${draft.completeness}%</li>`,
    `<li><strong>Confidence:</strong> ${draft.confidence}%</li>`,
    `<li><strong>Source coverage:</strong> ${draft.source_coverage}%</li>`,
    document ? `<li><strong>Selected source:</strong> ${escapeHtml(document.fileName || document.name)}</li>` : '',
    '</ul>',
    '<h4>Extracted KYC fields</h4>',
    fieldItems ? `<ul>${fieldItems}</ul>` : '<p>No KYC fields are available for this source yet.</p>',
    citationItems ? `<h4>Citations</h4><ul>${citationItems}</ul>` : '<h4>Citations</h4><p>No citations are attached to the selected source yet.</p>',
    issues.length ? `<h4>Review issues</h4><ul>${issues.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<p>No open KYC review issues are currently flagged.</p>',
    draft.detailed_description ? `<h4>Detailed AI description</h4>${draft.detailed_description}` : '',
  ].filter(Boolean).join('')
}

function buildAiGeneratedKycHtml(draft: KycDraft | null, latestRun: KycAgentRun | null) {
  if (!draft) return ''
  const linkedRun = runMatchesDraft(latestRun, draft) ? latestRun : null
  const linkedRunResponse = linkedRun?.detailed_description ?? ''
  const storedResponse = linkedRunResponse?.trim() || draft.detailed_description?.trim()
  const generatedAt = linkedRun ? linkedRun.completed_at || linkedRun.updated_at || linkedRun.created_at : draft.updated_at
  const sourceLabel = linkedRunResponse?.trim() ? 'Linked KYC run response' : 'Stored draft detailed response'
  const provider = linkedRun ? providerText(linkedRun) : 'Stored KYC draft'
  const populatedFields = draft.fields.filter(field => toPlainText(field.value || '').trim())
  const emptyFields = draft.fields.filter(field => !toPlainText(field.value || '').trim())
  const fieldSections = draft.fields.map(field => (
    [
      `<h5>${escapeHtml(field.workstream_title)} - ${escapeHtml(field.label)}</h5>`,
      toPlainText(field.value || '').trim() ? richTextFromStoredKycText(field.value || '') : '<p><em>No value returned yet.</em></p>',
      `<p><strong>Confidence:</strong> ${field.confidence}% · <strong>Status:</strong> ${field.missing ? 'Missing' : 'Populated'}${field.is_sensitive ? ' · Sensitive' : ''}</p>`,
      field.missing_evidence_note ? `<p><strong>Missing evidence:</strong> ${escapeHtml(field.missing_evidence_note)}</p>` : '',
      field.suggested_follow_up_questions?.length ? `<p><strong>Follow-up questions:</strong></p><ul>${field.suggested_follow_up_questions.map(question => `<li>${escapeHtml(question)}</li>`).join('')}</ul>` : '',
    ].filter(Boolean).join('')
  )).join('')
  const citationItems = draft.citations.slice(0, 40).map(citation => (
    `<li><strong>${escapeHtml(citation.label)}</strong>${citation.source_route ? ` · ${escapeHtml(citation.source_route)}` : ''}${citation.page_number ? ` · page ${citation.page_number}` : ''}<br/>${escapeHtml(citation.excerpt)}</li>`
  )).join('')
  return [
    '<h4>Generated KYC response</h4>',
    '<ul>',
    `<li><strong>Source:</strong> ${escapeHtml(sourceLabel)}</li>`,
    `<li><strong>Model:</strong> ${escapeHtml(linkedRun?.model_name || 'Stored draft response')}</li>`,
    `<li><strong>Provider:</strong> ${escapeHtml(provider)}</li>`,
    `<li><strong>Generated/stored at:</strong> ${escapeHtml(formatDateTime(generatedAt))}</li>`,
    `<li><strong>Populated fields:</strong> ${populatedFields.length}/${draft.fields.length}</li>`,
    `<li><strong>Empty fields:</strong> ${emptyFields.map(field => escapeHtml(field.label)).join(', ') || 'None'}</li>`,
    '</ul>',
    '<h4>Full response</h4>',
    storedResponse
      ? richTextFromStoredKycText(storedResponse)
      : '<p>No generated KYC response has been stored yet. Create or retry the KYC draft, run the pending job if needed, then refresh this page.</p>',
    '<h4>Current extracted KYC fields</h4>',
    fieldSections || '<p>No KYC fields are available yet.</p>',
    '<h4>Citations and web sources</h4>',
    citationItems ? `<ul>${citationItems}</ul>` : '<p>No citations or web research sources are attached yet.</p>',
    '<h4>Research source status</h4>',
    '<ul>',
    `<li><strong>Configured research labels:</strong> ${draft.research_sources.map(source => escapeHtml(source)).join(', ') || 'None'}</li>`,
    '<li><strong>Compliant web search:</strong> Tavily API can return official websites, news, blogs, business pages, and public Reddit results when available.</li>',
    '<li><strong>Google:</strong> direct Google scraping is not used; web search is routed through Tavily/API-backed search.</li>',
    '<li><strong>LinkedIn:</strong> not scraped or cited without approved official API/data-provider access.</li>',
    '<li><strong>ZoomInfo:</strong> not queried unless approved API credentials are configured.</li>',
    '</ul>',
  ].join('')
}

function buildAiDebugLogsHtml(draft: KycDraft | null, latestRun: KycAgentRun | null) {
  if (!draft) return ''
  const linkedRun = runMatchesDraft(latestRun, draft) ? latestRun : null
  if (!linkedRun) {
    return [
      '<h4>No linked run logs available</h4>',
      '<p>This draft does not currently have the latest KYC run loaded. Refresh the page or run/retry KYC to capture prompt and response logs for the next run.</p>',
      '<h4>Processing notes</h4>',
      '<ul>',
      '<li>Existing drafts created before log persistence may only show stored detailed response text.</li>',
    '<li>New AI KYC runs persist prompt sections, raw response sections, workstream call metadata, and processing notes.</li>',
      '</ul>',
    ].join('')
  }

  const retrieval = recordValue(linkedRun.retrieval_summary)
  const ollamaDebug = recordValue(retrieval.ollama_debug)
  const researchDebug = recordValue(retrieval.research_debug)
  const promptSections = arrayValue(ollamaDebug.prompt_sections)
  const rawSections = arrayValue(ollamaDebug.raw_response_sections)
  const workstreamCalls = arrayValue(ollamaDebug.workstream_calls)
  const runtimeEvents = arrayValue(ollamaDebug.runtime_events)
  const researchSources = arrayValue(researchDebug.tavily_sources)
  const researchQueries = arrayValue(researchDebug.tavily_queries)
  const processingNotes = [
    ...arrayValue(ollamaDebug.processing_notes).map(String),
    ...arrayValue(researchDebug.processing_notes).map(String),
  ]

  return [
    '<h4>Run summary</h4>',
    '<ul>',
    `<li><strong>Status:</strong> ${escapeHtml(linkedRun.status)}</li>`,
    `<li><strong>Model:</strong> ${escapeHtml(linkedRun.model_name || 'unknown')}</li>`,
    `<li><strong>Provider:</strong> ${escapeHtml(providerText(linkedRun))}</li>`,
    `<li><strong>Started:</strong> ${linkedRun.started_at ? escapeHtml(formatDateTime(linkedRun.started_at)) : 'Not recorded'}</li>`,
    `<li><strong>Completed:</strong> ${linkedRun.completed_at ? escapeHtml(formatDateTime(linkedRun.completed_at)) : 'Not recorded'}</li>`,
    `<li><strong>Retrieved context:</strong> ${escapeHtml(String(retrieval.retrieved_context_count ?? 'not recorded'))}</li>`,
    `<li><strong>Schema fallbacks:</strong> ${escapeHtml(String(ollamaDebug.schema_fallback_count ?? 0))}</li>`,
    '</ul>',
    processingNotes.length ? `<h4>Processing notes</h4><ul>${processingNotes.map(note => `<li>${escapeHtml(note)}</li>`).join('')}</ul>` : '',
    runtimeEvents.length ? `<h4>Runtime AI events</h4>${runtimeEvents.map(event => runtimeEventBlock(event)).join('')}` : '',
    researchQueries.length ? `<h4>Tavily/web research queries</h4><ul>${researchQueries.map(query => `<li>${escapeHtml(String(query))}</li>`).join('')}</ul>` : '',
    researchSources.length ? `<h4>Tavily/web research sources</h4><ul>${researchSources.map(source => sourceListItem(source)).join('')}</ul>` : '',
    workstreamCalls.length ? `<h4>Workstream call metadata</h4>${workstreamCalls.map(call => debugBlock(callTitle(call), jsonText(call))).join('')}` : '',
    promptSections.length ? `<h4>AI prompts</h4>${promptSections.map(section => promptBlock(section)).join('')}` : '',
    rawSections.length ? `<h4>AI raw workstream responses</h4>${rawSections.map(section => rawResponseBlock(section)).join('')}` : '',
    typeof researchDebug.ollama_prompt === 'string' && researchDebug.ollama_prompt.trim() ? `<h4>Web-research summarizer prompt</h4>${debugBlock('Research summarizer prompt', researchDebug.ollama_prompt)}` : '',
    typeof researchDebug.ollama_raw_response === 'string' && researchDebug.ollama_raw_response.trim() ? `<h4>Web-research summarizer raw response</h4>${debugBlock('Research summarizer response', researchDebug.ollama_raw_response)}` : '',
    !promptSections.length && !rawSections.length && !researchDebug.ollama_prompt
      ? '<p>No prompt/raw response logs are stored for this run yet. Run a new KYC or web-research job after this update to populate the sidebar.</p>'
      : '',
  ].filter(Boolean).join('')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toPlainText(value: string) {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char))
}

function textWithLineBreaks(value: string) {
  return escapeHtml(value).replace(/\n/g, '<br/>')
}

function richTextFromStoredKycText(value: string) {
  if (/<\/?[a-z][\s\S]*>/i.test(value)) return value
  return `<p>${textWithLineBreaks(value)}</p>`
}

function runMatchesDraft(run: KycAgentRun | null, draft: KycDraft | null) {
  if (!run || !draft) return false
  if (run.id === draft.agent_run_id) return true
  const provider = recordValue(run.provider)
  const retrieval = recordValue(run.retrieval_summary)
  return provider.draft_id === draft.id || retrieval.draft_id === draft.id
}

function recordValue(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function promptBlock(value: unknown) {
  const record = recordValue(value)
  const title = [record.title, record.workstream_key].filter(item => typeof item === 'string' && item).join(' - ') || 'AI prompt'
  const tokens = typeof record.input_tokens_estimate === 'number' ? ` · ${record.input_tokens_estimate} estimated tokens` : ''
  const context = typeof record.retrieved_context_count === 'number' ? ` · ${record.retrieved_context_count} context item(s)` : ''
  return debugBlock(`${title}${tokens}${context}`, String(record.prompt || 'Prompt not stored.'))
}

function rawResponseBlock(value: unknown) {
  const record = recordValue(value)
  const title = [record.title, record.workstream_key].filter(item => typeof item === 'string' && item).join(' - ') || 'AI raw response'
  return debugBlock(title, String(record.raw_response || 'Raw response not stored.'))
}

function runtimeEventBlock(value: unknown) {
  const record = recordValue(value)
  const event = typeof record.event === 'string' && record.event ? record.event : 'runtime_event'
  const at = typeof record.at === 'string' && record.at ? ` · ${formatDateTime(record.at)}` : ''
  return debugBlock(`${event.replace(/_/g, ' ')}${at}`, jsonText(recordValue(record.details)))
}

function callTitle(value: unknown) {
  const record = recordValue(value)
  return String(record.workstream_key || 'Workstream call')
}

function sourceListItem(value: unknown) {
  const record = recordValue(value)
  const label = escapeHtml(String(record.label || record.title || 'Web source'))
  const url = typeof record.url === 'string' && record.url ? ` · ${escapeHtml(record.url)}` : ''
  const confidence = typeof record.confidence === 'number' ? ` · ${record.confidence}%` : ''
  const excerpt = typeof record.excerpt === 'string' && record.excerpt ? `<br/>${escapeHtml(record.excerpt)}` : ''
  return `<li><strong>${label}</strong>${url}${confidence}${excerpt}</li>`
}

function debugBlock(title: string, value: string) {
  return [
    `<h5>${escapeHtml(title)}</h5>`,
    `<pre style="white-space: pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace; font-size: 12px; line-height: 1.5;">${escapeHtml(value)}</pre>`,
  ].join('')
}

function jsonText(value: unknown) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function groupFields(draft: KycDraft | null) {
  if (!draft) return []
  const groups = new Map<string, { key: string; title: string; fields: KycDraft['fields'] }>()
  draft.fields.forEach(field => {
    const group = groups.get(field.workstream_key) ?? { key: field.workstream_key, title: field.workstream_title, fields: [] }
    group.fields.push(field)
    groups.set(field.workstream_key, group)
  })
  return Array.from(groups.values())
}

function citationText(field: KycDraft['fields'][number]) {
  const citation = field.citations[0]
  if (!citation) return 'No citation attached to this field.'
  const page = citation.page_number ? `Page ${citation.page_number}: ` : ''
  return `${citation.label} - ${page}${citation.excerpt}`
}

function KYCStat({ label, value, suffix = '', tone = 'blue' }: { label: string; value: number; suffix?: string; tone?: 'blue' | 'green' | 'orange' }) {
  const toneClass = tone === 'green' ? 'text-rag-green' : tone === 'orange' ? 'text-brand-orange' : 'text-brand-blue'

  return (
    <div className="p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">{label}</p>
      <p className={cn('mt-1 font-display text-3xl font-bold', toneClass)}>{value}{suffix}</p>
    </div>
  )
}

function StatusPill({ status }: { status: KycDraftStatus }) {
  const tone =
    status === 'approved'
      ? 'border-rag-green/20 bg-rag-green/10 text-rag-green'
      : status === 'rejected'
        ? 'border-rag-red/20 bg-rag-red/10 text-rag-red'
        : 'border-blue-tint-20 bg-blue-tint-20 text-brand-blue'

  return <span className={cn('rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider', tone)}>{status.replace(/_/g, ' ')}</span>
}

function Badge({ tone, children }: { tone: 'blue' | 'green' | 'orange'; children: string }) {
  const toneClass =
    tone === 'green'
      ? 'border-rag-green/20 bg-rag-green/10 text-rag-green'
      : tone === 'orange'
        ? 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange'
        : 'border-blue-tint-20 bg-blue-tint-20 text-brand-blue'

  return <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', toneClass)}>{children}</span>
}

function PaginationControls({ page, pages, onPrevious, onNext }: { page: number; pages: number; onPrevious: () => void; onNext: () => void }) {
  return (
    <div className="mt-3 flex items-center justify-between gap-2">
      <button type="button" aria-label="Previous page" className="tk-button-secondary bg-white px-2" onClick={onPrevious} disabled={page <= 1}>
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="text-xs font-semibold text-ink-secondary">Page {page} of {Math.max(pages, 1)}</span>
      <button type="button" aria-label="Next page" className="tk-button-secondary bg-white px-2" onClick={onNext} disabled={page >= pages}>
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}

function LoadingPanel() {
  return (
    <section className="tk-card p-8">
      <div className="flex items-center justify-center gap-3 text-sm font-semibold text-ink-secondary">
        <Loader2 className="h-5 w-5 animate-spin text-brand-blue" />
        Loading KYC workspace
      </div>
    </section>
  )
}

function parseSort(value: string): { sort: 'created_at' | 'confidence' | 'completeness' | 'updated_at'; direction: 'asc' | 'desc' } {
  const [sort, direction] = value.split(':')
  return { sort: sort as 'created_at' | 'confidence' | 'completeness' | 'updated_at', direction: direction === 'asc' ? 'asc' : 'desc' }
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return 'KYC request failed'
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function providerText(run: KycAgentRun) {
  const provider = run.provider ?? {}
  const adapter = typeof provider.adapter === 'string' ? provider.adapter : 'AI provider'
  const baseUrl = typeof provider.base_url === 'string' && provider.base_url ? ` via ${provider.base_url}` : ''
  return `${adapter}${baseUrl}`
}

function openAiResponseLabel(run: KycAgentRun | null) {
  if (!run) return 'Waiting for OpenAI run'
  const model = String(run.model_name || '').trim()
  const provider = providerText(run).toLowerCase()
  const modelLower = model.toLowerCase()
  const isOpenAi = provider.includes('openai') || modelLower.startsWith('gpt-')
  if (isOpenAi) return model || 'OpenAI run'
  if (['pending', 'running'].includes(run.status)) return 'KYC run in progress'
  return 'Previous run stored'
}

function sourceCoverageSummary(run: KycAgentRun) {
  if (run.provider?.research_only) {
    const sourceCount = typeof run.retrieval_summary?.source_count === 'number' ? run.retrieval_summary.source_count : 0
    const queryCount = typeof run.retrieval_summary?.query_count === 'number' ? run.retrieval_summary.query_count : 0
    return `${sourceCount} Tavily source${sourceCount === 1 ? '' : 's'}, ${queryCount} quer${queryCount === 1 ? 'y' : 'ies'}`
  }
  const summary = run.retrieval_summary?.source_coverage
  if (!summary || typeof summary !== 'object') return 'not calculated yet'
  const record = summary as { documents_available?: number; documents_cited?: number; chunks_cited?: number }
  return `${record.documents_cited ?? 0}/${record.documents_available ?? 0} documents cited, ${record.chunks_cited ?? 0} chunks cited`
}
