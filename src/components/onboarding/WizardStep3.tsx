import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  type HealthFormData,
  RELATIONSHIP_CRITERIA, CONTRACT_CRITERIA, RESOURCE_CRITERIA,
  CSAT_CRITERIA, RISK_CRITERIA, HEALTH_SERVICE_LINES,
  calcWeightedScore,
} from "@/data/onboarding";

interface Props {
  data: HealthFormData;
  onChange: (d: HealthFormData) => void;
}

export function WizardStep3({ data, onChange }: Props) {
  const setScore = (section: keyof Pick<HealthFormData, "relationship" | "contract" | "resource" | "csat" | "risk">, id: string, val: number) => {
    onChange({ ...data, [section]: { ...data[section], [id]: val } });
  };

  const toggleService = (service: string) => {
    const list = data.serviceLineChecklist;
    onChange({
      ...data,
      serviceLineChecklist: list.includes(service) ? list.filter(s => s !== service) : [...list, service],
    });
  };

  const relScore = calcWeightedScore(RELATIONSHIP_CRITERIA, data.relationship);
  const conScore = calcWeightedScore(CONTRACT_CRITERIA, data.contract);
  const resScore = calcWeightedScore(RESOURCE_CRITERIA, data.resource);
  const csatScore = calcWeightedScore(CSAT_CRITERIA, data.csat, 5);
  const riskScore = calcWeightedScore(RISK_CRITERIA, data.risk);
  const overallHealth = relScore && conScore && resScore ? +((relScore + conScore + resScore) / 3).toFixed(2) : 0;

  const scoreOptions13 = [
    { value: "1", label: "1 — Low" },
    { value: "2", label: "2 — Medium" },
    { value: "3", label: "3 — High" },
  ];

  const scoreOptions15 = [
    { value: "1", label: "1 — Very Poor" },
    { value: "2", label: "2 — Poor" },
    { value: "3", label: "3 — Average" },
    { value: "4", label: "4 — Good" },
    { value: "5", label: "5 — Excellent" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-foreground">Health Scores</h2>
        <p className="text-sm text-muted-foreground mt-1">Capture initial health indicators.</p>
      </div>

      <div className="rounded-md p-4 border-l-4" style={{ backgroundColor: "#F9FAFB", borderLeftColor: "#9CA3AF" }}>
        <p className="text-sm text-muted-foreground">
          Recommended within <strong>3 weeks</strong> of account creation. If skipped, tasks will be auto-generated.
        </p>
      </div>

      {/* Overall Health Preview */}
      {overallHealth > 0 && (
        <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
          <div className="text-center">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Overall Health Score (Live)</span>
            <div className="text-3xl font-bold text-primary mt-1">{overallHealth}</div>
            <span className="text-xs text-muted-foreground">Average of Relationship ({relScore}), Contract ({conScore}), Resource ({resScore})</span>
          </div>
        </div>
      )}

      {/* Relationship Health */}
      <ScoringSection title="Relationship Health" criteria={RELATIONSHIP_CRITERIA} selections={data.relationship}
        onSelect={(id, val) => setScore("relationship", id, val)} options={scoreOptions13} score={relScore} scale="1–3" />

      {/* Contract Health */}
      <ScoringSection title="Contract Health" criteria={CONTRACT_CRITERIA} selections={data.contract}
        onSelect={(id, val) => setScore("contract", id, val)} options={scoreOptions13} score={conScore} scale="1–3" />

      {/* Resource Health */}
      <ScoringSection title="Resource Health" criteria={RESOURCE_CRITERIA} selections={data.resource}
        onSelect={(id, val) => setScore("resource", id, val)} options={scoreOptions13} score={resScore} scale="1–3" />

      {/* CSAT */}
      <ScoringSection title="CSAT Score" criteria={CSAT_CRITERIA} selections={data.csat}
        onSelect={(id, val) => setScore("csat", id, val)} options={scoreOptions15} score={csatScore} scale="1–5" />

      {/* Risk Score */}
      <ScoringSection title="Risk Score" criteria={RISK_CRITERIA} selections={data.risk}
        onSelect={(id, val) => setScore("risk", id, val)} options={scoreOptions13} score={riskScore} scale="1–3" />

      {/* Service Line Mapping */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-foreground uppercase tracking-wide mb-2">Service Line Mapping</legend>
        <div className="grid grid-cols-2 gap-2">
          {HEALTH_SERVICE_LINES.map(service => (
            <label key={service} className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer">
              <Checkbox checked={data.serviceLineChecklist.includes(service)}
                onCheckedChange={() => toggleService(service)} />
              <span className="text-sm">{service}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function ScoringSection({ title, criteria, selections, onSelect, options, score, scale }: {
  title: string;
  criteria: { id: string; name: string; weight: number }[];
  selections: Record<string, number>;
  onSelect: (id: string, val: number) => void;
  options: { value: string; label: string }[];
  score: number;
  scale: string;
}) {
  return (
    <fieldset className="space-y-4">
      <div className="flex items-center justify-between">
        <legend className="text-sm font-semibold text-foreground uppercase tracking-wide">{title}</legend>
        {score > 0 && (
          <span className="text-sm font-medium text-primary">Weighted: {score.toFixed(2)} / {scale === "1–5" ? "5" : "3"}</span>
        )}
      </div>
      <div className="space-y-3">
        {criteria.map(c => (
          <div key={c.id} className="flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <Label className="text-sm">{c.name}</Label>
              <span className="text-xs text-muted-foreground ml-2">({c.weight}%)</span>
            </div>
            <Select value={selections[c.id]?.toString() || ""} onValueChange={v => onSelect(c.id, parseInt(v))}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder={`Score (${scale})`} /></SelectTrigger>
              <SelectContent>
                {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </fieldset>
  );
}
