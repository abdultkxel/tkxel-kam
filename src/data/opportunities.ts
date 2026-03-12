import { MOCK_ACCOUNTS, getRagColor, type RiskStatus } from "./accounts";
import { MOCK_STRATEGY_DATA } from "./strategy";

export type OpportunityType = "Upsell" | "Cross-sell" | "Renewal Expansion" | "New Service";
export type OpportunityStage = "Identified" | "Qualified" | "Proposal Sent" | "Negotiation" | "Won" | "Lost";
export type Confidence = "Low" | "Medium" | "High";

export const CONFIDENCE_PCT: Record<Confidence, number> = { Low: 0.25, Medium: 0.5, High: 0.8 };

export const SERVICE_CATEGORIES = [
  "Software Engineering", "Cloud & DevOps", "Data & AI", "Quality Assurance",
  "Design & UX", "Staff Augmentation", "Consulting & Advisory",
] as const;

export const STAGE_ORDER: OpportunityStage[] = ["Identified", "Qualified", "Proposal Sent", "Negotiation", "Won", "Lost"];

export const STAGE_COLORS: Record<OpportunityStage, string> = {
  Identified: "bg-muted text-muted-foreground",
  Qualified: "bg-info/15 text-info",
  "Proposal Sent": "bg-rag-amber/15 text-rag-amber",
  Negotiation: "bg-warning/15 text-warning",
  Won: "bg-rag-green/15 text-rag-green",
  Lost: "bg-rag-red/15 text-rag-red",
};

export interface Opportunity {
  id: string;
  name: string;
  accountId: string;
  type: OpportunityType;
  serviceCategory: string;
  serviceLine: string;
  estimatedValue: number;
  confidence: Confidence;
  stage: OpportunityStage;
  targetClose: string;
  owner: string;
  notes: string;
  createdAt: string;
}

export const INITIAL_OPPORTUNITIES: Opportunity[] = [
  {
    id: "opp-1", name: "GenAI Analytics Pilot", accountId: "acc-1",
    type: "Upsell", serviceCategory: "Data & AI", serviceLine: "Predictive Analytics",
    estimatedValue: 150000, confidence: "High", stage: "Qualified",
    targetClose: "2026-06-30", owner: "Sarah Mitchell", notes: "CTO expressed strong interest during QBR.", createdAt: "2026-01-15",
  },
  {
    id: "opp-2", name: "Mobile App Development", accountId: "acc-1",
    type: "Cross-sell", serviceCategory: "Software Engineering", serviceLine: "Mobile App Development",
    estimatedValue: 80000, confidence: "Medium", stage: "Identified",
    targetClose: "2026-09-30", owner: "Sarah Mitchell", notes: "Companion app for existing platform.", createdAt: "2026-02-01",
  },
  {
    id: "opp-3", name: "DevOps Automation", accountId: "acc-2",
    type: "Cross-sell", serviceCategory: "Cloud & DevOps", serviceLine: "CI/CD Pipeline Setup",
    estimatedValue: 60000, confidence: "Medium", stage: "Proposal Sent",
    targetClose: "2026-04-30", owner: "Sarah Mitchell", notes: "Proposal sent to VP Engineering.", createdAt: "2026-01-20",
  },
  {
    id: "opp-4", name: "AI Transformation Workshop", accountId: "acc-4",
    type: "New Service", serviceCategory: "Data & AI", serviceLine: "AI Strategy Consulting",
    estimatedValue: 120000, confidence: "High", stage: "Negotiation",
    targetClose: "2026-03-31", owner: "Sarah Mitchell", notes: "Final terms under review.", createdAt: "2025-12-10",
  },
  {
    id: "opp-5", name: "Security Testing Expansion", accountId: "acc-3",
    type: "Upsell", serviceCategory: "Quality Assurance", serviceLine: "Security Testing",
    estimatedValue: 45000, confidence: "Low", stage: "Identified",
    targetClose: "2026-07-31", owner: "Sarah Mitchell", notes: "Initial discussion only.", createdAt: "2026-02-28",
  },
  // Won/Lost for history
  {
    id: "opp-6", name: "Cloud Migration Phase 2", accountId: "acc-1",
    type: "Upsell", serviceCategory: "Cloud & DevOps", serviceLine: "Cloud Migration",
    estimatedValue: 200000, confidence: "High", stage: "Won",
    targetClose: "2026-01-15", owner: "Sarah Mitchell", notes: "Signed and kicked off.", createdAt: "2025-09-01",
  },
  {
    id: "opp-7", name: "Chatbot Integration", accountId: "acc-2",
    type: "Cross-sell", serviceCategory: "Data & AI", serviceLine: "NLP & Chatbots",
    estimatedValue: 35000, confidence: "Medium", stage: "Lost",
    targetClose: "2025-12-31", owner: "Sarah Mitchell", notes: "Client chose in-house solution.", createdAt: "2025-08-15",
  },
];

export function getWeightedValue(opp: Opportunity): number {
  return Math.round(opp.estimatedValue * CONFIDENCE_PCT[opp.confidence]);
}

export function isOpenStage(stage: OpportunityStage): boolean {
  return !["Won", "Lost"].includes(stage);
}

export function getAccountOpportunities(accountId: string, opps: Opportunity[]): Opportunity[] {
  return opps.filter(o => o.accountId === accountId);
}

export function getWhitespaceSuggestions(accountId: string) {
  const stratData = MOCK_STRATEGY_DATA[accountId];
  if (!stratData) return [];
  return stratData.services.filter(s => s.status === "Opportunity");
}

export function getAccountHealthRag(accountId: string): RiskStatus {
  const acc = MOCK_ACCOUNTS.find(a => a.id === accountId);
  return acc ? getRagColor(acc.health.overall) : "green";
}

export function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value}`;
}
