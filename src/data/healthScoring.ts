export type RagLevel = "green" | "amber" | "red";

export interface ScoringOption {
  value: number;
  label: string;
}

export interface ScoringCriterion {
  id: string;
  name: string;
  weight: number;
  options: ScoringOption[];
  tooltip: string;
}

export interface ScoringFramework {
  id: string;
  name: string;
  scale: string;
  criteria: ScoringCriterion[];
  interpret: (score: number) => { label: string; color: RagLevel };
}

export interface CsatCriterion {
  id: string;
  name: string;
  weight: number;
  tooltip: string;
}

export interface HealthSubmission {
  id: string;
  date: string;
  submittedBy: string;
  relationship: { selections: Record<string, number>; score: number };
  contract: { selections: Record<string, number>; score: number };
  resource: { selections: Record<string, number>; score: number };
  csat: { selections: Record<string, number>; score: number };
  overall: number;
}

// ─── Interpretation helpers ───

export function interpretRag03(score: number): { label: string; color: RagLevel } {
  if (score >= 2) return { label: "Green", color: "green" };
  if (score > 1.5) return { label: "Yellow", color: "amber" };
  return { label: "Red", color: "red" };
}

export function interpretCsat(score: number): { label: string; color: RagLevel } {
  if (score >= 4.5) return { label: "Excellent", color: "green" };
  if (score >= 4.0) return { label: "Good", color: "green" };
  if (score >= 3.0) return { label: "Stable", color: "amber" };
  if (score >= 2.0) return { label: "Poor", color: "red" };
  return { label: "Critical", color: "red" };
}

// ─── Risk Score interpretation ───

export function interpretRisk03(score: number): { label: string; color: RagLevel } {
  if (score >= 2) return { label: "Low Risk", color: "green" };
  if (score >= 1.6) return { label: "Medium Risk", color: "amber" };
  return { label: "High Risk", color: "red" };
}

// ─── Default weight configs ───

export const DEFAULT_RISK_CRITERIA: ScoringCriterion[] = [
  { id: "competitors", name: "Competitors", weight: 30, options: [{ value: 3, label: "No competitors on this account" }, { value: 0, label: "1 or more competitors on this account" }], tooltip: "Whether Tkxel faces competition on this account." },
  { id: "leadership_tenure", name: "Current Leadership Tenure", weight: 15, options: [{ value: 3, label: "Aligned for 1+ year" }, { value: 0, label: "Aligned for less than 6 months" }], tooltip: "How long client leadership is expected to remain stable." },
  { id: "funding_revenue", name: "Funding & Revenue Changes", weight: 15, options: [{ value: 3, label: "Stable revenue for 1+ years" }, { value: 0, label: "Unaware of revenue information" }], tooltip: "Stability of client's revenue stream and funding." },
  { id: "payment_behavior", name: "Payment Behavior", weight: 15, options: [{ value: 3, label: "Invoices paid regularly" }, { value: 2, label: "Irregular payment schedule" }, { value: 0, label: "Invoices pending 2+ months" }], tooltip: "Timeliness and regularity of client payments." },
  { id: "roadmap_alignment", name: "Roadmap Alignment", weight: 20, options: [{ value: 3, label: "Aligned for 1+ years" }, { value: 2, label: "Aligned for 6+ months" }, { value: 0, label: "Vaguely or not aligned" }], tooltip: "How well Tkxel's plans align with the client's technology roadmap." },
  { id: "geopolitical", name: "Geopolitical Situation", weight: 5, options: [{ value: 3, label: "Stable geo-political situation" }, { value: 0, label: "Unstable geo-political situation" }], tooltip: "Stability of the client's geopolitical environment." },
];

