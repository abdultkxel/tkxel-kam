import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from "recharts";
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

const riskColors: Record<string, string> = {
  Green: "hsl(134, 61%, 41%)",
  Amber: "hsl(45, 100%, 51%)",
  Red: "hsl(354, 70%, 54%)",
};

export function ARRByRiskChart({ accounts }: { accounts: Account[] }) {
  const data = [
    { name: "Green", value: accounts.filter(a => a.riskStatus === "green").reduce((s, a) => s + parseARR(a.arr), 0) },
    { name: "Amber", value: accounts.filter(a => a.riskStatus === "amber").reduce((s, a) => s + parseARR(a.arr), 0) },
    { name: "Red", value: accounts.filter(a => a.riskStatus === "red").reduce((s, a) => s + parseARR(a.arr), 0) },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">ARR by Risk Level</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 10, right: 30 }}>
              <XAxis type="number" tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fontWeight: 500 }} width={50} />
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={28}>
                {data.map((entry) => (
                  <Cell key={entry.name} fill={riskColors[entry.name]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
