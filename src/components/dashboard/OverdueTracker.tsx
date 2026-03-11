import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface OverdueItem { task: string; owner: string; dueDate: string; source: string }

export function OverdueTracker({ items }: { items: OverdueItem[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-rag-red">Overdue Actions</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground px-6 pb-4">No overdue actions 🎉</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Task</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, i) => (
                <TableRow key={i}>
                  <TableCell className="pl-6 text-sm font-medium text-foreground">{item.task}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{item.owner}</TableCell>
                  <TableCell><Badge variant="destructive" className="text-[10px]">{item.dueDate}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{item.source}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
