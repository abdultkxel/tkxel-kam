import { Card, CardContent } from "@/components/ui/card";
import { BarChart3, FileText, PieChart, TrendingUp } from "lucide-react";

const reports = [
  { title: "Portfolio Summary", desc: "Overview of all accounts and key metrics", icon: PieChart },
  { title: "Revenue Trends", desc: "ARR growth and churn analysis", icon: TrendingUp },
  { title: "Health Distribution", desc: "Account health breakdown by segment", icon: BarChart3 },
  { title: "Activity Log", desc: "Detailed engagement and activity report", icon: FileText },
];

export default function Reports() {
  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">Analytics and reporting tools</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reports.map((r) => (
          <Card key={r.title} className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <r.icon className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium text-foreground">{r.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{r.desc}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
