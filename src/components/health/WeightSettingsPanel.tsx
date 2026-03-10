import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { ScoringCriterion, CsatCriterion } from "@/data/healthScoring";

interface Props {
  relCriteria: ScoringCriterion[];
  onRelChange: (c: ScoringCriterion[]) => void;
  conCriteria: ScoringCriterion[];
  onConChange: (c: ScoringCriterion[]) => void;
  resCriteria: ScoringCriterion[];
  onResChange: (c: ScoringCriterion[]) => void;
  csatCriteria: CsatCriterion[];
  onCsatChange: (c: CsatCriterion[]) => void;
  riskCriteria: ScoringCriterion[];
  onRiskChange: (c: ScoringCriterion[]) => void;
}

function WeightGroup({ title, items, onChange }: { title: string; items: { id: string; name: string; weight: number }[]; onChange: (id: string, weight: number) => void }) {
  const total = items.reduce((s, i) => s + i.weight, 0);
  const isValid = Math.abs(total - 100) < 1;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h5 className="text-xs font-medium text-foreground">{title}</h5>
        <span className={`text-[10px] font-semibold ${isValid ? "text-rag-green" : "text-rag-red"}`}>
          Total: {total}%{!isValid && " (must equal 100%)"}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {items.map(item => (
          <div key={item.id} className="flex items-center gap-2">
            <Label className="text-[11px] text-muted-foreground flex-1 truncate">{item.name}</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={item.weight}
              onChange={e => onChange(item.id, parseInt(e.target.value) || 0)}
              className="h-7 w-16 text-xs text-center"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function WeightSettingsPanel({ relCriteria, onRelChange, conCriteria, onConChange, resCriteria, onResChange, csatCriteria, onCsatChange }: Props) {
  const updateWeight = <T extends { id: string; weight: number }>(items: T[], setter: (items: T[]) => void) => (id: string, weight: number) => {
    setter(items.map(i => i.id === id ? { ...i, weight } : i));
  };

  return (
    <Card className="mt-2">
      <CardContent className="pt-4 space-y-4">
        <p className="text-xs text-muted-foreground">Adjust the weighting percentages for each scoring criterion. Weights within each framework must total 100%.</p>
        <WeightGroup title="Relationship Health" items={relCriteria} onChange={updateWeight(relCriteria, onRelChange)} />
        <WeightGroup title="Contract Health" items={conCriteria} onChange={updateWeight(conCriteria, onConChange)} />
        <WeightGroup title="Resource Health" items={resCriteria} onChange={updateWeight(resCriteria, onResChange)} />
        <WeightGroup title="CSAT" items={csatCriteria} onChange={updateWeight(csatCriteria, onCsatChange)} />
      </CardContent>
    </Card>
  );
}
