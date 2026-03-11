export type ReportType = "kyc" | "account_plan" | "health_score" | "governance" | "portfolio_summary";
export type ExportFormat = "pdf" | "word" | "csv";

export interface ReportConfig {
  id: ReportType;
  title: string;
  description: string;
  formats: ExportFormat[];
  multiAccount: boolean;
  hasDateRange: boolean;
  leadershipOnly: boolean;
  subOptions?: { label: string; value: string }[];
}

export const REPORT_CONFIGS: ReportConfig[] = [
  {
    id: "kyc",
    title: "KYC Export",
    description: "Export KYC data for selected account(s) including client overview, contacts, and engagement history.",
    formats: ["pdf", "word"],
    multiAccount: true,
    hasDateRange: false,
    leadershipOnly: false,
  },
  {
    id: "account_plan",
    title: "Account Plan Export",
    description: "Export account strategy & plan with vision, service mapping, and initiatives.",
    formats: ["pdf", "word", "csv"],
    multiAccount: false,
    hasDateRange: false,
    leadershipOnly: false,
    subOptions: [
      { label: "Current Version", value: "current" },
      { label: "All Versions", value: "all" },
    ],
  },
  {
    id: "health_score",
    title: "Health Score Report",
    description: "Export scoring history with trend data across all health dimensions.",
    formats: ["pdf", "csv"],
    multiAccount: true,
    hasDateRange: true,
    leadershipOnly: false,
  },
  {
    id: "governance",
    title: "Governance Report",
    description: "Export governance activities including QBRs, SteerCos, and escalations.",
    formats: ["pdf"],
    multiAccount: false,
    hasDateRange: false,
    leadershipOnly: false,
    subOptions: [
      { label: "QBRs", value: "qbr" },
      { label: "SteerCos", value: "steerco" },
      { label: "Escalations", value: "escalations" },
      { label: "All Activities", value: "all" },
    ],
  },
  {
    id: "portfolio_summary",
    title: "Portfolio Summary",
    description: "Full portfolio health overview with aggregate scoring and AM performance. Leadership only.",
    formats: ["pdf"],
    multiAccount: false,
    hasDateRange: false,
    leadershipOnly: true,
  },
];

export interface RecentExport {
  id: string;
  reportType: ReportType;
  reportTitle: string;
  accounts: string[];
  format: ExportFormat;
  generatedAt: string;
  generatedBy: string;
  fileName: string;
}

export const MOCK_RECENT_EXPORTS: RecentExport[] = [
  { id: "exp-1", reportType: "kyc", reportTitle: "KYC Export", accounts: ["Acme Corporation"], format: "pdf", generatedAt: "2026-03-10T14:30:00", generatedBy: "Sarah Mitchell", fileName: "KYC_Acme_Corporation_2026-03-10.pdf" },
  { id: "exp-2", reportType: "health_score", reportTitle: "Health Score Report", accounts: ["Acme Corporation", "Beta Industries"], format: "csv", generatedAt: "2026-03-09T10:15:00", generatedBy: "Sarah Mitchell", fileName: "HealthScores_Multi_2026-03-09.csv" },
  { id: "exp-3", reportType: "governance", reportTitle: "Governance Report", accounts: ["Delta Corp"], format: "pdf", generatedAt: "2026-03-08T16:45:00", generatedBy: "James Chen", fileName: "Governance_Delta_Corp_QBR_2026-03-08.pdf" },
  { id: "exp-4", reportType: "portfolio_summary", reportTitle: "Portfolio Summary", accounts: ["All Accounts"], format: "pdf", generatedAt: "2026-03-07T09:00:00", generatedBy: "James Chen", fileName: "Portfolio_Summary_2026-03-07.pdf" },
];
