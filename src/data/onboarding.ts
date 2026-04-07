export const TOTAL_STEPS = 7;
export const DRAFT_KEY = "kam-onboarding-draft";

export const INDUSTRIES = [
  "FinTech", "Healthcare", "SaaS", "Logistics", "E-Commerce",
  "Retail", "Manufacturing", "Education", "Government", "Other",
];

export const ENGAGEMENT_MODELS = [
  "Managed Services", "Time & Material (T&M)", "Fixed Price", "Retainer", "Hybrid",
];

export const REVENUE_RANGES = [
  "<$1M", "$1M–$10M", "$10M–$50M", "$50M–$100M", "$100M–$500M", "$500M+", "Prefer not to say",
];

export const SENIORITY_LEVELS = ["C-Level", "VP", "Director", "Manager", "Individual Contributor"] as const;
export const CONTACT_TYPES = ["Sponsor", "Champion", "Influencer", "Blocker", "Neutral"] as const;

// Step 2 - Strategy service lines
export const STRATEGY_SERVICE_LINES = [
  "Assessment & Strategy", "Business Analysis", "UX Design", "Solution Architecture",
  "Development", "DevOps Service", "Functional Testing", "Performance Testing",
  "Security Testing", "Test Automation", "SRE Services", "L1/L2/L3 Support",
  "Data Engineering", "Data Analysis", "Data Science", "GenAI Services",
  "Mobile Development", "Web Development", "Cloud Migration", "Cloud Optimisation",
  "Staff Augmentation", "AI Transformation", "Digital Transformation",
  "Application Modernisation", "Cyber Security Services", "Business Intelligence",
];

export type ServiceMappingStatus = "Active" | "Potential" | "Not Applicable";

// Step 3 - Health scoring service lines
export const HEALTH_SERVICE_LINES = [
  "Assessment & Strategy", "Business Analysis", "UX Design",
  "Solution Architecture & Design", "Development", "DevOps Service",
  "Functional Testing Service", "Performance Testing Service",
  "Security Testing Service", "Test Automation", "SRE Services",
  "L1 Support", "L2 Support", "L3 Support",
  "Salesforce Tech Support", "MS Dynamics Tech Support", "PeopleSoft Tech Support",
  "Hubspot Tech Support", "Monday.com Tech Support", "Jira Tech Support",
  "Data Engineering Services", "Data Analysis Services", "Data Science Services",
  "GenAI Services", "Architecture & Design Audit", "Security Audit",
  "Infrastructure Audit", "Code Audit", "Wordpress Tech Support",
  "Moodle Tech Support", "Discovery Workshop Service", "Mobile Development",
  "Web Development", "Digital Transformation", "AI Transformation",
  "Application Modernization", "Call Center Service", "NOC", "SOC",
  "Cyber Security Services", "GRC Services", "Cloud Optimization",
  "Cloud Migration Service", "Technology Upgradation",
  "Business Intelligence Service", "Staff Augmentation",
  "Handover Process (HOP)", "Automation Testing", "Mulesoft",
];

// ─── KYC (Step 1) ───
export interface KycContact {
  id: string;
  name: string;
  title: string;
  seniority: string;
  ownerAtTkxel: string;
  type: string;
}

export interface KycFormData {
  accountName: string;
  segment: "Growth" | "Retention" | "";
  engagementModel: string;
  companyName: string;
  industry: string;
  hqLocation: string;
  website: string;
  linkedin: string;
  foundedYear: string;
  revenueRange: string;
  employeeCount: string;
  contacts: KycContact[];
  startDate: string;
  contractValue: string;
  servicesEngaged: string;
  keyMilestones: string;
  strategicNotes: string;
  riskFlags: string;
}

// ─── Strategy (Step 2) ───
export interface PlanItem {
  id: string;
  owner: string;
  dueDate: string;
  status: "Not Started" | "In Progress" | "Complete";
}

export interface StrategyFormData {
  vision: string;
  mission: string;
  serviceMapping: Record<string, ServiceMappingStatus>;
  planItems: PlanItem[];
}

