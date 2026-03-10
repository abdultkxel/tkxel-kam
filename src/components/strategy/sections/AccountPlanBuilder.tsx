import { useState } from "react";
import { ClipboardList, Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CollapsibleSection } from "@/components/kyc/CollapsibleSection";
import { cn } from "@/lib/utils";
import type { StrategyData, Initiative, InitiativeStatus } from "@/data/strategy";
import { TEAM_MEMBERS } from "@/data/strategy";

interface Props {
  strategy: StrategyData;
  onChange: (partial: Partial<StrategyData>) => void;
  disabled: boolean;
}

const STATUS_OPTIONS: InitiativeStatus[] = ["Not Started", "In Progress", "Complete", "Blocked"];
const STATUS_BADGE: Record<InitiativeStatus, string> = {
  "Not Started": "bg-muted text-muted-foreground",
  "In Progress": "bg-primary/15 text-primary",
  "Complete": "bg-rag-green/15 text-rag-green",
  "Blocked": "bg-rag-red/15 text-rag-red",
};

export function AccountPlanBuilder({ strategy, onChange, disabled }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const addInitiative = () => {
    const newInit: Initiative = {
      id: `init-${Date.now()}`,
      objective: "",
      kpi: "",
      description: "",
      owner: TEAM_MEMBERS[0],
      targetDate: "",
      status: "Not Started",
      notes: "",
    };
    onChange({ initiatives: [...strategy.initiatives, newInit] });
    setExpandedId(newInit.id);
  };

  const updateInit = (id: string, patch: Partial<Initiative>) => {
    onChange({ initiatives: strategy.initiatives.map(i => i.id === id ? { ...i, ...patch } : i) });
  };

  const removeInit = (id: string) => {
    onChange({ initiatives: strategy.initiatives.filter(i => i.id !== id) });
    if (expandedId === id) setExpandedId(null);
  };

  return (
    <CollapsibleSection title="Account Plan Builder" icon={<ClipboardList className="h-4 w-4" />} step={4}>
      {strategy.initiatives.length === 0 && (
        <p className="text-sm text-muted-foreground">No initiatives added yet.</p>
      )}

      <div className="space-y-2">
        {strategy.initiatives.map((init) => {
          const isOpen = expandedId === init.id;
          return (
            <div key={init.id} className="border border-border rounded-lg overflow-hidden">
              {/* Row header */}
              <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/20">
                <button type="button" onClick={() => setExpandedId(isOpen ? null : init.id)} className="flex-shrink-0 text-muted-foreground hover:text-foreground">
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-6 gap-2 items-center min-w-0">
                  <div className="sm:col-span-2 truncate">
                    <Input
                      value={init.objective}
                      onChange={e => updateInit(init.id, { objective: e.target.value })}
                      disabled={disabled}
                      placeholder="Objective"
                      className="h-8 text-sm border-0 bg-transparent p-0 focus-visible:ring-0 font-medium"
                    />
                  </div>
                  <div className="hidden sm:block truncate text-xs text-muted-foreground">{init.owner || "—"}</div>
                  <div className="hidden sm:block text-xs text-muted-foreground">{init.targetDate || "—"}</div>
                  <Badge className={cn("text-[10px] w-fit", STATUS_BADGE[init.status])}>{init.status}</Badge>
                  <div className="flex justify-end">
                    {!disabled && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-rag-red" onClick={() => removeInit(init.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Expanded details */}
              {isOpen && (
                <div className="px-4 py-3 border-t border-border space-y-3 bg-background">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <span className="text-[11px] text-muted-foreground">Objective</span>
                      <Input value={init.objective} onChange={e => updateInit(init.id, { objective: e.target.value })} disabled={disabled} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[11px] text-muted-foreground">KPI</span>
                      <Input value={init.kpi} onChange={e => updateInit(init.id, { kpi: e.target.value })} disabled={disabled} className="h-8 text-sm" placeholder="How will success be measured?" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">Initiative Description</span>
                    <Input value={init.description} onChange={e => updateInit(init.id, { description: e.target.value })} disabled={disabled} className="h-8 text-sm" placeholder="Describe the initiative..." />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <span className="text-[11px] text-muted-foreground">Owner</span>
                      <Select value={init.owner} onValueChange={v => updateInit(init.id, { owner: v })} disabled={disabled}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>{TEAM_MEMBERS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[11px] text-muted-foreground">Target Date</span>
                      <Input type="date" value={init.targetDate} onChange={e => updateInit(init.id, { targetDate: e.target.value })} disabled={disabled} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[11px] text-muted-foreground">Status</span>
                      <Select value={init.status} onValueChange={v => updateInit(init.id, { status: v as InitiativeStatus })} disabled={disabled}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>{STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">Notes</span>
                    <Textarea value={init.notes} onChange={e => updateInit(init.id, { notes: e.target.value })} disabled={disabled} placeholder="Additional notes..." rows={2} className="text-sm" />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!disabled && (
        <Button variant="outline" size="sm" onClick={addInitiative}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Initiative
        </Button>
      )}
    </CollapsibleSection>
  );
}
