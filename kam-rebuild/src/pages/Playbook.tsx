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
    summary: 'Defines why the AM role exists, how it fits into Tkxel, and what enterprise outcomes it protects.',
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
        bullets: ['Maintain KYC and Account Brief quality', 'Run QBRs, SteerCos, and delivery review rhythm', 'Coordinate escalations, renewals, and opportunity planning'],
      },
      {
        title: '1.3 Core Expectations of a Tkxel Account Manager',
        body: 'Tkxel expects AMs to act with ownership, structured communication, commercial judgment, and disciplined follow-up. Every account should have a current view of health, risks, open actions, and next governance moments.',
      },
      {
        title: '1.4 Why Tkxel Needs a Key Account Manager',
        body: 'Key accounts require more than delivery execution. They need a named owner who can connect business context, delivery performance, client sentiment, and executive alignment into one operating view.',
      },
      {
        title: '1.5 The Evolution of KAM at Tkxel',
        body: 'KAM at Tkxel is evolving from relationship coverage into an enterprise execution layer. The role now blends customer success, portfolio governance, commercial planning, and proactive risk management.',
      },
      {
        title: '1.6 The Organizational Role of KAM (Positioning KAM Within Tkxel)',
        body: 'KAM sits between client stakeholders and Tkxel internal functions. It does not replace delivery, sales, finance, or leadership. It connects them around account outcomes and gives each team the context needed to act.',
      },
      {
        title: '1.7 What Problems KAM Solves for Tkxel',
        body: 'KAM reduces fragmented account ownership, late escalation discovery, unclear stakeholder coverage, weak renewal preparation, and missed expansion timing.',
      },
      {
        title: '1.8 How KAM Enables Enterprise-Level Execution',
        body: 'KAM creates a repeatable cadence for high-value accounts: documented account intelligence, governance rhythm, action tracking, risk escalation, and account-level decision support.',
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
        title: '2.1 What an Operating Model Does',
        body: 'The operating model defines how KAM work moves from insight to action. It clarifies inputs, rituals, owners, artifacts, and review mechanisms so account management becomes consistent across portfolios.',
      },
      {
        title: "2.2 Components of Tkxel's KAM Operating Model",
        body: 'The model combines account identification, KYC, account strategy, governance cadence, health scoring, escalation handling, opportunity planning, and leadership review.',
        bullets: ['Account Brief as the source of truth', 'Governance calendar as the execution rhythm', 'Health score and escalations as risk signals'],
      },
      {
        title: '2.3 Outcome of the Operating Model',
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
        body: 'It covers the AM role, KAM operating model, competencies, lifecycle processes, account identification, KYC, strategy planning, health improvement techniques, and common governance plays.',
      },
    ],
  },
  {
    id: 'jd-competencies',
    number: '4',
    title: 'Job Description (JD) + Competencies of Tkxel Account Managers',
    summary: 'Defines the AM profile, role expectations, account-type traits, and maturity progression.',
    icon: ClipboardList,
    topics: [
      {
        title: '4.1 Job Description: Account Manager (Tkxel)',
        body: 'The Account Manager is responsible for relationship management, retention health, governance rhythm, account planning, commercial coordination, and cross-functional execution for assigned accounts.',
        bullets: ['Maintain account plans and KYC artifacts', 'Drive QBRs and executive alignment', 'Coordinate renewal and expansion readiness'],
      },
      {
        title: '4.2 Traits Required for Different Account Types',
        body: 'AM traits vary by account context. Growth accounts need strategic curiosity and commercial pattern recognition. Retention accounts require calm escalation handling, recovery structure, and high communication discipline.',
      },
      {
        title: 'A. Traits for Growth Accounts (High Potential, High Spend)',
        body: 'Growth AMs should demonstrate executive presence, consultative selling, service mapping, strong discovery habits, and the ability to connect client strategy to Tkxel capabilities.',
      },
      {
        title: 'B. Traits for Retention Accounts (Stabilization, Risk, Recovery)',
        body: 'Retention AMs should show structured urgency, stakeholder empathy, documentation discipline, negotiation awareness, and the ability to rebuild trust through governance.',
      },
      {
        title: '4.3 Capability Maturity Levels for AMs',
        body: 'AM maturity is assessed across four levels: foundational coordination, structured account ownership, strategic portfolio leadership, and enterprise account advisory.',
        bullets: ['Level 1: follows cadence and updates records', 'Level 2: manages account actions proactively', 'Level 3: anticipates risks and expansion timing', 'Level 4: shapes executive account strategy'],
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
        body: 'The lifecycle starts with account identification, moves into KYC and account planning, then continues through governance, health tracking, opportunity development, escalation response, and renewal or expansion review.',
      },
      {
        title: '5.2 Roles & Responsibilities Across the Process',
        body: 'AMs own account orchestration. Delivery owns execution status. Sales supports commercial strategy. Finance supports ARR and pricing decisions. Leadership supports prioritization, escalation, and executive sponsorship.',
      },
      {
        title: '5.3 Process Interlocks (How Teams Work Together)',
        body: 'Interlocks happen through recurring governance, shared account notes, escalation logs, opportunity reviews, and leadership checkpoints. Each interlock should produce a documented decision or action.',
      },
    ],
  },
  {
    id: 'identification',
    number: '6',
    title: 'Key Account Identification Framework',
    summary: 'Shows how Tkxel selects accounts that require KAM discipline and leadership visibility.',
    icon: Target,
    topics: [
      {
        title: '6.1 Why Account Identification Matters',
        body: 'Not every account needs the same operating intensity. Identification helps Tkxel focus KAM capacity on accounts with sticky revenue, strategic potential, delivery complexity, or elevated retention risk.',
      },
      {
        title: "6.2 Core Principles of Tkxel's Account Identification",
        body: 'The framework should be transparent, repeatable, data-informed, and reviewed regularly. Accounts can move into or out of KAM coverage as their value, risk, or strategic importance changes.',
      },
      {
        title: '6.3 Key Account Identification Framework',
        body: 'Tkxel uses a two-step framework: a sticky revenue test followed by a weighted scoring model. Accounts passing either strategic threshold receive KAM operating coverage.',
      },
      {
        title: 'Step 1: Sticky Revenue Test',
        body: 'Dummy criteria: ARR above target, multi-year relationship, renewal complexity, multi-service dependency, and executive stakeholder access. Accounts scoring three or more criteria proceed to deeper review.',
      },
      {
        title: 'Step 2: Weighted Scoring Model',
        body: 'Dummy model: 30 percent revenue potential, 25 percent strategic fit, 20 percent delivery complexity, 15 percent expansion likelihood, 10 percent retention risk.',
      },
    ],
  },
  {
    id: 'kyc',
    number: '7',
    title: 'KYC (Know Your Customer): Account Brief (Part I)',
    summary: 'Captures the customer context AMs need before planning account strategy.',
    icon: FileText,
    topics: [
      {
        title: '7.1 Purpose of the Account Brief (KYC)',
        body: 'The Account Brief creates a structured view of the client, market, stakeholders, engagement history, financial context, and current account risks.',
      },
      {
        title: '7.2 Information Sources & Data Gathering',
        body: 'AMs gather information from CRM notes, delivery updates, governance meetings, client websites, public filings, stakeholder conversations, finance records, and prior proposals.',
      },
      {
        title: '7.3 Data-Gathering Methodology (Optional but Recommended)',
        body: 'Use a three-pass method: collect known internal facts, validate through client-facing conversations, then synthesize into the Account Brief with confidence notes.',
      },
      {
        title: '7.4 Account Brief (Part I): Detailed Section Breakdown',
        body: 'Part I should summarize market context, client business context, stakeholders, Tkxel engagement, and financial landscape. Each section should distinguish facts from assumptions.',
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
        title: '7.5 Requirements for Completing KYC',
        body: 'KYC is complete when required fields are populated, assumptions are flagged, stakeholder coverage is documented, and the AM can explain the account context in a leadership review.',
      },
      {
        title: '7.6 Deliverable: Completed Account Brief (Part I)',
        body: 'The deliverable is a reviewed Account Brief with source notes, confidence ratings, open questions, and next actions for missing intelligence.',
      },
    ],
  },
  {
    id: 'strategy',
    number: '8',
    title: 'Account Strategy & Planning: Account Brief (Part II)',
    summary: 'Turns KYC information into account strategy, health actions, and expansion or retention plans.',
    icon: Layers3,
    topics: [
      {
        title: '8.1 Purpose of Account Strategy & Planning',
        body: 'Planning converts client understanding into a prioritized action path. It defines account objectives, growth or retention plays, stakeholder strategy, governance cadence, and measurable outcomes.',
      },
      {
        title: '8.2 Approach: How Planning Happens After KYC',
        body: 'After KYC, the AM reviews signals with delivery, sales, finance, and leadership. The team agrees on account posture, strategic plays, risk actions, and next governance commitments.',
      },
      {
        title: '8.4 Tkxel-Specific Planning Method (4-Step Internal Framework)',
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
        title: '8.5 Practical Actions & Techniques for Improving Client Health Score',
        body: 'Improvement actions include executive sponsor mapping, cadence correction, delivery recovery plans, value realization workshops, renewal readiness, and stakeholder education.',
      },
    ],
  },
  {
    id: 'common-play',
    number: '9',
    title: 'Playbook A: Common Play',
    summary: 'Provides repeatable plays AMs can use across the portfolio for governance and execution visibility.',
    icon: BookOpen,
    topics: [
      {
        title: '9.1 Monthly SteerCos (Steering Committee Meetings)',
        body: 'Monthly SteerCos align senior stakeholders on progress, risks, decisions, and upcoming priorities. Each SteerCo should produce actions, owners, and decision notes.',
      },
      {
        title: '9.2 Delivery Progress Reviews (Weekly or Bi-Weekly)',
        body: 'Progress reviews keep delivery execution visible to the client and AM. The review should cover current status, blockers, scope changes, and follow-up actions.',
      },
      {
        title: '9.3 Quarterly Business Reviews (QBRs)',
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
