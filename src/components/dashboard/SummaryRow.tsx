import { Card, CardContent } from "@/components/ui/card";
import { Building2, AlertTriangle, AlertCircle, CalendarCheck } from "lucide-react";

interface Props {
  total: number;
  atRisk: number;
  needsAttention: number;
  upcomingQBRs: number;
  isAM: boolean;
}

export function SummaryRow({ total, atRisk, needsAttention, upcomingQBRs, isAM }: Props) {
  const cards = [
    { icon: Building2, label: isAM ? "My Accounts" : "Total Accounts", value: total, color: "text-primary" },
    { icon: AlertCircle, label: "At Risk", value: atRisk, color: "text-rag-red" },
    { icon: AlertTriangle, label: "Needs Attention", value: needsAttention, color: "text-rag-amber" },
    { icon: CalendarCheck, label: "Upcoming QBRs", value: upcomingQBRs, color: "text-info" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(c => (
        <Card key={c.label}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{c.label}</p>
                <p className="text-3xl font-bold text-foreground mt-1">{c.value}</p>
              </div>
              <c.icon className={`h-7 w-7 ${c.color} opacity-70`} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
