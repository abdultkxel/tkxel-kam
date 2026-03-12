import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, FileText, HeartPulse, Shield, Lightbulb, MessageSquare } from "lucide-react";
import { DailyTask } from "@/data/dashboard";

const categoryConfig: Record<DailyTask["category"], { label: string; icon: React.ElementType; className: string }> = {
  kyc: { label: "KYC", icon: FileText, className: "bg-chart-1/15 text-chart-1" },
  health: { label: "Health", icon: HeartPulse, className: "bg-chart-2/15 text-chart-2" },
  governance: { label: "Governance", icon: Shield, className: "bg-chart-3/15 text-chart-3" },
  strategy: { label: "Strategy", icon: Lightbulb, className: "bg-chart-4/15 text-chart-4" },
  "follow-up": { label: "Follow-up", icon: MessageSquare, className: "bg-chart-5/15 text-chart-5" },
};

const priorityClass: Record<DailyTask["priority"], string> = {
  high: "bg-destructive/15 text-destructive border-destructive/30",
  medium: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  low: "bg-muted text-muted-foreground border-border",
};

export function DailyTasks({ tasks: initialTasks }: { tasks: DailyTask[] }) {
  const [tasks, setTasks] = useState(initialTasks);

  const toggleTask = (id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const completed = tasks.filter(t => t.completed).length;
  const total = tasks.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Today's Tasks</CardTitle>
          </div>
          <span className="text-xs text-muted-foreground font-medium">
            {completed}/{total} done
          </span>
        </div>
        {/* Progress bar */}
        <div className="h-1.5 w-full rounded-full bg-muted mt-2">
          <div
            className="h-1.5 rounded-full bg-primary transition-all duration-300"
            style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-1 pt-0">
        {tasks.map(task => {
          const cat = categoryConfig[task.category];
          const CatIcon = cat.icon;
          return (
            <div
              key={task.id}
              className={`flex items-start gap-3 rounded-md px-3 py-2.5 transition-colors ${
                task.completed ? "opacity-50" : "hover:bg-muted/50"
              }`}
            >
              <Checkbox
                checked={task.completed}
                onCheckedChange={() => toggleTask(task.id)}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <p className={`text-sm leading-snug ${task.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>
                  {task.task}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${cat.className}`}>
                    <CatIcon className="h-2.5 w-2.5" />
                    {cat.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{task.account}</span>
                </div>
              </div>
              <Badge variant="outline" className={`text-[10px] shrink-0 ${priorityClass[task.priority]}`}>
                {task.priority}
              </Badge>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
