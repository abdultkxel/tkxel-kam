import { Target } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CollapsibleSection } from "../CollapsibleSection";
import type { KycData } from "@/data/kyc";

interface Props {
  kyc: KycData;
  onChange: (partial: Partial<KycData>) => void;
  disabled: boolean;
}

export function StrategicImportanceSection({ kyc, onChange, disabled }: Props) {
  return (
    <CollapsibleSection title="Strategic Importance" icon={<Target className="h-4 w-4" />} step={4}>
      <div className="space-y-1.5">
        <Label className="text-xs">Segment</Label>
        <Select value={kyc.segment} onValueChange={v => onChange({ segment: v })} disabled={disabled}>
          <SelectTrigger className="h-9 text-sm w-full sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Growth">Growth</SelectItem>
            <SelectItem value="Retention">Retention</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Strategic Notes</Label>
        <Textarea value={kyc.strategicNotes} onChange={e => onChange({ strategicNotes: e.target.value })} disabled={disabled} placeholder="Notes on strategic direction..." rows={3} className="text-sm" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Risk Flags</Label>
        <Textarea value={kyc.riskFlags} onChange={e => onChange({ riskFlags: e.target.value })} disabled={disabled} placeholder="Any risk flags to note..." rows={2} className="text-sm" />
      </div>
    </CollapsibleSection>
  );
}
