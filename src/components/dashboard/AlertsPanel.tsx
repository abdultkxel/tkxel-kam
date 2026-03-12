import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertItem } from "@/data/dashboard";
import { AlertCircle, FileWarning, Clock, ExternalLink } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavigate } from "react-router-dom";
import { MOCK_ACCOUNTS } from "@/data/accounts";

const iconMap = { health: AlertCircle, contract: FileWarning, overdue: Clock };

export function AlertsPanel({ alerts }: { alerts: AlertItem[] }) {
  const navigate = useNavigate();

  // Sort: red first, then amber
  const sorted = [...alerts].sort((a, b) => {
    if (a.severity === "red" && b.severity !== "red") return -1;
    if (a.severity !== "red" && b.severity === "red") return 1;
    return 0;
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-rag-red" /> Alerts
          <Badge variant="destructive" className="text-[10px] ml-auto">{alerts.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[280px]">
          <div className="px-6 pb-4 space-y-1">
            {sorted.length === 0 && <p className="text-sm text-muted-foreground py-4">No active alerts</p>}
            {sorted.map((a, i) => {
              const Icon = iconMap[a.type];
              const account = MOCK_ACCOUNTS.find(acc => acc.name === a.account);
              return (
                <div key={i} className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
                  <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${a.severity === "red" ? "text-rag-red" : "text-rag-amber"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-medium text-foreground">{a.account}</p>
                      {account && (
                        <span className="text-[10px] text-muted-foreground">{account.arr}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{a.message}</p>
                  </div>
                  {account && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => navigate(`/accounts/${account.id}`)}
                    >
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
