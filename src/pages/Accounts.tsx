import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const ALL_ACCOUNTS = [
  { id: 1, name: "Acme Corporation", industry: "FinTech", health: "healthy", am: "Sarah Mitchell", amId: "u1", arr: "$1.2M" },
  { id: 2, name: "Beta Industries", industry: "Healthcare", health: "at-risk", am: "Sarah Mitchell", amId: "u1", arr: "$800K" },
  { id: 3, name: "Gamma Ltd", industry: "E-Commerce", health: "healthy", am: "Sarah Mitchell", amId: "u1", arr: "$450K" },
  { id: 4, name: "Delta Corp", industry: "Logistics", health: "healthy", am: "Sarah Mitchell", amId: "u1", arr: "$2.1M" },
  { id: 5, name: "Epsilon Tech", industry: "SaaS", health: "critical", am: "Sarah Mitchell", amId: "u1", arr: "$350K" },
  { id: 6, name: "Zeta Partners", industry: "Insurance", health: "healthy", am: "James Chen", amId: "u2", arr: "$1.8M" },
  { id: 7, name: "Eta Solutions", industry: "Retail", health: "at-risk", am: "James Chen", amId: "u2", arr: "$600K" },
  { id: 8, name: "Theta Inc", industry: "Manufacturing", health: "healthy", am: "Other AM", amId: "u4", arr: "$950K" },
];

const healthColors: Record<string, string> = {
  healthy: "bg-success/10 text-success",
  "at-risk": "bg-warning/10 text-warning",
  critical: "bg-destructive/10 text-destructive",
};

export default function Accounts() {
  const { user } = useAuth();
  if (!user) return null;

  const accounts = user.role === "am"
    ? ALL_ACCOUNTS.filter(a => a.amId === user.id)
    : ALL_ACCOUNTS;

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Accounts</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {user.role === "am" ? "Your assigned accounts" : "All managed accounts"}
        </p>
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Account</th>
                  <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Industry</th>
                  <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">ARR</th>
                  <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Health</th>
                  {user.role !== "am" && (
                    <th className="text-left p-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Account Manager</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="p-4 text-sm font-medium text-foreground">{account.name}</td>
                    <td className="p-4 text-sm text-muted-foreground">{account.industry}</td>
                    <td className="p-4 text-sm text-foreground font-medium">{account.arr}</td>
                    <td className="p-4">
                      <Badge className={`${healthColors[account.health]} border-0 capitalize text-xs`}>
                        {account.health}
                      </Badge>
                    </td>
                    {user.role !== "am" && (
                      <td className="p-4 text-sm text-muted-foreground">{account.am}</td>
                    )}
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
