export interface OnboardingTask {
  id: string;
  title: string;
  helper: string;
  checked: boolean;
}

export interface OnboardingSubSection {
  id: string;
  title: string;
  tasks: OnboardingTask[];
}

export interface OnboardingStep {
  id: number;
  title: string;
  subtitle?: string;
  required: boolean;
  skipped: boolean;
  completed: boolean;
  sectionLabel?: string; // e.g. "A", "B", "C", "D", "E"
  infoBanner?: string;
  advisoryBanner?: string;
  subSections: OnboardingSubSection[];
}

export interface AccountFormData {
  accountName: string;
  industry: string;
  segment: "Growth" | "Retention" | "";
  accountStatus: "New Client" | "Existing Client" | "";
  tcv: string;
  arr: string;
  portfolioRevenue: string;
  contractStart: string;
  contractEnd: string;
  engagementModel: string;
  engagementScope: string;
  primaryServiceLines: string[];
  deliveryLocation: string;
  primaryContactName: string;
  primaryContactRole: string;
  primaryContactEmail: string;
  stepNotes: Record<number, string>;
}

export const INDUSTRIES = [
  "FinTech", "Healthcare", "SaaS", "Logistics", "E-Commerce",
  "Retail", "Manufacturing", "Education", "Government", "Other",
];

export const ENGAGEMENT_MODELS = [
  "Managed Services", "Time & Material (T&M)", "Fixed Price", "Retainer", "Hybrid",
];

export const SERVICE_LINES = [
  "Software Engineering", "QA & Testing", "DevOps & Cloud", "Data & Analytics",
  "AI/ML", "UX/Design", "IT Consulting", "Managed Support",
];

export const DELIVERY_LOCATIONS = ["Onshore", "Offshore", "Nearshore", "Hybrid"];

export const TOTAL_STEPS = 7;

interface StepDefinition {
  id: number;
  title: string;
  subtitle?: string;
  required: boolean;
  sectionLabel?: string;
  infoBanner?: string;
  advisoryBanner?: string;
  subSections: Array<{
    title: string;
    tasks: Array<{ title: string; helper: string }>;
  }>;
}

