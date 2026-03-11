import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { HeatmapRow } from "@/data/dashboard";
import { useNavigate } from "react-router-dom";

function cellColor(score: number, max: number = 3): string {
  const pct = score / max;
  if (pct >= 0.67) return "bg-rag-green/20 text-rag-green";
  if (pct >= 0.33) return "bg-rag-amber/20 text-rag-amber";
  return "bg-rag-red/20 text-rag-red";
}

export function HealthHeatmap({ data }: { data: HeatmapRow[] }) {
  const navigate = useNavigate();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Health Heatmap</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">Account</TableHead>
              <TableHead className="text-center">Relationship</TableHead>
              <TableHead className="text-center">Contract</TableHead>
              <TableHead className="text-center">Resource</TableHead>
              <TableHead className="text-center">CSAT</TableHead>
              <TableHead className="text-center">Overall</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map(row => (
              <TableRow
                key={row.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => navigate(`/accounts/${row.id}`)}
              >
                <TableCell className="pl-6 font-medium text-foreground">{row.name}</TableCell>
                {[
                  { v: row.relationship, m: 3 },
                  { v: row.contract, m: 3 },
                  { v: row.resource, m: 3 },
                  { v: row.csat, m: 5 },
                  { v: row.overall, m: 3 },
                ].map((cell, i) => (
                  <TableCell key={i} className="text-center p-2">
                    <span className={`inline-block px-3 py-1 rounded-md text-xs font-semibold ${cellColor(cell.v, cell.m)}`}>
                      {cell.v.toFixed(1)}
                    </span>
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
