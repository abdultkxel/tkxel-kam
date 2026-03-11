import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";
import { RiskPlotPoint } from "@/data/dashboard";

const statusColor: Record<string, string> = {
  green: "hsl(134, 61%, 41%)",
  amber: "hsl(45, 100%, 51%)",
  red: "hsl(354, 70%, 54%)",
};

export function RiskScatterPlot({ data }: { data: RiskPlotPoint[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Risk Heatmap — Health vs Revenue</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" dataKey="healthScore" name="Health" domain={[0, 3]} tick={{ fontSize: 11 }} label={{ value: "Health Score", position: "insideBottom", offset: -5, fontSize: 11 }} />
              <YAxis type="number" dataKey="revenue" name="Revenue ($K)" tick={{ fontSize: 11 }} label={{ value: "Revenue ($K)", angle: -90, position: "insideLeft", fontSize: 11 }} />
              <ReferenceLine x={1.5} stroke="hsl(45, 100%, 51%)" strokeDasharray="4 4" />
              <ReferenceLine y={800} stroke="hsl(214, 32%, 91%)" strokeDasharray="4 4" />
              <Tooltip
                content={({ payload }) => {
                  if (!payload?.length) return null;
                  const d = payload[0].payload as RiskPlotPoint;
                  return (
                    <div className="bg-card border border-border rounded-md p-2 shadow-md text-xs">
                      <p className="font-medium text-foreground">{d.name}</p>
                      <p className="text-muted-foreground">Health: {d.healthScore.toFixed(1)} · Revenue: ${d.revenue}K</p>
                    </div>
                  );
                }}
              />
              <Scatter data={data}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={statusColor[entry.riskStatus] || statusColor.green} r={8} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
