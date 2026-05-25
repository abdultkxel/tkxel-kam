import { CheckCircle2, Loader2, RotateCcw, XCircle } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { currentUser } from '@/data/mock'
import { emit } from '@/utils/emitTimelineEvent'

export function KYCWorkflow({ accountId }: { accountId: string }) {
  const [status, setStatus] = useState<'draft' | 'submitted' | 'approved' | 'rejected'>('submitted')
  const [loading, setLoading] = useState('')

  async function mutate(action: 'approved' | 'rejected' | 'submitted' | 'draft') {
    setLoading(action)
    await new Promise(resolve => window.setTimeout(resolve, 450))
    if (action === 'approved') emit.kycApproved(accountId, currentUser.id, currentUser.name)
    if (action === 'rejected') emit.kycRejected(accountId, currentUser.id, currentUser.name, 'Missing executive sponsor confirmation.')
    if (action === 'submitted') emit.kycSubmitted(accountId, currentUser.id, currentUser.name)
    if (action === 'draft') emit.kycReopened(accountId, currentUser.id, currentUser.name, 'Reopened for stakeholder update.')
    setStatus(action)
    setLoading('')
    toast.success('KYC status updated')
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="tk-card p-5">
        <h3 className="text-base font-semibold text-ink">KYC workflow</h3>
        <div className="mt-5 space-y-3">
          {['Company profile', 'Stakeholders', 'Commercial profile', 'Risk review'].map((step, index) => (
            <div key={step} className="flex items-center justify-between rounded-lg border border-surface-border p-3">
              <div>
                <p className="text-sm font-semibold text-ink">{step}</p>
                <p className="text-xs text-ink-secondary">Section {index + 1} complete</p>
              </div>
              <CheckCircle2 className="h-5 w-5 text-rag-green" />
            </div>
          ))}
        </div>
      </div>
      <div className="tk-card p-5">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Current status</p>
        <p className="mt-1 font-display text-3xl font-bold capitalize text-ink">{status}</p>
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
