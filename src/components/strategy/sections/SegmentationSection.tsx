import { Layers } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CollapsibleSection } from "@/components/kyc/CollapsibleSection";
import { cn } from "@/lib/utils";
import { Info } from "lucide-react";
import type { StrategyData, SegmentType } from "@/data/strategy";

interface Props {
  strategy: StrategyData;
  onChange: (partial: Partial<StrategyData>) => void;
  disabled: boolean;
}

const SEGMENTS: { value: SegmentType; label: string; tooltip: string }[] = [
  { value: "Growth", label: "Growth", tooltip: "Accounts targeted for expansion — upselling new services, increasing ARR, and deepening engagement across business units." },
  { value: "Retention", label: "Retention", tooltip: "Accounts focused on stability — ensuring service quality, managing risks, and securing renewals with minimal churn." },
];

export function SegmentationSection({ strategy, onChange, disabled }: Props) {
  return (
    <CollapsibleSection title="Segmentation" icon={<Layers className="h-4 w-4" />} step={2}>
      <Label className="text-xs">Account Segment</Label>
      <div className="flex gap-3 mt-2">
        {SEGMENTS.map(seg => (
          <button
            key={seg.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange({ segment: seg.value })}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors",
              strategy.segment === seg.value
                ? "border-primary bg-primary/5 text-primary"
                : "border-border bg-background text-muted-foreground hover:bg-muted/50",
              disabled && "opacity-60 cursor-not-allowed"
            )}
          >
            <span className={cn(
              "h-3 w-3 rounded-full border-2 flex items-center justify-center",
              strategy.segment === seg.value ? "border-primary" : "border-muted-foreground"
            )}>
              {strategy.segment === seg.value && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
            </span>
            {seg.label}
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs">
                {seg.tooltip}
              </TooltipContent>
            </Tooltip>
          </button>
        ))}
      </div>
    </CollapsibleSection>
  );
}
