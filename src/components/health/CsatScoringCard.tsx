import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { RAG_STYLES } from "@/data/accounts";
import { ChevronDown, Info, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { interpretCsat, type CsatCriterion } from "@/data/healthScoring";

interface Props {
  criteria: CsatCriterion[];
  selections: Record<string, number>;
  onSelect: (selections: Record<string, number>) => void;
  score: number;
}

export function CsatScoringCard({ criteria, selections, onSelect, score }: Props) {
  const [open, setOpen] = useState(true);
  const result = interpretCsat(score);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border border-border rounded-lg overflow-hidden">
      <CollapsibleTrigger className="flex items-center justify-between w-full px-4 py-3 bg-muted/30 hover:bg-muted/60 transition-colors text-left">
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Star className="h-4 w-4" /> CSAT Score
        </span>
        <div className="flex items-center gap-2">
          <span className={`text-lg font-bold ${RAG_STYLES[result.color].text}`}>{score.toFixed(2)}</span>
          <Badge className={`text-[10px] ${RAG_STYLES[result.color].bg} ${RAG_STYLES[result.color].text}`}>
            {result.label}
          </Badge>
          <span className="text-[10px] text-muted-foreground">(1–5)</span>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="p-4 space-y-3">
          {criteria.map(c => (
            <div key={c.id} className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 w-48 flex-shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help flex-shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs text-xs">{c.tooltip}</TooltipContent>
                </Tooltip>
                <span className="text-sm text-foreground">{c.name}</span>
                <span className="text-[10px] text-muted-foreground">({c.weight}%)</span>
              </div>
              <Select
                value={selections[c.id]?.toString()}
                onValueChange={v => onSelect({ ...selections, [c.id]: parseFloat(v) })}
              >
                <SelectTrigger className="h-8 text-sm flex-1 min-w-[200px]">
                  <SelectValue placeholder="Select score..." />
                </SelectTrigger>
                <SelectContent>
                  {[5, 4, 3, 2, 1].map(v => (
                    <SelectItem key={v} value={v.toString()}>
                      <span className="font-medium">{v}</span> — {v === 5 ? "Excellent" : v === 4 ? "Good" : v === 3 ? "Average" : v === 2 ? "Below Average" : "Poor"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
          <div className="pt-2 border-t border-border">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">Weighted Score</span>
              <span className={`font-bold ${RAG_STYLES[result.color].text}`}>{score.toFixed(2)} / 5</span>
            </div>
            <div className="h-2 rounded-full bg-border overflow-hidden">
              <div className={`h-full rounded-full ${RAG_STYLES[result.color].dot}`} style={{ width: `${(score / 5) * 100}%` }} />
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
