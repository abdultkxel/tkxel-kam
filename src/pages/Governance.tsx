import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const reviews = [
  { account: "Signal", type: "QBR", date: "2026-03-15", status: "Scheduled" },
  { account: "Canvs", type: "Executive Review", date: "2026-03-20", status: "Pending" },
  { account: "Cafe Zupas", type: "Escalation Review", date: "2026-03-10", status: "Overdue" },
  { account: "ASAP Semiconductor", type: "QBR", date: "2026-04-01", status: "Scheduled" },
];

const statusColors: Record<string, string> = {
  Scheduled: "bg-info/10 text-info",
  Pending: "bg-warning/10 text-warning",
  Overdue: "bg-destructive/10 text-destructive",
};

export default function Governance() {
  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Governance</h1>
        <p className="text-sm text-muted-foreground mt-1">Reviews, escalations, and compliance tracking</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upcoming Reviews</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Account</th>
                  <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</th>
                  <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                  <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((r, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="p-4 text-sm font-medium text-foreground">{r.account}</td>
                    <td className="p-4 text-sm text-muted-foreground">{r.type}</td>
                    <td className="p-4 text-sm text-muted-foreground">{r.date}</td>
                    <td className="p-4">
                      <Badge className={`${statusColors[r.status]} border-0 text-xs`}>{r.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
