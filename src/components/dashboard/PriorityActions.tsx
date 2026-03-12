import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Zap, AlertCircle, FileWarning, Clock, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Account, getRagColor } from "@/data/accounts";
import { MOCK_MEETINGS, getDueDateStatus } from "@/data/governance";

interface PriorityAction {
  account: string;
  accountId: string;
  issue: string;
  actionLabel: string;
  severity: "critical" | "high" | "medium";
  module: string;
  icon: React.ElementType;
}

function derivePriorityActions(accounts: Account[]): PriorityAction[] {
  const actions: PriorityAction[] = [];

  for (const a of accounts) {
    // Critical health scores
    if (a.health.overall < 1.5) {
      actions.push({
        account: a.name, accountId: a.id,
        issue: `Health score critical (${a.health.overall.toFixed(1)}/3.0)`,
        actionLabel: "Review Health", severity: "critical", module: "health", icon: AlertCircle,
      });
    }

    // Expiring contracts
    const daysToEnd = Math.ceil((new Date(a.contractEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysToEnd < 0) {
      actions.push({
        account: a.name, accountId: a.id,
        issue: `Contract expired ${Math.abs(daysToEnd)} days ago`,
        actionLabel: "Renew Contract", severity: "critical", module: "kyc", icon: FileWarning,
      });
    } else if (daysToEnd <= 60) {
      actions.push({
        account: a.name, accountId: a.id,
        issue: `Contract expires in ${daysToEnd} days`,
        actionLabel: "Plan Renewal", severity: "high", module: "kyc", icon: FileWarning,
      });
    }
  }

  // Overdue governance
  for (const m of MOCK_MEETINGS) {
    for (const ai of m.actionItems) {
      if (ai.status !== "Complete" && getDueDateStatus(ai.dueDate) === "overdue") {
        actions.push({
          account: m.type, accountId: "",
          issue: `"${ai.task}" overdue (${ai.owner})`,
          actionLabel: "Resolve", severity: "critical", module: "governance", icon: Clock,
        });
      }
    }
  }

  // Sort: critical first, then high, then medium
  const severityOrder = { critical: 0, high: 1, medium: 2 };
  return actions.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]).slice(0, 5);
}

const severityStyles = {
  critical: "bg-destructive/10 text-destructive border-destructive/20",
  high: "bg-rag-amber/10 text-rag-amber border-rag-amber/20",
  medium: "bg-info/10 text-info border-info/20",
};

export function PriorityActions({ accounts }: { accounts: Account[] }) {
  const navigate = useNavigate();
  const actions = derivePriorityActions(accounts);

  if (actions.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="h-4 w-4 text-rag-amber" /> Priority Actions
          <Badge variant="outline" className="ml-auto text-[10px]">{actions.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {actions.map((action, i) => {
            const Icon = action.icon;
            return (
              <div key={i} className="flex items-center gap-3 px-6 py-3">
                <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  action.severity === "critical" ? "bg-destructive/10" : action.severity === "high" ? "bg-rag-amber/10" : "bg-info/10"
                }`}>
                  <Icon className={`h-4 w-4 ${
                    action.severity === "critical" ? "text-destructive" : action.severity === "high" ? "text-rag-amber" : "text-info"
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{action.account}</p>
                  <p className="text-xs text-muted-foreground truncate">{action.issue}</p>
                </div>
                <Badge variant="outline" className={`text-[10px] shrink-0 ${severityStyles[action.severity]}`}>
                  {action.severity}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs shrink-0"
                  onClick={() => {
                    if (action.accountId) {
                      navigate(`/accounts/${action.accountId}`);
                    }
                  }}
                >
                  {action.actionLabel}
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
