import { BookOpen, CheckCircle2, ClipboardList, FileText, Layers3, Target, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { cn } from '@/utils/cn'

interface PlaybookTopic {
  title: string
  body: string
  bullets?: string[]
}

interface PlaybookSection {
  id: string
  number: string
  title: string
  summary: string
  icon: typeof BookOpen
  topics: PlaybookTopic[]
}

const sections: PlaybookSection[] = [
  {
    id: 'overview',
    number: '1',
    title: 'Overview: Account Manager at Tkxel',
    summary: 'Defines the AM role, core responsibilities, organizational positioning, and the problems KAM solves for Tkxel.',
    icon: UsersRound,
    topics: [
      {
        title: '1.1 Role of a Key Account Manager at Tkxel',
        body: 'The Tkxel Account Manager owns the commercial and relationship health of strategic accounts. The role connects client priorities with Tkxel delivery, leadership, finance, and growth teams so accounts progress with clarity.',
        bullets: ['Own executive relationships and account cadence', 'Translate client objectives into internal operating priorities', 'Protect retention while identifying responsible expansion'],
      },
      {
        title: '1.2 Core Responsibilities',
        body: 'AM responsibilities span account governance, risk visibility, expansion planning, stakeholder mapping, and internal follow-through. The AM is accountable for making the account visible and actionable across Tkxel.',
        bullets: ['Maintain KYC quality', 'Run QBRs, SteerCos, and delivery review rhythm', 'Coordinate escalations, renewals, and opportunity planning'],
      },
      {
        title: '1.3 The Organizational Role of KAM (Positioning KAM Within Tkxel)',
        body: 'KAM sits between client stakeholders and Tkxel internal functions. It does not replace delivery, sales, finance, or leadership. It connects them around account outcomes and gives each team the context needed to act.',
      },
      {
        title: '1.4 What Problems KAM Solves for Tkxel',
        body: 'KAM reduces fragmented account ownership, late escalation discovery, unclear stakeholder coverage, weak renewal preparation, and missed expansion timing.',
      },
    ],
  },
  {
    id: 'operating-model',
    number: '2',
    title: 'KAM Operating Model Overview',
    summary: 'Explains the working model AMs use to convert account intelligence into repeatable execution.',
    icon: Layers3,
    topics: [
      {
        title: "2.1 Components of Tkxel's KAM Operating Model",
        body: 'The model combines KYC, account strategy, governance cadence, health scoring, escalation handling, opportunity planning, and leadership review.',
        bullets: ['KYC workspace as the source of truth', 'Governance calendar as the execution rhythm', 'Health score and escalations as risk signals'],
      },
      {
        title: '2.2 Outcome of the Operating Model',
        body: 'The expected outcome is a managed portfolio where leadership can see account quality, AMs can prioritize work, delivery can act on context, and clients experience a more coordinated Tkxel partnership.',
      },
    ],
  },
  {
    id: 'objective',
    number: '3',
    title: 'Objective of This Playbook',
    summary: 'Sets the purpose and boundaries of the KAM playbook for AMs, leadership, and partner teams.',
    icon: Target,
    topics: [
      {
        title: '3.1 Purpose of the Playbook',
        body: 'This playbook gives Tkxel AMs a shared way to identify key accounts, document account intelligence, run governance, assess health, and manage growth or retention plays.',
      },
      {
        title: '3.2 What This Playbook Covers',
        body: 'It covers the AM role, KAM operating model, competencies, lifecycle processes, KYC, strategy planning, health improvement techniques, and common governance plays.',
      },
    ],
  },
  {
    id: 'jd-competencies',
    number: '4',
    title: 'Job Description (JD) + Competencies of Tkxel Account Managers',
    summary: 'Defines the AM profile and role expectations for assigned Tkxel accounts.',
    icon: ClipboardList,
    topics: [
      {
        title: '4.1 Job Description: Account Manager (Tkxel)',
        body: 'The Account Manager is responsible for relationship management, retention health, governance rhythm, account planning, commercial coordination, and cross-functional execution for assigned accounts.',
        bullets: ['Maintain account plans and KYC artifacts', 'Drive QBRs and executive alignment', 'Coordinate renewal and expansion readiness'],
      },
    ],
  },
  {
    id: 'processes',
    number: '5',
    title: 'Processes (High-Level Definition)',
    summary: 'Documents the end-to-end KAM lifecycle and the interlocks required for execution.',
    icon: CheckCircle2,
    topics: [
      {
        title: '5.1 The End-to-End KAM Lifecycle',
        body: 'The lifecycle starts with portfolio prioritization, moves into KYC and account planning, then continues through governance, health tracking, opportunity development, escalation response, and renewal or expansion review.',
      },
      {
        title: '5.2 Roles & Responsibilities Across the Process',
        body: 'AMs own account orchestration. Delivery owns execution status. Sales supports commercial strategy. Finance supports ARR and pricing decisions. Leadership supports prioritization, escalation, and executive sponsorship.',
      },
    ],
  },
  {
    id: 'kyc',
    number: '6',
    title: 'KYC (Know Your Customer)',
    summary: 'Captures the customer context AMs need before planning account strategy.',
    icon: FileText,
    topics: [
      {
        title: '6.1 Purpose of KYC',
        body: 'KYC creates a structured view of the client, market, stakeholders, engagement history, financial context, and current account risks.',
      },
      {
        title: '6.2 Information Sources & Data Gathering',
        body: 'AMs gather information from CRM notes, delivery updates, governance meetings, client websites, public filings, stakeholder conversations, finance records, and prior proposals.',
      },
      {
        title: '6.3 Data-Gathering Methodology (Optional but Recommended)',
        body: 'Use a three-pass method: collect known internal facts, validate through client-facing conversations, then synthesize KYC findings with confidence notes.',
      },
      {
        title: '6.4 Detailed Section Breakdown',
        body: 'KYC should summarize market context, client business context, stakeholders, Tkxel engagement, and financial landscape. Each section should distinguish facts from assumptions.',
      },
      {
        title: 'A. Market Research',
        body: 'Dummy data includes industry trends, competitor pressure, regulatory factors, technology investment signals, and market events that could affect the account.',
      },
      {
        title: 'B. Client Research',
        body: 'Dummy data includes company priorities, business units served by Tkxel, known transformation programs, digital maturity, and budget climate.',
      },
      {
        title: 'C. Stakeholder Details',
        body: 'Dummy data includes executive sponsor, procurement owner, delivery counterpart, technical champion, renewal influencer, and relationship strength rating.',
      },
      {
        title: 'D. Tkxel Engagement with Client',
        body: 'Dummy data includes current services, delivery teams, active projects, governance cadence, open commitments, and historical wins or friction points.',
      },
      {
        title: 'E. Financial Landscape',
        body: 'Dummy data includes ARR, renewal date, contract model, open invoices, pricing sensitivity, expansion appetite, and commercial risks.',
      },
      {
        title: '6.5 Requirements for Completing KYC',
        body: 'KYC is complete when required fields are populated, assumptions are flagged, stakeholder coverage is documented, and the AM can explain the account context in a leadership review.',
      },
      {
        title: '6.6 Deliverable: Completed KYC',
        body: 'The deliverable is reviewed KYC data with source notes, confidence ratings, open questions, and next actions for missing intelligence.',
      },
    ],
  },
  {
    id: 'strategy',
    number: '7',
    title: 'Account Strategy & Planning',
    summary: 'Turns KYC information into account strategy, health actions, and expansion or retention plans.',
    icon: Layers3,
    topics: [
      {
        title: '7.1 Purpose of Account Strategy & Planning',
        body: 'Planning converts client understanding into a prioritized action path. It defines account objectives, growth or retention plays, stakeholder strategy, governance cadence, and measurable outcomes.',
      },
      {
        title: '7.2 Approach: How Planning Happens After KYC',
        body: 'After KYC, the AM reviews signals with delivery, sales, finance, and leadership. The team agrees on account posture, strategic plays, risk actions, and next governance commitments.',
      },
      {
        title: '7.3 Tkxel-Specific Planning Method (4-Step Internal Framework)',
        body: 'Tkxel planning uses four internal steps: align on client goals, segment the account, map services, and assess health. Each step produces one or more account actions.',
      },
      {
        title: 'Step 1: Vision/Mission & Goals Alignment',
        body: 'Capture what the client is trying to achieve, how success is measured, and where Tkxel work contributes to that business outcome.',
      },
      {
        title: 'Step 2: Segmentation Strategy',
        body: 'Classify the account as growth, retention, recovery, adoption, or executive priority. The segment determines cadence, leadership involvement, and play selection.',
      },
      {
        title: 'Step 3: Service Mapping & Applicability Assessment',
        body: 'Map Tkxel services against client needs, current usage, adjacent demand, budget fit, and stakeholder readiness. Flag services as active, relevant, future, or not applicable.',
      },
      {
        title: 'Step 4: Client Health Assessment',
        body: 'Assess relationship, delivery, usage, commercial, and strategic health. Scores should be evidence-based and linked to account actions.',
      },
      {
        title: '7.4 Practical Actions & Techniques for Improving Client Health Score',
        body: 'Improvement actions include executive sponsor mapping, cadence correction, delivery recovery plans, value realization workshops, renewal readiness, and stakeholder education.',
      },
    ],
  },
  {
    id: 'common-play',
    number: '8',
    title: 'Governance Activities / Account play',
    summary: 'Provides repeatable plays AMs can use across the portfolio for governance and execution visibility.',
    icon: BookOpen,
    topics: [
      {
        title: '8.1 Monthly SteerCos (Steering Committee Meetings)',
        body: 'Monthly SteerCos align senior stakeholders on progress, risks, decisions, and upcoming priorities. Each SteerCo should produce actions, owners, and decision notes.',
      },
      {
        title: '8.2 Delivery Progress Reviews (Weekly or Bi-Weekly)',
        body: 'Progress reviews keep delivery execution visible to the client and AM. The review should cover current status, blockers, scope changes, and follow-up actions.',
      },
      {
        title: '8.3 Quarterly Business Reviews (QBRs)',
        body: 'QBRs connect Tkxel delivery to business outcomes. A strong QBR covers value delivered, health score movement, open risks, strategic roadmap, and next-quarter priorities.',
      },
    ],
  },
]

const playbookStats = [
  { label: 'Sections', value: sections.length },
  { label: 'Topics', value: sections.reduce((sum, section) => sum + section.topics.length, 0) },
  { label: 'Audience', value: 'AM + leadership' },
  { label: 'Status', value: 'Draft dummy data' },
]

export function Playbook() {
  const [activeSection, setActiveSection] = useState(sections[0]?.id ?? '')

  function scrollToSection(id: string) {
    const target = document.getElementById(id)
    if (!target) return
    setActiveSection(id)
    const topOffset = target.getBoundingClientRect().top + window.scrollY - 88
    window.scrollTo({
      top: Math.max(topOffset, 0),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    })
  }

  return (
    <div>
      <PageHeader
        eyebrow="Customer success playbook"
        title="TKXEL KEY ACCOUNT MANAGEMENT (KAM) PLAYBOOK"
        description="A structured operating manual for account managers, leadership, and partner teams running the Tkxel KAM motion."
      />

      <section className="tk-card mb-4 p-4">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {playbookStats.map(stat => (
            <div key={stat.label} className="rounded-lg bg-surface-secondary px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-secondary">{stat.label}</p>
              <p className="mt-1 text-sm font-semibold text-ink">{stat.value}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="tk-card h-fit p-3 xl:sticky xl:top-20">
          <div className="mb-3 flex items-center gap-2 px-2">
            <BookOpen className="h-4 w-4 text-brand-blue" />
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Contents</p>
          </div>
          <nav className="grid gap-1">
            {sections.map(section => (
              <button
                key={section.id}
                type="button"
                onClick={() => scrollToSection(section.id)}
                aria-current={activeSection === section.id ? 'location' : undefined}
                className={cn(
                  'flex min-h-[44px] w-full items-center gap-3 rounded-md px-3 text-left text-sm font-semibold transition-colors',
                  activeSection === section.id ? 'bg-blue-tint-20 text-brand-blue' : 'text-ink-secondary hover:bg-surface-tertiary hover:text-ink',
                )}
              >
                <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold', activeSection === section.id ? 'bg-white text-brand-blue' : 'bg-blue-tint-20 text-brand-blue')}>{section.number}</span>
                <span>{section.title}</span>
              </button>
            ))}
          </nav>
        </aside>

        <div className="grid gap-4">
          {sections.map(section => {
            const Icon = section.icon

            return (
              <section key={section.id} id={section.id} className="tk-card scroll-mt-24 overflow-hidden">
                <header className="border-b border-surface-border bg-surface-secondary p-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Section {section.number}</p>
                      <h2 className="mt-1 text-xl font-semibold text-ink">{section.title}</h2>
                      <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-secondary">{section.summary}</p>
                    </div>
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white text-brand-blue">
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>
                </header>
                <div className="divide-y divide-surface-border">
                  {section.topics.map(topic => (
                    <article key={topic.title} className="grid gap-3 p-5 lg:grid-cols-[minmax(220px,0.35fr)_minmax(0,1fr)]">
                      <h3 className="text-sm font-semibold leading-6 text-ink">{topic.title}</h3>
                      <div className="max-w-3xl">
                        <p className="text-sm leading-6 text-ink-secondary">{topic.body}</p>
                        {topic.bullets ? (
                          <ul className="mt-3 grid gap-2">
                            {topic.bullets.map(bullet => (
                              <li key={bullet} className="flex gap-2 text-sm leading-6 text-ink">
                                <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-rag-green" />
                                <span>{bullet}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
