import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft, Pencil, Trash2, Plus, CalendarIcon, Check, X,
  MessageSquare, Activity, Link as LinkIcon, ChevronDown, Clock,
  CircleDot, CheckCircle2, XCircle, Circle,
} from "lucide-react";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { useOpportunities } from "@/contexts/OpportunitiesContext";
import { useOpportunityDetail } from "@/contexts/OpportunityDetailContext";
import { MOCK_ACCOUNTS, RAG_STYLES, getRagColor } from "@/data/accounts";
import {
  STAGE_ORDER, STAGE_COLORS, CONFIDENCE_PCT, formatCurrency, getWeightedValue,
  type Opportunity, type OpportunityStage, type Confidence,
} from "@/data/opportunities";
import { TEAM_MEMBERS } from "@/data/strategy";
import {
  TASK_TYPE_COLORS, PRIORITY_COLORS,
  type OppTaskType, type OppTaskPriority,
} from "@/data/opportunityTasks";
import { AddOpportunityDrawer } from "@/components/opportunities/AddOpportunityDrawer";

const TODAY = new Date("2026-03-12");

const TASK_TYPES: OppTaskType[] = ["Discovery", "Follow-up", "Proposal", "Demo", "Internal", "Meeting", "Legal", "Commercial"];
const TASK_PRIORITIES: OppTaskPriority[] = ["High", "Medium", "Low"];

