import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { AMPerformance } from "@/data/dashboard";

function ProgressCell({ value }: { value: number }) {
  const color = value >= 80 ? "bg-rag-green" : value >= 60 ? "bg-rag-amber" : "bg-rag-red";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-8 text-right">{value}%</span>
    </div>
  );
}

export function AMPerformanceTable({ data }: { data: AMPerformance[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">AM Performance</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">Account Manager</TableHead>
              <TableHead className="text-center">Accounts</TableHead>
              <TableHead>KYC Completion</TableHead>
              <TableHead>Plan Submission</TableHead>
              <TableHead>Governance Rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((am, i) => (
              <TableRow key={i}>
                <TableCell className="pl-6 font-medium text-foreground">{am.name}</TableCell>
                <TableCell className="text-center text-sm text-foreground">{am.accounts}</TableCell>
                <TableCell><ProgressCell value={am.kycCompletion} /></TableCell>
                <TableCell><ProgressCell value={am.planSubmission} /></TableCell>
                <TableCell><ProgressCell value={am.governanceRate} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
