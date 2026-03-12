export type InvoiceStatus = "Paid" | "Pending" | "Overdue";
export type SOWStatus = "Active" | "Completed";
export type ContractStatusType = "Active" | "Expiring Soon" | "Expired";

export interface Invoice {
  id: string;
  invoiceNumber: string;
  period: string;
  amount: number;
  dueDate: string;
  status: InvoiceStatus;
}

export interface SOWEntry {
  id: string;
  reference: string;
  description: string;
  startDate: string;
  value: number;
  status: SOWStatus;
}

export interface ContractTerms {
  noticePeriodDays: number;
  rateEscalation: string;
  billingCycle: "Monthly" | "Quarterly";
  yoyGrowth: number; // percentage
}

export interface FinancialData {
  invoices: Invoice[];
  sows: SOWEntry[];
  terms: ContractTerms;
}

function parseArr(arr: string): number {
  const num = parseFloat(arr.replace(/[^0-9.]/g, ""));
  if (arr.includes("M")) return num * 1_000_000;
  if (arr.includes("K")) return num * 1_000;
  return num;
}

export function getArrNumeric(arr: string): number {
  return parseArr(arr);
}

export function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

export function getContractStatus(endDate: string, today: Date = new Date("2026-03-12")): { status: ContractStatusType; daysToRenewal: number } {
  const end = new Date(endDate);
  const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  let status: ContractStatusType = "Active";
  if (diff < 0) status = "Expired";
  else if (diff <= 90) status = "Expiring Soon";
  return { status, daysToRenewal: diff };
}

export function getRenewalActionDeadline(endDate: string, noticePeriodDays: number): string {
  const end = new Date(endDate);
  end.setDate(end.getDate() - noticePeriodDays);
  return end.toISOString().split("T")[0];
}

