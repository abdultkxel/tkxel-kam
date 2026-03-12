export type OppTaskType = "Discovery" | "Follow-up" | "Proposal" | "Demo" | "Internal" | "Meeting" | "Legal" | "Commercial";
export type OppTaskPriority = "High" | "Medium" | "Low";

export interface OppTask {
  id: string;
  opportunityId: string;
  title: string;
  type: OppTaskType;
  priority: OppTaskPriority;
  dueDate: string;
  owner: string;
  notes: string;
  completed: boolean;
  completedAt?: string;
}

export interface OppActivityEntry {
  id: string;
  opportunityId: string;
  type: "created" | "stage_change" | "confidence_change" | "value_change" | "task_completed" | "note";
  content: string;
  author: string;
  timestamp: string;
}

export interface OppDocument {
  id: string;
  opportunityId: string;
  label: string;
  url: string;
}

export const TASK_TYPE_COLORS: Record<OppTaskType, string> = {
  Discovery: "bg-purple-500/15 text-purple-600",
  "Follow-up": "bg-blue-500/15 text-blue-600",
  Proposal: "bg-yellow-500/15 text-yellow-700",
  Demo: "bg-teal-500/15 text-teal-600",
  Internal: "bg-muted text-muted-foreground",
  Meeting: "bg-rag-green/15 text-rag-green",
  Legal: "bg-orange-500/15 text-orange-600",
  Commercial: "bg-indigo-500/15 text-indigo-600",
};

export const PRIORITY_COLORS: Record<OppTaskPriority, string> = {
  High: "bg-destructive/15 text-destructive",
  Medium: "bg-rag-amber/15 text-rag-amber",
  Low: "bg-muted text-muted-foreground",
};

export const SEED_TASKS: OppTask[] = [
  // GenAI Analytics Pilot (opp-1)
  { id: "ot-1", opportunityId: "opp-1", title: "Send GenAI capability deck to client", type: "Follow-up", priority: "High", dueDate: "2026-03-20", owner: "Sarah Mitchell", notes: "", completed: false },
  { id: "ot-2", opportunityId: "opp-1", title: "Discovery call with CTO", type: "Meeting", priority: "High", dueDate: "2026-03-10", owner: "Sarah Mitchell", notes: "", completed: true, completedAt: "2026-03-10" },
  { id: "ot-3", opportunityId: "opp-1", title: "Get budget sign-off from CFO", type: "Internal", priority: "Medium", dueDate: "2026-04-05", owner: "Sarah Mitchell", notes: "", completed: false },
  { id: "ot-4", opportunityId: "opp-1", title: "Submit commercial proposal", type: "Proposal", priority: "High", dueDate: "2026-04-15", owner: "Sarah Mitchell", notes: "", completed: false },
  { id: "ot-5", opportunityId: "opp-1", title: "Legal review of engagement terms", type: "Legal", priority: "Low", dueDate: "2026-05-01", owner: "James Chen", notes: "", completed: false },
  // AI Transformation Workshop (opp-4)
  { id: "ot-6", opportunityId: "opp-4", title: "Workshop agenda finalized", type: "Internal", priority: "High", dueDate: "2026-03-08", owner: "Sarah Mitchell", notes: "", completed: true, completedAt: "2026-03-08" },
  { id: "ot-7", opportunityId: "opp-4", title: "Send contract for signature", type: "Commercial", priority: "High", dueDate: "2026-03-14", owner: "Sarah Mitchell", notes: "", completed: false },
  { id: "ot-8", opportunityId: "opp-4", title: "Confirm facilitator from Tkxel side", type: "Internal", priority: "Medium", dueDate: "2026-03-12", owner: "James Chen", notes: "", completed: false },
  // DevOps Automation (opp-3)
  { id: "ot-9", opportunityId: "opp-3", title: "Demo of CI/CD pipeline tooling", type: "Demo", priority: "High", dueDate: "2026-04-02", owner: "Sarah Mitchell", notes: "", completed: false },
  { id: "ot-10", opportunityId: "opp-3", title: "Share case study from similar client", type: "Follow-up", priority: "Medium", dueDate: "2026-03-18", owner: "Sarah Mitchell", notes: "", completed: false },
];

export const SEED_ACTIVITIES: OppActivityEntry[] = [
  { id: "oa-1", opportunityId: "opp-1", type: "created", content: "Opportunity created by Sarah Mitchell", author: "Sarah Mitchell", timestamp: "2026-01-15T09:00:00Z" },
  { id: "oa-2", opportunityId: "opp-1", type: "stage_change", content: "Stage changed: Identified → Qualified by Sarah Mitchell", author: "Sarah Mitchell", timestamp: "2026-02-10T14:30:00Z" },
  { id: "oa-3", opportunityId: "opp-1", type: "task_completed", content: "Task completed: Discovery call with CTO", author: "Sarah Mitchell", timestamp: "2026-03-10T16:00:00Z" },
  { id: "oa-4", opportunityId: "opp-4", type: "created", content: "Opportunity created by Sarah Mitchell", author: "Sarah Mitchell", timestamp: "2025-12-10T10:00:00Z" },
  { id: "oa-5", opportunityId: "opp-4", type: "stage_change", content: "Stage changed: Identified → Qualified by Sarah Mitchell", author: "Sarah Mitchell", timestamp: "2026-01-05T11:00:00Z" },
  { id: "oa-6", opportunityId: "opp-4", type: "stage_change", content: "Stage changed: Qualified → Proposal Sent by Sarah Mitchell", author: "Sarah Mitchell", timestamp: "2026-01-20T09:00:00Z" },
  { id: "oa-7", opportunityId: "opp-4", type: "stage_change", content: "Stage changed: Proposal Sent → Negotiation by Sarah Mitchell", author: "Sarah Mitchell", timestamp: "2026-02-15T15:00:00Z" },
  { id: "oa-8", opportunityId: "opp-4", type: "task_completed", content: "Task completed: Workshop agenda finalized", author: "Sarah Mitchell", timestamp: "2026-03-08T12:00:00Z" },
  { id: "oa-9", opportunityId: "opp-3", type: "created", content: "Opportunity created by Sarah Mitchell", author: "Sarah Mitchell", timestamp: "2026-01-20T08:00:00Z" },
  { id: "oa-10", opportunityId: "opp-3", type: "stage_change", content: "Stage changed: Identified → Qualified by Sarah Mitchell", author: "Sarah Mitchell", timestamp: "2026-02-05T10:00:00Z" },
  { id: "oa-11", opportunityId: "opp-3", type: "stage_change", content: "Stage changed: Qualified → Proposal Sent by Sarah Mitchell", author: "Sarah Mitchell", timestamp: "2026-02-20T11:00:00Z" },
];

export const SEED_DOCUMENTS: OppDocument[] = [
  { id: "od-1", opportunityId: "opp-1", label: "GenAI Capability Deck", url: "https://docs.example.com/genai-deck" },
  { id: "od-2", opportunityId: "opp-4", label: "Workshop Proposal", url: "https://docs.example.com/workshop-proposal" },
  { id: "od-3", opportunityId: "opp-4", label: "Pricing Sheet", url: "https://docs.example.com/pricing-v2" },
];
