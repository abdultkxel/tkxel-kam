import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { HeatmapRow } from "@/data/dashboard";
import { useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { useNavigate } from "react-router-dom";

type SortKey = "name" | "relationship" | "contract" | "resource" | "csat" | "risk" | "serviceCoverage" | "overall";

function cellBadge(v: number, max: number = 3) {
  const pct = v / max;
  const cls = pct >= 0.67 ? "text-rag-green" : pct >= 0.33 ? "text-rag-amber" : "text-rag-red";
  return <span className={`font-semibold text-xs ${cls}`}>{v.toFixed(1)}</span>;
}

export function ComparisonTable({ data }: { data: HeatmapRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("overall");
  const [asc, setAsc] = useState(false);
  const navigate = useNavigate();

  const sorted = [...data].sort((a, b) => {
    const av = a[sortKey] as number | string;
    const bv = b[sortKey] as number | string;
    const cmp = typeof av === "string" ? (av as string).localeCompare(bv as string) : (av as number) - (bv as number);
    return asc ? cmp : -cmp;
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setAsc(!asc);
    else { setSortKey(key); setAsc(false); }
  };

  const SortHeader = ({ k, label }: { k: SortKey; label: string }) => (
    <TableHead className="cursor-pointer select-none text-center" onClick={() => toggleSort(k)}>
      <span className="inline-flex items-center gap-1 text-xs">{label} <ArrowUpDown className="h-3 w-3" /></span>
    </TableHead>
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Account Comparison</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6 cursor-pointer" onClick={() => toggleSort("name")}>
                <span className="inline-flex items-center gap-1">Account <ArrowUpDown className="h-3 w-3" /></span>
              </TableHead>
              <TableHead className="text-center text-xs">ARR</TableHead>
              <SortHeader k="relationship" label="Rel." />
              <SortHeader k="contract" label="Contract" />
              <SortHeader k="resource" label="Resource" />
              <SortHeader k="csat" label="CSAT" />
              <SortHeader k="risk" label="Risk" />
              <SortHeader k="serviceCoverage" label="Svc %" />
              <SortHeader k="overall" label="Overall" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map(row => (
              <TableRow key={row.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/accounts/${row.id}`)}>
                <TableCell className="pl-6 font-medium text-foreground text-sm">{row.name}</TableCell>
                <TableCell className="text-center text-xs text-muted-foreground">{row.arr}</TableCell>
                <TableCell className="text-center">{cellBadge(row.relationship)}</TableCell>
                <TableCell className="text-center">{cellBadge(row.contract)}</TableCell>
                <TableCell className="text-center">{cellBadge(row.resource)}</TableCell>
                <TableCell className="text-center">{cellBadge(row.csat, 5)}</TableCell>
                <TableCell className="text-center">{cellBadge(row.risk)}</TableCell>
                <TableCell className="text-center">
                  <span className={`font-semibold text-xs ${row.serviceCoverage >= 67 ? "text-rag-green" : row.serviceCoverage >= 33 ? "text-rag-amber" : "text-rag-red"}`}>
                    {row.serviceCoverage}%
                  </span>
                </TableCell>
                <TableCell className="text-center">{cellBadge(row.overall)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