// ─── Health (Step 3) ───
export interface HealthFormData {
  relationship: Record<string, number>;
  contract: Record<string, number>;
  resource: Record<string, number>;
  csat: Record<string, number>;
  risk: Record<string, number>;
  serviceLineChecklist: string[];
}

export const RELATIONSHIP_CRITERIA = [
  { id: "ceo", name: "CEO Engagement", weight: 20 },
  { id: "kam", name: "KAM Engagement", weight: 30 },
  { id: "delivery", name: "Delivery Leadership", weight: 25 },
  { id: "finance", name: "Finance Connection", weight: 5 },
  { id: "inperson", name: "In-Person Meeting", weight: 20 },
];

export const CONTRACT_CRITERIA = [
  { id: "length", name: "Contract Length", weight: 33 },
  { id: "notice", name: "Notice Period", weight: 33 },
  { id: "renewal", name: "Renewal Terms", weight: 33 },
];

export const RESOURCE_CRITERIA = [
  { id: "keyres", name: "Number of Key Resources", weight: 50 },
  { id: "alignment", name: "Key Resource Alignment", weight: 25 },
  { id: "backup", name: "Backup", weight: 25 },
];

export const CSAT_CRITERIA = [
  { id: "delivery_ex", name: "Delivery Excellence", weight: 30 },
  { id: "communication", name: "Communication", weight: 20 },
  { id: "proactiveness", name: "Proactiveness", weight: 15 },
  { id: "trust", name: "Trust", weight: 20 },
  { id: "value", name: "Value for Money", weight: 15 },
];

export const RISK_CRITERIA = [
  { id: "competitors", name: "Competitors", weight: 30 },
  { id: "leadership_tenure", name: "Current Leadership Tenure", weight: 15 },
  { id: "funding_revenue", name: "Funding & Revenue Changes", weight: 15 },
  { id: "payment_behavior", name: "Payment Behavior", weight: 15 },
  { id: "roadmap_alignment", name: "Roadmap Alignment", weight: 20 },
  { id: "geopolitical", name: "Geopolitical Situation", weight: 5 },
];

// ─── Governance (Step 4) ───
export interface GovMeeting {
  id: string;
  date: string;
  status: "Planned" | "Completed" | "Cancelled";
  notes: string;
}

export interface GovEscalation {
  id: string;
  title: string;
  severity: "Low" | "Medium" | "High";
  status: "Open" | "In Progress" | "Resolved";
  date: string;
}

export interface GovernanceFormData {
  qbrs: GovMeeting[];
  steercos: GovMeeting[];
  escalations: GovEscalation[];
}

// ─── Financials (Step 5) ───
export interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  period: string;
  amount: string;
  dueDate: string;
  status: "Paid" | "Pending" | "Overdue";
}

export interface SowRow {
  id: string;
  reference: string;
  description: string;
  startDate: string;
  value: string;
  status: "Active" | "Completed" | "Cancelled";
}

export interface FinancialsFormData {
  revenue: string;
  tcv: string;
  contractStart: string;
  contractEnd: string;
  contractStatus: "Active" | "Pending" | "Expired" | "Renewed" | "";
  noticePeriodDays: string;
  rateEscalation: string;
  invoices: InvoiceRow[];
  sows: SowRow[];
}

// ─── Opportunities (Step 6) ───
export interface OppRow {
  id: string;
  name: string;
  type: string;
  serviceLine: string;
  estimatedValue: string;
  confidence: "Low" | "Medium" | "High";
  stage: string;
  targetClose: string;
}

export interface OpportunitiesFormData {
  opportunities: OppRow[];
}

// ─── Full wizard state ───
export interface WizardData {
  kyc: KycFormData;
  strategy: StrategyFormData;
  health: HealthFormData;
  governance: GovernanceFormData;
  financials: FinancialsFormData;
  opportunities: OpportunitiesFormData;
  stepStatuses: Record<number, "incomplete" | "complete" | "skipped">;
}

