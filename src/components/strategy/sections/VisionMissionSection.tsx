import { Eye } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CollapsibleSection } from "@/components/kyc/CollapsibleSection";
import type { StrategyData } from "@/data/strategy";

interface Props {
  strategy: StrategyData;
  onChange: (partial: Partial<StrategyData>) => void;
  disabled: boolean;
}

export function VisionMissionSection({ strategy, onChange, disabled }: Props) {
  return (
    <CollapsibleSection title="Vision & Mission" icon={<Eye className="h-4 w-4" />} step={1}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Account Vision (12-Month)</Label>
            <span className="text-[11px] text-muted-foreground">{strategy.vision.length}/500</span>
          </div>
          <Textarea
            value={strategy.vision}
            onChange={e => { if (e.target.value.length <= 500) onChange({ vision: e.target.value }); }}
            disabled={disabled}
            placeholder="Describe the 12-month vision for this account..."
            rows={4}
            className="text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Account Mission Statement</Label>
            <span className="text-[11px] text-muted-foreground">{strategy.mission.length}/500</span>
          </div>
          <Textarea
            value={strategy.mission}
            onChange={e => { if (e.target.value.length <= 500) onChange({ mission: e.target.value }); }}
            disabled={disabled}
            placeholder="Define the mission statement for this account engagement..."
            rows={4}
            className="text-sm"
          />
        </div>
      </div>
    </CollapsibleSection>
  );
}
