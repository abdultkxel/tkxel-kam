import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Account } from "@/data/accounts";

function parseARR(arr: string): number {
  const num = parseFloat(arr.replace(/[$,]/g, ""));
  if (arr.includes("M")) return num * 1000000;
  if (arr.includes("K")) return num * 1000;
  return num;
}

function formatCurrency(val: number): string {
  if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `$${(val / 1000).toFixed(0)}K`;
  return `$${val}`;
}

interface Segment { name: string; value: number; fill: string; arr: number }

export function SegmentDonut({ data, accounts }: { data: { name: string; value: number; fill: string }[]; accounts: Account[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);

  const enriched: Segment[] = data.map(d => ({
    ...d,
    arr: accounts
      .filter(a => a.segment === d.name)
      .reduce((s, a) => s + parseARR(a.arr), 0),
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Growth vs Retention</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <div className="h-[180px] w-[180px] flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={enriched}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  dataKey="value"
                  paddingAngle={3}
                  startAngle={90}
                  endAngle={-270}
                >
                  {enriched.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-3">
            {enriched.map((seg) => {
              const pct = total > 0 ? Math.round((seg.value / total) * 100) : 0;
              return (
                <div key={seg.name} className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-sm flex-shrink-0" style={{ backgroundColor: seg.fill }} />
                    <span className="text-sm font-medium text-foreground">{seg.name}</span>
                  </div>
                  <div className="ml-5">
                    <p className="text-lg font-bold text-foreground">{pct}%</p>
                    <p className="text-xs text-muted-foreground">{seg.value} accounts · {formatCurrency(seg.arr)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
