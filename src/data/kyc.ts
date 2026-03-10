export type KycStatus = "draft" | "pending_review" | "approved" | "rejected";
export type Seniority = "C-Level" | "Director" | "Manager";
export type ContactType = "Sponsor" | "Influencer" | "Detractor" | "Champion";

export interface KycContact {
  id: string;
  name: string;
  title: string;
  seniority: Seniority;
  relationshipOwner: string;
  contactType: ContactType;
}

export interface KycDocument {
  id: string;
  name: string;
  uploadedAt: string;
  size: string;
}

export interface KycVersion {
  id: string;
  submittedAt: string;
  submittedBy: string;
  status: KycStatus;
  comment?: string;
}

export interface KycData {
  // Client Overview
  companyName: string;
  industry: string;
  hqLocation: string;
  website: string;
  linkedin: string;
  foundedYear: string;
  revenueRange: string;
  employeeCount: string;
  // Key Contacts
  contacts: KycContact[];
  // Engagement History
  startDate: string;
  contractValue: string;
  servicesEngaged: string;
  keyMilestones: string;
  // Strategic Importance
  segment: string;
  strategicNotes: string;
  riskFlags: string;
  // Documents
  documents: KycDocument[];
  // Meta
  status: KycStatus;
  lastUpdated: string;
  approvalComment?: string;
  versions: KycVersion[];
}

export function createDefaultKyc(accountName: string, industry: string, segment: string): KycData {
  return {
    companyName: accountName,
    industry,
    hqLocation: "",
    website: "",
    linkedin: "",
    foundedYear: "",
    revenueRange: "",
    employeeCount: "",
    contacts: [],
    startDate: "",
    contractValue: "",
    servicesEngaged: "",
    keyMilestones: "",
    segment,
    strategicNotes: "",
    riskFlags: "",
    documents: [],
    status: "draft",
    lastUpdated: new Date().toISOString().split("T")[0],
    versions: [],
  };
}

// Mock KYC data for some accounts
export const MOCK_KYC_DATA: Record<string, KycData> = {
  "acc-1": {
    companyName: "Acme Corporation",
    industry: "FinTech",
    hqLocation: "San Francisco, CA",
    website: "https://acme.com",
    linkedin: "https://linkedin.com/company/acme",
    foundedYear: "2015",
    revenueRange: "$50M–$100M",
    employeeCount: "500",
    contacts: [
      { id: "kc1", name: "John Smith", title: "VP Engineering", seniority: "Director", relationshipOwner: "Sarah Mitchell", contactType: "Sponsor" },
      { id: "kc2", name: "Lisa Chen", title: "CTO", seniority: "C-Level", relationshipOwner: "James Chen", contactType: "Champion" },
    ],
    startDate: "2025-01-15",
    contractValue: "$1.2M",
    servicesEngaged: "Cloud Migration, Staff Augmentation, DevOps",
    keyMilestones: "Phase 1 completed Jan 2026. Phase 2 kicked off Feb 2026.",
    segment: "Growth",
    strategicNotes: "High potential for expansion into mobile and AI services.",
    riskFlags: "",
    documents: [
      { id: "d1", name: "SOW_Phase2.pdf", uploadedAt: "2026-02-01", size: "2.4 MB" },
      { id: "d2", name: "NDA_Signed.pdf", uploadedAt: "2025-01-10", size: "450 KB" },
    ],
    status: "approved",
    lastUpdated: "2026-03-08",
    approvalComment: "KYC looks complete. Approved.",
    versions: [
      { id: "v1", submittedAt: "2025-01-20", submittedBy: "Sarah Mitchell", status: "approved", comment: "Initial KYC approved." },
      { id: "v2", submittedAt: "2026-02-15", submittedBy: "Sarah Mitchell", status: "approved", comment: "Updated with Phase 2 contacts." },
    ],
  },
  "acc-2": {
    companyName: "Beta Industries",
    industry: "Healthcare",
    hqLocation: "Boston, MA",
    website: "https://beta-ind.com",
    linkedin: "https://linkedin.com/company/beta-industries",
    foundedYear: "2008",
    revenueRange: "$100M–$500M",
    employeeCount: "2000",
    contacts: [
      { id: "kc3", name: "Mark Johnson", title: "Director of IT", seniority: "Director", relationshipOwner: "Sarah Mitchell", contactType: "Influencer" },
    ],
    startDate: "2024-06-01",
    contractValue: "$800K",
    servicesEngaged: "Custom Software Development, QA",
    keyMilestones: "MVP delivered Dec 2024. Renewal discussion started.",
    segment: "Retention",
    strategicNotes: "At risk — need to address delivery concerns before renewal.",
    riskFlags: "Missed Q4 delivery milestones. Client escalation pending.",
    documents: [],
    status: "pending_review",
    lastUpdated: "2026-03-06",
    versions: [
      { id: "v3", submittedAt: "2024-07-01", submittedBy: "Sarah Mitchell", status: "approved", comment: "Initial setup." },
    ],
  },
};
