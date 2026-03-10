import { useAuth, ROLE_LABELS } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";

const MOCK_STATS = {
  am: { accounts: 5, healthy: 3, atRisk: 1, renewals: 2 },
  leadership: { accounts: 24, healthy: 16, atRisk: 5, renewals: 8 },
  admin: { accounts: 24, healthy: 16, atRisk: 5, renewals: 8 },
};

export default function Dashboard() {
  const { user } = useAuth();
  if (!user) return null;

  const stats = MOCK_STATS[user.role];
  const isAM = user.role === "am";

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          {isAM ? "My Dashboard" : "Portfolio Dashboard"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Welcome back, {user.name} · <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-0">{ROLE_LABELS[user.role]}</Badge>
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Building2} label={isAM ? "My Accounts" : "Total Accounts"} value={stats.accounts} />
        <StatCard icon={CheckCircle} label="Healthy" value={stats.healthy} variant="success" />
        <StatCard icon={AlertTriangle} label="At Risk" value={stats.atRisk} variant="warning" />
        <StatCard icon={TrendingUp} label="Upcoming Renewals" value={stats.renewals} variant="info" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { text: "QBR completed for Acme Corp", time: "2h ago" },
                { text: "Health score updated for Beta Inc", time: "5h ago" },
                { text: "New stakeholder added to Gamma Ltd", time: "1d ago" },
              ].map((item, i) => (
                <div key={i} className="flex justify-between items-center py-2 border-b border-border last:border-0">
                  <span className="text-sm text-foreground">{item.text}</span>
                  <span className="text-xs text-muted-foreground">{item.time}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upcoming Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { text: "Prepare QBR deck for Delta Corp", due: "Mar 12" },
                { text: "Review health score metrics", due: "Mar 14" },
                { text: "Stakeholder alignment call", due: "Mar 15" },
              ].map((item, i) => (
                <div key={i} className="flex justify-between items-center py-2 border-b border-border last:border-0">
                  <span className="text-sm text-foreground">{item.text}</span>
                  <Badge variant="outline" className="text-xs">{item.due}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, variant }: {
  icon: React.ElementType;
  label: string;
  value: number;
  variant?: "success" | "warning" | "info";
}) {
  const colorMap = {
    success: "text-success",
    warning: "text-warning",
    info: "text-info",
  };
  const iconColor = variant ? colorMap[variant] : "text-primary";

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-3xl font-semibold text-foreground mt-1">{value}</p>
          </div>
          <Icon className={`h-8 w-8 ${iconColor} opacity-80`} />
        </div>
      </CardContent>
    </Card>
  );
}
