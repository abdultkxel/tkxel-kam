import { addDays } from 'date-fns'
import { CheckCircle2, FileSearch, FileText, Loader2, UploadCloud } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { uploadAccountAttachment } from '@/services/accountWorkspace'
import { createKycDraft } from '@/services/kyc'
import { createTask } from '@/services/playbooksTasks'
import { Account } from '@/types/account'
import { KycDraft } from '@/types/kyc'
import { SourceDocument } from '@/types/v3'
import { formatRelative } from '@/utils/formatters'

export function KYCIntakeFlow({ account }: { account: Account }) {
  const { token } = useAuth()
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [extracting, setExtracting] = useState(false)
  const [latestBackendDraft, setLatestBackendDraft] = useState<KycDraft | null>(null)
  const [latestUploadedDocuments, setLatestUploadedDocuments] = useState<SourceDocument[]>([])
  const [error, setError] = useState<string | null>(null)

  async function runIntake() {
    if (!selectedFiles.length) {
      setError('Select at least one charter, SOW, or supporting document before running AI intake.')
      return
    }
    if (!token) {
      setError('You must be signed in to run AI intake.')
      return
    }
    const names = selectedFiles.map(file => file.name)
    setExtracting(true)
    setError(null)
    let sourceDocuments: SourceDocument[] = []
    try {
      const uploaded: SourceDocument[] = []
      for (const file of selectedFiles) {
        uploaded.push(
          await uploadAccountAttachment(token, account.id, {
            file,
            title: file.name,
            extractNow: true,
          }),
        )
      }
      sourceDocuments = uploaded
      setLatestUploadedDocuments(uploaded)
      const draft = await createKycDraft(token, account.id, {
        trigger_source: 'source_documents',
        source_document_ids: uploaded.map(document => document.id),
        notes: `Charter/SOW intake uploaded from stored source documents: ${names.join(', ')}`,
      })
      setLatestBackendDraft(draft)
      await createTask(token, {
        account_id: account.id,
        owner_id: account.ownerId,
        title: 'Update KYC from new charter/SOW intake',
        description: 'AI agent created a new source-backed KYC draft. Review extracted fields, citations, missing items, and renewal terms before approval.',
        due_at: addDays(new Date(), 2).toISOString(),
        status: 'open',
        priority: 'high',
        source_type: 'kyc_draft',
        source_record_id: draft.id,
        notes: `Created from AI intake draft ${draft.id} using ${names.join(', ')}. Source documents: ${sourceDocuments.map(document => document.id).join(', ')}`,
      })
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'KYC intake failed')
      setExtracting(false)
      return
    }
    setExtracting(false)
    setSelectedFiles([])
    toast.success('AI intake added and KYC update task created')
  }

  const latestStatus = latestBackendDraft?.status
  const latestConfidence = latestBackendDraft?.confidence
  const latestCreatedAt = latestBackendDraft?.created_at

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
              <span className="mt-1 text-xs text-ink-secondary">PDF, DOCX, or text content is stored and extracted for KYC.</span>
              <input
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.txt,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/csv"
                className="sr-only"
                onChange={event => setSelectedFiles(Array.from(event.target.files ?? []))}
              />
            </label>

            <div className="rounded-lg border border-surface-border bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Files ready</p>
              <div className="mt-2 space-y-2">
                {selectedFiles.length ? selectedFiles.slice(0, 3).map(file => (
                  <div key={file.name} className="flex items-center gap-2 rounded-md bg-surface-secondary p-2 text-xs font-medium text-ink-secondary">
                    <FileText className="h-4 w-4 shrink-0 text-brand-blue" />
                    <span className="min-w-0 truncate">{file.name}</span>
                  </div>
                )) : (
                  <div className="rounded-md bg-surface-secondary p-2 text-xs text-ink-secondary">No files selected yet.</div>
                )}
                {selectedFiles.length > 3 ? (
                  <div className="rounded-md bg-surface-secondary p-2 text-xs text-ink-secondary">+{selectedFiles.length - 3} more selected</div>
                ) : null}
                {latestUploadedDocuments.slice(0, 3).map(document => (
                  <div key={document.id} className="flex items-center gap-2 rounded-md bg-blue-tint-20 p-2 text-xs font-medium text-brand-blue">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 truncate">{document.name} stored</span>
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
