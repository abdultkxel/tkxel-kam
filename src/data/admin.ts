export interface SystemUser {
  id: string;
  name: string;
  email: string;
  role: "am" | "leadership" | "admin";
  status: "active" | "inactive";
  assignedAccounts: string[];
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  userId: string;
  userName: string;
  action: string;
  recordType: string;
  recordId: string;
  recordName: string;
  timestamp: string;
  details: string;
}

export interface TemplateFile {
  id: string;
  name: string;
  type: "KYC" | "QBR" | "SteerCo";
  version: string;
  uploadedAt: string;
  uploadedBy: string;
  fileSize: string;
}

export const MOCK_USERS: SystemUser[] = [
  { id: "u1", name: "Sarah Mitchell", email: "am@tkxel.com", role: "am", status: "active", assignedAccounts: ["acc-1", "acc-2", "acc-3", "acc-4", "acc-5"], createdAt: "2025-01-15" },
  { id: "u2", name: "James Chen", email: "lead@tkxel.com", role: "leadership", status: "active", assignedAccounts: [], createdAt: "2024-11-01" },
  { id: "u3", name: "Alex Rivera", email: "admin@tkxel.com", role: "admin", status: "active", assignedAccounts: [], createdAt: "2024-10-01" },
  { id: "u4", name: "David Park", email: "david@tkxel.com", role: "am", status: "active", assignedAccounts: ["acc-6", "acc-7", "acc-8"], createdAt: "2025-03-01" },
  { id: "u5", name: "Maria Lopez", email: "maria@tkxel.com", role: "am", status: "inactive", assignedAccounts: [], createdAt: "2024-08-15" },
];

export const MOCK_TEMPLATES: TemplateFile[] = [
  { id: "t1", name: "KYC Form Template", type: "KYC", version: "2.1", uploadedAt: "2026-02-15", uploadedBy: "Alex Rivera", fileSize: "245 KB" },
  { id: "t2", name: "QBR Deck Template", type: "QBR", version: "3.0", uploadedAt: "2026-01-20", uploadedBy: "Alex Rivera", fileSize: "1.8 MB" },
  { id: "t3", name: "SteerCo Agenda Template", type: "SteerCo", version: "1.5", uploadedAt: "2026-03-01", uploadedBy: "James Chen", fileSize: "520 KB" },
];

export const MOCK_AUDIT_LOG: AuditEntry[] = [
  { id: "al1", userId: "u1", userName: "Sarah Mitchell", action: "Updated", recordType: "KYC", recordId: "acc-1", recordName: "Acme Corporation", timestamp: "2026-03-10T14:30:00", details: "Updated key contacts section" },
  { id: "al2", userId: "u1", userName: "Sarah Mitchell", action: "Submitted", recordType: "Health Score", recordId: "acc-2", recordName: "Beta Industries", timestamp: "2026-03-10T11:00:00", details: "Q1 health scoring submitted" },
  { id: "al3", userId: "u2", userName: "James Chen", action: "Approved", recordType: "Strategy", recordId: "acc-1", recordName: "Acme Corporation", timestamp: "2026-03-09T16:45:00", details: "Approved account plan v2" },
  { id: "al4", userId: "u3", userName: "Alex Rivera", action: "Created", recordType: "User", recordId: "u4", recordName: "David Park", timestamp: "2026-03-08T09:00:00", details: "New AM user created" },
  { id: "al5", userId: "u1", userName: "Sarah Mitchell", action: "Exported", recordType: "Report", recordId: "exp-1", recordName: "KYC Export", timestamp: "2026-03-10T14:30:00", details: "KYC export for Acme Corporation" },
  { id: "al6", userId: "u3", userName: "Alex Rivera", action: "Updated", recordType: "Scoring Config", recordId: "rel", recordName: "Relationship Health", timestamp: "2026-03-07T10:15:00", details: "Changed CEO Engagement weight from 20% to 25%" },
  { id: "al7", userId: "u2", userName: "James Chen", action: "Created", recordType: "QBR", recordId: "m2", recordName: "Q1 QBR - Acme", timestamp: "2026-03-06T14:00:00", details: "Scheduled QBR for Q1 review" },
  { id: "al8", userId: "u1", userName: "Sarah Mitchell", action: "Resolved", recordType: "Escalation", recordId: "e1", recordName: "Delayed Module B", timestamp: "2026-03-05T11:30:00", details: "Escalation resolved with additional resources" },
];
