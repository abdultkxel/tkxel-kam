import { useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { MOCK_KYC_DATA, createDefaultKyc, type KycData, type KycStatus } from "@/data/kyc";
import { type Account } from "@/data/accounts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Save, Send, CheckCircle, XCircle, Unlock, FileDown, History, Clock } from "lucide-react";
import { toast } from "sonner";
import { ClientOverviewSection } from "./sections/ClientOverviewSection";
import { KeyContactsSection } from "./sections/KeyContactsSection";
import { EngagementHistorySection } from "./sections/EngagementHistorySection";
import { StrategicImportanceSection } from "./sections/StrategicImportanceSection";
import { DocumentsSection } from "./sections/DocumentsSection";
import { VersionHistoryModal } from "./VersionHistoryModal";

const STATUS_STYLES: Record<KycStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  pending_review: { label: "Pending Review", className: "bg-rag-amber/15 text-rag-amber" },
  approved: { label: "Approved", className: "bg-rag-green/15 text-rag-green" },
  rejected: { label: "Rejected", className: "bg-rag-red/15 text-rag-red" },
};

interface KycTabProps {
  account: Account;
}

export function KycTab({ account }: KycTabProps) {
  const { user } = useAuth();
  const [kyc, setKyc] = useState<KycData>(() => {
    return MOCK_KYC_DATA[account.id] ?? createDefaultKyc(account.name, account.industry, account.segment);
  });
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState("");

  const isLocked = kyc.status === "approved";
  const isAM = user?.role === "am";
  const isReviewer = user?.role === "leadership" || user?.role === "admin";

  const updateKyc = useCallback((partial: Partial<KycData>) => {
    if (isLocked) return;
    setKyc(prev => ({ ...prev, ...partial, lastUpdated: new Date().toISOString().split("T")[0] }));
  }, [isLocked]);

  const handleSaveDraft = () => {
    updateKyc({ status: "draft" });
    toast.success("KYC saved as draft.");
  };

  const handleSubmit = () => {
    setKyc(prev => ({
      ...prev,
      status: "pending_review",
      lastUpdated: new Date().toISOString().split("T")[0],
      versions: [...prev.versions, {
        id: `v${Date.now()}`,
        submittedAt: new Date().toISOString().split("T")[0],
        submittedBy: user?.name ?? "Unknown",
        status: "pending_review",
      }],
    }));
    toast.success("KYC submitted for approval.");
  };

  const handleApprove = () => {
    setKyc(prev => ({
      ...prev,
      status: "approved",
      approvalComment: "Approved by reviewer.",
      lastUpdated: new Date().toISOString().split("T")[0],
    }));
    toast.success("KYC approved.");
  };

  const handleReject = () => {
    setKyc(prev => ({
      ...prev,
      status: "rejected",
      approvalComment: rejectComment || "Rejected — please revise.",
      lastUpdated: new Date().toISOString().split("T")[0],
    }));
    setRejectComment("");
    toast.error("KYC rejected.");
  };

  const handleRequestReopen = () => {
    setKyc(prev => ({ ...prev, status: "draft", lastUpdated: new Date().toISOString().split("T")[0] }));
    toast.success("KYC reopened for editing.");
  };

  const handleExportPdf = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const contactRows = kyc.contacts.map(c =>
      `<tr><td>${c.name}</td><td>${c.title}</td><td>${c.seniority}</td><td>${c.relationshipOwner}</td><td>${c.contactType}</td></tr>`
    ).join("");
    w.document.write(`<!DOCTYPE html><html><head><title>KYC — ${kyc.companyName}</title>
      <style>body{font-family:Inter,sans-serif;padding:40px;color:#1a1a2e;max-width:800px;margin:0 auto}
      h1{color:#1E3A5F;font-size:22px;margin-bottom:4px}h2{color:#1E3A5F;font-size:15px;margin-top:24px;border-bottom:1px solid #e2e8f0;padding-bottom:6px}
      table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #e2e8f0;padding:6px 10px;font-size:13px;text-align:left}
      th{background:#f4f6f9;font-weight:600}.badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600}
      .meta{color:#64748b;font-size:13px;margin-top:2px}p{font-size:13px;line-height:1.6}</style></head><body>
      <h1>${kyc.companyName}</h1><p class="meta">Status: ${STATUS_STYLES[kyc.status].label} · Last Updated: ${kyc.lastUpdated}</p>
      <h2>Client Overview</h2>
      <table><tr><th>Industry</th><td>${kyc.industry}</td><th>HQ</th><td>${kyc.hqLocation}</td></tr>
      <tr><th>Website</th><td>${kyc.website}</td><th>LinkedIn</th><td>${kyc.linkedin}</td></tr>
      <tr><th>Founded</th><td>${kyc.foundedYear}</td><th>Revenue</th><td>${kyc.revenueRange}</td></tr>
      <tr><th>Employees</th><td>${kyc.employeeCount}</td><th></th><td></td></tr></table>
      <h2>Key Contacts</h2>
      <table><tr><th>Name</th><th>Title</th><th>Seniority</th><th>Relationship Owner</th><th>Type</th></tr>${contactRows || "<tr><td colspan='5'>No contacts</td></tr>"}</table>
      <h2>Engagement History</h2>
      <table><tr><th>Start Date</th><td>${kyc.startDate}</td><th>Contract Value</th><td>${kyc.contractValue}</td></tr></table>
      <p><strong>Services:</strong> ${kyc.servicesEngaged}</p><p><strong>Milestones:</strong> ${kyc.keyMilestones}</p>
      <h2>Strategic Importance</h2>
      <p><strong>Segment:</strong> ${kyc.segment}</p><p><strong>Notes:</strong> ${kyc.strategicNotes}</p><p><strong>Risk Flags:</strong> ${kyc.riskFlags || "None"}</p>
      <h2>Documents</h2>
      ${kyc.documents.length ? `<table><tr><th>Name</th><th>Uploaded</th><th>Size</th></tr>${kyc.documents.map(d => `<tr><td>${d.name}</td><td>${d.uploadedAt}</td><td>${d.size}</td></tr>`).join("")}</table>` : "<p>No documents uploaded.</p>"}
      <script>window.print()</script></body></html>`);
    w.document.close();
  };

  const statusStyle = STATUS_STYLES[kyc.status];

  return (
    <div className="space-y-4">
      {/* Header Bar */}
      <div className="flex items-center justify-between flex-wrap gap-3 p-4 rounded-lg bg-muted/50 border border-border">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="text-base font-semibold text-foreground">Know Your Customer</h3>
          <Badge className={`text-xs font-semibold ${statusStyle.className}`}>{statusStyle.label}</Badge>
          <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Updated {kyc.lastUpdated}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setVersionModalOpen(true)}>
            <History className="h-3.5 w-3.5 mr-1" /> Versions
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPdf}>
            <FileDown className="h-3.5 w-3.5 mr-1" /> Export PDF
          </Button>
        </div>
      </div>

      {/* Approval Comment */}
      {kyc.approvalComment && (kyc.status === "approved" || kyc.status === "rejected") && (
        <div className={`p-3 rounded-lg text-sm border ${kyc.status === "approved" ? "bg-rag-green/5 border-rag-green/20 text-rag-green" : "bg-rag-red/5 border-rag-red/20 text-rag-red"}`}>
          <strong>{kyc.status === "approved" ? "Approval Note:" : "Rejection Note:"}</strong> {kyc.approvalComment}
        </div>
      )}

      {/* Form Sections */}
      <ClientOverviewSection kyc={kyc} onChange={updateKyc} disabled={isLocked} />
      <KeyContactsSection kyc={kyc} onChange={updateKyc} disabled={isLocked} />
      <EngagementHistorySection kyc={kyc} onChange={updateKyc} disabled={isLocked} />
      <StrategicImportanceSection kyc={kyc} onChange={updateKyc} disabled={isLocked} />
      <DocumentsSection kyc={kyc} onChange={updateKyc} disabled={isLocked} />

      {/* Action Buttons */}
      <div className="flex items-center justify-between flex-wrap gap-3 pt-2 border-t border-border">
        <div className="flex items-center gap-2 flex-wrap">
          {!isLocked && (
            <>
              <Button variant="outline" size="sm" onClick={handleSaveDraft}>
                <Save className="h-3.5 w-3.5 mr-1" /> Save Draft
              </Button>
              {(isAM || !isReviewer) && kyc.status !== "pending_review" && (
                <Button size="sm" onClick={handleSubmit}>
                  <Send className="h-3.5 w-3.5 mr-1" /> Submit for Approval
                </Button>
              )}
            </>
          )}
          {isLocked && isAM && (
            <Button variant="outline" size="sm" onClick={handleRequestReopen}>
              <Unlock className="h-3.5 w-3.5 mr-1" /> Request Re-open
            </Button>
          )}
        </div>

        {isReviewer && kyc.status === "pending_review" && (
          <div className="flex items-center gap-2 flex-wrap">
            <input
              className="text-sm border border-input rounded-md px-3 py-1.5 bg-background placeholder:text-muted-foreground"
              placeholder="Rejection comment..."
              value={rejectComment}
              onChange={e => setRejectComment(e.target.value)}
            />
            <Button size="sm" variant="outline" className="text-rag-red border-rag-red/30 hover:bg-rag-red/10" onClick={handleReject}>
              <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
            </Button>
            <Button size="sm" className="bg-rag-green hover:bg-rag-green/90 text-white" onClick={handleApprove}>
              <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve
            </Button>
          </div>
        )}
      </div>

      <VersionHistoryModal open={versionModalOpen} onClose={() => setVersionModalOpen(false)} versions={kyc.versions} />
    </div>
  );
}
