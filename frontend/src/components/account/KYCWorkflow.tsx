import { CheckCircle2, ClipboardCheck, Loader2, RotateCcw, XCircle } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { createTimelineNote } from '@/services/timeline'

export function KYCWorkflow({ accountId }: { accountId: string }) {
  const { token } = useAuth()
  const [status, setStatus] = useState<'draft' | 'submitted' | 'approved' | 'rejected'>('submitted')
  const [loading, setLoading] = useState('')

  async function mutate(action: 'approved' | 'rejected' | 'submitted' | 'draft') {
    if (!token) {
      toast.error('You must be logged in to update KYC status')
      return
    }
    setLoading(action)
    try {
      const event = kycTimelineEvent(action)
      await createTimelineNote(token, accountId, {
        event_type: 'kyc_update',
        title: event.title,
        description: event.description,
        mentions: [],
        attachments: [],
        tags: ['kyc-status'],
        is_sensitive: false,
      })
      setStatus(action)
      toast.success('KYC status updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'KYC status could not be updated')
    } finally {
      setLoading('')
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="tk-card overflow-hidden">
        <header className="border-b border-surface-border bg-surface-secondary p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-tint-20 text-brand-blue">
              <ClipboardCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">KYC workflow</p>
              <h3 className="text-base font-semibold text-ink">Section completion</h3>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-secondary">Each section is reviewed before approval. KYC status changes create timeline audit events.</p>
            </div>
          </div>
        </header>
        <div className="grid gap-3 p-5 md:grid-cols-2">
          {['Company profile', 'Stakeholders', 'Commercial profile', 'Risk review'].map((step, index) => (
            <div key={step} className="flex items-center justify-between gap-3 rounded-lg border border-surface-border bg-white p-4">
              <div>
                <p className="text-sm font-semibold text-ink">{step}</p>
                <p className="mt-1 text-xs text-ink-secondary">Section {index + 1} complete</p>
              </div>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-rag-green/10 text-rag-green">
                <CheckCircle2 className="h-5 w-5" />
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="tk-card p-5">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Current status</p>
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="font-display text-3xl font-bold capitalize text-ink">{status}</p>
          <StatusPill status={status} />
        </div>
        <p className="mt-2 text-sm leading-6 text-ink-secondary">Approve, reject, or reopen KYC after reviewing source-backed fields and stakeholder coverage.</p>
        <div className="mt-5 grid gap-2">
          <button className="tk-button-primary" disabled={Boolean(loading)} onClick={() => mutate('approved')}>
            {loading === 'approved' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Approve
          </button>
          <button className="tk-button-secondary" disabled={Boolean(loading)} onClick={() => mutate('rejected')}>
            {loading === 'rejected' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            Reject
          </button>
          <button className="tk-button-secondary" disabled={Boolean(loading)} onClick={() => mutate('draft')}>
            {loading === 'draft' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Reopen
          </button>
        </div>
      </div>
    </div>
  )
}

function kycTimelineEvent(action: 'approved' | 'rejected' | 'submitted' | 'draft') {
  if (action === 'approved') return { title: 'KYC approved', description: 'KYC submitted and approved.' }
  if (action === 'rejected') return { title: 'KYC rejected', description: 'Missing executive sponsor confirmation.' }
  if (action === 'draft') return { title: 'KYC reopened', description: 'Reopened for stakeholder update.' }
  return { title: 'KYC submitted', description: 'KYC packet submitted for review.' }
}

function StatusPill({ status }: { status: 'draft' | 'submitted' | 'approved' | 'rejected' }) {
  const tone =
    status === 'approved'
      ? 'border-rag-green/20 bg-rag-green/10 text-rag-green'
      : status === 'rejected'
        ? 'border-rag-red/20 bg-rag-red/10 text-rag-red'
        : status === 'submitted'
          ? 'border-blue-tint-20 bg-blue-tint-20 text-brand-blue'
          : 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange'

  return <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${tone}`}>{status}</span>
}
