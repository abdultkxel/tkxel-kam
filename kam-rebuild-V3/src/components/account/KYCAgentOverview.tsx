import { CheckCircle2, ChevronDown, FileSearch, Loader2, RefreshCcw, SearchCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { cn } from '@/utils/cn'

type KYCStep = {
  key: string
  title: string
  description: string
  sections: {
    title: string
    items: string[]
  }[]
}

const kycAgentSteps: KYCStep[] = [
  {
    key: 'market',
    title: 'Market Research',
    description: "Strategic view of the client's operating environment.",
    sections: [
      { title: 'Industry Overview', items: ['Industry category, sub-segment, and maturity stage', 'Market size and growth rate', 'Industry disruptions or inflection points', 'Key value chains and major players'] },
      { title: 'Market Landscape & Trends', items: ['Typical buying cycles', 'Adoption patterns for engineering, product, or data services', 'Tech trends impacting spend', 'Macro trends influencing demand'] },
      { title: 'Competitor Analysis', items: ['Direct competitors and product comparisons', 'Competitor partnerships or technology choices', "Client's competitive positioning", 'How Tkxel can differentiate'] },
      { title: 'Regulatory & Compliance Factors', items: ['Industry standards such as HIPAA, SOC2, GDPR', 'Compliance obligations affecting architecture, data, or delivery', 'Upcoming regulatory changes'] },
    ],
  },
  {
    key: 'client',
    title: 'Client Research',
    description: 'Comprehensive understanding of the client as an organization.',
    sections: [
      { title: 'Company Snapshot', items: ['Founded year, employees, revenue if public', 'HQ, global presence, and regions served', 'Ownership structure'] },
      { title: 'Vision, Mission & Strategy', items: ['Stated company direction', 'Key business goals', 'Leadership statements', 'Product and innovation priorities'] },
      { title: 'Company History / Evolution', items: ['Founding story', 'Major pivots', 'Acquisitions, mergers, or restructuring', 'Major leadership changes'] },
      { title: 'Stakeholder Map', items: ['Name, role, seniority, and influence power', 'Decision authority and communication style', 'Sponsorship potential and relationship strength'] },
      { title: 'Technical Landscape', items: ['Tech stack and architecture components', 'APIs, integrations, and data pipelines', 'Cloud providers, constraints, dependencies, and legacy systems'] },
    ],
  },
  {
    key: 'stakeholders',
    title: 'Stakeholder Details',
    description: 'Decision, operational, and internal ownership map.',
    sections: [
      { title: 'Client-Side Stakeholder Details', items: ['Decision-makers and day-to-day contacts', 'Recent org changes', 'Influence map and informal influencers', 'Communication preferences'] },
      { title: 'Tkxel-Side Stakeholder Mapping', items: ['Assigned AM, Delivery Lead, PM, and Technical Leads', 'Executive sponsor', 'Internal sync cadence', 'Ownership by sales, finance, and delivery'] },
    ],
  },
  {
    key: 'engagement',
    title: 'Tkxel Engagement with Client',
    description: 'How Tkxel is engaged, obligated, and performing.',
    sections: [
      { title: 'Project Charters', items: ['Objectives and scope', 'Milestone roadmap and success metrics', 'Key contacts, dependencies, and assumptions'] },
      { title: 'Engagement Models', items: ['Staff augmentation', 'Dedicated product teams', 'Fixed-price delivery', 'Managed services', 'Support and maintenance'] },
      { title: 'Contractual Obligations & SLAs', items: ['Contract terms and delivery commitments', 'Support levels and escalation procedures', 'Renewal windows', 'Penalties or legal considerations'] },
      { title: 'Past Engagement Summary', items: ['Delivered outcomes', 'Issues, blockers, and escalations', 'Learnings and best practices', 'Client sentiment over time'] },
    ],
  },
  {
    key: 'financial',
    title: 'Financial Landscape',
    description: 'Structured financial view for forecasting and risk assessment.',
    sections: [
      { title: 'Renewal Cycle', items: ['Contract end dates', 'Renewal dependencies', 'Renewal risks', 'Pricing sensitivity'] },
      { title: 'Payment Behaviour', items: ['On-time payments', 'Delays', 'Disputes', 'Credit risk signals'] },
      { title: 'Gross Margins', items: ['Margin by project', 'Blended account margin', 'Month-over-month trends', 'Risks to margin stability'] },
      { title: 'Billing Models', items: ['Hourly or T&M', 'Monthly pods', 'Milestone-based', 'Managed services'] },
    ],
  },
]

export function KYCAgentOverview({ compact = false, onReview }: { compact?: boolean; onReview: () => void }) {
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState('Today, 09:10')
  const [openStep, setOpenStep] = useState(kycAgentSteps[0].key)
  const totalSections = useMemo(() => kycAgentSteps.reduce((sum, step) => sum + step.sections.length, 0), [])

  function refreshData() {
    setRefreshing(true)
    window.setTimeout(() => {
      setRefreshing(false)
      setLastRefresh('Just now')
      toast.success('AI KYC data refreshed')
    }, 850)
  }

  return (
    <section className="tk-card overflow-hidden">
      <div className="border-b border-surface-border bg-surface-secondary p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">AI KYC agent</p>
            <h3 className="mt-1 text-base font-semibold text-ink">KYC intelligence overview</h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-secondary">
              The agent refreshes five KYC workstreams, prepares source-backed findings, and keeps the output in review before it affects the account record.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="tk-button-secondary bg-white" onClick={refreshData} disabled={refreshing}>
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              Refresh AI data
            </button>
            <button type="button" className="tk-button-primary" onClick={onReview}>
              <SearchCheck className="h-4 w-4" />
              Review data
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-0 divide-y divide-surface-border md:grid-cols-3 md:divide-x md:divide-y-0">
        <KYCMetric label="Agent steps" value={kycAgentSteps.length} />
        <KYCMetric label="Research blocks" value={totalSections} />
        <KYCMetric label="Last refresh" value={lastRefresh} />
      </div>

      <div className={cn('grid gap-3 p-5', compact ? 'xl:grid-cols-1' : 'xl:grid-cols-5')}>
        {kycAgentSteps.map((step, index) => {
          const expanded = openStep === step.key
          return (
            <article key={step.key} className="rounded-lg border border-surface-border bg-white">
              <button
                type="button"
                className="flex min-h-[76px] w-full items-start justify-between gap-3 p-4 text-left transition-colors hover:bg-surface-secondary"
                onClick={() => setOpenStep(expanded ? '' : step.key)}
                aria-expanded={expanded}
              >
                <div className="min-w-0">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-blue-tint-20 text-xs font-bold text-brand-blue">{index + 1}</span>
                  <h4 className="mt-3 text-sm font-semibold text-ink">{step.title}</h4>
                  <p className="mt-1 text-xs leading-5 text-ink-secondary">{step.description}</p>
                </div>
                <ChevronDown className={cn('mt-1 h-4 w-4 shrink-0 text-ink-secondary transition-transform', expanded && 'rotate-180')} />
              </button>
              {expanded ? (
                <div className="border-t border-surface-border p-4">
                  <div className="grid gap-3">
                    {step.sections.map(section => (
                      <div key={section.title}>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-rag-green" />
                          <p className="text-xs font-semibold uppercase tracking-wider text-ink">{section.title}</p>
                        </div>
                        <ul className="mt-2 space-y-1">
                          {section.items.map(item => (
                            <li key={item} className="text-xs leading-5 text-ink-secondary">{item}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </article>
          )
        })}
      </div>
    </section>
  )
}

function KYCMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-3 p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-tint-20 text-brand-blue">
        <FileSearch className="h-5 w-5" />
      </span>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">{label}</p>
        <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
      </div>
    </div>
  )
}
