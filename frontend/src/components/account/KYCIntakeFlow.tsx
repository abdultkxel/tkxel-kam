import { addDays } from 'date-fns'
import { CheckCircle2, FileSearch, FileText, Loader2, UploadCloud } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'
import { createKycDraft } from '@/services/kyc'
import { useScoreActivityStore } from '@/stores/scoreActivityStore'
import { useV3Store } from '@/stores/v3Store'
import { Account } from '@/types/account'
import { ScoreActivityTask } from '@/types/scoreActivity'
import { KycDraft } from '@/types/kyc'
import { emitTimelineEvent } from '@/utils/emitTimelineEvent'
import { formatRelative } from '@/utils/formatters'

export function KYCIntakeFlow({ account }: { account: Account }) {
  const user = useRole()
  const { token } = useAuth()
  const drafts = useV3Store(state => state.onboardingDrafts)
  const addAccountKycIntakeDraft = useV3Store(state => state.addAccountKycIntakeDraft)
  const addTask = useScoreActivityStore(state => state.addTask)
  const [fileNames, setFileNames] = useState<string[]>([])
  const [extracting, setExtracting] = useState(false)
  const [latestBackendDraft, setLatestBackendDraft] = useState<KycDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const accountDrafts = useMemo(
    () =>
      drafts
        .filter(draft => draft.accountDraft.id === account.id || draft.kycDraft.accountId === account.id)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [account.id, drafts],
  )
  const latestDraft = accountDrafts[0]

  async function runIntake() {
    const names = fileNames.length ? fileNames : [`${account.name} Project Charter.pdf`, `${account.name} Renewal SOW.pdf`]
    setExtracting(true)
    setError(null)
    let draftId = ''
    try {
      if (token) {
        const draft = await createKycDraft(token, account.id, {
          trigger_source: 'source_documents',
          notes: `Charter/SOW intake file names: ${names.join(', ')}`,
        })
        setLatestBackendDraft(draft)
        draftId = draft.id
      } else {
        await new Promise(resolve => window.setTimeout(resolve, 800))
        draftId = addAccountKycIntakeDraft(account, names, user.name)
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'KYC intake failed')
      setExtracting(false)
      return
    }
    const task: ScoreActivityTask = {
      id: `sat-kyc-${account.id}-${Date.now()}`,
      templateId: 'ai-kyc-intake',
      accountId: account.id,
      accountName: account.name,
      ownerId: account.ownerId,
      ownerName: account.ownerName,
      calculatorId: 'risk',
      criterionId: 'kyc_agent_refresh',
      title: 'Update KYC from new charter/SOW intake',
      description: 'AI agent created a new source-backed KYC draft. Review extracted fields, citations, missing items, and renewal terms before approval.',
      dueDate: addDays(new Date(), 2).toISOString(),
      status: 'todo',
      priority: 'high',
      workflowLane: 'due_soon',
      evidenceNote: `Created from AI intake draft ${draftId} using ${names.join(', ')}.`,
      createdAt: new Date().toISOString(),
    }
    addTask(task)
    emitTimelineEvent({
      accountId: account.id,
      eventType: 'manual_note',
      module: 'activity',
      title: 'KYC update task created from charter/SOW intake',
      description: `${task.title}. Owner: ${task.ownerName}.`,
      performedBy: user.id,
      performedByName: user.name,
      sourceRecordId: task.id,
      sourceRecordType: 'score_activity_task',
      sourceRecordRoute: `/accounts/${account.id}?tab=kyc`,
      metadata: { taskId: task.id, draftId, sourceDocuments: names },
      isSensitive: false,
      isSystemGenerated: true,
      isImmutable: false,
    })
    setExtracting(false)
    setFileNames([])
    toast.success('AI intake added and KYC update task created')
  }

  const latestStatus = latestBackendDraft?.status ?? latestDraft?.status
  const latestConfidence = latestBackendDraft?.confidence ?? latestDraft?.confidence
  const latestCreatedAt = latestBackendDraft?.created_at ?? latestDraft?.createdAt

  return (
    <section className="tk-card overflow-hidden">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="border-b border-surface-border bg-surface-secondary p-5 lg:border-b-0 lg:border-r">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">New charter AI intake</p>
              <h3 className="mt-1 text-base font-semibold text-ink">Add charter or SOW evidence</h3>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-secondary">
                Upload a new charter or SOW for this account. The AI agent extracts engagement details, KYC fields, renewal terms, risks, citations, and missing items for review below.
              </p>
            </div>
            <button type="button" className="tk-button-primary shrink-0" onClick={runIntake} disabled={extracting}>
              {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
              Run AI intake
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
            <label className="flex min-h-[112px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-brand-blue/40 bg-white p-4 text-center transition-colors hover:bg-blue-tint-20">
              <UploadCloud className="h-6 w-6 text-brand-blue" />
              <span className="mt-2 text-sm font-semibold text-ink">Select charter/SOW files</span>
              <span className="mt-1 text-xs text-ink-secondary">PDF or DOCX names are used for prototype extraction.</span>
              <input
                type="file"
                multiple
                className="sr-only"
                onChange={event => setFileNames(Array.from(event.target.files ?? []).map(file => file.name))}
              />
            </label>

            <div className="rounded-lg border border-surface-border bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Files ready</p>
              <div className="mt-2 space-y-2">
                {(fileNames.length ? fileNames : [`${account.name} Project Charter.pdf`, `${account.name} Renewal SOW.pdf`]).slice(0, 3).map(name => (
                  <div key={name} className="flex items-center gap-2 rounded-md bg-surface-secondary p-2 text-xs font-medium text-ink-secondary">
                    <FileText className="h-4 w-4 shrink-0 text-brand-blue" />
                    <span className="min-w-0 truncate">{name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {error ? (
            <div className="mt-4 rounded-lg border border-rag-red/20 bg-rag-red/10 p-3 text-sm text-rag-red">
              {error}
            </div>
          ) : null}
        </div>

        <aside className="p-5">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Intake handoff</p>
          <div className="mt-4 space-y-3">
            {['Extract document fields', 'Refresh five KYC workstreams', 'Push draft into review'].map((step, index) => (
              <div key={step} className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-tint-20 text-xs font-bold text-brand-blue">
                  {extracting && index === 1 ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                </span>
                <span className="text-sm font-medium text-ink">{step}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-lg border border-surface-border bg-surface-secondary p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Latest intake</p>
            <p className="mt-1 text-sm font-semibold text-ink">{latestStatus ? latestStatus.replace(/_/g, ' ') : 'No intake yet'}</p>
            <p className="mt-1 text-xs text-ink-secondary">
              {latestStatus && latestConfidence && latestCreatedAt ? `${latestConfidence}% confidence, ${formatRelative(latestCreatedAt)}` : 'Run intake to create a reviewable KYC draft.'}
            </p>
          </div>
        </aside>
      </div>
    </section>
  )
}
