import { AlertTriangle, ArrowRight, CalendarClock, Edit3, FileText, Loader2, Save, ShieldCheck, UserRound } from 'lucide-react'
import { FormEvent } from 'react'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { KYCIntakeFlow } from '@/components/account/KYCIntakeFlow'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/contexts/AuthContext'
import { listEngagements } from '@/services/accountWorkspace'
import { updateEngagementRenewal } from '@/services/retention'
import { Account } from '@/types/account'
import { EngagementRecord } from '@/types/v3'
import { cn } from '@/utils/cn'
import { formatCompactCurrency, formatDate } from '@/utils/formatters'

export function EngagementsPanel({ account }: { account: Account }) {
  const { token, user } = useAuth()
  const [engagements, setEngagements] = useState<EngagementRecord[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingRenewal, setEditingRenewal] = useState(false)
  const [savingRenewal, setSavingRenewal] = useState(false)
  const [renewalError, setRenewalError] = useState('')
  const [renewalForm, setRenewalForm] = useState(() => renewalFormFromEngagement(undefined))
  const selected = engagements.find(engagement => engagement.id === selectedId) ?? engagements[0]
  const readOnly = user?.role === 'leadership_viewer'
  const selectedDocs = useMemo(() => [] as { id: string; name: string; type: string; confidence: number; citations: { id: string; page: number; excerpt: string }[] }[], [])
  const selectedSignals: { headline: string }[] = []

  useEffect(() => {
    if (!token) return
    let active = true
    setLoading(true)
    setError('')
    listEngagements(token, account.id, new URLSearchParams({ page: '1', page_size: '25' }))
      .then(result => {
        if (!active) return
        setEngagements(result.items)
        setSelectedId(current => current || result.items[0]?.id || '')
      })
      .catch(err => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Unable to load engagements')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [account.id, token])

  useEffect(() => {
    setRenewalForm(renewalFormFromEngagement(selected))
    setEditingRenewal(false)
    setRenewalError('')
  }, [selected?.id])

  async function saveRenewal(event: FormEvent) {
    event.preventDefault()
    if (!token || !selected || readOnly) return
    setSavingRenewal(true)
    setRenewalError('')
    try {
      const updated = await updateEngagementRenewal(token, selected.id, {
        renewal_date: toIsoOrNull(renewalForm.renewal_date),
        notice_deadline: toIsoOrNull(renewalForm.notice_deadline),
        notice_period_days: Number(renewalForm.notice_period_days || 0),
        auto_renewal: renewalForm.auto_renewal,
        commercial_exposure: Number(renewalForm.commercial_exposure || 0),
        currency: renewalForm.currency,
        confidence: Number(renewalForm.confidence || 0),
        source_kind: renewalForm.source_kind,
        source_citation: renewalForm.source_citation,
        manual_override_reason: renewalForm.manual_override_reason || null,
      })
      setEngagements(current => current.map(engagement => {
        if (engagement.id !== selected.id) return engagement
        const endDate = updated.sow_end_date || engagement.renewalTerms.endDate
        const renewalDate = updated.renewal_date || engagement.renewalTerms.renewalDate
        return {
          ...engagement,
          ownerId: updated.owner_id || engagement.ownerId,
          ownerName: updated.owner_name || engagement.ownerName,
          value: updated.commercial_exposure,
          renewalTerms: {
            ...engagement.renewalTerms,
            endDate,
            renewalDate,
            noticeDeadline: updated.notice_deadline || engagement.renewalTerms.noticeDeadline,
            noticePeriodDays: updated.notice_period_days ?? engagement.renewalTerms.noticePeriodDays,
            autoRenewal: updated.auto_renewal,
            commercialExposure: updated.commercial_exposure,
            riskStatus: updated.renewal_risk,
            confidence: updated.confidence ?? engagement.renewalTerms.confidence,
            sourceDocumentId: updated.source_document_id || engagement.renewalTerms.sourceDocumentId,
            sourceCitation: updated.source_citation || engagement.renewalTerms.sourceCitation,
            daysToExpiry: updated.days_to_expiry ?? engagement.renewalTerms.daysToExpiry,
          },
        }
      }))
      setEditingRenewal(false)
    } catch (err) {
      setRenewalError(err instanceof Error ? err.message : 'Unable to update renewal terms')
    } finally {
      setSavingRenewal(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <KYCIntakeFlow account={account} />
        <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-5">
        <KYCIntakeFlow account={account} />
        <EmptyState icon={AlertTriangle} heading="Engagements could not be loaded" body={error} />
      </div>
    )
  }

  if (!engagements.length) {
    return (
      <div className="space-y-5">
        <KYCIntakeFlow account={account} />
        <section className="tk-card p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-tint-20 text-brand-blue">
                <FileText className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Engagement/SOW</p>
                <h3 className="mt-1 text-base font-semibold text-ink">No engagement records yet</h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-secondary">Approved charter and SOW intake drafts create engagement records under the parent account.</p>
              </div>
            </div>
            <Link className="tk-button-primary shrink-0" to="/accounts/onboarding">
              Start intake
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <KYCIntakeFlow account={account} />
      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <div className="tk-card p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Engagements</p>
            <p className="mt-1 text-sm leading-6 text-ink-secondary">Select a SOW-backed engagement to inspect renewal posture, delivery ownership, and source evidence.</p>
          </div>
          {engagements.map(engagement => (
            <button
              key={engagement.id}
              className={cn(
                'w-full rounded-lg border p-4 text-left transition-colors',
                selected?.id === engagement.id ? 'border-brand-blue bg-blue-tint-20' : 'border-surface-border bg-white hover:border-brand-blue/40 hover:bg-surface-tertiary',
              )}
              onClick={() => setSelectedId(engagement.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-ink">{engagement.name}</h3>
                  <p className="mt-1 text-xs text-ink-secondary">{engagement.serviceLines.join(', ')}</p>
                </div>
                <StatusPill status={engagement.status} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <MiniStat label="Value" value={formatCompactCurrency(engagement.value)} />
                <MiniStat label="SOW end" value={formatDate(engagement.renewalTerms.endDate)} />
              </div>
            </button>
          ))}
        </aside>

        {selected ? (
          <main className="space-y-5">
          <section className="tk-card overflow-hidden">
            <div className="border-b border-surface-border bg-surface-secondary p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Engagement 360</p>
                  <h2 className="font-display text-3xl font-bold text-ink">{selected.name}</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-secondary">{selected.commercialContext}</p>
                </div>
                <StatusPill status={selected.status} />
              </div>
            </div>
            <div className="grid gap-0 divide-y divide-surface-border md:grid-cols-4 md:divide-x md:divide-y-0">
              <Metric label="Value" value={formatCompactCurrency(selected.value)} />
              <Metric label="Delivery health" value={`${selected.deliveryHealth}%`} />
              <Metric label="SOW expiry" value={`${selected.renewalTerms.daysToExpiry}d`} tone="orange" />
              <Metric label="Confidence" value={`${selected.renewalTerms.confidence}%`} tone="blue" />
            </div>
          </section>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="space-y-4">
              <Panel title="Renewal intelligence" icon={CalendarClock}>
                <div className="mb-3 flex justify-end">
                  {!readOnly ? (
                    <button className="tk-button-secondary" onClick={() => setEditingRenewal(value => !value)}>
                      <Edit3 className="h-4 w-4" />
                      {editingRenewal ? 'Cancel' : 'Edit renewal'}
                    </button>
                  ) : null}
                </div>
                {editingRenewal ? (
                  <form className="space-y-3" onSubmit={saveRenewal}>
                    {renewalError ? <p className="rounded-lg border border-rag-red/20 bg-rag-red/10 p-3 text-sm text-rag-red">{renewalError}</p> : null}
                    <div className="grid gap-3 md:grid-cols-3">
                      <label className="space-y-1">
                        <span className="tk-label">Renewal date</span>
                        <input type="datetime-local" className="tk-input" value={renewalForm.renewal_date} onChange={event => setRenewalForm({ ...renewalForm, renewal_date: event.target.value })} />
                      </label>
                      <label className="space-y-1">
                        <span className="tk-label">Notice deadline</span>
                        <input type="datetime-local" className="tk-input" value={renewalForm.notice_deadline} onChange={event => setRenewalForm({ ...renewalForm, notice_deadline: event.target.value })} />
                      </label>
                      <label className="space-y-1">
                        <span className="tk-label">Notice period</span>
                        <input type="number" min={0} className="tk-input" value={renewalForm.notice_period_days} onChange={event => setRenewalForm({ ...renewalForm, notice_period_days: event.target.value })} />
                      </label>
                      <label className="space-y-1">
                        <span className="tk-label">Exposure</span>
                        <input type="number" min={0} className="tk-input" value={renewalForm.commercial_exposure} onChange={event => setRenewalForm({ ...renewalForm, commercial_exposure: event.target.value })} />
                      </label>
                      <label className="space-y-1">
                        <span className="tk-label">Confidence</span>
                        <input type="number" min={0} max={100} className="tk-input" value={renewalForm.confidence} onChange={event => setRenewalForm({ ...renewalForm, confidence: event.target.value })} />
                      </label>
                      <label className="space-y-1">
                        <span className="tk-label">Source</span>
                        <select className="tk-input" value={renewalForm.source_kind} onChange={event => setRenewalForm({ ...renewalForm, source_kind: event.target.value as typeof renewalForm.source_kind })}>
                          <option value="sow">SOW</option>
                          <option value="extracted">Extracted</option>
                          <option value="manual">Manual</option>
                          <option value="imported">Imported</option>
                        </select>
                      </label>
                    </div>
                    <label className="flex min-h-[44px] items-center gap-2 rounded-md border border-surface-border bg-white px-3 text-sm font-semibold text-ink">
                      <input type="checkbox" checked={renewalForm.auto_renewal} onChange={event => setRenewalForm({ ...renewalForm, auto_renewal: event.target.checked })} />
                      Auto-renewal
                    </label>
                    <label className="space-y-1">
                      <span className="tk-label">Source citation</span>
                      <textarea className="tk-input min-h-[88px]" value={renewalForm.source_citation} onChange={event => setRenewalForm({ ...renewalForm, source_citation: event.target.value })} />
                    </label>
                    {renewalForm.source_kind === 'manual' ? (
                      <label className="space-y-1">
                        <span className="tk-label">Manual override reason</span>
                        <textarea className="tk-input min-h-[72px]" value={renewalForm.manual_override_reason} onChange={event => setRenewalForm({ ...renewalForm, manual_override_reason: event.target.value })} />
                      </label>
                    ) : null}
                    <button className="tk-button-primary" disabled={savingRenewal}>
                      {savingRenewal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save renewal
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="grid gap-3 md:grid-cols-3">
                      <Field label="Start" value={formatDate(selected.renewalTerms.startDate)} />
                      <Field label="End" value={formatDate(selected.renewalTerms.endDate)} />
                      <Field label="Renewal" value={formatDate(selected.renewalTerms.renewalDate)} />
                      <Field label="Notice deadline" value={formatDate(selected.renewalTerms.noticeDeadline)} />
                      <Field label="Notice period" value={`${selected.renewalTerms.noticePeriodDays} days`} />
                      <Field label="Auto-renewal" value={selected.renewalTerms.autoRenewal ? 'Yes' : 'No'} />
                    </div>
                    <p className="mt-3 rounded-lg border border-brand-orange/20 bg-brand-orange/10 p-3 text-sm text-brand-orange">{selected.renewalTerms.sourceCitation}</p>
                  </>
                )}
              </Panel>

              <Panel title="Delivery and resource context" icon={UserRound}>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Owner" value={selected.ownerName} />
                  <Field label="Ops Lead" value={selected.opsLeadName} />
                  <Field label="Resource dependency" value={selected.resourceDependency} multiline />
                  <Field label="Service lines" value={selected.serviceLines.join(', ')} multiline />
                </div>
              </Panel>

              <Panel title="Risks and signals" icon={AlertTriangle}>
                <div className="space-y-2">
                  {[...selected.risks, ...selectedSignals.map(signal => signal.headline)].map(item => (
                    <div key={item} className="rounded-lg border border-brand-orange/20 bg-brand-orange/10 p-3 text-sm text-brand-orange">{item}</div>
                  ))}
                </div>
              </Panel>
            </section>

            <aside className="space-y-4">
              <Panel title="Source documents" icon={FileText}>
                <div className="space-y-2">
                  {selectedDocs.map(document => (
                    <div key={document.id} className="rounded-lg border border-surface-border p-3">
                      <p className="text-sm font-semibold text-ink">{document.name}</p>
                      <p className="mt-1 text-xs text-ink-secondary">{document.type.replace('_', ' ')} | {document.confidence}% confidence</p>
                      {document.citations.slice(0, 1).map(citation => (
                        <p key={citation.id} className="mt-2 rounded-md bg-surface-secondary p-2 text-xs leading-5 text-ink-secondary">Page {citation.page}: {citation.excerpt}</p>
                      ))}
                    </div>
                  ))}
                </div>
              </Panel>
            </aside>
          </div>
          </main>
        ) : null}
      </div>
    </div>
  )
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof ShieldCheck; children: ReactNode }) {
  return (
    <section className="tk-card p-5">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-brand-blue" />
        <h3 className="text-base font-semibold text-ink">{title}</h3>
      </div>
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

function Metric({ label, value, tone = 'dark' }: { label: string; value: string; tone?: 'dark' | 'orange' | 'blue' }) {
  const toneClass = tone === 'orange' ? 'text-brand-orange' : tone === 'blue' ? 'text-brand-blue' : 'text-ink'
  return (
    <div className="rounded-lg bg-surface-secondary p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">{label}</p>
      <p className={`mt-1 font-display text-3xl font-bold ${toneClass}`}>{value}</p>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-md bg-white px-2 py-1">
      <span className="block text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">{label}</span>
      <span className="font-semibold text-ink">{value}</span>
    </span>
  )
}

function StatusPill({ status }: { status: EngagementRecord['status'] }) {
  const tone = status === 'at_risk' ? 'border-rag-red/20 bg-rag-red/10 text-rag-red' : status === 'renewal_watch' ? 'border-brand-orange/20 bg-brand-orange/10 text-brand-orange' : 'border-rag-green/20 bg-rag-green/10 text-rag-green'
  return <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-wider ${tone}`}>{status.replace('_', ' ')}</span>
}

function renewalFormFromEngagement(engagement?: EngagementRecord) {
  const terms = engagement?.renewalTerms
  const citation = terms?.sourceCitation ?? ''
  return {
    renewal_date: toInputDate(terms?.renewalDate),
    notice_deadline: toInputDate(terms?.noticeDeadline),
    notice_period_days: String(terms?.noticePeriodDays ?? 0),
    auto_renewal: Boolean(terms?.autoRenewal),
    commercial_exposure: String(terms?.commercialExposure ?? engagement?.value ?? 0),
    currency: 'USD',
    confidence: String(terms?.confidence ?? 75),
    source_kind: citation && citation !== 'No source citation recorded.' ? 'sow' as const : 'manual' as const,
    source_citation: citation === 'No source citation recorded.' ? '' : citation,
    manual_override_reason: '',
  }
}

function toInputDate(value?: string) {
  if (!value) return ''
  return new Date(value).toISOString().slice(0, 16)
}

function toIsoOrNull(value: string) {
  return value ? new Date(value).toISOString() : null
}
