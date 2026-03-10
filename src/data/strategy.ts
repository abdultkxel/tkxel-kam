import type { KycStatus } from "./kyc";

export type SegmentType = "Growth" | "Retention";
export type ServiceStatus = "Active" | "Opportunity" | "Not Applicable";
export type InitiativeStatus = "Not Started" | "In Progress" | "Complete" | "Blocked";

export interface ServiceItem {
  id: string;
  name: string;
  competency: string;
  status: ServiceStatus;
}

export interface Initiative {
  id: string;
  objective: string;
  kpi: string;
  description: string;
  owner: string;
  targetDate: string;
  status: InitiativeStatus;
  notes: string;
}

export interface StrategyVersion {
  id: string;
  savedAt: string;
  savedBy: string;
  status: KycStatus;
  comment?: string;
}

export interface StrategyData {
  vision: string;
  mission: string;
  segment: SegmentType;
  services: ServiceItem[];
  initiatives: Initiative[];
  status: KycStatus;
  lastUpdated: string;
  approvalComment?: string;
  versions: StrategyVersion[];
}

// Tkxel's 40+ services grouped by competency
export const SERVICE_CATALOG: { competency: string; services: string[] }[] = [
  {
    competency: "Software Engineering",
    services: ["Custom Web Development", "Mobile App Development", "API Development & Integration", "Legacy Modernization", "Full-Stack Development", "Microservices Architecture", "Progressive Web Apps"],
  },
  {
    competency: "Cloud & DevOps",
    services: ["Cloud Migration", "AWS Solutions", "Azure Solutions", "GCP Solutions", "CI/CD Pipeline Setup", "Infrastructure as Code", "Kubernetes & Containers", "Cloud Cost Optimization"],
  },
  {
    competency: "Data & AI",
    services: ["Data Engineering", "Business Intelligence", "Machine Learning", "NLP & Chatbots", "Computer Vision", "Predictive Analytics", "Data Warehouse", "AI Strategy Consulting"],
  },
  {
    competency: "Quality Assurance",
    services: ["Manual Testing", "Test Automation", "Performance Testing", "Security Testing", "Mobile Testing", "API Testing"],
  },
  {
    competency: "Design & UX",
    services: ["UI/UX Design", "Design Systems", "User Research", "Prototyping", "Brand Identity"],
  },
  {
    competency: "Staff Augmentation",
    services: ["Dedicated Teams", "Team Extension", "On-Demand Resources", "Technical Leads", "Project Managers"],
  },
  {
    competency: "Consulting & Advisory",
    services: ["Digital Transformation", "Technology Audit", "Architecture Review", "CTO as a Service", "Product Strategy"],
  },
];

export const TEAM_MEMBERS = [
  "Sarah Mitchell", "James Chen", "Alex Rivera", "David Park",
  "Priya Sharma", "Michael Brown", "Fatima Khan", "Raj Patel",
  "Emily Taylor", "Omar Hassan",
];

export function createDefaultStrategy(segment: SegmentType): StrategyData {
  const services: ServiceItem[] = SERVICE_CATALOG.flatMap(group =>
    group.services.map((name, i) => ({
      id: `svc-${group.competency.replace(/\s/g, "")}-${i}`,
      name,
      competency: group.competency,
      status: "Not Applicable" as ServiceStatus,
    }))
  );

  return {
    vision: "",
    mission: "",
    segment,
    services,
    initiatives: [],
    status: "draft",
    lastUpdated: new Date().toISOString().split("T")[0],
    versions: [],
  };
}

// Mock data for acc-1
export const MOCK_STRATEGY_DATA: Record<string, StrategyData> = {
  "acc-1": {
    vision: "Position Acme Corporation as our flagship FinTech partnership, expanding from cloud migration into AI-driven analytics and mobile platforms within 12 months.",
    mission: "Deliver exceptional value through innovative engineering solutions while deepening executive relationships and achieving 20% ARR growth.",
    segment: "Growth",
    services: SERVICE_CATALOG.flatMap(group =>
      group.services.map((name, i) => ({
        id: `svc-${group.competency.replace(/\s/g, "")}-${i}`,
        name,
        competency: group.competency,
        status: (
          ["Custom Web Development", "API Development & Integration", "Cloud Migration", "AWS Solutions", "CI/CD Pipeline Setup", "Data Engineering", "Test Automation", "UI/UX Design", "Dedicated Teams"].includes(name)
            ? "Active"
            : ["Mobile App Development", "Machine Learning", "Predictive Analytics", "Design Systems", "Digital Transformation"].includes(name)
            ? "Opportunity"
            : "Not Applicable"
        ) as ServiceStatus,
      }))
    ),
    initiatives: [
      { id: "init-1", objective: "Expand into mobile", kpi: "Launch MVP by Q3", description: "Build companion mobile app for Acme's platform", owner: "Sarah Mitchell", targetDate: "2026-09-30", status: "In Progress", notes: "Design phase complete. Dev sprint 2 underway." },
      { id: "init-2", objective: "Deepen exec relationships", kpi: "Monthly CTO sync", description: "Establish regular cadence with C-suite stakeholders", owner: "James Chen", targetDate: "2026-06-30", status: "Complete", notes: "Monthly sync established with CTO and VP Eng." },
      { id: "init-3", objective: "AI analytics pilot", kpi: "POC delivered", description: "Prototype predictive churn model using client data", owner: "Priya Sharma", targetDate: "2026-12-31", status: "Not Started", notes: "" },
    ],
    status: "approved",
    lastUpdated: "2026-03-08",
    approvalComment: "Strong plan. Approved for execution.",
    versions: [
      { id: "sv1", savedAt: "2025-06-01", savedBy: "Sarah Mitchell", status: "approved", comment: "Initial strategy approved." },
      { id: "sv2", savedAt: "2026-01-15", savedBy: "Sarah Mitchell", status: "approved", comment: "Updated with AI pilot initiative." },
    ],
  },
};
