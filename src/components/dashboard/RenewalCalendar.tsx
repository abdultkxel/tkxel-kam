import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RenewalEntry } from "@/data/dashboard";

export function RenewalCalendar({ entries }: { entries: RenewalEntry[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Renewal Calendar (Next 6 Months)</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground px-6 pb-4">No renewals in the next 6 months</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Account</TableHead>
                <TableHead>Contract End</TableHead>
                <TableHead>ARR</TableHead>
                <TableHead>Days Remaining</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="pl-6 font-medium text-foreground">{r.account}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.contractEnd}</TableCell>
                  <TableCell className="text-sm text-foreground">{r.arr}</TableCell>
                  <TableCell className="text-sm text-foreground">{r.daysRemaining}</TableCell>
                  <TableCell>
                    <Badge
                      variant={r.status === "overdue" ? "destructive" : "outline"}
                      className={`text-[10px] ${r.status === "upcoming" ? "border-rag-amber text-rag-amber" : ""}`}
                    >
                      {r.status === "overdue" ? "Expired" : r.status === "upcoming" ? "Expiring Soon" : "On Track"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