export const SERVICE_LINE_COMPETENCIES: string[] = [
  "Assessment & Strategy", "Business Analysis", "UX Design", "Solution Architecture & Design",
  "Development", "DevOps Service", "Functional Testing Service", "Performance Testing Service",
  "Security Testing Service", "Test Automation", "SRE Services", "L1 Support", "L2 Support",
  "L3 Support", "Salesforce Tech Support", "MS Dynamics Tech Support", "PeopleSoft Tech Support",
  "Hubspot Tech Support", "Monday.com Tech Support", "Jira Tech Support",
  "Data Engineering Services", "Data Analysis Services", "Data Science Services", "GenAI Services",
  "Architecture & Design Audit", "Security Audit", "Infrastructure Audit", "Code Audit",
  "Wordpress Tech Support", "Moodle Tech Support", "Discovery Workshop Service",
  "Mobile Development", "Web Development", "Digital Transformation", "AI Transformation",
  "Application Modernization", "Call Center Service", "NOC", "SOC", "Cyber Security Services",
  "GRC Services", "Cloud Optimization", "Cloud Migration Service", "Technology Upgradation",
  "Business Intelligence Service", "Staff Augmentation", "Handover Process (HOP)",
  "Automation Testing", "Mulesoft",
];

export const DEFAULT_RELATIONSHIP_CRITERIA: ScoringCriterion[] = [
  { id: "ceo", name: "CEO Engagement", weight: 20, options: [{ value: 3, label: "Regular 1:1 access" }, { value: 2, label: "Occasional contact" }, { value: 0, label: "No engagement" }], tooltip: "Measures direct access to client CEO/MD. Regular means monthly+, occasional means quarterly." },
  { id: "kam", name: "KAM Engagement", weight: 30, options: [{ value: 3, label: "Strong strategic partner" }, { value: 2, label: "Good operational relationship" }, { value: 0, label: "Transactional only" }], tooltip: "Quality of Key Account Manager's relationship with client stakeholders." },
  { id: "delivery", name: "Delivery Leadership", weight: 25, options: [{ value: 3, label: "Trusted advisor" }, { value: 2, label: "Respected partner" }, { value: 0, label: "Vendor only" }], tooltip: "Client's perception of Tkxel delivery leads — trusted advisor vs. vendor." },
  { id: "finance", name: "Finance Connection", weight: 5, options: [{ value: 3, label: "Direct finance contact" }, { value: 0, label: "No finance contact" }], tooltip: "Whether Tkxel has a direct relationship with client finance/procurement." },
  { id: "inperson", name: "In-Person Meeting", weight: 20, options: [{ value: 3, label: "Recent in-person meeting" }, { value: 0, label: "No recent in-person" }], tooltip: "Whether an in-person meeting has occurred in the last quarter." },
];

export const DEFAULT_CONTRACT_CRITERIA: ScoringCriterion[] = [
  { id: "length", name: "Contract Length", weight: 33, options: [{ value: 3, label: ">24 months remaining" }, { value: 2, label: "12–24 months" }, { value: 1, label: "<12 months" }], tooltip: "Time remaining on the current contract term." },
  { id: "notice", name: "Notice Period", weight: 33, options: [{ value: 3, label: ">90 days notice" }, { value: 2, label: "30–90 days" }, { value: 1, label: "<30 days" }], tooltip: "Required notice period for contract termination." },
  { id: "renewal", name: "Renewal Terms", weight: 33, options: [{ value: 3, label: "Auto-renew with uplift" }, { value: 2, label: "Auto-renew flat" }, { value: 0, label: "No auto-renew" }], tooltip: "Whether the contract auto-renews and under what terms." },
];

export const DEFAULT_RESOURCE_CRITERIA: ScoringCriterion[] = [
  { id: "keyres", name: "Number of Key Resources", weight: 50, options: [{ value: 3, label: "5+ key resources" }, { value: 2, label: "3–4 key resources" }, { value: 0, label: "<3 key resources" }], tooltip: "Count of critical resources assigned to the account." },
  { id: "alignment", name: "Key Resource Alignment", weight: 25, options: [{ value: 3, label: "Fully aligned & embedded" }, { value: 2, label: "Partially aligned" }, { value: 1, label: "Loosely aligned" }], tooltip: "How well key resources are culturally and operationally aligned with Tkxel." },
  { id: "backup", name: "Backup", weight: 25, options: [{ value: 1, label: "Backup plan exists" }, { value: 0, label: "No backup plan" }], tooltip: "Whether documented backup plans exist for key resources." },
];

