import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { RAG_STYLES } from "@/data/accounts";
import { ChevronDown, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { SERVICE_LINE_COMPETENCIES } from "@/data/healthScoring";
import { Progress } from "@/components/ui/progress";

interface Props {
  selections: Record<string, boolean>;
  onSelect: (selections: Record<string, boolean>) => void;
}

export function ServiceLineMappingCard({ selections, onSelect }: Props) {
  const [open, setOpen] = useState(true);
  const total = SERVICE_LINE_COMPETENCIES.length;
  const active = Object.values(selections).filter(Boolean).length;
  const coverage = total > 0 ? Math.round((active / total) * 100) : 0;

  const ragColor = coverage >= 50 ? "green" : coverage >= 25 ? "amber" : "red";

  const handleToggle = (competency: string, checked: boolean) => {
    onSelect({ ...selections, [competency]: checked });
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border border-border rounded-lg overflow-hidden">
      <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-3 bg-muted/30 hover:bg-muted/60 transition-colors text-left">
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Layers className="h-4 w-4" /> Service Line Mapping
        </span>
        <div className="flex items-center gap-2">
          <span className={`text-lg font-bold ${RAG_STYLES[ragColor].text}`}>{coverage}%</span>
          <Badge className={`text-[10px] ${RAG_STYLES[ragColor].bg} ${RAG_STYLES[ragColor].text}`}>
            {active}/{total} Active
          </Badge>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="p-4 space-y-3">
          {/* Coverage bar */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">Service Coverage</span>
              <span className={`font-bold ${RAG_STYLES[ragColor].text}`}>{coverage}%</span>
            </div>
            <Progress value={coverage} className="h-2" />
          </div>

          {/* Checklist grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 pt-2">
            {SERVICE_LINE_COMPETENCIES.map(comp => (
              <label
                key={comp}
                className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/40 cursor-pointer transition-colors"
              >
                <Checkbox
                  checked={!!selections[comp]}
                  onCheckedChange={(checked) => handleToggle(comp, !!checked)}
                />
                <span className={cn("text-xs", selections[comp] ? "text-foreground font-medium" : "text-muted-foreground")}>
                  {comp}
                </span>
              </label>
            ))}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
