import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays } from "lucide-react";

interface GovernanceItem { date: string; title: string; type: string }

export function GovernanceUpcoming({ items }: { items: GovernanceItem[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" /> Upcoming Governance
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {items.length === 0 && <p className="text-sm text-muted-foreground">No upcoming activities</p>}
          {items.map((item, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground truncate">{item.title}</p>
              </div>
              <Badge variant="outline" className="text-[10px] ml-3 flex-shrink-0">{item.date}</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
