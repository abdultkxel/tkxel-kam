export type ActivityStatus = "Planned" | "Completed" | "Cancelled";
export type EscalationSeverity = "High" | "Medium" | "Low";
export type EscalationStatus = "Open" | "In Progress" | "Resolved";
export type ActionItemStatus = "Not Started" | "In Progress" | "Complete" | "Blocked";

export interface ActionItem {
  id: string;
  task: string;
  owner: string;
  dueDate: string;
  status: ActionItemStatus;
}

export interface MeetingActivity {
  id: string;
  type: "QBR" | "SteerCo";
  accountId: string;
  accountName: string;
  scheduledDate: string;
  status: ActivityStatus;
  agenda: string;
  recordingUrl: string;
  mom: string;
  actionItems: ActionItem[];
  createdAt: string;
}

export interface Escalation {
  id: string;
  title: string;
  raisedBy: string;
  dateRaised: string;
  severity: EscalationSeverity;
  description: string;
  resolutionNotes: string;
  status: EscalationStatus;
  resolutionDate: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  type: "QBR" | "SteerCo" | "Meeting" | "Task";
  accountId: string;
  accountName: string;
}

export const TEAM_MEMBERS = [
  "Sarah Mitchell", "David Park", "James Chen", "Maria Lopez",
  "Alex Johnson", "Priya Sharma", "Tom Wilson", "Emma Davis",
];

function daysFromNow(d: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() + d);
  return dt.toISOString().split("T")[0];
}

export const MOCK_MEETINGS: MeetingActivity[] = [
  {
    id: "m1", type: "QBR", accountId: "acc-1", accountName: "Signal", scheduledDate: daysFromNow(-30), status: "Completed",
    agenda: "Review Q4 delivery metrics, discuss Q1 roadmap priorities.",
    recordingUrl: "https://example.com/recordings/qbr-q4",
    mom: "All KPIs met. Client requested additional cloud migration support.",
    actionItems: [
      { id: "ai1", task: "Prepare cloud migration proposal", owner: "James Chen", dueDate: daysFromNow(-15), status: "Complete" },
      { id: "ai2", task: "Share updated pricing model", owner: "Sarah Mitchell", dueDate: daysFromNow(-10), status: "Complete" },
    ],
    createdAt: daysFromNow(-35),
  },
  {
    id: "m2", type: "QBR", accountId: "acc-4", accountName: "Canvs", scheduledDate: daysFromNow(5), status: "Planned",
    agenda: "Review Q1 deliverables and client satisfaction scores.",
    recordingUrl: "", mom: "",
    actionItems: [
      { id: "ai3", task: "Prepare QBR deck", owner: "David Park", dueDate: daysFromNow(3), status: "In Progress" },
    ],
    createdAt: daysFromNow(-5),
  },
  {
    id: "m3", type: "SteerCo", accountId: "acc-2", accountName: "Cafe Zupas", scheduledDate: daysFromNow(-60), status: "Completed",
    agenda: "Strategic alignment on 2026 engagement model.",
    recordingUrl: "https://example.com/recordings/steerco-jan",
    mom: "Agreed on expanded scope for H2. Budget approved.",
    actionItems: [
      { id: "ai4", task: "Draft SOW for H2 expansion", owner: "Maria Lopez", dueDate: daysFromNow(-45), status: "Complete" },
    ],
    createdAt: daysFromNow(-65),
  },
  {
    id: "m4", type: "SteerCo", accountId: "acc-3", accountName: "ASAP Semiconductor", scheduledDate: daysFromNow(20), status: "Planned",
    agenda: "Mid-year strategic review and resource planning.",
    recordingUrl: "", mom: "",
    actionItems: [
      { id: "ai5", task: "Compile resource utilization report", owner: "Tom Wilson", dueDate: daysFromNow(15), status: "Not Started" },
    ],
    createdAt: daysFromNow(-2),
  },
  {
    id: "m5", type: "QBR", accountId: "acc-5", accountName: "Epilogue", scheduledDate: daysFromNow(12), status: "Planned",
    agenda: "Contract renewal discussion and service expansion.",
    recordingUrl: "", mom: "",
    actionItems: [],
    createdAt: daysFromNow(-3),
  },
  {
    id: "m6", type: "SteerCo", accountId: "acc-1", accountName: "Signal", scheduledDate: daysFromNow(25), status: "Planned",
    agenda: "Cloud migration progress review and budget alignment.",
    recordingUrl: "", mom: "",
    actionItems: [],
    createdAt: daysFromNow(-1),
  },
];

export const MOCK_ESCALATIONS: Escalation[] = [
  {
    id: "e1", title: "Delayed Module B Delivery", raisedBy: "Client PM",
    dateRaised: daysFromNow(-20), severity: "High",
    description: "Module B delivery delayed by 3 weeks due to resource gaps.",
    resolutionNotes: "Assigned 2 additional senior developers. Timeline revised.",
    status: "Resolved", resolutionDate: daysFromNow(-10),
  },
  {
    id: "e2", title: "Security Audit Findings", raisedBy: "Sarah Mitchell",
    dateRaised: daysFromNow(-5), severity: "Medium",
    description: "3 medium-severity findings in latest security audit need remediation.",
    resolutionNotes: "",
    status: "In Progress", resolutionDate: "",
  },
  {
    id: "e3", title: "Invoice Discrepancy", raisedBy: "Client Finance",
    dateRaised: daysFromNow(-2), severity: "Low",
    description: "Mismatch between PO amount and invoiced amount for February.",
    resolutionNotes: "",
    status: "Open", resolutionDate: "",
  },
];

export const MOCK_CALENDAR_EVENTS: CalendarEvent[] = [
  { id: "ce1", title: "QBR - Q1 Review", date: daysFromNow(5), type: "QBR", accountId: "acc-4", accountName: "Canvs" },
  { id: "ce2", title: "SteerCo - Mid-Year", date: daysFromNow(20), type: "SteerCo", accountId: "acc-3", accountName: "ASAP Semiconductor" },
  { id: "ce3", title: "Weekly Sync", date: daysFromNow(1), type: "Meeting", accountId: "acc-1", accountName: "Signal" },
  { id: "ce4", title: "Weekly Sync", date: daysFromNow(8), type: "Meeting", accountId: "acc-2", accountName: "Cafe Zupas" },
  { id: "ce5", title: "Weekly Sync", date: daysFromNow(15), type: "Meeting", accountId: "acc-4", accountName: "Canvs" },
  { id: "ce6", title: "Executive Lunch", date: daysFromNow(12), type: "Meeting", accountId: "acc-5", accountName: "Epilogue" },
  { id: "ce7", title: "Sprint Review", date: daysFromNow(3), type: "Meeting", accountId: "acc-1", accountName: "Signal" },
  { id: "ce8", title: "Weekly Sync", date: daysFromNow(22), type: "Meeting", accountId: "acc-3", accountName: "ASAP Semiconductor" },
];

export function getDueDateStatus(dateStr: string): "overdue" | "upcoming" | "normal" {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);
  const diff = (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return "overdue";
  if (diff <= 7) return "upcoming";
  return "normal";
}

export function getLatestGovernanceEvents(): { date: string; title: string; type: string }[] {
  const all = [
    ...MOCK_MEETINGS.map(m => ({ date: m.scheduledDate, title: `${m.type}: ${m.agenda.slice(0, 50)}...`, type: m.type.toLowerCase() })),
    ...MOCK_ESCALATIONS.map(e => ({ date: e.dateRaised, title: `Escalation: ${e.title}`, type: "escalation" })),
  ];
  return all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);
}
