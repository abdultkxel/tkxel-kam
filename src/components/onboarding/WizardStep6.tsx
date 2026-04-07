import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { type OpportunitiesFormData, type OppRow } from "@/data/onboarding";

interface Props {
  data: OpportunitiesFormData;
  onChange: (d: OpportunitiesFormData) => void;
}

const STAGES = ["Identified", "Qualified", "Proposal Sent", "Negotiation", "Won", "Lost"];
const OPP_TYPES = ["Upsell", "Cross-sell", "New Service", "Expansion"];
const CONFIDENCES = ["Low", "Medium", "High"] as const;

export function WizardStep6({ data, onChange }: Props) {
  const addOpp = () => {
    const opp: OppRow = {
      id: crypto.randomUUID(), name: "", type: "", serviceLine: "",
      estimatedValue: "", confidence: "Medium", stage: "Identified", targetClose: "",
    };
    onChange({ ...data, opportunities: [...data.opportunities, opp] });
  };

  const updateOpp = (id: string, field: keyof OppRow, value: string) => {
    onChange({ ...data, opportunities: data.opportunities.map(o => o.id === id ? { ...o, [field]: value } : o) });
  };

  const removeOpp = (id: string) => {
    onChange({ ...data, opportunities: data.opportunities.filter(o => o.id !== id) });
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-foreground">Opportunities</h2>
        <p className="text-sm text-muted-foreground mt-1">Identify upsell and cross-sell opportunities.</p>
      </div>

      <div className="rounded-md p-4 border-l-4" style={{ backgroundColor: "#F9FAFB", borderLeftColor: "#9CA3AF" }}>
        <p className="text-sm text-muted-foreground">
          Recommended within <strong>1 month</strong> of account creation. If skipped, tasks will be auto-generated.
        </p>
      </div>

      {data.opportunities.map((opp, idx) => (
        <div key={opp.id} className="relative border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Opportunity {idx + 1}</span>
            <button type="button" onClick={() => removeOpp(opp.id)} className="text-destructive hover:text-destructive/80">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input value={opp.name} onChange={e => updateOpp(opp.id, "name", e.target.value)} placeholder="Opportunity Name" />
            <Select value={opp.type} onValueChange={v => updateOpp(opp.id, "type", v)}>
              <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>{OPP_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
            <Input value={opp.serviceLine} onChange={e => updateOpp(opp.id, "serviceLine", e.target.value)} placeholder="Service Line" />
            <Input value={opp.estimatedValue} onChange={e => updateOpp(opp.id, "estimatedValue", e.target.value)} placeholder="Est. Value ($)" />
            <Select value={opp.confidence} onValueChange={v => updateOpp(opp.id, "confidence", v as any)}>
              <SelectTrigger><SelectValue placeholder="Confidence" /></SelectTrigger>
              <SelectContent>{CONFIDENCES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={opp.stage} onValueChange={v => updateOpp(opp.id, "stage", v)}>
              <SelectTrigger><SelectValue placeholder="Stage" /></SelectTrigger>
              <SelectContent>{STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
            <Input type="date" value={opp.targetClose} onChange={e => updateOpp(opp.id, "targetClose", e.target.value)} />
          </div>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={addOpp}>
        <Plus className="h-4 w-4 mr-1" /> Add Opportunity
      </Button>

      {data.opportunities.length === 0 && (
        <div className="text-center py-8 border-2 border-dashed border-border rounded-lg">
          <p className="text-muted-foreground text-sm">No opportunities added yet.</p>
          <p className="text-muted-foreground text-xs mt-1">Click "+ Add Opportunity" to start.</p>
        </div>
      )}
    </div>
  );
}