export const DEFAULT_CSAT_CRITERIA: CsatCriterion[] = [
  { id: "delivery_ex", name: "Delivery Excellence", weight: 30, tooltip: "Quality and timeliness of deliverables. 5=Exceeds expectations, 1=Significantly below." },
  { id: "communication", name: "Communication", weight: 20, tooltip: "Responsiveness, clarity, and proactiveness in communication. 5=Excellent, 1=Poor." },
  { id: "proactiveness", name: "Proactiveness", weight: 15, tooltip: "Anticipating client needs and suggesting improvements. 5=Highly proactive, 1=Reactive only." },
  { id: "trust", name: "Trust", weight: 20, tooltip: "Level of trust and confidence the client has in Tkxel. 5=Full trust, 1=Low trust." },
  { id: "value", name: "Value for Money", weight: 15, tooltip: "Perceived value relative to cost. 5=Exceptional value, 1=Overpriced." },
];

// ─── Calculate weighted score ───

export function calcWeightedScore(criteria: { weight: number }[], selections: Record<string, number>, criteriaIds: string[]): number {
  let totalWeight = 0;
  let weightedSum = 0;
  criteriaIds.forEach((id, i) => {
    const val = selections[id];
    if (val !== undefined) {
      const w = criteria[i].weight;
      weightedSum += val * (w / 100);
      totalWeight += w / 100;
    }
  });
  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

// Wrong — weights already expressed as percentages, just need sum
export function calcScore(criteria: { id: string; weight: number }[], selections: Record<string, number>): number {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const c of criteria) {
    const val = selections[c.id];
    if (val !== undefined) {
      weightedSum += val * (c.weight / 100);
      totalWeight += c.weight / 100;
    }
  }
  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

// ─── Mock historical data ───

export function generateMockHistory(accountId: string): HealthSubmission[] {
  const periods = ["2025-10", "2025-12", "2026-01", "2026-02", "2026-03", "2026-03-10"];
  const base: Record<string, { r: number; c: number; res: number; csat: number }> = {
    "acc-1": { r: 2.6, c: 2.2, res: 2.3, csat: 4.2 },
    "acc-2": { r: 1.8, c: 1.2, res: 1.5, csat: 3.1 },
    "acc-3": { r: 2.3, c: 2.0, res: 1.7, csat: 3.8 },
    "acc-4": { r: 2.8, c: 2.9, res: 2.5, csat: 4.6 },
    "acc-5": { r: 1.0, c: 0.6, res: 0.9, csat: 2.2 },
  };
  const b = base[accountId] || { r: 2.0, c: 2.0, res: 2.0, csat: 3.5 };

  return periods.map((date, i) => {
    const jitter = (v: number, range: number) => Math.max(0, Math.min(3, +(v + (Math.sin(i * 2 + v) * range)).toFixed(2)));
    const r = jitter(b.r, 0.3);
    const c = jitter(b.c, 0.2);
    const res = jitter(b.res, 0.25);
    const csat = Math.max(1, Math.min(5, +(b.csat + Math.sin(i * 1.5) * 0.4).toFixed(2)));
    // Normalize CSAT to 0-3 for overall calc
    const csatNorm = ((csat - 1) / 4) * 3;
    const overall = +((r + c + res + csatNorm) / 4).toFixed(2);
    return {
      id: `hs-${accountId}-${i}`,
      date,
      submittedBy: "System",
      relationship: { selections: {}, score: r },
      contract: { selections: {}, score: c },
      resource: { selections: {}, score: res },
      csat: { selections: {}, score: csat },
      overall,
    };
  });
}
