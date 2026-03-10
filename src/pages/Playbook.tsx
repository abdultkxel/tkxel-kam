import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen } from "lucide-react";

export default function Playbook() {
  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Playbook</h1>
        <p className="text-sm text-muted-foreground mt-1">Standardized processes and best practices</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {["Onboarding", "QBR Preparation", "Escalation Handling", "Renewal Strategy", "Expansion Planning", "Risk Mitigation"].map((title) => (
          <Card key={title} className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <BookOpen className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium text-foreground text-sm">{title}</h3>
                  <p className="text-xs text-muted-foreground mt-1">Click to view playbook details</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
