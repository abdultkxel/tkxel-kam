import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays, Shield, Presentation, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface GovernanceItem { date: string; title: string; type: string }

const typeConfig: Record<string, { icon: React.ElementType; className: string }> = {
  QBR: { icon: Presentation, className: "text-primary bg-primary/10" },
  SteerCo: { icon: Shield, className: "text-info bg-info/10" },
  Escalation: { icon: AlertTriangle, className: "text-destructive bg-destructive/10" },
};

export function GovernanceUpcoming({ items }: { items: GovernanceItem[] }) {
  const navigate = useNavigate();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" /> Upcoming Governance
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {items.length === 0 && <p className="text-sm text-muted-foreground">No upcoming activities</p>}
          {items.map((item, i) => {
            const now = new Date();
            const eventDate = new Date(item.date);
            const daysRemaining = Math.ceil((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            const config = typeConfig[item.type] || typeConfig.QBR;
            const Icon = config.icon;

            return (
              <div key={i} className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
                <div className={`h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${config.className}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground leading-snug">{item.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-[10px]">{item.type}</Badge>
                    <span className={`text-[11px] font-medium ${
                      daysRemaining < 0 ? "text-destructive" : daysRemaining <= 3 ? "text-rag-amber" : "text-muted-foreground"
                    }`}>
                      {daysRemaining < 0 ? `${Math.abs(daysRemaining)}d overdue` : daysRemaining === 0 ? "Today" : `${daysRemaining}d remaining`}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] shrink-0 text-primary"
                  onClick={() => navigate("/accounts")}
                >
                  Prepare
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
