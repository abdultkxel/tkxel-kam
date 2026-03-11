import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronDown, Plus, Trash2, AlertTriangle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Escalation, EscalationSeverity, EscalationStatus } from "@/data/governance";
import { getDueDateStatus } from "@/data/governance";

interface Props {
  escalations: Escalation[];
  onUpdate: (escalations: Escalation[]) => void;
}

const SEVERITY_STYLES: Record<EscalationSeverity, string> = {
  High: "bg-rag-red/10 text-rag-red border-rag-red/20",
  Medium: "bg-rag-amber/10 text-rag-amber border-rag-amber/20",
  Low: "bg-info/10 text-info border-info/20",
};

const ESC_STATUS_STYLES: Record<EscalationStatus, string> = {
  Open: "bg-rag-red/10 text-rag-red",
  "In Progress": "bg-rag-amber/10 text-rag-amber",
  Resolved: "bg-rag-green/10 text-rag-green",
};

export function EscalationCard({ escalations, onUpdate }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sectionOpen, setSectionOpen] = useState(true);
  const openCount = escalations.filter(e => e.status !== "Resolved").length;

  const addEscalation = () => {
    const newE: Escalation = {
      id: `e-${Date.now()}`, title: "", raisedBy: "",
      dateRaised: new Date().toISOString().split("T")[0], severity: "Medium",
      description: "", resolutionNotes: "", status: "Open", resolutionDate: "",
    };
    onUpdate([...escalations, newE]);
    setExpandedId(newE.id);
  };

  const update = (id: string, patch: Partial<Escalation>) => {
    onUpdate(escalations.map(e => e.id === id ? { ...e, ...patch } : e));
  };

  const remove = (id: string) => {
    onUpdate(escalations.filter(e => e.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  return (
    <Collapsible open={sectionOpen} onOpenChange={setSectionOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> Escalations
                {openCount > 0 && <Badge className="text-[10px] bg-rag-red/10 text-rag-red">{openCount} Open</Badge>}
              </CardTitle>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", sectionOpen && "rotate-180")} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-3 pt-0">
            {escalations.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No escalations.</p>}
            {escalations.map(esc => (
              <div key={esc.id} className="border border-border rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedId(expandedId === esc.id ? null : esc.id)}
                  className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors text-left"
                >
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="text-sm font-medium text-foreground">{esc.title || "Untitled"}</span>
                    <Badge className={cn("text-[10px] border", SEVERITY_STYLES[esc.severity])}>{esc.severity}</Badge>
                    <Badge className={cn("text-[10px]", ESC_STATUS_STYLES[esc.status])}>{esc.status}</Badge>
                    <span className="text-xs text-muted-foreground">{esc.dateRaised}</span>
                  </div>
                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform flex-shrink-0", expandedId === esc.id && "rotate-180")} />
                </button>

                {expandedId === esc.id && (
                  <div className="p-4 border-t border-border space-y-3 bg-muted/10">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Title</label>
                        <Input value={esc.title} onChange={e => update(esc.id, { title: e.target.value })} placeholder="Escalation title..." />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Raised By</label>
                        <Input value={esc.raisedBy} onChange={e => update(esc.id, { raisedBy: e.target.value })} placeholder="Name..." />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Date Raised</label>
                        <Input type="date" value={esc.dateRaised} onChange={e => update(esc.id, { dateRaised: e.target.value })} />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Severity</label>
                        <Select value={esc.severity} onValueChange={v => update(esc.id, { severity: v as EscalationSeverity })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="High">High</SelectItem>
                            <SelectItem value="Medium">Medium</SelectItem>
                            <SelectItem value="Low">Low</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Description</label>
                      <Textarea value={esc.description} onChange={e => update(esc.id, { description: e.target.value })} rows={2} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Status</label>
                        <Select value={esc.status} onValueChange={v => update(esc.id, { status: v as EscalationStatus })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Open">Open</SelectItem>
                            <SelectItem value="In Progress">In Progress</SelectItem>
                            <SelectItem value="Resolved">Resolved</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Resolution Date</label>
                        <Input type="date" value={esc.resolutionDate} onChange={e => update(esc.id, { resolutionDate: e.target.value })} />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Resolution Notes</label>
                      <Textarea value={esc.resolutionNotes} onChange={e => update(esc.id, { resolutionNotes: e.target.value })} rows={2} placeholder="How was this resolved..." />
                    </div>
                    <div className="flex justify-end">
                      <Button variant="ghost" size="sm" className="text-xs text-destructive hover:text-destructive" onClick={() => remove(esc.id)}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addEscalation} className="w-full text-xs gap-1">
              <Plus className="h-3.5 w-3.5" /> Add Escalation
            </Button>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