export default function OpportunityDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { opportunities, updateOpportunity, deleteOpportunity } = useOpportunities();
  const { tasks, activities, documents, addTask, toggleTask, addActivity, addDocument, deleteDocument } = useOpportunityDetail();

  const opp = opportunities.find(o => o.id === id);
  const account = opp ? MOCK_ACCOUNTS.find(a => a.id === opp.accountId) : null;

  // Inline editing states
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [editingValue, setEditingValue] = useState(false);
  const [valueInput, setValueInput] = useState("");
  const [editingClose, setEditingClose] = useState(false);
  const [description, setDescription] = useState(""); // per-opp in real app
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);

  // Task drawer
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskType, setNewTaskType] = useState<OppTaskType>("Follow-up");
  const [newTaskPriority, setNewTaskPriority] = useState<OppTaskPriority>("Medium");
  const [newTaskDue, setNewTaskDue] = useState<Date | undefined>();
  const [newTaskOwner, setNewTaskOwner] = useState("Sarah Mitchell");
  const [newTaskNotes, setNewTaskNotes] = useState("");

  // Note entry
  const [noteText, setNoteText] = useState("");

  // Documents
  const [docsOpen, setDocsOpen] = useState(false);
  const [newDocLabel, setNewDocLabel] = useState("");
  const [newDocUrl, setNewDocUrl] = useState("");

  // Completed tasks toggle
  const [showCompleted, setShowCompleted] = useState(false);

  if (!opp || !account) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Opportunity not found.</p>
        <Button variant="ghost" onClick={() => navigate("/opportunities")} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Opportunities
        </Button>
      </div>
    );
  }

  const oppTasks = tasks.filter(t => t.opportunityId === opp.id);
  const incompleteTasks = oppTasks.filter(t => !t.completed).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  const completedTasks = oppTasks.filter(t => t.completed);
  const oppActivities = activities.filter(a => a.opportunityId === opp.id).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const oppDocs = documents.filter(d => d.opportunityId === opp.id);

  const overallRag = getRagColor(account.health.overall);
  const weighted = getWeightedValue(opp);

  // Stage change handler with activity log
  const handleStageChange = (newStage: OpportunityStage) => {
    const oldStage = opp.stage;
    updateOpportunity(opp.id, { stage: newStage });
    addActivity({
      opportunityId: opp.id, type: "stage_change",
      content: `Stage changed: ${oldStage} → ${newStage} by Sarah Mitchell`,
      author: "Sarah Mitchell", timestamp: new Date().toISOString(),
    });
  };

  const handleConfidenceChange = (newConf: Confidence) => {
    const oldConf = opp.confidence;
    updateOpportunity(opp.id, { confidence: newConf });
    addActivity({
      opportunityId: opp.id, type: "confidence_change",
      content: `Confidence updated: ${oldConf} → ${newConf}`,
      author: "Sarah Mitchell", timestamp: new Date().toISOString(),
    });
  };

  const handleNameSave = () => {
    if (nameValue.trim()) {
      updateOpportunity(opp.id, { name: nameValue.trim() });
    }
    setEditingName(false);
  };

  const handleValueSave = () => {
    const v = parseFloat(valueInput);
    if (!isNaN(v) && v > 0) {
      const oldVal = opp.estimatedValue;
      updateOpportunity(opp.id, { estimatedValue: v });
      addActivity({
        opportunityId: opp.id, type: "value_change",
        content: `Value updated: ${formatCurrency(oldVal)} → ${formatCurrency(v)}`,
        author: "Sarah Mitchell", timestamp: new Date().toISOString(),
      });
    }
    setEditingValue(false);
  };

  const handleAddTask = () => {
    if (!newTaskTitle.trim()) return;
    addTask({
      opportunityId: opp.id, title: newTaskTitle.trim(), type: newTaskType,
      priority: newTaskPriority, dueDate: newTaskDue ? format(newTaskDue, "yyyy-MM-dd") : "",
      owner: newTaskOwner, notes: newTaskNotes, completed: false,
    });
    setTaskDrawerOpen(false);
    setNewTaskTitle(""); setNewTaskNotes(""); setNewTaskDue(undefined);
  };

  const handleToggleTask = (taskId: string) => {
    const task = oppTasks.find(t => t.id === taskId);
    if (task && !task.completed) {
      addActivity({
        opportunityId: opp.id, type: "task_completed",
        content: `Task completed: ${task.title}`,
        author: "Sarah Mitchell", timestamp: new Date().toISOString(),
      });
    }
    toggleTask(taskId);
  };

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    addActivity({
      opportunityId: opp.id, type: "note",
      content: noteText.trim(),
      author: "Sarah Mitchell", timestamp: new Date().toISOString(),
    });
    setNoteText("");
  };

  const handleAddDoc = () => {
    if (!newDocLabel.trim() || !newDocUrl.trim()) return;
    addDocument({ opportunityId: opp.id, label: newDocLabel.trim(), url: newDocUrl.trim() });
    setNewDocLabel(""); setNewDocUrl("");
  };

  const handleDelete = () => {
    deleteOpportunity(opp.id);
    navigate("/opportunities");
  };

  const confidenceColors: Record<string, string> = {
    Low: "bg-muted text-muted-foreground",
    Medium: "bg-rag-amber/15 text-rag-amber",
    High: "bg-rag-green/15 text-rag-green",
  };

  // Task progress
  const taskTotal = oppTasks.length;
  const taskDone = completedTasks.length;
  const overdueTasks = incompleteTasks.filter(t => differenceInDays(new Date(t.dueDate), TODAY) < 0);
  const dueSoon = incompleteTasks.filter(t => {
    const d = differenceInDays(new Date(t.dueDate), TODAY);
    return d >= 0 && d <= 7;
  });

  // Stage timeline
  const stageTimeline = ["Identified", "Qualified", "Proposal Sent", "Negotiation"] as const;
  const currentStageIdx = STAGE_ORDER.indexOf(opp.stage);
  const isWon = opp.stage === "Won";
  const isLost = opp.stage === "Lost";

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* HEADER */}
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/opportunities")} className="mb-3 -ml-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4 mr-1" /> Opportunities
        </Button>

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Name - inline editable */}
            {editingName ? (
              <div className="flex items-center gap-2">
                <Input value={nameValue} onChange={e => setNameValue(e.target.value)} className="text-xl font-semibold h-9 max-w-md" autoFocus onKeyDown={e => e.key === "Enter" && handleNameSave()} />
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleNameSave}><Check className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingName(false)}><X className="h-4 w-4" /></Button>
              </div>
            ) : (
              <h1 className="text-2xl font-semibold text-foreground cursor-pointer hover:text-primary transition-colors" onClick={() => { setNameValue(opp.name); setEditingName(true); }}>
                {opp.name}
              </h1>
            )}
            <p className="text-sm text-muted-foreground mt-1">
              {account.name} · {opp.serviceLine} · {opp.type}
            </p>

            {/* Status controls row */}
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              {/* Stage dropdown */}
              <Select value={opp.stage} onValueChange={(v) => handleStageChange(v as OpportunityStage)}>
                <SelectTrigger className={cn("w-auto h-7 text-xs font-medium border-0 px-2.5", STAGE_COLORS[opp.stage])}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGE_ORDER.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>

              {/* Confidence */}
              <Select value={opp.confidence} onValueChange={(v) => handleConfidenceChange(v as Confidence)}>
                <SelectTrigger className={cn("w-auto h-7 text-xs font-medium border-0 px-2.5", confidenceColors[opp.confidence])}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Low">Low (25%)</SelectItem>
                  <SelectItem value="Medium">Medium (50%)</SelectItem>
                  <SelectItem value="High">High (80%)</SelectItem>
                </SelectContent>
              </Select>

              {/* Value - inline editable */}
              {editingValue ? (
                <div className="flex items-center gap-1">
                  <span className="text-sm text-muted-foreground">$</span>
                  <Input value={valueInput} onChange={e => setValueInput(e.target.value)} type="number" className="h-7 w-28 text-xs" autoFocus onKeyDown={e => e.key === "Enter" && handleValueSave()} />
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleValueSave}><Check className="h-3 w-3" /></Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingValue(false)}><X className="h-3 w-3" /></Button>
                </div>
              ) : (
                <span className="text-sm font-semibold text-foreground cursor-pointer hover:text-primary" onClick={() => { setValueInput(opp.estimatedValue.toString()); setEditingValue(true); }}>
                  {formatCurrency(opp.estimatedValue)}
                </span>
              )}

              <span className="text-xs text-muted-foreground">Weighted: {formatCurrency(weighted)}</span>

              {/* Target close */}
              {editingClose ? (
                <Popover open onOpenChange={(o) => !o && setEditingClose(false)}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 text-xs">
                      <CalendarIcon className="h-3 w-3 mr-1" /> {opp.targetClose}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={new Date(opp.targetClose)}
                      onSelect={(d) => {
                        if (d) { updateOpportunity(opp.id, { targetClose: format(d, "yyyy-MM-dd") }); }
                        setEditingClose(false);
                      }}
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              ) : (
                <span className="text-xs text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-1" onClick={() => setEditingClose(true)}>
                  <CalendarIcon className="h-3 w-3" /> {opp.targetClose}
                </span>
              )}
            </div>
          </div>

          {/* Edit / Delete */}
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => setEditDrawerOpen(true)}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={handleDelete}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
            </Button>
          </div>
        </div>
      </div>

      {/* TWO-COLUMN LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
        {/* LEFT COLUMN */}
        <div className="space-y-6">
          {/* SECTION 1 — Description */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Opportunity Description</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe the opportunity, client need, trigger, and Tkxel's angle..."
                rows={4}
                className="resize-none"
              />
            </CardContent>
          </Card>

          {/* SECTION 2 — Tasks */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">Tasks</CardTitle>
                <Badge variant="secondary" className="text-xs">{taskTotal}</Badge>
              </div>
              <Button size="sm" onClick={() => setTaskDrawerOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Add Task
              </Button>
            </CardHeader>
            <CardContent className="space-y-1">
              {oppTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No tasks yet — add your first task to start tracking pursuit actions.</p>
              ) : (
                <>
                  {incompleteTasks.map(task => (
                    <TaskRow key={task.id} task={task} onToggle={() => handleToggleTask(task.id)} today={TODAY} />
                  ))}
                  {completedTasks.length > 0 && (
                    <Collapsible open={showCompleted} onOpenChange={setShowCompleted}>
                      <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mt-3 cursor-pointer py-1">
                        <ChevronDown className={cn("h-4 w-4 transition-transform", showCompleted && "rotate-180")} />
                        Completed ({completedTasks.length})
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-1 mt-1">
                        {completedTasks.map(task => (
                          <TaskRow key={task.id} task={task} onToggle={() => handleToggleTask(task.id)} today={TODAY} />
                        ))}
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* SECTION 3 — Activity & Notes */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Activity</CardTitle>
              <div className="flex items-center gap-2">
                <Input value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Add a note..." className="h-8 text-xs w-56" onKeyDown={e => e.key === "Enter" && handleAddNote()} />
                <Button size="sm" variant="outline" onClick={handleAddNote} disabled={!noteText.trim()}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Note
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {oppActivities.map(entry => {
                  const icons: Record<string, React.ReactNode> = {
                    created: <CircleDot className="h-3.5 w-3.5 text-primary" />,
                    stage_change: <Activity className="h-3.5 w-3.5 text-info" />,
                    confidence_change: <Activity className="h-3.5 w-3.5 text-rag-amber" />,
                    value_change: <Activity className="h-3.5 w-3.5 text-rag-green" />,
                    task_completed: <CheckCircle2 className="h-3.5 w-3.5 text-rag-green" />,
                    note: <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />,
                  };
                  const labels: Record<string, string> = {
                    created: "Created", stage_change: "Stage Change", confidence_change: "Confidence",
                    value_change: "Value Update", task_completed: "Task Done", note: "Note",
                  };
                  return (
                    <div key={entry.id} className="flex items-start gap-3">
                      <div className="mt-0.5 shrink-0">{icons[entry.type]}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[10px]">{labels[entry.type]}</Badge>
                          {entry.type === "note" ? (
                            <p className="text-sm text-foreground italic border-l-2 border-muted pl-2">"{entry.content}"</p>
                          ) : (
                            <p className="text-sm text-foreground">{entry.content}</p>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {entry.author} · {formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {oppActivities.length === 0 && (
                  <p className="text-sm text-muted-foreground py-2">No activity yet.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* SECTION 4 — Linked Documents */}
          <Collapsible open={docsOpen} onOpenChange={setDocsOpen}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer flex flex-row items-center justify-between pb-3">
                  <div className="flex items-center gap-2">
                    <LinkIcon className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-base">Documents & Links</CardTitle>
                    <Badge variant="secondary" className="text-xs">{oppDocs.length}</Badge>
                  </div>
                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", docsOpen && "rotate-180")} />
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="space-y-3">
                  {oppDocs.map(doc => (
                    <div key={doc.id} className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-muted/50">
                      <div className="flex items-center gap-2 min-w-0">
                        <LinkIcon className="h-3.5 w-3.5 text-primary shrink-0" />
                        <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline truncate">{doc.label}</a>
                      </div>
                      <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => deleteDocument(doc.id)}>
                        <Trash2 className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 pt-2 border-t border-border">
                    <Input value={newDocLabel} onChange={e => setNewDocLabel(e.target.value)} placeholder="Label" className="h-8 text-xs flex-1" />
                    <Input value={newDocUrl} onChange={e => setNewDocUrl(e.target.value)} placeholder="URL" className="h-8 text-xs flex-1" />
                    <Button size="sm" variant="outline" onClick={handleAddDoc} disabled={!newDocLabel.trim() || !newDocUrl.trim()}>Add</Button>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-4">
          {/* CARD 1 — Account Context */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Account</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">{account.name}</span>
                <Badge variant="secondary" className={cn("text-[10px]", account.segment === "Growth" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                  {account.segment}
                </Badge>
              </div>
              <div className="space-y-2 text-sm">
                <SidebarRow label="Industry" value={account.industry} />
                <SidebarRow label="Revenue" value={account.arr} />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Health</span>
                  <div className="flex items-center gap-1.5">
                    <span className={cn("h-2 w-2 rounded-full", RAG_STYLES[overallRag].dot)} />
                    <span className="font-medium text-foreground">{account.health.overall.toFixed(1)}</span>
                  </div>
                </div>
                <SidebarRow label="Relationship" value={account.health.relationship.toFixed(1)} />
                <SidebarRow label="Contract End" value={account.contractEnd} />
              </div>
              <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => navigate(`/accounts/${account.id}`)}>
                View Account →
              </Button>
            </CardContent>
          </Card>

          {/* CARD 2 — Opportunity Details */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <SidebarRow label="Estimated Value" value={formatCurrency(opp.estimatedValue)} />
              <SidebarRow label="Weighted Value" value={formatCurrency(weighted)} />
              <SidebarRow label="Type" value={opp.type} />
              <SidebarRow label="Service Category" value={opp.serviceCategory} />
              <SidebarRow label="Service Line" value={opp.serviceLine} />
              <SidebarRow label="Owner" value={opp.owner} />
              <SidebarRow label="Created" value={opp.createdAt} />
              <SidebarRow label="Last Updated" value={new Date().toISOString().split("T")[0]} />
            </CardContent>
          </Card>

          {/* CARD 3 — Task Progress */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Task Progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{taskDone} of {taskTotal} complete</span>
                <span className="font-medium text-foreground">{taskTotal > 0 ? Math.round((taskDone / taskTotal) * 100) : 0}%</span>
              </div>
              <Progress value={taskTotal > 0 ? (taskDone / taskTotal) * 100 : 0} className="h-2" />
              <div className="space-y-1 text-sm">
                {overdueTasks.length > 0 && (
                  <p className="text-destructive font-medium">{overdueTasks.length} overdue</p>
                )}
                {dueSoon.length > 0 && (
                  <p className="text-rag-amber font-medium">{dueSoon.length} due in next 7 days</p>
                )}
                <p className="text-muted-foreground">{incompleteTasks.length} remaining</p>
              </div>
            </CardContent>
          </Card>

          {/* CARD 4 — Stage History / Timeline */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Stage History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-0">
                {stageTimeline.map((stage, idx) => {
                  const stageIdx = STAGE_ORDER.indexOf(stage);
                  const isCompleted = currentStageIdx > stageIdx || isWon;
                  const isCurrent = opp.stage === stage;
                  const isLostHere = isLost && currentStageIdx <= stageIdx && idx === Math.min(currentStageIdx, stageTimeline.length - 1);

                  return (
                    <div key={stage} className="flex items-center flex-1">
                      <div className="flex flex-col items-center flex-1">
                        <div className={cn(
                          "h-7 w-7 rounded-full flex items-center justify-center text-xs border-2 transition-colors",
                          isLostHere ? "border-destructive bg-destructive/10" :
                          isCompleted ? "border-primary bg-primary text-primary-foreground" :
                          isCurrent ? "border-primary bg-primary/10 text-primary" :
                          "border-muted bg-muted/30 text-muted-foreground"
                        )}>
                          {isLostHere ? <XCircle className="h-4 w-4 text-destructive" /> :
                           isCompleted ? <Check className="h-3.5 w-3.5" /> :
                           isCurrent ? <CircleDot className="h-3.5 w-3.5" /> :
                           <Circle className="h-3.5 w-3.5" />}
                        </div>
                        <span className={cn("text-[9px] mt-1 text-center leading-tight", isCurrent || isCompleted ? "text-foreground font-medium" : "text-muted-foreground")}>
                          {stage.replace("Proposal Sent", "Proposal")}
                        </span>
                      </div>
                      {idx < stageTimeline.length - 1 && (
                        <div className={cn("h-0.5 flex-1 -mx-1", isCompleted ? "bg-primary" : "bg-muted")} />
                      )}
                    </div>
                  );
                })}
                {/* Won/Lost final */}
                <div className="flex items-center">
                  <div className={cn("h-0.5 w-4", isWon || isLost ? (isWon ? "bg-primary" : "bg-destructive") : "bg-muted")} />
                  <div className="flex flex-col items-center">
                    <div className={cn(
                      "h-7 w-7 rounded-full flex items-center justify-center text-xs border-2",
                      isWon ? "border-rag-green bg-rag-green text-white" :
                      isLost ? "border-destructive bg-destructive text-white" :
                      "border-muted bg-muted/30 text-muted-foreground"
                    )}>
                      {isWon ? <Check className="h-3.5 w-3.5" /> : isLost ? <XCircle className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                    </div>
                    <span className={cn("text-[9px] mt-1", isWon ? "text-rag-green font-medium" : isLost ? "text-destructive font-medium" : "text-muted-foreground")}>
                      {isWon ? "Won" : isLost ? "Lost" : "Won/Lost"}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Add Task Drawer */}
      <Sheet open={taskDrawerOpen} onOpenChange={setTaskDrawerOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Add Task</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div>
              <Label>Task Title *</Label>
              <Input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} placeholder="e.g. Send proposal deck" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={newTaskType} onValueChange={v => setNewTaskType(v as OppTaskType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TASK_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={newTaskPriority} onValueChange={v => setNewTaskPriority(v as OppTaskPriority)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TASK_PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Due Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !newTaskDue && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {newTaskDue ? format(newTaskDue, "PPP") : "Pick date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={newTaskDue} onSelect={setNewTaskDue} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>Owner</Label>
              <Select value={newTaskOwner} onValueChange={setNewTaskOwner}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TEAM_MEMBERS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={newTaskNotes} onChange={e => setNewTaskNotes(e.target.value)} rows={3} />
            </div>
            <div className="flex gap-3 pt-4">
              <Button onClick={handleAddTask} className="flex-1" disabled={!newTaskTitle.trim()}>Save Task</Button>
              <Button variant="outline" onClick={() => setTaskDrawerOpen(false)} className="flex-1">Cancel</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit Opportunity Drawer */}
      <AddOpportunityDrawer open={editDrawerOpen} onOpenChange={setEditDrawerOpen} editOpportunity={opp} />
    </div>
  );
}

function TaskRow({ task, onToggle, today }: { task: any; onToggle: () => void; today: Date }) {
  const daysUntil = differenceInDays(new Date(task.dueDate), today);
  const isOverdue = !task.completed && daysUntil < 0;
  const isDueSoon = !task.completed && daysUntil >= 0 && daysUntil <= 3;

  return (
    <div className={cn("flex items-start gap-3 rounded-md px-3 py-2.5 transition-colors group", task.completed ? "opacity-50" : "hover:bg-muted/50")}>
      <Checkbox checked={task.completed} onCheckedChange={onToggle} className="mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm leading-snug", task.completed && "line-through text-muted-foreground")}>
          {task.title}
        </p>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <Badge className={cn("text-[10px]", TASK_TYPE_COLORS[task.type as keyof typeof TASK_TYPE_COLORS])}>{task.type}</Badge>
          <Badge className={cn("text-[10px]", PRIORITY_COLORS[task.priority as keyof typeof PRIORITY_COLORS])}>{task.priority}</Badge>
          {task.dueDate && (
            <span className={cn("text-[10px]", isOverdue ? "text-destructive font-medium" : isDueSoon ? "text-rag-amber font-medium" : "text-muted-foreground")}>
              <Clock className="h-2.5 w-2.5 inline mr-0.5" />
              {task.dueDate}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">{task.owner}</span>
        </div>
      </div>
    </div>
  );
}

function SidebarRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground text-right">{value}</span>
    </div>
  );
}
