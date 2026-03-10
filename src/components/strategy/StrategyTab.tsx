import { useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { MOCK_STRATEGY_DATA, createDefaultStrategy, type StrategyData } from "@/data/strategy";
import type { KycStatus } from "@/data/kyc";
import type { Account } from "@/data/accounts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Save, Send, CheckCircle, XCircle, Unlock, FileDown, History, Clock, FileText, Table } from "lucide-react";
import { toast } from "sonner";
import { VisionMissionSection } from "./sections/VisionMissionSection";
import { SegmentationSection } from "./sections/SegmentationSection";
import { ServiceMappingSection } from "./sections/ServiceMappingSection";
import { AccountPlanBuilder } from "./sections/AccountPlanBuilder";
import { VersionHistoryModal } from "@/components/kyc/VersionHistoryModal";

const STATUS_STYLES: Record<KycStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  pending_review: { label: "Pending Review", className: "bg-rag-amber/15 text-rag-amber" },
  approved: { label: "Approved", className: "bg-rag-green/15 text-rag-green" },
  rejected: { label: "Rejected", className: "bg-rag-red/15 text-rag-red" },
};

interface Props {
  account: Account;
}

export function StrategyTab({ account }: Props) {
  const { user } = useAuth();
  const [strategy, setStrategy] = useState<StrategyData>(() => {
    return MOCK_STRATEGY_DATA[account.id] ?? createDefaultStrategy(account.segment);
  });
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState("");

  const isLocked = strategy.status === "approved";
  const isAM = user?.role === "am";
  const isReviewer = user?.role === "leadership" || user?.role === "admin";

  const updateStrategy = useCallback((partial: Partial<StrategyData>) => {
    if (isLocked) return;
    setStrategy(prev => ({ ...prev, ...partial, lastUpdated: new Date().toISOString().split("T")[0] }));
  }, [isLocked]);

  const handleSaveDraft = () => {
    updateStrategy({ status: "draft" });
    toast.success("Strategy saved as draft.");
  };

  const handleSubmit = () => {
    setStrategy(prev => ({
      ...prev,
      status: "pending_review",
      lastUpdated: new Date().toISOString().split("T")[0],
      versions: [...prev.versions, {
        id: `sv${Date.now()}`,
        savedAt: new Date().toISOString().split("T")[0],
        savedBy: user?.name ?? "Unknown",
        status: "pending_review" as KycStatus,
      }],
    }));
    toast.success("Strategy submitted for approval.");
  };

  const handleApprove = () => {
    setStrategy(prev => ({ ...prev, status: "approved", approvalComment: "Approved by reviewer.", lastUpdated: new Date().toISOString().split("T")[0] }));
    toast.success("Strategy approved.");
  };

  const handleReject = () => {
    setStrategy(prev => ({ ...prev, status: "rejected", approvalComment: rejectComment || "Rejected — please revise.", lastUpdated: new Date().toISOString().split("T")[0] }));
    setRejectComment("");
    toast.error("Strategy rejected.");
  };

  const handleRequestReopen = () => {
    setStrategy(prev => ({ ...prev, status: "draft", lastUpdated: new Date().toISOString().split("T")[0] }));
    toast.success("Strategy reopened for editing.");
  };

  const handleExportPdf = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const initRows = strategy.initiatives.map(i =>
      `<tr><td>${i.objective}</td><td>${i.kpi}</td><td>${i.description}</td><td>${i.owner}</td><td>${i.targetDate}</td><td>${i.status}</td></tr>`
    ).join("");
    const activeServices = strategy.services.filter(s => s.status === "Active").map(s => s.name).join(", ") || "None";
    const oppServices = strategy.services.filter(s => s.status === "Opportunity").map(s => s.name).join(", ") || "None";
    w.document.write(`<!DOCTYPE html><html><head><title>Strategy — ${account.name}</title>
      <style>body{font-family:Inter,sans-serif;padding:40px;color:#1a1a2e;max-width:900px;margin:0 auto}
      h1{color:#1E3A5F;font-size:22px}h2{color:#1E3A5F;font-size:15px;margin-top:24px;border-bottom:1px solid #e2e8f0;padding-bottom:6px}
      table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #e2e8f0;padding:6px 10px;font-size:12px;text-align:left}
      th{background:#f4f6f9;font-weight:600}.meta{color:#64748b;font-size:13px}p{font-size:13px;line-height:1.6}</style></head><body>
      <h1>Account Strategy — ${account.name}</h1><p class="meta">${STATUS_STYLES[strategy.status].label} · Updated ${strategy.lastUpdated}</p>
      <h2>Vision (12-Month)</h2><p>${strategy.vision || "—"}</p>
      <h2>Mission Statement</h2><p>${strategy.mission || "—"}</p>
      <h2>Segment</h2><p>${strategy.segment}</p>
      <h2>Active Services</h2><p>${activeServices}</p>
      <h2>Opportunity Services</h2><p>${oppServices}</p>
      <h2>Account Plan</h2>
      <table><tr><th>Objective</th><th>KPI</th><th>Description</th><th>Owner</th><th>Target</th><th>Status</th></tr>${initRows || "<tr><td colspan='6'>No initiatives</td></tr>"}</table>
      <script>window.print()</script></body></html>`);
    w.document.close();
  };

  const handleExportCsv = () => {
    const headers = "Objective,KPI,Description,Owner,Target Date,Status,Notes";
    const rows = strategy.initiatives.map(i =>
      `"${i.objective}","${i.kpi}","${i.description}","${i.owner}","${i.targetDate}","${i.status}","${i.notes}"`
    ).join("\n");
    const blob = new Blob([headers + "\n" + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `strategy-${account.name.replace(/\s/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported.");
  };

  const handleExportWord = () => {
    const content = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'>
      <head><meta charset='utf-8'><title>Strategy — ${account.name}</title>
      <style>body{font-family:Calibri,sans-serif;padding:20px}h1{color:#1E3A5F}h2{color:#1E3A5F;border-bottom:1px solid #ccc}
      table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px;font-size:11pt}th{background:#f0f0f0}</style></head><body>
      <h1>Account Strategy — ${account.name}</h1>
      <h2>Vision</h2><p>${strategy.vision || "—"}</p>
      <h2>Mission</h2><p>${strategy.mission || "—"}</p>
      <h2>Segment</h2><p>${strategy.segment}</p>
      <h2>Initiatives</h2>
      <table><tr><th>Objective</th><th>KPI</th><th>Description</th><th>Owner</th><th>Target</th><th>Status</th></tr>
      ${strategy.initiatives.map(i => `<tr><td>${i.objective}</td><td>${i.kpi}</td><td>${i.description}</td><td>${i.owner}</td><td>${i.targetDate}</td><td>${i.status}</td></tr>`).join("")}
      </table></body></html>`;
    const blob = new Blob([content], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `strategy-${account.name.replace(/\s/g, "-").toLowerCase()}.doc`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Word document exported.");
  };

  const statusStyle = STATUS_STYLES[strategy.status];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 p-4 rounded-lg bg-muted/50 border border-border">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="text-base font-semibold text-foreground">Strategy & Plan</h3>
          <Badge className={`text-xs font-semibold ${statusStyle.className}`}>{statusStyle.label}</Badge>
          <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Updated {strategy.lastUpdated}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setVersionModalOpen(true)}>
            <History className="h-3.5 w-3.5 mr-1" /> Past Plans
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPdf}>
            <FileDown className="h-3.5 w-3.5 mr-1" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportWord}>
            <FileText className="h-3.5 w-3.5 mr-1" /> Word
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCsv}>
            <Table className="h-3.5 w-3.5 mr-1" /> CSV
          </Button>
        </div>
      </div>

      {/* Approval Comment */}
      {strategy.approvalComment && (strategy.status === "approved" || strategy.status === "rejected") && (
        <div className={`p-3 rounded-lg text-sm border ${strategy.status === "approved" ? "bg-rag-green/5 border-rag-green/20 text-rag-green" : "bg-rag-red/5 border-rag-red/20 text-rag-red"}`}>
          <strong>{strategy.status === "approved" ? "Approval Note:" : "Rejection Note:"}</strong> {strategy.approvalComment}
        </div>
      )}

      {/* Sections */}
      <VisionMissionSection strategy={strategy} onChange={updateStrategy} disabled={isLocked} />
      <SegmentationSection strategy={strategy} onChange={updateStrategy} disabled={isLocked} />
      <ServiceMappingSection strategy={strategy} onChange={updateStrategy} disabled={isLocked} />
      <AccountPlanBuilder strategy={strategy} onChange={updateStrategy} disabled={isLocked} />

      {/* Actions */}
      <div className="flex items-center justify-between flex-wrap gap-3 pt-2 border-t border-border">
        <div className="flex items-center gap-2 flex-wrap">
          {!isLocked && (
            <>
              <Button variant="outline" size="sm" onClick={handleSaveDraft}>
                <Save className="h-3.5 w-3.5 mr-1" /> Save Draft
              </Button>
              {(isAM || !isReviewer) && strategy.status !== "pending_review" && (
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
        {isReviewer && strategy.status === "pending_review" && (
          <div className="flex items-center gap-2 flex-wrap">
            <input className="text-sm border border-input rounded-md px-3 py-1.5 bg-background placeholder:text-muted-foreground" placeholder="Rejection comment..." value={rejectComment} onChange={e => setRejectComment(e.target.value)} />
            <Button size="sm" variant="outline" className="text-rag-red border-rag-red/30 hover:bg-rag-red/10" onClick={handleReject}>
              <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
            </Button>
            <Button size="sm" className="bg-rag-green hover:bg-rag-green/90 text-white" onClick={handleApprove}>
              <CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve
            </Button>
          </div>
        )}
      </div>

      <VersionHistoryModal open={versionModalOpen} onClose={() => setVersionModalOpen(false)} versions={strategy.versions.map(v => ({ id: v.id, submittedAt: v.savedAt, submittedBy: v.savedBy, status: v.status, comment: v.comment }))} />
    </div>
  );
}
