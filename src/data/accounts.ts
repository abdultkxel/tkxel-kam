export type RiskStatus = "green" | "amber" | "red";
export type Segment = "Growth" | "Retention";
export type HealthDimension = "relationship" | "contract" | "resource";

export interface HealthScore {
  overall: number; // 0-3
  relationship: number;
  contract: number;
  resource: number;
}

export interface AccountActivity {
  id: string;
  date: string;
  title: string;
  description: string;
  type: "meeting" | "review" | "escalation" | "update" | "milestone";
}

export interface Account {
  id: string;
  name: string;
  segment: Segment;
  health: HealthScore;
  riskStatus: RiskStatus;
  amId: string;
  amName: string;
  industry: string;
  arr: string;
  lastUpdated: string;
  logo?: string;
  contractStart: string;
  contractEnd: string;
  stakeholders: number;
  activities: AccountActivity[];
}

export const MOCK_ACCOUNTS: Account[] = [
  {
    id: "acc-1",
    name: "Signal",
    segment: "Growth",
    health: { overall: 2.5, relationship: 3, contract: 2, resource: 2.5 },
    riskStatus: "green",
    amId: "u1",
    amName: "Sarah Mitchell",
    industry: "FinTech",
    arr: "$1.2M",
    lastUpdated: "2026-03-08",
    contractStart: "2025-01-15",
    contractEnd: "2027-01-14",
    stakeholders: 8,
    activities: [
      { id: "a1", date: "2026-03-08", title: "QBR Completed", description: "Quarterly business review held with VP Engineering. All KPIs on track.", type: "review" },
      { id: "a2", date: "2026-03-01", title: "New SOW Signed", description: "Expanded engagement for cloud migration phase 2.", type: "milestone" },
      { id: "a3", date: "2026-02-20", title: "Stakeholder Meeting", description: "Introduced new technical lead from our side.", type: "meeting" },
      { id: "a4", date: "2026-02-10", title: "Health Score Updated", description: "Resource health improved from 2.0 to 2.5 after staffing changes.", type: "update" },
    ],
  },
  {
    id: "acc-2",
    name: "Cafe Zupas",
    segment: "Retention",
    health: { overall: 1.5, relationship: 2, contract: 1, resource: 1.5 },
    riskStatus: "amber",
    amId: "u1",
    amName: "Sarah Mitchell",
    industry: "Healthcare",
    arr: "$800K",
    lastUpdated: "2026-03-06",
    contractStart: "2024-06-01",
    contractEnd: "2026-05-31",
    stakeholders: 5,
    activities: [
      { id: "b1", date: "2026-03-06", title: "Escalation Filed", description: "Client raised concerns about delivery timelines on Module B.", type: "escalation" },
      { id: "b2", date: "2026-02-28", title: "Contract Review", description: "Renewal discussion initiated. Client requesting pricing revision.", type: "review" },
      { id: "b3", date: "2026-02-15", title: "Resource Change", description: "Senior developer rotated off project. Replacement onboarding.", type: "update" },
    ],
  },
  {
    id: "acc-3",
    name: "ASAP Semiconductor",
    segment: "Growth",
    health: { overall: 2, relationship: 2.5, contract: 2, resource: 1.5 },
    riskStatus: "green",
    amId: "u1",
    amName: "Sarah Mitchell",
    industry: "E-Commerce",
    arr: "$450K",
    lastUpdated: "2026-03-07",
    contractStart: "2025-09-01",
    contractEnd: "2026-08-31",
    stakeholders: 4,
    activities: [
      { id: "c1", date: "2026-03-07", title: "Sprint Demo", description: "Showcased new checkout flow. Client very satisfied.", type: "meeting" },
      { id: "c2", date: "2026-02-25", title: "Upsell Opportunity", description: "Client interested in mobile app development.", type: "milestone" },
    ],
  },
  {
    id: "acc-4",
    name: "Delta Corp",
    segment: "Growth",
    health: { overall: 2.8, relationship: 3, contract: 3, resource: 2.5 },
    riskStatus: "green",
    amId: "u1",
    amName: "Sarah Mitchell",
    industry: "Logistics",
    arr: "$2.1M",
    lastUpdated: "2026-03-09",
    contractStart: "2024-01-01",
    contractEnd: "2027-12-31",
    stakeholders: 12,
    activities: [
      { id: "d1", date: "2026-03-09", title: "Executive Alignment", description: "CTO-level meeting confirmed continued partnership.", type: "meeting" },
      { id: "d2", date: "2026-03-05", title: "New Phase Kickoff", description: "Phase 3 of warehouse automation project started.", type: "milestone" },
      { id: "d3", date: "2026-02-28", title: "QBR Completed", description: "Strong results presented. NPS score: 9/10.", type: "review" },
    ],
  },
  {
    id: "acc-5",
    name: "Epsilon Tech",
    segment: "Retention",
    health: { overall: 0.8, relationship: 1, contract: 0.5, resource: 1 },
    riskStatus: "red",
    amId: "u1",
    amName: "Sarah Mitchell",
    industry: "SaaS",
    arr: "$350K",
    lastUpdated: "2026-03-10",
    contractStart: "2025-03-01",
    contractEnd: "2026-02-28",
    stakeholders: 3,
    activities: [
      { id: "e1", date: "2026-03-10", title: "Critical Escalation", description: "Client threatening contract termination due to missed deliverables.", type: "escalation" },
      { id: "e2", date: "2026-03-05", title: "Emergency Review", description: "Internal war room to address delivery gaps.", type: "review" },
      { id: "e3", date: "2026-02-25", title: "Resource Crisis", description: "Two key developers resigned. Immediate backfill needed.", type: "update" },
    ],
  },
  {
    id: "acc-6",
    name: "Zeta Partners",
    segment: "Growth",
    health: { overall: 2.2, relationship: 2.5, contract: 2, resource: 2 },
    riskStatus: "green",
    amId: "u4",
    amName: "David Park",
    industry: "Insurance",
    arr: "$1.8M",
    lastUpdated: "2026-03-05",
    contractStart: "2025-04-01",
    contractEnd: "2027-03-31",
    stakeholders: 7,
    activities: [
      { id: "f1", date: "2026-03-05", title: "Monthly Sync", description: "Regular sync with client PM. All green.", type: "meeting" },
    ],
  },
  {
    id: "acc-7",
    name: "Eta Solutions",
    segment: "Retention",
    health: { overall: 1.2, relationship: 1.5, contract: 1, resource: 1 },
    riskStatus: "amber",
    amId: "u4",
    amName: "David Park",
    industry: "Retail",
    arr: "$600K",
    lastUpdated: "2026-03-04",
    contractStart: "2024-11-01",
    contractEnd: "2026-10-31",
    stakeholders: 4,
    activities: [
      { id: "g1", date: "2026-03-04", title: "Scope Change Request", description: "Client requesting additional features without budget increase.", type: "update" },
      { id: "g2", date: "2026-02-20", title: "Delivery Concern", description: "Sprint velocity below target for 3 consecutive sprints.", type: "escalation" },
    ],
  },
  {
    id: "acc-8",
    name: "Theta Inc",
    segment: "Growth",
    health: { overall: 2.3, relationship: 2, contract: 2.5, resource: 2.5 },
    riskStatus: "green",
    amId: "u4",
    amName: "David Park",
    industry: "Manufacturing",
    arr: "$950K",
    lastUpdated: "2026-03-03",
    contractStart: "2025-07-01",
    contractEnd: "2027-06-30",
    stakeholders: 6,
    activities: [
      { id: "h1", date: "2026-03-03", title: "Expansion Discussion", description: "Client interested in IoT integration project.", type: "milestone" },
    ],
  },
];

export function getRagColor(score: number, max: number = 3): RiskStatus {
  const pct = score / max;
  if (pct >= 0.67) return "green";
  if (pct >= 0.33) return "amber";
  return "red";
}

export const RAG_STYLES: Record<RiskStatus, { bg: string; text: string; dot: string }> = {
  green: { bg: "bg-rag-green/10", text: "text-rag-green", dot: "bg-rag-green" },
  amber: { bg: "bg-rag-amber/10", text: "text-rag-amber", dot: "bg-rag-amber" },
  red: { bg: "bg-rag-red/10", text: "text-rag-red", dot: "bg-rag-red" },
};
