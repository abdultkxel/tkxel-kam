import { Briefcase } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CollapsibleSection } from "../CollapsibleSection";
import type { KycData } from "@/data/kyc";

interface Props {
  kyc: KycData;
  onChange: (partial: Partial<KycData>) => void;
  disabled: boolean;
}

export function EngagementHistorySection({ kyc, onChange, disabled }: Props) {
  return (
    <CollapsibleSection title="Engagement History" icon={<Briefcase className="h-4 w-4" />} step={3}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Start Date</Label>
          <Input type="date" value={kyc.startDate} onChange={e => onChange({ startDate: e.target.value })} disabled={disabled} className="h-9 text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Contract Value</Label>
          <Input value={kyc.contractValue} onChange={e => onChange({ contractValue: e.target.value })} disabled={disabled} placeholder="e.g. $1.2M" className="h-9 text-sm" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Services Engaged</Label>
        <Input value={kyc.servicesEngaged} onChange={e => onChange({ servicesEngaged: e.target.value })} disabled={disabled} placeholder="e.g. Cloud Migration, DevOps" className="h-9 text-sm" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Key Milestones</Label>
        <Textarea value={kyc.keyMilestones} onChange={e => onChange({ keyMilestones: e.target.value })} disabled={disabled} placeholder="Describe key milestones..." rows={3} className="text-sm" />
      </div>
    </CollapsibleSection>
  );
}
