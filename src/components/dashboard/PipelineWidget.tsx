import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useOpportunities } from "@/contexts/OpportunitiesContext";
import { MOCK_ACCOUNTS } from "@/data/accounts";
import { isOpenStage, formatCurrency, STAGE_ORDER } from "@/data/opportunities";
import { differenceInDays } from "date-fns";
import { TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function PipelineWidget() {
  const { opportunities } = useOpportunities();
  const navigate = useNavigate();
  const today = new Date("2026-03-12");

  const open = opportunities.filter(o => isOpenStage(o.stage));
  const totalPipeline = open.reduce((s, o) => s + o.estimatedValue, 0);

  const activeStages = STAGE_ORDER.filter(s => isOpenStage(s));
  const stageData = activeStages.map(stage => {
    const stageOpps = open.filter(o => o.stage === stage);
    const val = stageOpps.reduce((s, o) => s + o.estimatedValue, 0);
    return { stage, value: val, count: stageOpps.length };
  }).filter(s => s.value > 0);

  const maxVal = Math.max(...stageData.map(s => s.value), 1);

  const top3 = [...open].sort((a, b) => b.estimatedValue - a.estimatedValue).slice(0, 3);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" /> My Pipeline
        </CardTitle>
        <button onClick={() => navigate("/opportunities")} className="text-xs text-primary hover:underline">View all →</button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-3xl font-bold text-foreground">{formatCurrency(totalPipeline)}</p>
          <p className="text-xs text-muted-foreground">{open.length} open opportunities</p>
        </div>

        {/* Stage funnel */}
        <div className="space-y-2">
          {stageData.map(s => (
            <div key={s.stage} className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground w-20 text-right truncate">{s.stage}</span>
              <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary/70 rounded-full" style={{ width: `${(s.value / maxVal) * 100}%` }} />
              </div>
              <span className="text-[11px] font-medium text-foreground w-14 text-right">{formatCurrency(s.value)}</span>
            </div>
          ))}
        </div>

        {/* Top 3 */}
        {top3.length > 0 && (
          <div className="border-t border-border pt-3 space-y-2">
            {top3.map(opp => {
              const acc = MOCK_ACCOUNTS.find(a => a.id === opp.accountId);
              const days = differenceInDays(new Date(opp.targetClose), today);
              return (
                <div key={opp.id} className="flex items-center justify-between text-sm">
                  <div className="truncate flex-1">
                    <span className="font-medium text-foreground">{acc?.name}</span>
                    <span className="text-muted-foreground"> · {opp.serviceLine}</span>
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <span className="font-semibold">{formatCurrency(opp.estimatedValue)}</span>
                    <Badge variant="outline" className="text-[9px]">{days > 0 ? `${days}d` : "Overdue"}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
