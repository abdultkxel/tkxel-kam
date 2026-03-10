import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";
import type { KycVersion, KycStatus } from "@/data/kyc";

const STATUS_LABELS: Record<KycStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  pending_review: { label: "Submitted", className: "bg-rag-amber/15 text-rag-amber" },
  approved: { label: "Approved", className: "bg-rag-green/15 text-rag-green" },
  rejected: { label: "Rejected", className: "bg-rag-red/15 text-rag-red" },
};

interface Props {
  open: boolean;
  onClose: () => void;
  versions: KycVersion[];
}

export function VersionHistoryModal({ open, onClose, versions }: Props) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Version History</DialogTitle>
        </DialogHeader>
        {versions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No previous versions.</p>
        ) : (
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {[...versions].reverse().map((v) => {
              const style = STATUS_LABELS[v.status];
              return (
                <div key={v.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Clock className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{v.submittedBy}</span>
                      <Badge className={`text-[10px] ${style.className}`}>{style.label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{v.submittedAt}</p>
                    {v.comment && <p className="text-xs text-muted-foreground mt-1 italic">"{v.comment}"</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
