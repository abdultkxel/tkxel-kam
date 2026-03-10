import { useState } from "react";
import { Grid3X3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CollapsibleSection } from "@/components/kyc/CollapsibleSection";
import { cn } from "@/lib/utils";
import type { StrategyData, ServiceItem, ServiceStatus } from "@/data/strategy";
import { SERVICE_CATALOG } from "@/data/strategy";

interface Props {
  strategy: StrategyData;
  onChange: (partial: Partial<StrategyData>) => void;
  disabled: boolean;
}

const STATUS_CYCLE: ServiceStatus[] = ["Not Applicable", "Active", "Opportunity"];
const STATUS_STYLES: Record<ServiceStatus, string> = {
  "Active": "bg-rag-green/15 text-rag-green border-rag-green/30",
  "Opportunity": "bg-rag-amber/15 text-rag-amber border-rag-amber/30",
  "Not Applicable": "bg-muted text-muted-foreground border-border",
};

export function ServiceMappingSection({ strategy, onChange, disabled }: Props) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const totalServices = strategy.services.length;
  const activeCount = strategy.services.filter(s => s.status === "Active").length;
  const oppCount = strategy.services.filter(s => s.status === "Opportunity").length;
  const coveragePct = totalServices > 0 ? Math.round(((activeCount + oppCount) / totalServices) * 100) : 0;

  const cycleStatus = (svc: ServiceItem) => {
    if (disabled) return;
    const currentIdx = STATUS_CYCLE.indexOf(svc.status);
    const nextStatus = STATUS_CYCLE[(currentIdx + 1) % STATUS_CYCLE.length];
    const updated = strategy.services.map(s => s.id === svc.id ? { ...s, status: nextStatus } : s);
    onChange({ services: updated });
  };

  const grouped = SERVICE_CATALOG.map(cat => ({
    competency: cat.competency,
    services: strategy.services.filter(s => s.competency === cat.competency),
  }));

  return (
    <CollapsibleSection title="Service Mapping" icon={<Grid3X3 className="h-4 w-4" />} step={3} defaultOpen={false}>
      {/* Coverage bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Service Coverage</span>
          <span className="font-semibold text-foreground">{coveragePct}%</span>
        </div>
        <Progress value={coveragePct} className="h-2" />
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rag-green" /> {activeCount} Active</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rag-amber" /> {oppCount} Opportunity</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted-foreground" /> {totalServices - activeCount - oppCount} N/A</span>
        </div>
      </div>

      {/* Competency groups */}
      <div className="space-y-2 mt-3">
        {grouped.map(group => {
          const isOpen = expandedGroup === group.competency;
          const groupActive = group.services.filter(s => s.status === "Active").length;
          const groupOpp = group.services.filter(s => s.status === "Opportunity").length;

          return (
            <div key={group.competency} className="border border-border rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedGroup(isOpen ? null : group.competency)}
                className="flex items-center justify-between w-full px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
              >
                <span className="text-sm font-medium text-foreground">{group.competency}</span>
                <div className="flex items-center gap-2">
                  {groupActive > 0 && <Badge variant="outline" className="text-[10px] bg-rag-green/10 text-rag-green border-rag-green/30">{groupActive} active</Badge>}
                  {groupOpp > 0 && <Badge variant="outline" className="text-[10px] bg-rag-amber/10 text-rag-amber border-rag-amber/30">{groupOpp} opp</Badge>}
                  <span className="text-xs text-muted-foreground">{group.services.length} services</span>
                </div>
              </button>
              {isOpen && (
                <div className="border-t border-border px-3 py-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {group.services.map(svc => (
                    <button
                      key={svc.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => cycleStatus(svc)}
                      className={cn(
                        "flex items-center justify-between px-3 py-2 rounded-md border text-xs transition-colors",
                        STATUS_STYLES[svc.status],
                        !disabled && "cursor-pointer hover:opacity-80"
                      )}
                    >
                      <span>{svc.name}</span>
                      <span className="font-medium">{svc.status}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground mt-2">Click a service to cycle: Not Applicable → Active → Opportunity</p>
    </CollapsibleSection>
  );
}
