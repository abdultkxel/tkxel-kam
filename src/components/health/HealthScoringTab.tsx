import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { Account } from "@/data/accounts";
import { RAG_STYLES, getRagColor } from "@/data/accounts";
import {
  DEFAULT_RELATIONSHIP_CRITERIA, DEFAULT_CONTRACT_CRITERIA,
  DEFAULT_RESOURCE_CRITERIA, DEFAULT_CSAT_CRITERIA,
  calcScore, interpretRag03, interpretCsat,
  generateMockHistory, type ScoringCriterion, type CsatCriterion,
} from "@/data/healthScoring";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, Users, FileText, Cpu, Star, Settings, Save, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { ScoringCard } from "./ScoringCard";
import { CsatScoringCard } from "./CsatScoringCard";
import { HealthTrendChart } from "./HealthTrendChart";
import { WeightSettingsPanel } from "./WeightSettingsPanel";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface Props {
  account: Account;
}

export function HealthScoringTab({ account }: Props) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  // Weight configs (admin-adjustable)
  const [relCriteria, setRelCriteria] = useState(DEFAULT_RELATIONSHIP_CRITERIA);
  const [conCriteria, setConCriteria] = useState(DEFAULT_CONTRACT_CRITERIA);
  const [resCriteria, setResCriteria] = useState(DEFAULT_RESOURCE_CRITERIA);
  const [csatCriteria, setCsatCriteria] = useState(DEFAULT_CSAT_CRITERIA);

  // Current selections
  const [relSelections, setRelSelections] = useState<Record<string, number>>({});
  const [conSelections, setConSelections] = useState<Record<string, number>>({});
  const [resSelections, setResSelections] = useState<Record<string, number>>({});
  const [csatSelections, setCsatSelections] = useState<Record<string, number>>({});

  // Settings panel
  const [showSettings, setShowSettings] = useState(false);

  // Historical data
  const history = useMemo(() => generateMockHistory(account.id), [account.id]);

  // Calculate current scores
  const relScore = calcScore(relCriteria, relSelections);
  const conScore = calcScore(conCriteria, conSelections);
  const resScore = calcScore(resCriteria, resSelections);
  const csatScore = calcScore(csatCriteria, csatSelections);

  // Normalize CSAT (1-5) to 0-3 scale for overall
  const csatNorm = csatScore > 0 ? ((csatScore - 1) / 4) * 3 : 0;
  const hasAnySelection = Object.keys(relSelections).length > 0 || Object.keys(conSelections).length > 0 || Object.keys(resSelections).length > 0 || Object.keys(csatSelections).length > 0;
  const overallScore = hasAnySelection ? +((relScore + conScore + resScore + csatNorm) / 4).toFixed(2) : account.health.overall;

  const overallRag = getRagColor(overallScore);
  const relRag = interpretRag03(hasAnySelection ? relScore : account.health.relationship);
  const conRag = interpretRag03(hasAnySelection ? conScore : account.health.contract);
  const resRag = interpretRag03(hasAnySelection ? resScore : account.health.resource);
  const csatInterp = interpretCsat(csatScore || 3.5);

  const handleSaveScores = () => {
    toast.success("Health scores saved successfully.", { description: `Overall: ${overallScore.toFixed(2)} · ${new Date().toLocaleDateString()}` });
  };

  return (
    <div className="space-y-5">
      {/* Overall Health Summary */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Overall Health Score</p>
              <div className="flex items-center gap-3 mt-1">
                <span className={`text-4xl font-bold ${RAG_STYLES[overallRag].text}`}>
                  {overallScore.toFixed(2)}
                </span>
                <span className="text-lg text-muted-foreground">/3</span>
                <Badge className={`${RAG_STYLES[overallRag].bg} ${RAG_STYLES[overallRag].text} text-xs font-semibold`}>
                  {overallRag.charAt(0).toUpperCase() + overallRag.slice(1)}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {[
                { label: "Relationship", score: hasAnySelection ? relScore : account.health.relationship, icon: Users, rag: relRag.color },
                { label: "Contract", score: hasAnySelection ? conScore : account.health.contract, icon: FileText, rag: conRag.color },
                { label: "Resource", score: hasAnySelection ? resScore : account.health.resource, icon: Cpu, rag: resRag.color },
                { label: "CSAT", score: csatScore || 3.5, icon: Star, rag: csatInterp.color, suffix: "/5" },
              ].map(item => (
                <div key={item.label} className="text-center">
                  <div className={`h-10 w-10 rounded-lg ${RAG_STYLES[item.rag].bg} flex items-center justify-center mx-auto`}>
                    <item.icon className={`h-5 w-5 ${RAG_STYLES[item.rag].text}`} />
                  </div>
                  <p className={`text-lg font-bold mt-1 ${RAG_STYLES[item.rag].text}`}>{item.score.toFixed(1)}</p>
                  <p className="text-[10px] text-muted-foreground">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Historical Trend Chart */}
      <HealthTrendChart history={history} />

      {/* Admin Settings */}
      {isAdmin && (
        <Collapsible open={showSettings} onOpenChange={setShowSettings}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="w-full justify-between">
              <span className="flex items-center gap-2"><Settings className="h-3.5 w-3.5" /> Weight Settings (Admin)</span>
              <ChevronDown className={cn("h-4 w-4 transition-transform", showSettings && "rotate-180")} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <WeightSettingsPanel
              relCriteria={relCriteria} onRelChange={setRelCriteria}
              conCriteria={conCriteria} onConChange={setConCriteria}
              resCriteria={resCriteria} onResChange={setResCriteria}
              csatCriteria={csatCriteria} onCsatChange={setCsatCriteria}
            />
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Scoring Frameworks */}
      <ScoringCard
        title="Relationship Health"
        icon={<Users className="h-4 w-4" />}
        criteria={relCriteria}
        selections={relSelections}
        onSelect={setRelSelections}
        score={hasAnySelection ? relScore : account.health.relationship}
        interpret={interpretRag03}
        scale="0–3"
      />
      <ScoringCard
        title="Contract Health"
        icon={<FileText className="h-4 w-4" />}
        criteria={conCriteria}
        selections={conSelections}
        onSelect={setConSelections}
        score={hasAnySelection ? conScore : account.health.contract}
        interpret={interpretRag03}
        scale="0–3"
      />
      <ScoringCard
        title="Resource Health"
        icon={<Cpu className="h-4 w-4" />}
        criteria={resCriteria}
        selections={resSelections}
        onSelect={setResSelections}
        score={hasAnySelection ? resScore : account.health.resource}
        interpret={interpretRag03}
        scale="0–3"
      />
      <CsatScoringCard
        criteria={csatCriteria}
        selections={csatSelections}
        onSelect={setCsatSelections}
        score={csatScore || 3.5}
      />

      {/* Save */}
      <div className="flex justify-end pt-2 border-t border-border">
        <Button size="sm" onClick={handleSaveScores}>
          <Save className="h-3.5 w-3.5 mr-1" /> Save Scores
        </Button>
      </div>
    </div>
  );
}
