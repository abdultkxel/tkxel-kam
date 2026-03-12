import { MOCK_ACCOUNTS, Account, getRagColor } from "./accounts";
import { MOCK_MEETINGS, MOCK_ESCALATIONS, getDueDateStatus } from "./governance";
import { generateMockHistory } from "./healthScoring";

// ─── Summary stats ───

export function getAMStats(amId: string) {
  const accounts = MOCK_ACCOUNTS.filter(a => a.amId === amId);
  return computeStats(accounts);
}

export function getPortfolioStats() {
  return computeStats(MOCK_ACCOUNTS);
}

function computeStats(accounts: Account[]) {
  const atRisk = accounts.filter(a => a.riskStatus === "red").length;
  const needsAttention = accounts.filter(a => a.riskStatus === "amber").length;

  const now = new Date();
  const in30 = new Date();
  in30.setDate(in30.getDate() + 30);
  const upcomingQBRs = MOCK_MEETINGS.filter(
    m => m.type === "QBR" && m.status === "Planned" &&
    new Date(m.scheduledDate) >= now && new Date(m.scheduledDate) <= in30
  ).length;

  return { total: accounts.length, atRisk, needsAttention, upcomingQBRs };
}

// ─── Health heatmap data ───

export interface HeatmapRow {
  id: string;
  name: string;
  segment: string;
  relationship: number;
  contract: number;
  resource: number;
  csat: number;
  risk: number;
  serviceCoverage: number;
  overall: number;
  arr: string;
}

export function getHeatmapData(accounts: Account[]): HeatmapRow[] {
  return accounts.map(a => {
    const hist = generateMockHistory(a.id);
    const latest = hist[hist.length - 1];
    // Mock risk & service coverage per account
    const riskMap: Record<string, number> = { "acc-1": 2.4, "acc-2": 1.3, "acc-3": 1.8, "acc-4": 2.7, "acc-5": 0.9, "acc-6": 2.1, "acc-7": 1.5, "acc-8": 2.2 };
    const serviceMap: Record<string, number> = { "acc-1": 42, "acc-2": 18, "acc-3": 24, "acc-4": 55, "acc-5": 10, "acc-6": 38, "acc-7": 22, "acc-8": 30 };
    return {
      id: a.id,
      name: a.name,
      segment: a.segment,
      relationship: latest?.relationship.score ?? a.health.relationship,
      contract: latest?.contract.score ?? a.health.contract,
      resource: latest?.resource.score ?? a.health.resource,
      csat: latest?.csat.score ?? 3.5,
      risk: riskMap[a.id] ?? 2.0,
      serviceCoverage: serviceMap[a.id] ?? 25,
      overall: latest?.overall ?? a.health.overall,
      arr: a.arr,
    };
  });
}

// ─── Growth vs Retention ───

export function getSegmentSplit(accounts: Account[]) {
  const growth = accounts.filter(a => a.segment === "Growth").length;
  const retention = accounts.filter(a => a.segment === "Retention").length;
  return [
    { name: "Growth", value: growth, fill: "hsl(213, 52%, 24%)" },
    { name: "Retention", value: retention, fill: "hsl(199, 89%, 48%)" },
  ];
}

// ─── Alerts ───

export interface AlertItem {
  type: "health" | "contract" | "overdue";
  severity: "red" | "amber";
  account: string;
  message: string;
}

export function getAlerts(accounts: Account[]): AlertItem[] {
  const alerts: AlertItem[] = [];

  for (const a of accounts) {
    if (a.health.relationship < 1.5) alerts.push({ type: "health", severity: "red", account: a.name, message: `Relationship health critical (${a.health.relationship})` });
    if (a.health.contract < 1.5) alerts.push({ type: "health", severity: "red", account: a.name, message: `Contract health critical (${a.health.contract})` });
    if (a.health.resource < 1.5) alerts.push({ type: "health", severity: "red", account: a.name, message: `Resource health critical (${a.health.resource})` });

    const endDate = new Date(a.contractEnd);
    const now = new Date();
    const daysToEnd = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysToEnd < 0) alerts.push({ type: "contract", severity: "red", account: a.name, message: "Contract expired" });
    else if (daysToEnd <= 90) alerts.push({ type: "contract", severity: "amber", account: a.name, message: `Contract expires in ${daysToEnd} days` });
  }

  // Overdue action items
  for (const m of MOCK_MEETINGS) {
    for (const ai of m.actionItems) {
      if (ai.status !== "Complete" && getDueDateStatus(ai.dueDate) === "overdue") {
        alerts.push({ type: "overdue", severity: "red", account: m.type, message: `"${ai.task}" overdue (${ai.owner})` });
      }
    }
  }

  return alerts.sort((a, b) => (a.severity === "red" ? -1 : 1) - (b.severity === "red" ? -1 : 1));
}

// ─── Upcoming governance ───

export function getUpcomingGovernance() {
  const now = new Date();
  const items = [
    ...MOCK_MEETINGS.filter(m => m.status === "Planned" && new Date(m.scheduledDate) >= now)
      .map(m => ({ date: m.scheduledDate, title: `${m.type} — ${m.agenda.slice(0, 60)}`, type: m.type })),
    ...MOCK_ESCALATIONS.filter(e => e.status !== "Resolved")
      .map(e => ({ date: e.dateRaised, title: `Escalation: ${e.title}`, type: "Escalation" })),
  ];
  return items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(0, 5);
}

// ─── Overdue actions ───

