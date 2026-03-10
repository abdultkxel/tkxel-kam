import { Card, CardContent } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { HealthSubmission } from "@/data/healthScoring";

interface Props {
  history: HealthSubmission[];
}

export function HealthTrendChart({ history }: Props) {
  const data = history.map(h => ({
    period: h.date,
    Relationship: h.relationship.score,
    Contract: h.contract.score,
    Resource: h.resource.score,
    CSAT: h.csat.score,
    Overall: h.overall,
  }));

  return (
    <Card>
      <CardContent className="pt-6">
        <h4 className="text-sm font-medium text-foreground mb-4">Health Score Trend (Last 6 Periods)</h4>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
              <YAxis domain={[0, 3]} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--background))" }}
                labelStyle={{ fontWeight: 600, color: "hsl(var(--foreground))" }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="Overall" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="Relationship" stroke="#28A745" strokeWidth={1.5} strokeDasharray="4 2" dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Contract" stroke="#FFC107" strokeWidth={1.5} strokeDasharray="4 2" dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Resource" stroke="#DC3545" strokeWidth={1.5} strokeDasharray="4 2" dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
