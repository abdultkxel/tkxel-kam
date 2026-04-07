import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ClipboardList, FileText, HeartPulse, Shield, Lightbulb, MessageSquare, TrendingUp, Plus } from "lucide-react";
import { DailyTask } from "@/data/dashboard";
import { MOCK_ACCOUNTS } from "@/data/accounts";

const categoryConfig: Record<DailyTask["category"], { label: string; icon: React.ElementType; className: string }> = {
  kyc: { label: "KYC", icon: FileText, className: "bg-chart-1/15 text-chart-1" },
  health: { label: "Health", icon: HeartPulse, className: "bg-chart-2/15 text-chart-2" },
  governance: { label: "Governance", icon: Shield, className: "bg-chart-3/15 text-chart-3" },
  strategy: { label: "Strategy", icon: Lightbulb, className: "bg-chart-4/15 text-chart-4" },
  "follow-up": { label: "Follow-up", icon: MessageSquare, className: "bg-chart-5/15 text-chart-5" },
  opportunity: { label: "Opportunity", icon: TrendingUp, className: "bg-primary/15 text-primary" },
};

const priorityClass: Record<DailyTask["priority"], string> = {
  high: "bg-destructive/15 text-destructive border-destructive/30",
  medium: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  low: "bg-muted text-muted-foreground border-border",
};

export function DailyTasks({ tasks: initialTasks }: { tasks: DailyTask[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTask, setNewTask] = useState({
    task: "",
    account: "",
    category: "follow-up" as DailyTask["category"],
    priority: "medium" as DailyTask["priority"],
    dueDate: new Date().toISOString().split("T")[0],
  });

  const toggleTask = (id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const handleAddTask = () => {
    if (!newTask.task.trim() || !newTask.account) return;
    const task: DailyTask = {
      id: `dt-new-${Date.now()}`,
      task: newTask.task,
      account: newTask.account,
      category: newTask.category,
      priority: newTask.priority,
      dueDate: newTask.dueDate,
      completed: false,
    };
    setTasks(prev => [task, ...prev]);
    setNewTask({ task: "", account: "", category: "follow-up", priority: "medium", dueDate: new Date().toISOString().split("T")[0] });
    setDialogOpen(false);
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
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">
              {completed}/{total} done
            </span>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setDialogOpen(true)}>
              <Plus className="h-3 w-3" /> Add Task
            </Button>
          </div>
        </div>
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
                  {task.contextLabel && (
                    <span className="text-[10px] text-muted-foreground italic">· {task.contextLabel}</span>
                  )}
                </div>
              </div>
              <Badge variant="outline" className={`text-[10px] shrink-0 ${priorityClass[task.priority]}`}>
                {task.priority}
              </Badge>
            </div>
          );
        })}
      </CardContent>

      {/* Add Task Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Add New Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Task Description</label>
              <Input
                placeholder="What needs to be done?"
                value={newTask.task}
                onChange={e => setNewTask(prev => ({ ...prev, task: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Account</label>
              <Select value={newTask.account} onValueChange={v => setNewTask(prev => ({ ...prev, account: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {MOCK_ACCOUNTS.map(a => (
                    <SelectItem key={a.id} value={a.name}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Category</label>
                <Select value={newTask.category} onValueChange={v => setNewTask(prev => ({ ...prev, category: v as DailyTask["category"] }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(categoryConfig).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Priority</label>
                <Select value={newTask.priority} onValueChange={v => setNewTask(prev => ({ ...prev, priority: v as DailyTask["priority"] }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Due Date</label>
              <Input
                type="date"
                value={newTask.dueDate}
                onChange={e => setNewTask(prev => ({ ...prev, dueDate: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddTask} disabled={!newTask.task.trim() || !newTask.account}>Add Task</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
