export interface OnboardingTask {
  id: string;
  title: string;
  helper: string;
  checked: boolean;
}

export interface OnboardingStep {
  id: number;
  title: string;
  subtitle?: string;
  required: boolean;
  skipped: boolean;
  completed: boolean;
  tasks: OnboardingTask[];
}

export interface AccountFormData {
  // Step 1
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
  // Step 3 KYC fields
  clientBusinessSummary: string;
  clientSuccessCriteria: string;
  keyBusinessChallenges: string;
  kycDocReference: string;
  // Notes per step
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

export const STEP_DEFINITIONS: Array<{
  id: number;
  title: string;
  subtitle?: string;
  required: boolean;
  tasks: Array<{ title: string; helper: string }>;
}> = [
  {
    id: 1, title: "Account Details", required: true, tasks: [],
  },
  {
    id: 2, title: "Account Setup & Access", required: false,
    subtitle: "Confirm internal setup and tool access before beginning engagement.",
    tasks: [
      { title: "Confirm account assignment by manager", helper: "Ensure the account has been formally assigned to you in the system." },
      { title: "Verify stakeholders (client + internal team)", helper: "Confirm who the client contacts are and which internal team is supporting." },
      { title: "Set up communication channels", helper: "Establish email threads, Slack/Teams channels, and shared workspaces." },
      { title: "Ensure access to tools (JIRA, CRM, repos, dashboards)", helper: "Request and verify access to all required platforms before kickoff." },
    ],
  },
  {
    id: 3, title: "Initial KYC", required: true,
    subtitle: "Document the client's business context, goals, and engagement scope. This section is required to activate the account.",
    tasks: [
      { title: "Complete company background research", helper: "Review the client's website, recent news, annual reports, and market presence." },
      { title: "Identify business model, offerings, and market positioning", helper: "Understand what the client sells, who their customers are, and how they compete." },
      { title: "Map key stakeholders (decision makers, influencers, users)", helper: "Identify who approves budgets, who influences decisions, and who uses the service." },
      { title: "Capture client goals, expectations, and success criteria", helper: "Document what success looks like for this client over the next 6–12 months." },
      { title: "Document engagement scope and services in use", helper: "List all active services Tkxel is delivering and the agreed scope of work." },
    ],
  },
  {
    id: 4, title: "Stakeholder Mapping", required: false,
    subtitle: "Build a clear picture of the client's internal structure and key contacts.",
    tasks: [
      { title: "Identify primary, secondary, and escalation contacts", helper: "Define the go-to contacts at each level of the client organisation." },
      { title: "Map roles, responsibilities, and influence levels", helper: "Classify each stakeholder by their role (decision maker, champion, blocker, etc.)." },
      { title: "Document communication preferences and cadence", helper: "Note preferred channels, time zones, and how often each stakeholder wants updates." },
      { title: "Establish relationship strength baseline", helper: "Rate the current relationship strength (Strong / Neutral / At Risk) for each contact." },
    ],
  },
  {
    id: 5, title: "Service & Delivery Mapping", required: false,
    subtitle: "Map all active services and the teams responsible for delivery.",
    tasks: [
      { title: "List all active services being delivered", helper: "Create a complete inventory of every service or workstream currently running." },
      { title: "Map teams/resources against each service", helper: "Identify which Tkxel team members own each service area." },
      { title: "Identify dependencies across teams or systems", helper: "Document any cross-team handoffs, shared infrastructure, or integration points." },
      { title: "Validate delivery model and workflows", helper: "Confirm how delivery is structured (Agile sprints, retainers, project-based, etc.)." },
    ],
  },
  {
    id: 6, title: "Account Health Baseline", required: false,
    subtitle: "Capture initial health indicators to establish a starting benchmark.",
    tasks: [
      { title: "Capture delivery performance baseline", helper: "Document current SLA adherence, sprint velocity, or milestone completion rate." },
      { title: "Capture financial health baseline", helper: "Note invoice status, payment history, and any outstanding financial concerns." },
      { title: "Capture CSAT baseline (if available)", helper: "Record any existing satisfaction scores or qualitative client sentiment." },
      { title: "Capture resource health baseline", helper: "Assess team capacity, morale, and any resourcing gaps." },
      { title: "Calculate initial account health score", helper: "Enter scores for Relationship, Contract, and Resource health (1–3 scale)." },
      { title: "Identify early risks or gaps", helper: "Flag any concerns surfaced during baseline capture for immediate attention." },
    ],
  },
  {
    id: 7, title: "Risk Assessment", required: false,
    subtitle: "Identify and document risks before they become issues.",
    tasks: [
      { title: "Identify competitors or alternative vendors", helper: "Note any competing vendors the client is evaluating or currently using." },
      { title: "Identify leadership or organisational changes", helper: "Flag any recent or upcoming changes in client-side leadership or structure." },
      { title: "Identify payment or billing risks", helper: "Review contract terms and note any payment delays, disputes, or concerns." },
      { title: "Identify geopolitical or external risks", helper: "Consider macro-level risks that could affect the client's business or engagement." },
      { title: "Document mitigation considerations", helper: "For each risk identified, note the proposed mitigation or monitoring plan." },
    ],
  },
  {
    id: 8, title: "Growth Opportunity Mapping", required: false,
    subtitle: "Identify expansion potential within the account.",
    tasks: [
      { title: "Identify unused service areas (white space)", helper: "Map services Tkxel offers that the client is not yet using." },
      { title: "Map upsell / cross-sell opportunities", helper: "Document specific opportunities with estimated value and likelihood." },
      { title: "Align opportunities with client business goals", helper: "Tie each opportunity back to a stated client goal or pain point." },
      { title: "Categorise account as Growth or Retention focus", helper: "Confirm the strategic priority for this account based on opportunity and risk." },
    ],
  },
  {
    id: 9, title: "Resource Health Assessment", required: false,
    subtitle: "Evaluate the Tkxel team working on this account.",
    tasks: [
      { title: "Identify key resources on the project", helper: "List the team members whose departure would significantly impact the account." },
      { title: "Evaluate tenure, alignment, and risk exposure", helper: "Assess how long each key resource has been on the account and their engagement level." },
      { title: "Flag single points of failure", helper: "Identify any tasks or knowledge that only one person holds." },
      { title: "Assign backup or redundancy plan if needed", helper: "Document who would cover each critical role if a key resource became unavailable." },
    ],
  },
  {
    id: 10, title: "Planning Frameworks", required: false,
    subtitle: "Ensure all required strategic plans are in place.",
    tasks: [
      { title: "Complete account strategy plan", helper: "Define the 12-month strategic direction for the account." },
      { title: "Complete growth plan", helper: "Document targeted upsell/cross-sell initiatives and timelines." },
      { title: "Complete engagement plan", helper: "Outline the cadence, touchpoints, and relationship-building activities." },
      { title: "Complete risk mitigation plan", helper: "Document identified risks and corresponding mitigation strategies." },
      { title: "Align internal team on execution approach", helper: "Run an internal alignment session to ensure all team members understand the plan." },
    ],
  },
  {
    id: 11, title: "Governance Setup", required: false,
    subtitle: "Establish the meeting and reporting structure for this account.",
    tasks: [
      { title: "Define weekly / bi-weekly check-in cadence", helper: "Schedule recurring internal and client-facing check-ins." },
      { title: "Define monthly review cadence", helper: "Set up a monthly business review structure with agenda template." },
      { title: "Define QBR cadence", helper: "Schedule QBRs for the year and confirm client-side attendees." },
      { title: "Set reporting structure and templates", helper: "Agree on the format, frequency, and distribution list for reports." },
      { title: "Define escalation paths", helper: "Document who gets contacted (and how) at each level of escalation." },
    ],
  },
  {
    id: 12, title: "CSAT & Feedback Loop", required: false,
    subtitle: "Put a structured feedback process in place from day one.",
    tasks: [
      { title: "Schedule CSAT collection cadence", helper: "Define when and how often satisfaction surveys or calls will be conducted." },
      { title: "Identify survey respondents", helper: "Confirm which client contacts will participate in CSAT surveys." },
      { title: "Define feedback channels", helper: "Document whether feedback is collected via calls, surveys, QBRs, or all three." },
      { title: "Establish improvement loop process", helper: "Define how feedback will be reviewed, actioned, and communicated back to the client." },
    ],
  },
  {
    id: 13, title: "Documentation & Handover", required: false,
    subtitle: "Finalise and share all onboarding documentation.",
    tasks: [
      { title: "Consolidate KYC document", helper: "Compile all knowledge capture outputs into a single reference document." },
      { title: "Finalise account profile in system", helper: "Ensure the account record is complete and up to date in the KAM platform." },
      { title: "Share onboarding summary with stakeholders", helper: "Distribute the onboarding summary to internal team and relevant client contacts." },
      { title: "Ensure all frameworks are completed and saved", helper: "Do a final check that all planning and governance frameworks have been documented." },
      { title: "Transition to steady-state account management", helper: "Formally close out onboarding and confirm the account is in active management mode." },
    ],
  },
  {
    id: 14, title: "Review & Confirm", required: true, tasks: [],
  },
];

export function getInitialFormData(): AccountFormData {
  return {
    accountName: "", industry: "", segment: "", accountStatus: "",
    tcv: "", arr: "", portfolioRevenue: "",
    contractStart: "", contractEnd: "",
    engagementModel: "", engagementScope: "",
    primaryServiceLines: [], deliveryLocation: "",
    primaryContactName: "", primaryContactRole: "", primaryContactEmail: "",
    clientBusinessSummary: "", clientSuccessCriteria: "",
    keyBusinessChallenges: "", kycDocReference: "",
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
    tasks: def.tasks.map((t, i) => ({
      id: `step${def.id}-task${i}`,
      title: t.title,
      helper: t.helper,
      checked: false,
    })),
  }));
}
