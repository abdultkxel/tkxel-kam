import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";

interface Props {
  averages: { relationship: number; contract: number; resource: number; overall: number };
}

export function PortfolioOverview({ averages }: Props) {
  const data = [
    { dimension: "Relationship", score: averages.relationship },
    { dimension: "Contract", score: averages.contract },
    { dimension: "Resource", score: averages.resource },
    { dimension: "Overall", score: averages.overall },
  ];

  const barColor = (score: number) => {
    if (score >= 2) return "hsl(134, 61%, 41%)";
    if (score >= 1.5) return "hsl(45, 100%, 51%)";
    return "hsl(354, 70%, 54%)";
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Portfolio Health Averages</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, 3]} tick={{ fontSize: 11 }} />
              <YAxis dataKey="dimension" type="category" tick={{ fontSize: 11 }} width={90} />
              <Tooltip formatter={(v: number) => v.toFixed(2)} />
              <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={22}>
                {data.map((d, i) => (
                  <rect key={i} fill={barColor(d.score)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