export function getOverdueActions() {
  const items: { task: string; owner: string; dueDate: string; source: string }[] = [];
  for (const m of MOCK_MEETINGS) {
    for (const ai of m.actionItems) {
      if (ai.status !== "Complete" && getDueDateStatus(ai.dueDate) === "overdue") {
        items.push({ task: ai.task, owner: ai.owner, dueDate: ai.dueDate, source: m.type });
      }
    }
  }
  return items;
}

// ─── Portfolio averages (Leadership) ───

export function getPortfolioAverages() {
  const accounts = MOCK_ACCOUNTS;
  const n = accounts.length;
  if (n === 0) return { relationship: 0, contract: 0, resource: 0, overall: 0 };
  return {
    relationship: +(accounts.reduce((s, a) => s + a.health.relationship, 0) / n).toFixed(2),
    contract: +(accounts.reduce((s, a) => s + a.health.contract, 0) / n).toFixed(2),
    resource: +(accounts.reduce((s, a) => s + a.health.resource, 0) / n).toFixed(2),
    overall: +(accounts.reduce((s, a) => s + a.health.overall, 0) / n).toFixed(2),
  };
}

// ─── AM Performance (Leadership) ───

export interface AMPerformance {
  name: string;
  accounts: number;
  kycCompletion: number;
  planSubmission: number;
  governanceRate: number;
}

export function getAMPerformanceData(): AMPerformance[] {
  const amMap = new Map<string, { name: string; count: number }>();
  for (const a of MOCK_ACCOUNTS) {
    const existing = amMap.get(a.amId);
    if (existing) existing.count++;
    else amMap.set(a.amId, { name: a.amName, count: 1 });
  }
  return Array.from(amMap.entries()).map(([id, { name, count }]) => ({
    name,
    accounts: count,
    kycCompletion: Math.round(60 + Math.random() * 40),
    planSubmission: Math.round(50 + Math.random() * 50),
    governanceRate: Math.round(55 + Math.random() * 45),
  }));
}

// ─── Risk heatmap (Health vs Revenue) ───

export interface RiskPlotPoint {
  name: string;
  healthScore: number;
  revenue: number;
  riskStatus: string;
}

export function getRiskHeatmapData(): RiskPlotPoint[] {
  return MOCK_ACCOUNTS.map(a => ({
    name: a.name,
    healthScore: a.health.overall,
    revenue: parseFloat(a.arr.replace(/[$MK,]/g, "")) * (a.arr.includes("M") ? 1000 : 1),
    riskStatus: a.riskStatus,
  }));
}

// ─── Renewal calendar ───

export interface RenewalEntry {
  account: string;
  contractEnd: string;
  arr: string;
  daysRemaining: number;
  status: "overdue" | "upcoming" | "normal";
}

export function getRenewalCalendar(): RenewalEntry[] {
  const now = new Date();
  const in6m = new Date();
  in6m.setMonth(in6m.getMonth() + 6);

  return MOCK_ACCOUNTS
    .map(a => {
      const end = new Date(a.contractEnd);
      const days = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return {
        account: a.name,
        contractEnd: a.contractEnd,
        arr: a.arr,
        daysRemaining: days,
        status: days < 0 ? "overdue" as const : days <= 90 ? "upcoming" as const : "normal" as const,
      };
    })
    .filter(r => new Date(r.contractEnd) <= in6m || r.daysRemaining < 0)
    .sort((a, b) => a.daysRemaining - b.daysRemaining);
}

// ─── Billing forecast ───

export interface BillingForecast {
  month: string;
  projected: number;
  confirmed: number;
}

export function getBillingForecast(): BillingForecast[] {
  const months = ["Apr 2026", "May 2026", "Jun 2026", "Jul 2026", "Aug 2026", "Sep 2026"];
  return months.map((month, i) => ({
    month,
    projected: Math.round(800 + Math.random() * 400),
    confirmed: Math.round(600 + Math.random() * 300),
  }));
}

// ─── Daily To-Do Tasks ───

export interface DailyTask {
  id: string;
  task: string;
  account: string;
  category: "kyc" | "health" | "governance" | "strategy" | "follow-up" | "opportunity";
  priority: "high" | "medium" | "low";
  dueDate: string;
  completed: boolean;
  contextLabel?: string;
}

export function getDailyTasks(amId?: string): DailyTask[] {
  const today = new Date().toISOString().split("T")[0];
  const tasks: DailyTask[] = [
    { id: "dt-1", task: "Complete KYC update for Signal", account: "Signal", category: "kyc", priority: "high", dueDate: today, completed: false },
    { id: "dt-2", task: "Submit Q1 health scores for Cafe Zupas", account: "Cafe Zupas", category: "health", priority: "high", dueDate: today, completed: false },
    { id: "dt-3", task: "Prepare QBR deck for Canvs", account: "Canvs", category: "governance", priority: "medium", dueDate: today, completed: false },
    { id: "dt-4", task: "Follow up on escalation — Module B delay", account: "Signal", category: "follow-up", priority: "high", dueDate: today, completed: true },
    { id: "dt-5", task: "Review strategic plan draft for Epilogue", account: "Epilogue", category: "strategy", priority: "medium", dueDate: today, completed: false },
    { id: "dt-6", task: "Send contract renewal reminder to ASAP Semiconductor", account: "ASAP Semiconductor", category: "follow-up", priority: "low", dueDate: today, completed: false },
    { id: "dt-7", task: "Update service line mapping for Theta Inc", account: "Theta Inc", category: "health", priority: "medium", dueDate: today, completed: true },
    { id: "dt-8", task: "Schedule SteerCo with Zeta Partners leadership", account: "Zeta Partners", category: "governance", priority: "low", dueDate: today, completed: false },
  ];

  // For AM role, return only a subset; for leadership, return all
  return amId ? tasks.slice(0, 6) : tasks;
}