export function getInitialWizardData(): WizardData {
  const serviceMapping: Record<string, ServiceMappingStatus> = {};
  STRATEGY_SERVICE_LINES.forEach(s => { serviceMapping[s] = "Not Applicable"; });

  return {
    kyc: {
      accountName: "", segment: "", engagementModel: "",
      companyName: "", industry: "", hqLocation: "", website: "", linkedin: "",
      foundedYear: "", revenueRange: "", employeeCount: "",
      contacts: [{ id: crypto.randomUUID(), name: "", title: "", seniority: "", ownerAtTkxel: "", type: "" }],
      startDate: "", contractValue: "", servicesEngaged: "", keyMilestones: "",
      strategicNotes: "", riskFlags: "",
    },
    strategy: { vision: "", mission: "", serviceMapping, planItems: [] },
    health: { relationship: {}, contract: {}, resource: {}, csat: {}, risk: {}, serviceLineChecklist: [] },
    governance: { qbrs: [], steercos: [], escalations: [] },
    financials: {
      revenue: "", tcv: "", contractStart: "", contractEnd: "",
      contractStatus: "", noticePeriodDays: "", rateEscalation: "",
      invoices: [], sows: [],
    },
    opportunities: { opportunities: [] },
    stepStatuses: { 1: "incomplete", 2: "incomplete", 3: "incomplete", 4: "incomplete", 5: "incomplete", 6: "incomplete", 7: "incomplete" },
  };
}

export function calcWeightedScore(
  criteria: { id: string; weight: number }[],
  selections: Record<string, number>,
  maxVal: number = 3
): number {
  let totalWeight = 0;
  let weightedSum = 0;
  for (const c of criteria) {
    const val = selections[c.id];
    if (val !== undefined && val > 0) {
      weightedSum += val * (c.weight / 100);
      totalWeight += c.weight / 100;
    }
  }
  return totalWeight > 0 ? +(weightedSum / totalWeight).toFixed(2) : 0;
}

export interface StepDef {
  id: number;
  title: string;
  required: boolean;
  tabName: string;
}

export const STEP_DEFS: StepDef[] = [
  { id: 1, title: "KYC: Know Your Customer", required: true, tabName: "KYC" },
  { id: 2, title: "Strategy & Plan", required: false, tabName: "Strategy & Plan" },
  { id: 3, title: "Health Scores", required: false, tabName: "Health Scores" },
  { id: 4, title: "Governance", required: false, tabName: "Governance" },
  { id: 5, title: "Financials", required: false, tabName: "Financials" },
  { id: 6, title: "Opportunities", required: false, tabName: "Opportunities" },
  { id: 7, title: "Review & Confirm", required: true, tabName: "" },
];

// Auto-generated tasks when steps are skipped
export interface AutoTask {
  title: string;
  tab: string;
  priority: "High" | "Medium";
  dueDaysFromCreation: number;
  recurring?: boolean;
  recurringInterval?: "monthly" | null;
}

export const SKIPPED_STEP_TASKS: Record<number, AutoTask[]> = {
  2: [
    { title: "Complete Account Vision & Mission Statement", tab: "Strategy & Plan", priority: "High", dueDaysFromCreation: 14 },
    { title: "Complete Service Mapping", tab: "Strategy & Plan", priority: "High", dueDaysFromCreation: 14 },
    { title: "Complete Account Plan Builder", tab: "Strategy & Plan", priority: "Medium", dueDaysFromCreation: 30 },
  ],
  3: [
    { title: "Complete initial Health Score assessment", tab: "Health Scores", priority: "High", dueDaysFromCreation: 21 },
    { title: "Complete CSAT baseline score", tab: "Health Scores", priority: "Medium", dueDaysFromCreation: 30 },
  ],
  4: [
    { title: "Set up Governance cadence (QBRs, SteerCos, check-ins)", tab: "Governance", priority: "High", dueDaysFromCreation: 21 },
  ],
  5: [
    { title: "Complete Financial details (invoices, SOW, billing)", tab: "Financials", priority: "High", dueDaysFromCreation: 7 },
  ],
  6: [
    { title: "Identify upsell/cross-sell opportunities", tab: "Opportunities", priority: "Medium", dueDaysFromCreation: 30 },
  ],
};
