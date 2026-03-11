import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertItem } from "@/data/dashboard";
import { AlertCircle, FileWarning, Clock } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

const iconMap = { health: AlertCircle, contract: FileWarning, overdue: Clock };

export function AlertsPanel({ alerts }: { alerts: AlertItem[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-rag-red" /> Alerts
          <Badge variant="destructive" className="text-[10px] ml-auto">{alerts.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[240px]">
          <div className="px-6 pb-4 space-y-2">
            {alerts.length === 0 && <p className="text-sm text-muted-foreground py-4">No active alerts</p>}
            {alerts.map((a, i) => {
              const Icon = iconMap[a.type];
              return (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
                  <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${a.severity === "red" ? "text-rag-red" : "text-rag-amber"}`} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">{a.account}</p>
                    <p className="text-xs text-muted-foreground truncate">{a.message}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
