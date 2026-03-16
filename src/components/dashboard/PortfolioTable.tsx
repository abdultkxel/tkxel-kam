import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Account, RAG_STYLES } from "@/data/accounts";
import { MOCK_MEETINGS } from "@/data/governance";
import { useNavigate } from "react-router-dom";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";

function getDaysToRenewal(contractEnd: string): number {
  return Math.ceil((new Date(contractEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function getNextGovernanceDate(accountName: string): string | null {
  const now = new Date();
  const upcoming = MOCK_MEETINGS
    .filter(m => m.status === "Planned" && new Date(m.scheduledDate) >= now)
    .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());
  return upcoming.length > 0 ? upcoming[0].scheduledDate : null;
}

// Mock trend: compare overall to a "previous" value
function getTrend(account: Account): "up" | "down" | "stable" {
  const mockPrev: Record<string, number> = {
    "acc-1": 2.3, "acc-2": 1.8, "acc-3": 1.9, "acc-4": 2.6, "acc-5": 1.2,
    "acc-6": 2.0, "acc-7": 1.5, "acc-8": 2.1,
  };
  const prev = mockPrev[account.id] ?? account.health.overall;
  if (account.health.overall > prev + 0.1) return "up";
  if (account.health.overall < prev - 0.1) return "down";
  return "stable";
}

const trendIcons = {
  up: { icon: ArrowUp, className: "text-rag-green" },
  down: { icon: ArrowDown, className: "text-rag-red" },
  stable: { icon: Minus, className: "text-muted-foreground" },
};

const ragLabels = { green: "Green", amber: "Amber", red: "Red" };

export function PortfolioTable({ accounts }: { accounts: Account[] }) {
  const navigate = useNavigate();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Account Portfolio</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">Account</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-center">Trend</TableHead>
              <TableHead className="text-center">Renewal</TableHead>
              <TableHead className="text-center">Next Gov.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map(account => {
              const days = getDaysToRenewal(account.contractEnd);
              const govDate = getNextGovernanceDate(account.name);
              const trend = getTrend(account);
              const TrendIcon = trendIcons[trend].icon;
              const rag = RAG_STYLES[account.riskStatus];

              return (
                <TableRow
                  key={account.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/accounts/${account.id}`)}
                >
                  <TableCell className="pl-6">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{account.name}</span>
                      <Badge variant="secondary" className="text-[10px]">{account.segment}</Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${rag.bg} ${rag.text}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${rag.dot}`} />
                      {ragLabels[account.riskStatus]}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium text-foreground">{account.arr}</TableCell>
                  <TableCell className="text-center">
                    <TrendIcon className={`h-4 w-4 mx-auto ${trendIcons[trend].className}`} />
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={`text-xs font-medium ${
                      days < 0 ? "text-destructive" : days <= 60 ? "text-rag-amber" : "text-muted-foreground"
                    }`}>
                      {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}
                    </span>
                  </TableCell>
                  <TableCell className="text-center text-xs text-muted-foreground">
                    {govDate || "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
