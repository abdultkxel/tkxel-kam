export interface PlaybookSection {
  id: string;
  title: string;
  icon: string;
  lastUpdated: string;
  children?: PlaybookSection[];
  content: string;
  templates?: { name: string; type: "PDF" | "Word" | "Excel"; url: string }[];
  actionLinks?: { label: string; url: string }[];
}

export const PLAYBOOK_SECTIONS: PlaybookSection[] = [
  {
    id: "kam-fundamentals",
    title: "KAM Fundamentals",
    icon: "BookOpen",
    lastUpdated: "2026-02-28",
    content: `## What is Key Account Management?

Key Account Management (KAM) is a strategic approach to managing relationships with our most important clients. It goes beyond traditional account management by focusing on **long-term partnerships**, mutual value creation, and deep understanding of client needs.

### Core Principles

1. **Strategic Alignment** — Align Tkxel's capabilities with the client's business objectives
2. **Proactive Engagement** — Anticipate needs before they become requests
3. **Value-First Mindset** — Every interaction should deliver measurable value
4. **Cross-functional Orchestration** — Coordinate across delivery, sales, and leadership

### The KAM Lifecycle

| Phase | Duration | Key Activities |
|-------|----------|----------------|
| Onboarding | 0–90 days | KYC, stakeholder mapping, service baseline |
| Stabilization | 3–6 months | Health scoring, governance cadence, quick wins |
| Growth | 6–18 months | Upsell/cross-sell, strategic planning, executive alignment |
| Maturity | 18+ months | Innovation partnerships, co-creation, long-term roadmap |

### Role of the Account Manager

The Account Manager is the **single point of accountability** for client satisfaction, revenue retention, and growth. They are responsible for:

- Maintaining up-to-date KYC records
- Conducting regular health assessments
- Driving governance activities (QBRs, SteerCos)
- Identifying and pursuing growth opportunities
- Managing escalations proactively`,
    templates: [
      { name: "KAM Onboarding Checklist", type: "PDF", url: "#" },
      { name: "Account Manager Handbook", type: "Word", url: "#" },
    ],
    children: [
      {
        id: "kam-roles",
        title: "Roles & Responsibilities",
        icon: "Users",
        lastUpdated: "2026-02-15",
        content: `## Roles & Responsibilities

### Account Manager (AM)
- Primary client relationship owner
- Drives KYC completion, health scoring, and governance
- Reports to KAM Leadership on account health

### KAM Leadership
- Portfolio-level oversight across all accounts
- Reviews health trends, risk escalations, and growth pipeline
- Approves strategic account plans and resource allocations

### Delivery Lead
- Owns technical execution and quality
- Participates in QBRs and SteerCos
- Provides input on resource health scoring

### Admin
- Manages platform configuration (scoring weights, playbook content)
- User access management
- Reporting and analytics`,
        templates: [],
        actionLinks: [],
      },
    ],
  },
  {
    id: "account-planning",
    title: "Account Planning",
    icon: "Target",
    lastUpdated: "2026-03-05",
    content: `## Account Planning Guide

A well-crafted account plan is the foundation of strategic client management. Every key account should have a living plan that is reviewed quarterly.

### Plan Components

1. **Client Overview** — Industry, size, key contacts, and organizational structure
2. **Strategic Objectives** — What does the client want to achieve in the next 12–24 months?
3. **Service Mapping** — Current services vs. potential services
4. **Growth Roadmap** — Identified opportunities with timelines and revenue projections
5. **Risk Register** — Known risks and mitigation strategies

### Best Practices

- Update the plan **at least quarterly** after each QBR
- Share relevant sections with the client for alignment
- Use data from health scoring to prioritize focus areas
- Link plan objectives to measurable outcomes

### SMART Goals Framework

| Element | Description | Example |
|---------|-------------|---------|
| Specific | Clear and well-defined | "Expand into mobile development" |
| Measurable | Quantifiable outcome | "Add $200K ARR by Q3" |
| Achievable | Realistic given resources | "Team has mobile expertise" |
| Relevant | Aligned with client needs | "Client launching mobile app" |
| Time-bound | Clear deadline | "SOW signed by June 2026" |`,
    templates: [
      { name: "Account Plan Template", type: "Word", url: "#" },
      { name: "Growth Opportunity Tracker", type: "Excel", url: "#" },
    ],
    actionLinks: [
      { label: "Start Account Plan", url: "/accounts" },
    ],
  },
  {
    id: "governance-guide",
    title: "Governance",
    icon: "Shield",
    lastUpdated: "2026-03-01",
    content: `## Governance Framework

Governance provides the structure for strategic alignment, performance review, and issue resolution with key accounts.

### Meeting Cadences

| Meeting Type | Frequency | Attendees | Purpose |
|-------------|-----------|-----------|---------|
| Weekly Sync | Weekly | AM, Delivery Lead, Client PM | Operational updates |
| Monthly Review | Monthly | AM, KAM Lead, Client Director | Performance review |
| QBR | Quarterly | Full team + Client Leadership | Strategic alignment |
| SteerCo | Bi-annually | Executives on both sides | Partnership direction |

### QBR Best Practices

1. **Prepare 2 weeks in advance** — Gather metrics, prepare deck, align internally
2. **Lead with value** — Start with achievements and delivered outcomes
3. **Be transparent about challenges** — Address issues before the client raises them
4. **Close with next steps** — Every QBR should produce 3–5 action items with owners
5. **Follow up within 48 hours** — Send MoM and action tracker

### Escalation Protocol

- **Level 1 (Low)**: AM resolves within 48 hours
- **Level 2 (Medium)**: KAM Leadership involvement, 1-week resolution target
- **Level 3 (High)**: Executive escalation, war room activation, daily updates`,
    templates: [
      { name: "QBR Deck Template", type: "PDF", url: "#" },
      { name: "SteerCo Agenda Template", type: "Word", url: "#" },
      { name: "Escalation Log Template", type: "Excel", url: "#" },
    ],
    actionLinks: [
      { label: "View Governance Tab", url: "/governance" },
    ],
  },
  {
    id: "health-scoring",
    title: "Health Scoring",
    icon: "HeartPulse",
    lastUpdated: "2026-03-08",
    content: `## Health Scoring Methodology

The Health Scoring Engine evaluates accounts across 7 dimensions to provide a comprehensive view of account health.

### Scoring Dimensions

| Dimension | Scale | Key Criteria |
|-----------|-------|-------------|
| Relationship | 0–3 | CEO engagement, KAM engagement, delivery leadership |
| Contract | 0–3 | Length, notice period, renewal terms |
| Resource | 0–3 | Key resources, alignment, backup plans |
| CSAT | 1–5 | Delivery, communication, trust, value |
| Risk | 0–3 | Competitors, leadership tenure, payment behavior |
| Service Line | % | Coverage across 49 competencies |
| Overall | 0–3 | Weighted average across all dimensions |

### RAG Interpretation (0–3 scale)

- 🟢 **Green** (≥ 2.0): Healthy — maintain current approach
- 🟡 **Amber** (1.5–1.99): Needs attention — create improvement plan
- 🔴 **Red** (< 1.5): At risk — escalate and intervene immediately

### Scoring Cadence

- **Monthly**: Relationship and CSAT assessments
- **Quarterly**: Full scoring review across all dimensions
- **Ad-hoc**: Triggered by significant events (escalations, leadership changes)

### Admin Controls

Administrators can adjust scoring weights per dimension to reflect organizational priorities. Changes are logged and auditable.`,
    templates: [
      { name: "Health Score Review Template", type: "PDF", url: "#" },
    ],
    actionLinks: [
      { label: "View Health Scores", url: "/health-scores" },
    ],
  },
  {
    id: "escalation-handling",
    title: "Escalation Handling",
    icon: "AlertTriangle",
    lastUpdated: "2026-02-20",
    content: `## Escalation Handling Procedures

Effective escalation management protects client relationships and demonstrates organizational maturity.

### Escalation Severity Matrix

| Severity | Impact | Response Time | Resolution Target | Escalation Path |
|----------|--------|---------------|-------------------|-----------------|
| Low | Minor inconvenience | 24 hours | 1 week | AM handles directly |
| Medium | Service degradation | 4 hours | 3 business days | KAM Leadership + Delivery Head |
| High | Critical impact | 1 hour | 24 hours | Executive team, war room |

### Escalation Lifecycle

1. **Identification** — Recognize the issue and assess severity
2. **Documentation** — Log in the system with full context
3. **Communication** — Notify relevant stakeholders immediately
4. **Action Plan** — Define steps, owners, and timeline
5. **Execution** — Implement fixes with regular updates
6. **Resolution** — Confirm with client and document learnings
7. **Post-mortem** — Conduct RCA and update playbook

### Communication Templates

**Initial Notification:**
> "We've identified [issue] affecting [scope]. Severity: [level]. We have [action] in progress and expect [timeline]. Next update: [time]."

**Resolution Notification:**
> "[Issue] has been resolved as of [time]. Root cause: [brief]. Preventive measures: [actions]. Full RCA to follow within [timeline]."`,
    templates: [
      { name: "Escalation Report Template", type: "Word", url: "#" },
      { name: "RCA Template", type: "PDF", url: "#" },
    ],
  },
  {
    id: "growth-strategies",
    title: "Growth Strategies",
    icon: "TrendingUp",
    lastUpdated: "2026-03-03",
    content: `## Growth Strategy Playbook

Growth within existing accounts is the most efficient path to revenue expansion. This section covers proven strategies for account growth.

### Growth Levers

1. **Service Line Expansion** — Introduce new competencies to existing accounts
2. **Team Scaling** — Grow the team size within current engagements
3. **New Business Units** — Expand to other departments within the client organization
4. **Innovation Projects** — Propose POCs and innovation sprints
5. **Managed Services** — Convert project work to ongoing managed services

### Identifying Opportunities

| Signal | Opportunity Type | Action |
|--------|-----------------|--------|
| Client mentions new initiative | Service expansion | Schedule discovery call |
| Positive health scores | Team scaling | Propose additional resources |
| Budget cycle approaching | New projects | Submit proposals early |
| Technology shift | Modernization | Offer assessment workshop |
| Competitor departure | Land grab | Accelerate engagement |

### Qualification Framework (BANT)

- **Budget**: Does the client have allocated budget?
- **Authority**: Are we talking to the decision-maker?
- **Need**: Is there a genuine business need?
- **Timeline**: Is there urgency or a defined timeline?

### Revenue Targets

Each account should have a defined growth target:
- **Growth accounts**: 20–30% ARR increase annually
- **Retention accounts**: Maintain ARR + 5–10% organic growth`,
    templates: [
      { name: "Growth Opportunity Canvas", type: "PDF", url: "#" },
      { name: "Proposal Template", type: "Word", url: "#" },
    ],
    actionLinks: [
      { label: "View Accounts", url: "/accounts" },
    ],
  },
];

// Flatten for search
export function flattenSections(sections: PlaybookSection[]): PlaybookSection[] {
  const result: PlaybookSection[] = [];
  for (const s of sections) {
    result.push(s);
    if (s.children) result.push(...flattenSections(s.children));
  }
  return result;
}

export function searchPlaybook(query: string): PlaybookSection[] {
  const q = query.toLowerCase();
  return flattenSections(PLAYBOOK_SECTIONS).filter(
    s => s.title.toLowerCase().includes(q) || s.content.toLowerCase().includes(q)
  );
}
