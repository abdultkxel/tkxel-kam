import { AlertTriangle, CheckCircle2, FileSearch, Loader2, Save, ShieldCheck, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { currentUser } from '@/data/mock'
import { useV3Store } from '@/stores/v3Store'
import { Account } from '@/types/account'
import { SourceDocument } from '@/types/v3'
import { cn } from '@/utils/cn'
import { emit } from '@/utils/emitTimelineEvent'

type ReviewStatus = 'ready_for_review' | 'approved' | 'rejected'

type ReviewField = {
  key: string
  label: string
  value: string
  evidence: string
}

type ReviewGroup = {
  key: string
  title: string
  description: string
  fields: ReviewField[]
}

const groupNames = ['Market Research', 'Client Research', 'Stakeholder Details', 'Tkxel Engagement with Client', 'Financial Landscape']

export function KYCAssistedReview({ account }: { account: Account }) {
  const drafts = useV3Store(state => state.onboardingDrafts)
  const documents = useV3Store(state => state.sourceDocuments)
  const approveDraft = useV3Store(state => state.approveDraft)
  const rejectDraft = useV3Store(state => state.rejectDraft)
  const draft = drafts.find(item => item.accountDraft.id === account.id || item.kycDraft.accountId === account.id)
  const kyc = useMemo(() => draft?.kycDraft ?? buildFallbackKYC(account, documents), [account, documents, draft])
  const sourceDocs = useMemo(
    () =>
      draft
        ? documents.filter(document => kyc.sourceDocumentIds.includes(document.id))
        : documents.filter(document => document.accountId === account.id),
    [account.id, documents, draft, kyc.sourceDocumentIds],
  )
  const [status, setStatus] = useState<ReviewStatus>(kyc.status)
  const [loading, setLoading] = useState<'save' | 'approved' | 'rejected' | ''>('')
  const initialGroups = useMemo(() => buildReviewGroups(account, kyc.sections, sourceDocs), [account, kyc.sections, sourceDocs])
  const [reviewGroups, setReviewGroups] = useState(initialGroups)
  const totalFields = reviewGroups.reduce((sum, group) => sum + group.fields.length, 0)
  const completedFields = reviewGroups.reduce(
    (sum, group) => sum + group.fields.filter(field => field.value.trim().length > 8).length,
    0,
  )
  const issuePenalty = Math.min(18, kyc.missingFields.length * 4 + kyc.conflicts.length * 6)
  const completion = Math.max(0, Math.min(100, Math.round((completedFields / Math.max(totalFields, 1)) * 100 - issuePenalty)))
  const sourceLabel = sourceDocs.length ? `${sourceDocs.length} source documents` : 'No charter or SOW attached'

  useEffect(() => {
    setReviewGroups(initialGroups)
    setStatus(kyc.status)
  }, [draft?.id, initialGroups, kyc.status])

  function updateField(groupKey: string, fieldKey: string, value: string) {
    setReviewGroups(groups =>
      groups.map(group =>
        group.key === groupKey
          ? {
              ...group,
              fields: group.fields.map(field => (field.key === fieldKey ? { ...field, value } : field)),
            }
          : group,
      ),
    )
  }

  async function saveEdits() {
    setLoading('save')
    await new Promise(resolve => window.setTimeout(resolve, 350))
    setLoading('')
    toast.success('KYC review edits saved')
  }

  async function decide(nextStatus: 'approved' | 'rejected') {
    setLoading(nextStatus)
    await new Promise(resolve => window.setTimeout(resolve, 450))
    if (draft) {
      if (nextStatus === 'approved') approveDraft(draft.id)
      if (nextStatus === 'rejected') rejectDraft(draft.id)
    }
    if (nextStatus === 'approved') emit.kycApproved(account.id, currentUser.id, currentUser.name)
    if (nextStatus === 'rejected') emit.kycRejected(account.id, currentUser.id, currentUser.name, 'KYC review rejected after source-backed field review.')
    setStatus(nextStatus)
    setLoading('')
    toast.success(nextStatus === 'approved' ? 'KYC approved' : 'KYC rejected')
  }

  return (
    <div className="space-y-4">
      <section className="tk-card overflow-hidden">
        <div className="border-b border-surface-border bg-surface-secondary p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">AI-assisted KYC review</p>
              <h3 className="mt-1 text-lg font-semibold text-ink">Source-backed KYC workspace</h3>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-secondary">
                Review and edit the five agent workstreams before the KYC snapshot is approved for the account record.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="tk-button-secondary bg-white" onClick={saveEdits} disabled={Boolean(loading)}>
                {loading === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save edits
              </button>
              <button type="button" className="tk-button-secondary bg-white" onClick={() => decide('rejected')} disabled={Boolean(loading)}>
                {loading === 'rejected' ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Reject
              </button>
              <button type="button" className="tk-button-primary" onClick={() => decide('approved')} disabled={Boolean(loading)}>
                {loading === 'approved' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Approve KYC
              </button>
            </div>
          </div>

          <div className="mt-5 rounded-lg border border-surface-border bg-white p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-ink">KYC completion</p>
                <p className="mt-1 text-xs text-ink-secondary">{sourceLabel} reviewed across {groupNames.length} agent steps</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill status={status} />
                <span className="font-display text-2xl font-bold text-ink">{completion}%</span>
              </div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-tertiary">
              <div className="h-full rounded-full bg-brand-blue transition-all duration-300" style={{ width: `${completion}%` }} />
            </div>
          </div>
        </div>

        <div className="grid gap-0 divide-y divide-surface-border md:grid-cols-3 md:divide-x md:divide-y-0">
          <KYCStat label="AI confidence" value={kyc.confidence} suffix="%" />
          <KYCStat label="Missing fields" value={kyc.missingFields.length} tone={kyc.missingFields.length ? 'orange' : 'green'} />
          <KYCStat label="Conflicts" value={kyc.conflicts.length} tone={kyc.conflicts.length ? 'orange' : 'green'} />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-4">
          {reviewGroups.map((group, groupIndex) => (
            <article key={group.key} className="tk-card overflow-hidden">
              <header className="border-b border-surface-border p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-tint-20 text-sm font-bold text-brand-blue">
                    {groupIndex + 1}
                  </span>
                  <div>
                    <h4 className="text-base font-semibold text-ink">{group.title}</h4>
                    <p className="mt-1 text-sm leading-6 text-ink-secondary">{group.description}</p>
                  </div>
                </div>
              </header>
              <div className="grid gap-3 p-5">
                {group.fields.map(field => (
                  <label key={field.key} className="block rounded-lg border border-surface-border bg-white p-3 transition-colors focus-within:border-brand-blue focus-within:ring-2 focus-within:ring-brand-blue/20">
                    <span className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">{field.label}</span>
                    <textarea
                      className="mt-2 min-h-[96px] w-full resize-y rounded-md border border-surface-border bg-surface-secondary px-3 py-2 text-sm leading-6 text-ink outline-none transition-colors focus:border-brand-blue focus:bg-white focus:ring-2 focus:ring-brand-blue/20"
                      value={field.value}
                      onChange={event => updateField(group.key, field.key, event.target.value)}
                    />
                    <span className="mt-2 flex items-start gap-2 text-xs leading-5 text-ink-secondary">
                      <FileSearch className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-blue" />
                      {field.evidence}
                    </span>
                  </label>
                ))}
              </div>
            </article>
          ))}
        </section>

        <aside className="space-y-4">
          <section className="tk-card p-5">
            <h3 className="text-base font-semibold text-ink">Research sources</h3>
            <div className="mt-3 grid gap-2">
              {kyc.researchSources.map(source => (
                <div key={source} className="flex items-center gap-2 rounded-lg border border-blue-tint-20 bg-blue-tint-20 p-3 text-sm font-semibold text-brand-blue">
                  <ShieldCheck className="h-4 w-4" />
                  {source}
                </div>
              ))}
            </div>
          </section>
          <section className="tk-card p-5">
            <h3 className="text-base font-semibold text-ink">Review issues</h3>
            <div className="mt-3 space-y-2">
              {[...kyc.missingFields, ...kyc.conflicts].map(item => (
                <div key={item} className="flex items-start gap-2 rounded-lg border border-brand-orange/20 bg-brand-orange/10 p-3 text-sm leading-5 text-brand-orange">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {item}
                </div>
              ))}
              {!kyc.missingFields.length && !kyc.conflicts.length ? (
                <div className="flex items-center gap-2 rounded-lg border border-rag-green/20 bg-rag-green/10 p-3 text-sm font-semibold text-rag-green">
                  <CheckCircle2 className="h-4 w-4" />
                  No open review issues
                </div>
              ) : null}
            </div>
          </section>
          <section className="tk-card p-5">
            <h3 className="text-base font-semibold text-ink">Source citations</h3>
            <div className="mt-3 space-y-2">
              {sourceDocs.length ? (
                sourceDocs.map(document => (
                  <div key={document.id} className="rounded-lg border border-surface-border p-3">
                    <p className="text-sm font-semibold text-ink">{document.name}</p>
                    {document.citations.map(citation => (
                      <p key={citation.id} className="mt-2 text-xs leading-5 text-ink-secondary">Page {citation.page}: {citation.excerpt}</p>
                    ))}
                  </div>
                ))
              ) : (
                <p className="text-sm leading-6 text-ink-secondary">
                  Upload a project charter or SOW from the Accounts intake action to attach source evidence to this account.
                </p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

function buildFallbackKYC(account: Account, documents: SourceDocument[]) {
  const accountDocs = documents.filter(document => document.accountId === account.id)
  return {
    id: `kyc-${account.id}`,
    accountId: account.id,
    status: 'ready_for_review' as const,
    confidence: accountDocs.length ? 82 : 64,
    sourceDocumentIds: accountDocs.map(document => document.id),
    researchSources: ['AI/LLM Gateway research', 'Charter and SOW extraction'],
    sections: {
      company: `${account.name} is managed as a ${account.segment.toLowerCase()} account owned by ${account.ownerName}.`,
      industry: `${account.tags.join(', ')} account context with current stage set to ${account.stage}.`,
      stakeholders: account.stakeholders.join('. '),
      market: 'The AI agent should refresh industry sizing, buying-cycle patterns, peer movement, and technology adoption pressure before leadership review.',
      funding: 'Financial context should be verified from approved commercial notes, public research, and account-owner confirmation.',
      engagementContext: `${account.name} has active engagement evidence that should be tied to source documents, renewal terms, and delivery obligations.`,
      risks: account.risks.join('. '),
    },
    missingFields: accountDocs.length ? ['Confirm financial approver and latest communication cadence'] : ['Project charter or SOW source evidence is not attached'],
    conflicts: [],
    citations: accountDocs.flatMap(document => document.citations),
  }
}

function buildReviewGroups(account: Account, sections: Record<string, string>, sourceDocs: SourceDocument[]): ReviewGroup[] {
  const sourceHint = sourceDocs[0]?.name ? `Source-backed by ${sourceDocs[0].name}` : 'Needs charter, SOW, or research citation before final approval'

  return [
    {
      key: 'market',
      title: 'Market Research',
      description: "Strategic view of the client's operating environment.",
      fields: [
        makeField('industryOverview', 'Industry overview', `${sections.industry}\n\nMaturity, market size, growth rate, disruptions, value chain, and major players should be validated.`, sourceHint),
        makeField('marketTrends', 'Market landscape and trends', sections.market, 'AI agent refreshes buying cycles, engineering adoption, tech trends, and macro demand drivers.'),
        makeField('competitors', 'Competitor analysis', `Direct competitors, product comparisons, partnership signals, technology choices, and Tkxel differentiation for ${account.name}.`, 'Requires public research citation and AM validation.'),
        makeField('regulatory', 'Regulatory and compliance factors', 'Review industry-specific standards, compliance obligations, architecture impact, data handling obligations, and upcoming regulatory changes.', 'Requires source citation before client-facing use.'),
      ],
    },
    {
      key: 'client',
      title: 'Client Research',
      description: 'Comprehensive understanding of the client as an organization.',
      fields: [
        makeField('companySnapshot', 'Company snapshot', sections.company, sourceHint),
        makeField('strategy', 'Vision, mission and strategy', 'Capture stated company direction, business goals, leadership statements, and product or innovation priorities.', 'AI research output must be reviewed before approval.'),
        makeField('companyHistory', 'Company history and evolution', 'Document founding story, major pivots, acquisitions, restructuring, and major leadership changes.', 'Needs cited external research source.'),
        makeField('stakeholderMap', 'Stakeholder map', sections.stakeholders, 'Stakeholder influence, authority, communication style, sponsorship potential, and relationship strength.'),
        makeField('technicalLandscape', 'Technical landscape', 'Capture tech stack, architecture, APIs, integrations, data pipelines, cloud providers, constraints, and legacy dependencies.', 'Requires delivery and technical lead review.'),
      ],
    },
    {
      key: 'stakeholders',
      title: 'Stakeholder Details',
      description: 'Decision, operational, and internal ownership map.',
      fields: [
        makeField('clientStakeholders', 'Client-side stakeholders', `${sections.stakeholders}\n\nAdd decision-makers, operational contacts, recent org changes, influence map, and communication preferences.`, 'Needs AM review.'),
        makeField('tkxelStakeholders', 'Tkxel-side stakeholder mapping', `Assigned AM: ${account.ownerName}. Add Delivery Lead, PM, Technical Leads, executive sponsor, internal cadence, and functional ownership.`, 'Requires internal ownership confirmation.'),
      ],
    },
    {
      key: 'engagement',
      title: 'Tkxel Engagement with Client',
      description: 'How Tkxel is engaged, obligated, and performing.',
      fields: [
        makeField('projectCharters', 'Project charters', 'For each engagement, capture objectives, scope, milestones, success metrics, key contacts, dependencies, and assumptions.', 'Project charter citation required.'),
        makeField('engagementModels', 'Engagement models', sections.engagementContext, 'Validate staff augmentation, dedicated team, fixed-price, managed services, support, or maintenance model.'),
        makeField('obligations', 'Contractual obligations and SLAs', 'Capture contract terms, delivery commitments, support levels, escalation procedures, renewal windows, penalties, and legal considerations.', 'SOW citation required.'),
        makeField('pastEngagements', 'Past engagement summary', 'Summarize delivered outcomes, blockers, escalations, learnings, best practices, and client sentiment over time.', 'Timeline and governance evidence recommended.'),
      ],
    },
    {
      key: 'financial',
      title: 'Financial Landscape',
      description: 'Structured financial view for forecasting and risk assessment.',
      fields: [
        makeField('renewalCycle', 'Renewal cycle', 'Capture contract end dates, renewal dependencies, renewal risks, and pricing sensitivity.', 'SOW renewal terms and notice-window citation required.'),
        makeField('paymentBehaviour', 'Payment behaviour', 'Review on-time payments, delays, disputes, and credit-risk signals.', 'Finance confirmation required.'),
        makeField('grossMargins', 'Gross margins', 'Capture margin by project, blended account margin, month-over-month trend, and margin-stability risk.', 'Commercial review required before sharing.'),
        makeField('billingModels', 'Billing models', 'Confirm hourly or T&M, monthly pods, milestone-based work, managed services, and support billing structure.', 'SOW or commercial note citation required.'),
      ],
    },
  ]
}

function makeField(key: string, label: string, value: string, evidence: string): ReviewField {
  return { key, label, value, evidence }
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

function StatusPill({ status }: { status: ReviewStatus }) {
  const tone =
    status === 'approved'
      ? 'border-rag-green/20 bg-rag-green/10 text-rag-green'
      : status === 'rejected'
        ? 'border-rag-red/20 bg-rag-red/10 text-rag-red'
        : 'border-blue-tint-20 bg-blue-tint-20 text-brand-blue'

  return <span className={cn('rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider', tone)}>{status.replace(/_/g, ' ')}</span>
}