export const STEP_DEFINITIONS: StepDefinition[] = [
  { id: 1, title: "Account Details", required: true, subSections: [] },
  {
    id: 2, title: "A: Market Research", required: true,
    sectionLabel: "A",
    subtitle: "A strategic view of the client's operating environment.",
    infoBanner: "Market research is required to activate this account.",
    subSections: [
      {
        title: "A1. Industry Overview",
        tasks: [
          { title: "Document industry category, sub-segment, and maturity stage", helper: "Classify the client's industry and where it sits in its growth lifecycle." },
          { title: "Research market size and growth rate", helper: "Find current market size data and projected CAGR for this industry." },
          { title: "Identify industry disruptions or inflection points", helper: "Note any technology shifts, regulatory changes, or events reshaping this industry." },
          { title: "Map key value chains and major players", helper: "Identify the main participants in the client's industry ecosystem." },
        ],
      },
      {
        title: "A2. Market Landscape & Trends",
        tasks: [
          { title: "Document typical buying cycles in this industry", helper: "Understand how and when clients in this sector typically procure services." },
          { title: "Research adoption patterns for engineering, product, or data services", helper: "How mature is the use of outsourced tech services in this sector?" },
          { title: "Identify tech trends impacting spend", helper: "Note AI, cloud, automation, or other trends driving budget allocation." },
          { title: "Document macro trends influencing demand", helper: "Economic, geopolitical, or social factors affecting this client's market." },
        ],
      },
      {
        title: "A3. Competitor Analysis",
        tasks: [
          { title: "Identify direct competitors (industry peers)", helper: "List the main companies competing with this client in their market." },
          { title: "Complete product or feature comparison (if applicable)", helper: "How does the client's product/service compare to competitors?" },
          { title: "Document competitor partnerships or technology choices", helper: "Note which vendors or platforms competitors are using." },
          { title: "Assess client's competitive positioning", helper: "Where does the client stand — leader, challenger, niche player?" },
          { title: "Define how Tkxel can differentiate within this context", helper: "Articulate the Tkxel advantage specific to this client's competitive landscape." },
        ],
      },
      {
        title: "A4. Regulatory & Compliance Factors",
        tasks: [
          { title: "Identify applicable industry standards (HIPAA, SOC2, GDPR, etc.)", helper: "List all compliance frameworks relevant to this client's industry and geography." },
          { title: "Document compliance obligations affecting architecture, data, or delivery", helper: "Note how regulatory requirements will shape how Tkxel designs and delivers." },
          { title: "Flag upcoming regulatory changes", helper: "Are any new laws or standards on the horizon that could affect this engagement?" },
        ],
      },
    ],
  },
  {
    id: 3, title: "B: Client Research", required: true,
    sectionLabel: "B",
    subtitle: "A comprehensive understanding of the client as an organisation.",
    infoBanner: "Client research is required to activate this account.",
    subSections: [
      {
        title: "B1. Company Snapshot",
        tasks: [
          { title: "Document year founded, company size (employees and revenue if public)", helper: "Establish the basic facts about the client's scale and maturity." },
          { title: "Record HQ location, global presence, and regions served", helper: "Understand the client's geographic footprint and where they operate." },
          { title: "Confirm ownership structure (public, private, venture-backed)", helper: "Note funding status, investors, or listed exchange if applicable." },
        ],
      },
      {
        title: "B2. Vision, Mission & Strategy",
        tasks: [
          { title: "Document stated company direction and key business goals", helper: "Research the client's publicly stated strategy and priorities." },
          { title: "Capture public statements from leadership", helper: "Note CEO/leadership quotes, blog posts, or earnings call highlights." },
          { title: "Document product and innovation priorities", helper: "What is the client investing in building or launching?" },
        ],
      },
      {
        title: "B3. Company History & Evolution",
        tasks: [
          { title: "Document founding story and major pivots", helper: "Understand how the company has evolved and what shaped its current form." },
          { title: "Record acquisitions, mergers, or restructuring events", helper: "Flag any M&A activity that may affect stakeholders or delivery context." },
          { title: "Note major leadership changes", helper: "Recent C-level or senior leadership changes that could affect the engagement." },
        ],
      },
      {
        title: "B4. Stakeholder Map",
        tasks: [
          { title: "Map each stakeholder: name, role, and seniority level", helper: "Build a complete list of client-side contacts involved in the engagement." },
          { title: "Assess influence power for each stakeholder (High / Medium / Low)", helper: "Classify how much weight each person carries in decisions." },
          { title: "Document decision-making authority per stakeholder", helper: "Identify who can approve, block, or accelerate key decisions." },
          { title: "Record preferred communication style per stakeholder", helper: "Note whether they prefer email, calls, Slack, formal reports, etc." },
          { title: "Identify sponsorship potential for each stakeholder", helper: "Flag stakeholders who could become internal champions for Tkxel." },
          { title: "Rate relationship strength baseline per stakeholder", helper: "Score each relationship: Strong / Neutral / At Risk." },
        ],
      },
      {
        title: "B5. Technical Landscape",
        tasks: [
          { title: "Document tech stack overview", helper: "List the primary languages, frameworks, and platforms the client uses." },
          { title: "Map architecture components", helper: "Understand the client's system architecture at a high level." },
          { title: "Document APIs and integrations", helper: "Identify key integration points Tkxel's work will need to interact with." },
          { title: "Map data pipelines and cloud providers", helper: "Note how data flows and which cloud infrastructure is in use." },
          { title: "Identify dependencies, constraints, and legacy systems", helper: "Flag any technical debt or legacy systems that could impact delivery." },
        ],
      },
    ],
  },
  {
    id: 4, title: "C: Stakeholder Details", required: true,
    sectionLabel: "C",
    subtitle: "Map all client-side and Tkxel-side stakeholders for this engagement.",
    infoBanner: "Stakeholder details are required to activate this account.",
    subSections: [
      {
        title: "C1. Client-Side Stakeholder Details",
        tasks: [
          { title: "Document key decision-makers (name, role, influence level)", helper: "List all client-side people with authority over budget or strategic direction." },
          { title: "Identify operational contacts (primary day-to-day POCs)", helper: "Who does Tkxel interact with on a regular working basis?" },
          { title: "Document recent org changes (new hires, departures, restructuring)", helper: "Flag any changes in the client org that could affect the engagement dynamic." },
          { title: "Build influence map (who impacts decisions, including informal influencers)", helper: "Go beyond org charts — identify who people actually listen to." },
          { title: "Document communication preferences (email/call cadence, style)", helper: "Note how often and through what channels each client contact prefers to engage." },
        ],
      },
      {
        title: "C2. Tkxel-Side Stakeholder Mapping",
        tasks: [
          { title: "Confirm assigned AM, Delivery Lead, PM, and Technical Leads", helper: "Ensure all internal roles are filled and assigned to this account." },
          { title: "Identify executive sponsor (if applicable)", helper: "Is there a Tkxel executive sponsoring this relationship?" },
          { title: "Define internal communication rhythm (sync cadence)", helper: "Set the schedule for internal team check-ins on this account." },
          { title: "Confirm ownership by function (sales, finance, delivery)", helper: "Ensure each function knows their responsibilities on this account." },
        ],
      },
    ],
  },
  {
    id: 5, title: "D: Tkxel Engagement", required: true,
    sectionLabel: "D",
    subtitle: "Capture all active engagements, delivery models, and contractual obligations.",
    infoBanner: "Engagement details are required to activate this account.",
    subSections: [
      {
        title: "D1. Project Charters",
        tasks: [
          { title: "Document objectives and scope for each active engagement", helper: "What is each project trying to achieve, and what is in/out of scope?" },
          { title: "Build milestone roadmap per engagement", helper: "Map out the key delivery milestones and target dates." },
          { title: "Define success metrics per engagement", helper: "What measurable outcomes define success for each project?" },
          { title: "Document key contacts and dependencies per engagement", helper: "Note who owns each workstream and what it depends on internally or externally." },
        ],
      },
      {
        title: "D2. Engagement Models",
        tasks: [
          { title: "Specify the delivery model for each engagement", helper: "Confirm whether each workstream is staff aug, dedicated team, fixed-price, managed services, or support/maintenance." },
          { title: "Document the rationale for each model choice", helper: "Why was this model selected — client preference, risk, scope certainty?" },
        ],
      },
      {
        title: "D3. Contractual Obligations & SLAs",
        tasks: [
          { title: "Document contract terms and delivery commitments", helper: "Capture the key obligations Tkxel has agreed to in writing." },
          { title: "Record support levels and escalation procedures", helper: "What SLAs apply, and how are escalations handled contractually?" },
          { title: "Note renewal windows and pricing terms", helper: "When does each contract expire, and what are the renewal conditions?" },
          { title: "Flag any penalties or legal considerations", helper: "Are there performance penalties, IP clauses, or legal risks to be aware of?" },
        ],
      },
      {
        title: "D4. Past Engagement Summary",
        tasks: [
          { title: "Document what Tkxel has previously delivered for this client", helper: "Summarise completed projects, outcomes, and deliverables." },
          { title: "Capture issues, blockers, and escalations from past engagements", helper: "What went wrong before, and how was it resolved?" },
          { title: "Document learnings and best practices", helper: "What worked well and should be repeated on this account?" },
          { title: "Assess client sentiment over time", helper: "Has the client's satisfaction been improving, stable, or declining?" },
        ],
      },
    ],
  },
  {
    id: 6, title: "E: Financial Landscape", required: false,
    sectionLabel: "E",
    subtitle: "A structured financial view enabling forecasting and risk assessment.",
    advisoryBanner: "Recommended: Complete the financial landscape to enable accurate forecasting and risk scoring for this account.",
    subSections: [
      {
        title: "E1. Renewal Cycle",
        tasks: [
          { title: "Document contract end dates and renewal dependencies", helper: "Map out when each contract expires and what triggers renewal discussions." },
          { title: "Assess renewal risks and pricing sensitivity", helper: "Are there signals the client may not renew, or may push back on pricing?" },
        ],
      },
      {
        title: "E2. Payment Behaviour",
        tasks: [
          { title: "Document payment history (on-time, delays, disputes)", helper: "Review invoice records to establish the client's payment track record." },
          { title: "Identify any credit risk signals", helper: "Are there signs of financial stress, missed payments, or disputes?" },
        ],
      },
      {
        title: "E3. Gross Margins",
        tasks: [
          { title: "Calculate margin by project and blended across the account", helper: "Understand profitability at both the project and account level." },
          { title: "Document month-over-month margin trends", helper: "Is the account becoming more or less profitable over time?" },
          { title: "Identify risks to margin stability", helper: "What could erode margins — scope creep, resource cost, FX, etc.?" },
        ],
      },
      {
        title: "E4. Billing Models",
        tasks: [
          { title: "Document the billing model per engagement", helper: "Is each workstream billed hourly, as a monthly pod, by milestone, or as a managed service?" },
          { title: "Confirm billing cadence and invoicing contacts", helper: "When are invoices issued, and who approves them on the client side?" },
        ],
      },
    ],
  },
  { id: 7, title: "Review & Confirm", required: true, subSections: [] },
];

