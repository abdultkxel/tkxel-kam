import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { type StrategyFormData, type PlanItem, type ServiceMappingStatus, STRATEGY_SERVICE_LINES } from "@/data/onboarding";

interface Props {
  data: StrategyFormData;
  segment: string;
  onChange: (d: StrategyFormData) => void;
}

export function WizardStep2({ data, segment, onChange }: Props) {
  const set = (key: keyof StrategyFormData, value: any) => onChange({ ...data, [key]: value });

  const setServiceStatus = (service: string, status: ServiceMappingStatus) => {
    onChange({ ...data, serviceMapping: { ...data.serviceMapping, [service]: status } });
  };

  const addPlanItem = () => {
    const item: PlanItem = { id: crypto.randomUUID(), owner: "", dueDate: "", status: "Not Started" };
    set("planItems", [...data.planItems, item]);
  };

  const updatePlanItem = (id: string, field: keyof PlanItem, value: string) => {
    set("planItems", data.planItems.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const removePlanItem = (id: string) => {
    set("planItems", data.planItems.filter(p => p.id !== id));
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-foreground">Strategy & Plan</h2>
        <p className="text-sm text-muted-foreground mt-1">Define the strategic direction for this account.</p>
      </div>

      <div className="rounded-md p-4 border-l-4" style={{ backgroundColor: "#F9FAFB", borderLeftColor: "#9CA3AF" }}>
        <p className="text-sm text-muted-foreground">
          Recommended within <strong>2 weeks</strong> of account creation. If skipped, tasks will be auto-generated.
        </p>
      </div>

      {/* Vision & Mission */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-foreground uppercase tracking-wide mb-2">Section 1 — Vision & Mission</legend>
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Account Vision (12-Month)</Label>
          <Textarea value={data.vision} onChange={e => { if (e.target.value.length <= 500) set("vision", e.target.value); }}
            placeholder="Where do you want this account to be in 12 months?" rows={3} />
          <div className="flex justify-between">
            <p className="text-[13px] text-muted-foreground">Where do you want this account to be in 12 months?</p>
            <span className="text-xs text-muted-foreground">{data.vision.length}/500</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Account Mission Statement</Label>
          <Textarea value={data.mission} onChange={e => { if (e.target.value.length <= 500) set("mission", e.target.value); }}
            placeholder="How will Tkxel deliver value to this account?" rows={3} />
          <div className="flex justify-between">
            <p className="text-[13px] text-muted-foreground">How will Tkxel deliver value to this account?</p>
            <span className="text-xs text-muted-foreground">{data.mission.length}/500</span>
          </div>
        </div>
      </fieldset>

      {/* Segmentation */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-foreground uppercase tracking-wide mb-2">Section 2 — Segmentation</legend>
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Account Segment</Label>
          <Input value={segment} disabled className="bg-[#EFF6FF] max-w-[200px]" />
          <p className="text-[13px] text-muted-foreground">Pre-filled from Step 1</p>
        </div>
      </fieldset>

      {/* Service Mapping */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-foreground uppercase tracking-wide mb-2">Section 3 — Service Mapping</legend>
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-0 text-xs font-semibold text-muted-foreground bg-muted p-3">
            <span>Service Line</span>
            <span className="w-20 text-center">Active</span>
            <span className="w-20 text-center">Potential</span>
            <span className="w-20 text-center">N/A</span>
          </div>
          {STRATEGY_SERVICE_LINES.map(service => (
            <div key={service} className="grid grid-cols-[1fr_auto_auto_auto] gap-0 items-center border-t border-border px-3 py-2">
              <span className="text-sm">{service}</span>
              {(["Active", "Potential", "Not Applicable"] as ServiceMappingStatus[]).map(status => (
                <label key={status} className="w-20 flex justify-center">
                  <input type="radio" name={`svc-${service}`}
                    checked={data.serviceMapping[service] === status}
                    onChange={() => setServiceStatus(service, status)}
                    className="h-4 w-4 accent-primary" />
                </label>
              ))}
            </div>
          ))}
        </div>
      </fieldset>

      {/* Account Plan Builder */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-foreground uppercase tracking-wide mb-2">Section 4 — Account Plan Builder</legend>
        {data.planItems.map((item, idx) => (
          <div key={item.id} className="relative border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Plan Item {idx + 1}</span>
              <button type="button" onClick={() => removePlanItem(item.id)} className="text-destructive hover:text-destructive/80">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Input value={item.owner} onChange={e => updatePlanItem(item.id, "owner", e.target.value)} placeholder="Owner" />
              <Input type="date" value={item.dueDate} onChange={e => updatePlanItem(item.id, "dueDate", e.target.value)} />
              <Select value={item.status} onValueChange={v => updatePlanItem(item.id, "status", v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Not Started">Not Started</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                  <SelectItem value="Complete">Complete</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addPlanItem}>
          <Plus className="h-4 w-4 mr-1" /> Add Plan Item
        </Button>
      </fieldset>
    </div>
  );
}