export const MOCK_FINANCIAL_DATA: Record<string, FinancialData> = {
  "acc-1": {
    terms: { noticePeriodDays: 90, rateEscalation: "5% annual increase", billingCycle: "Monthly", yoyGrowth: 15 },
    invoices: [
      { id: "inv-1-01", invoiceNumber: "INV-2026-001", period: "Jan 2026", amount: 100000, dueDate: "2026-01-31", status: "Paid" },
      { id: "inv-1-02", invoiceNumber: "INV-2026-002", period: "Feb 2026", amount: 100000, dueDate: "2026-02-28", status: "Paid" },
      { id: "inv-1-03", invoiceNumber: "INV-2026-003", period: "Mar 2026", amount: 100000, dueDate: "2026-03-31", status: "Pending" },
    ],
    sows: [
      { id: "sow-1-1", reference: "SOW-SIG-001", description: "Cloud Migration Phase 1", startDate: "2025-01-15", value: 600000, status: "Completed" },
      { id: "sow-1-2", reference: "SOW-SIG-002", description: "Cloud Migration Phase 2", startDate: "2026-03-01", value: 450000, status: "Active" },
      { id: "sow-1-3", reference: "AMD-SIG-001", description: "API Integration Add-on", startDate: "2025-06-01", value: 150000, status: "Completed" },
    ],
  },
  "acc-2": {
    terms: { noticePeriodDays: 60, rateEscalation: "3% annual increase", billingCycle: "Quarterly", yoyGrowth: -5 },
    invoices: [
      { id: "inv-2-01", invoiceNumber: "INV-2026-Q1", period: "Q1 2026", amount: 200000, dueDate: "2026-03-31", status: "Pending" },
      { id: "inv-2-02", invoiceNumber: "INV-2025-Q4", period: "Q4 2025", amount: 200000, dueDate: "2025-12-31", status: "Paid" },
      { id: "inv-2-03", invoiceNumber: "INV-2025-Q3", period: "Q3 2025", amount: 200000, dueDate: "2025-09-30", status: "Paid" },
    ],
    sows: [
      { id: "sow-2-1", reference: "SOW-CZ-001", description: "Digital Ordering Platform", startDate: "2024-06-01", value: 500000, status: "Active" },
      { id: "sow-2-2", reference: "SOW-CZ-002", description: "POS Integration", startDate: "2025-02-01", value: 300000, status: "Completed" },
    ],
  },
  "acc-3": {
    terms: { noticePeriodDays: 60, rateEscalation: "4% annual increase", billingCycle: "Monthly", yoyGrowth: 22 },
    invoices: [
      { id: "inv-3-01", invoiceNumber: "INV-2026-001", period: "Jan 2026", amount: 37500, dueDate: "2026-01-31", status: "Paid" },
      { id: "inv-3-02", invoiceNumber: "INV-2026-002", period: "Feb 2026", amount: 37500, dueDate: "2026-02-28", status: "Paid" },
      { id: "inv-3-03", invoiceNumber: "INV-2026-003", period: "Mar 2026", amount: 37500, dueDate: "2026-03-31", status: "Pending" },
    ],
    sows: [
      { id: "sow-3-1", reference: "SOW-ASAP-001", description: "E-Commerce Platform Build", startDate: "2025-09-01", value: 350000, status: "Active" },
      { id: "sow-3-2", reference: "AMD-ASAP-001", description: "Checkout Flow Enhancement", startDate: "2026-01-15", value: 100000, status: "Active" },
    ],
  },
  "acc-4": {
    terms: { noticePeriodDays: 120, rateEscalation: "5% annual increase", billingCycle: "Monthly", yoyGrowth: 12 },
    invoices: [
      { id: "inv-4-01", invoiceNumber: "INV-2026-001", period: "Jan 2026", amount: 175000, dueDate: "2026-01-31", status: "Paid" },
      { id: "inv-4-02", invoiceNumber: "INV-2026-002", period: "Feb 2026", amount: 175000, dueDate: "2026-02-28", status: "Paid" },
      { id: "inv-4-03", invoiceNumber: "INV-2026-003", period: "Mar 2026", amount: 175000, dueDate: "2026-03-31", status: "Pending" },
    ],
    sows: [
      { id: "sow-4-1", reference: "SOW-CNV-001", description: "Warehouse Automation Phase 1", startDate: "2024-01-01", value: 1200000, status: "Completed" },
      { id: "sow-4-2", reference: "SOW-CNV-002", description: "Warehouse Automation Phase 2", startDate: "2025-03-01", value: 900000, status: "Completed" },
      { id: "sow-4-3", reference: "SOW-CNV-003", description: "Warehouse Automation Phase 3", startDate: "2026-03-05", value: 1000000, status: "Active" },
      { id: "sow-4-4", reference: "AMD-CNV-001", description: "IoT Sensor Integration", startDate: "2025-08-01", value: 400000, status: "Active" },
    ],
  },
  "acc-5": {
    terms: { noticePeriodDays: 30, rateEscalation: "None", billingCycle: "Monthly", yoyGrowth: -18 },
    invoices: [
      { id: "inv-5-01", invoiceNumber: "INV-2026-001", period: "Jan 2026", amount: 29167, dueDate: "2026-01-31", status: "Paid" },
      { id: "inv-5-02", invoiceNumber: "INV-2026-002", period: "Feb 2026", amount: 29167, dueDate: "2026-02-28", status: "Overdue" },
      { id: "inv-5-03", invoiceNumber: "INV-2026-003", period: "Mar 2026", amount: 29167, dueDate: "2026-03-15", status: "Overdue" },
    ],
    sows: [
      { id: "sow-5-1", reference: "SOW-EPL-001", description: "SaaS Platform Development", startDate: "2025-03-01", value: 350000, status: "Active" },
    ],
  },
  "acc-6": {
    terms: { noticePeriodDays: 90, rateEscalation: "4% annual increase", billingCycle: "Monthly", yoyGrowth: 8 },
    invoices: [
      { id: "inv-6-01", invoiceNumber: "INV-2026-001", period: "Jan 2026", amount: 150000, dueDate: "2026-01-31", status: "Paid" },
      { id: "inv-6-02", invoiceNumber: "INV-2026-002", period: "Feb 2026", amount: 150000, dueDate: "2026-02-28", status: "Paid" },
      { id: "inv-6-03", invoiceNumber: "INV-2026-003", period: "Mar 2026", amount: 150000, dueDate: "2026-03-31", status: "Pending" },
    ],
    sows: [
      { id: "sow-6-1", reference: "SOW-ZP-001", description: "Insurance Platform Modernization", startDate: "2025-04-01", value: 1200000, status: "Active" },
      { id: "sow-6-2", reference: "AMD-ZP-001", description: "Claims Processing Module", startDate: "2025-10-01", value: 400000, status: "Active" },
    ],
  },
  "acc-7": {
    terms: { noticePeriodDays: 60, rateEscalation: "3% annual increase", billingCycle: "Quarterly", yoyGrowth: -3 },
    invoices: [
      { id: "inv-7-01", invoiceNumber: "INV-2026-Q1", period: "Q1 2026", amount: 150000, dueDate: "2026-03-31", status: "Pending" },
      { id: "inv-7-02", invoiceNumber: "INV-2025-Q4", period: "Q4 2025", amount: 150000, dueDate: "2025-12-31", status: "Paid" },
    ],
    sows: [
      { id: "sow-7-1", reference: "SOW-ETA-001", description: "Retail Analytics Dashboard", startDate: "2024-11-01", value: 450000, status: "Active" },
    ],
  },
  "acc-8": {
    terms: { noticePeriodDays: 90, rateEscalation: "5% annual increase", billingCycle: "Monthly", yoyGrowth: 18 },
    invoices: [
      { id: "inv-8-01", invoiceNumber: "INV-2026-001", period: "Jan 2026", amount: 79167, dueDate: "2026-01-31", status: "Paid" },
      { id: "inv-8-02", invoiceNumber: "INV-2026-002", period: "Feb 2026", amount: 79167, dueDate: "2026-02-28", status: "Paid" },
      { id: "inv-8-03", invoiceNumber: "INV-2026-003", period: "Mar 2026", amount: 79167, dueDate: "2026-03-31", status: "Pending" },
    ],
    sows: [
      { id: "sow-8-1", reference: "SOW-THT-001", description: "Manufacturing ERP Integration", startDate: "2025-07-01", value: 700000, status: "Active" },
      { id: "sow-8-2", reference: "AMD-THT-001", description: "IoT Data Pipeline", startDate: "2026-01-15", value: 250000, status: "Active" },
    ],
  },
};