export function getInitialFormData(): AccountFormData {
  return {
    accountName: "", industry: "", segment: "", accountStatus: "",
    tcv: "", arr: "", portfolioRevenue: "",
    contractStart: "", contractEnd: "",
    engagementModel: "", engagementScope: "",
    primaryServiceLines: [], deliveryLocation: "",
    primaryContactName: "", primaryContactRole: "", primaryContactEmail: "",
    stepNotes: {},
  };
}

export function getInitialSteps(): OnboardingStep[] {
  return STEP_DEFINITIONS.map(def => ({
    id: def.id,
    title: def.title,
    subtitle: def.subtitle,
    required: def.required,
    skipped: false,
    completed: false,
    sectionLabel: def.sectionLabel,
    infoBanner: def.infoBanner,
    advisoryBanner: def.advisoryBanner,
    subSections: def.subSections.map((ss, si) => ({
      id: `step${def.id}-ss${si}`,
      title: ss.title,
      tasks: ss.tasks.map((t, ti) => ({
        id: `step${def.id}-ss${si}-task${ti}`,
        title: t.title,
        helper: t.helper,
        checked: false,
      })),
    })),
  }));
}

export function getAllTasksForStep(step: OnboardingStep): OnboardingTask[] {
  return step.subSections.flatMap(ss => ss.tasks);
}

export function getCheckedCountForStep(step: OnboardingStep): number {
  return getAllTasksForStep(step).filter(t => t.checked).length;
}

export function getTotalCountForStep(step: OnboardingStep): number {
  return getAllTasksForStep(step).length;
}
