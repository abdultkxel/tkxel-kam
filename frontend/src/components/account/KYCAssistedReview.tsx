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
import { useAuth } from '@/contexts/AuthContext'
import { ApiError } from '@/services/api'
import {
  approveKycDraft,
  createKycDraft,
  getKycFreshness,
  listKycAgentRuns,
  listKycDrafts,
  listKycSnapshots,
  rejectKycDraft,
  runPendingKycJobs,
  restoreKycSnapshot,
  updateKycDraft,
} from '@/services/kyc'
import { Account } from '@/types/account'
import { KycAgentRun, KycDraft, KycDraftStatus, KycFreshness, KycPage, KycSnapshot } from '@/types/kyc'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/utils/cn'

const DRAFT_PAGE_SIZE = 5
const SNAPSHOT_PAGE_SIZE = 3

type ActionState = 'initial' | 'refresh' | 'create' | 'save' | 'approve' | 'reject' | 'restore' | 'runPending' | ''

export function KYCAssistedReview({ account }: { account: Account }) {
  const { token } = useAuth()
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
  const completion = activeDraft?.completeness ?? freshness?.completeness ?? 0
  const confidence = activeDraft?.confidence ?? freshness?.confidence ?? 0
  const sourceCoverage = activeDraft?.source_coverage ?? freshness?.source_coverage ?? 0
  const hasInitialLoading = loading === 'initial' && !drafts
  const { sort, direction } = parseSort(sortOption)

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
    if (!activeDraft) {
      setFieldValues({})
      setAckLowConfidence(false)
      setAckConflicts(false)
      setOverrideReason('')
      setReviewNotes('')
      setRejectionReason('')
      return
    }
    setFieldValues(Object.fromEntries(activeDraft.fields.map(field => [field.key, field.value ?? ''])))
    setAckLowConfidence(activeDraft.low_confidence_acknowledged)
    setAckConflicts(activeDraft.conflicts_acknowledged)
    setOverrideReason(activeDraft.override_reason ?? '')
    setReviewNotes(activeDraft.review_notes ?? '')
    setRejectionReason(activeDraft.rejection_reason ?? '')
    setFieldErrors([])
  }, [activeDraft])

  function updateField(fieldKey: string, value: string) {
    setFieldValues(values => ({ ...values, [fieldKey]: value }))
  }

  async function createDraft() {
    if (!token) return
    setLoading('create')
    setFieldErrors([])
    setError(null)
    try {
      const draft = await createKycDraft(token, account.id, { trigger_source: 'kyc_page', notes: reviewNotes || undefined })
      toast.success('KYC draft created')
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
    setLoading('approve')
    setFieldErrors([])
    setError(null)
    try {
      await approveKycDraft(token, account.id, activeDraft.id, {
        low_confidence_acknowledged: ackLowConfidence,
        conflicts_acknowledged: ackConflicts,
        override_reason: overrideReason || null,
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

      {latestRun ? (
        <section className="tk-card p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">Local AI run status</p>
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
          </div>
        </section>
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
                  <button type="button" className="tk-button-secondary bg-white" onClick={createDraft} disabled={Boolean(loading)}>
                    {loading === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
                    New draft
                  </button>
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
                        <textarea
                          className="mt-2 min-h-[104px] w-full resize-y rounded-md border border-surface-border bg-surface-secondary px-3 py-2 text-sm leading-6 text-ink outline-none transition-colors focus:border-brand-blue focus:bg-white focus:ring-2 focus:ring-brand-blue/20 disabled:cursor-not-allowed disabled:opacity-70"
                          value={fieldValues[field.key] ?? ''}
                          onChange={event => updateField(field.key, event.target.value)}
                          disabled={!canEditDraft}
                        />
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

          {activeDraft ? (
            <section className="tk-card p-5">
              <h3 className="text-base font-semibold text-ink">Review gates</h3>
              <div className="mt-3 space-y-3">
                <label className="flex items-start gap-2 rounded-lg border border-surface-border p-3 text-sm text-ink-secondary">
                  <input type="checkbox" className="mt-1" checked={ackLowConfidence} onChange={event => setAckLowConfidence(event.target.checked)} disabled={!canEditDraft} />
                  <span>Low-confidence fields acknowledged ({lowConfidenceFields.length})</span>
                </label>
                <label className="flex items-start gap-2 rounded-lg border border-surface-border p-3 text-sm text-ink-secondary">
                  <input type="checkbox" className="mt-1" checked={ackConflicts} onChange={event => setAckConflicts(event.target.checked)} disabled={!canEditDraft} />
                  <span>Conflicts acknowledged ({activeDraft.conflicts.length})</span>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Override reason</span>
                  <textarea className="tk-input mt-2 min-h-[86px]" value={overrideReason} onChange={event => setOverrideReason(event.target.value)} disabled={!canEditDraft} />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Review notes</span>
                  <textarea className="tk-input mt-2 min-h-[86px]" value={reviewNotes} onChange={event => setReviewNotes(event.target.value)} disabled={!canEditDraft} />
                </label>
              </div>
            </section>
          ) : null}

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
                <textarea className="tk-input mt-2 min-h-[120px]" value={rejectionReason} onChange={event => setRejectionReason(event.target.value)} />
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
                <textarea className="tk-input mt-2 min-h-[120px]" value={restoreReason} onChange={event => setRestoreReason(event.target.value)} />
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

function sourceCoverageSummary(run: KycAgentRun) {
  const summary = run.retrieval_summary?.source_coverage
  if (!summary || typeof summary !== 'object') return 'not calculated yet'
  const record = summary as { documents_available?: number; documents_cited?: number; chunks_cited?: number }
  return `${record.documents_cited ?? 0}/${record.documents_available ?? 0} documents cited, ${record.chunks_cited ?? 0} chunks cited`
}
