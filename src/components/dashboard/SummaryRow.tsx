import { Card, CardContent } from "@/components/ui/card";
import { Building2, AlertCircle, AlertTriangle, CalendarCheck } from "lucide-react";
import { Account } from "@/data/accounts";
import { MOCK_MEETINGS } from "@/data/governance";

function parseARR(arr: string): number {
  const num = parseFloat(arr.replace(/[$,]/g, ""));
  if (arr.includes("M")) return num * 1000000;
  if (arr.includes("K")) return num * 1000;
  return num;
}

function formatCurrency(val: number): string {
  if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `$${(val / 1000).toFixed(0)}K`;
  return `$${val}`;
}

interface Props {
  accounts: Account[];
  isAM: boolean;
}

export function SummaryRow({ accounts, isAM }: Props) {
  const totalARR = accounts.reduce((sum, a) => sum + parseARR(a.arr), 0);
  
  // At Risk
  const atRiskAccounts = accounts.filter(a => a.riskStatus === "red");
  const arrAtRisk = atRiskAccounts.reduce((sum, a) => sum + parseARR(a.arr), 0);
  
  // Needs Attention (amber)
  const attentionAccounts = accounts.filter(a => a.riskStatus === "amber");
  const lowestCSAT = attentionAccounts.length > 0 
    ? attentionAccounts.reduce((min, a) => Math.min(min, a.health.overall), 3)
    : null;

  // Next QBR
  const now = new Date();
  const nextQBR = MOCK_MEETINGS
    .filter(m => m.type === "QBR" && m.status === "Planned" && new Date(m.scheduledDate) >= now)
    .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime())[0];
  const daysToQBR = nextQBR 
    ? Math.ceil((new Date(nextQBR.scheduledDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {/* My Accounts */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {isAM ? "My Accounts" : "Total Accounts"}
              </p>
              <p className="text-3xl font-bold text-foreground mt-1">{accounts.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatCurrency(totalARR)} portfolio ARR
              </p>
            </div>
            <Building2 className="h-7 w-7 text-primary opacity-70" />
          </div>
        </CardContent>
      </Card>

      {/* At Risk */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">At Risk</p>
              <p className="text-3xl font-bold text-foreground mt-1">{formatCurrency(arrAtRisk)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {atRiskAccounts.length > 0 
                  ? atRiskAccounts.map(a => a.name).join(", ")
                  : "No accounts at risk"}
              </p>
            </div>
            <AlertCircle className="h-7 w-7 text-rag-red opacity-70" />
          </div>
        </CardContent>
      </Card>

      {/* Needs Attention */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Needs Attention</p>
              <p className="text-3xl font-bold text-foreground mt-1">{attentionAccounts.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {attentionAccounts.length > 0 
                  ? `Lowest health: ${lowestCSAT?.toFixed(1)}/3.0`
                  : "All healthy"}
              </p>
            </div>
            <AlertTriangle className="h-7 w-7 text-rag-amber opacity-70" />
          </div>
        </CardContent>
      </Card>

      {/* Next QBR */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Next QBR</p>
              <p className="text-3xl font-bold text-foreground mt-1">
                {daysToQBR !== null ? `${daysToQBR}d` : "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {nextQBR ? nextQBR.agenda.slice(0, 40) : "None scheduled"}
              </p>
            </div>
            <CalendarCheck className="h-7 w-7 text-info opacity-70" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
