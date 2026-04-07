import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronDown, Plus, Trash2, ExternalLink, Calendar, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MeetingActivity, ActionItem, ActivityStatus, ActionItemStatus } from "@/data/governance";
import { TEAM_MEMBERS, getDueDateStatus } from "@/data/governance";

interface Props {
  type: "QBR" | "SteerCo";
  meetings: MeetingActivity[];
  onUpdate: (meetings: MeetingActivity[]) => void;
}

const STATUS_STYLES: Record<ActivityStatus, string> = {
  Planned: "bg-info/10 text-info border-info/20",
  Completed: "bg-rag-green/10 text-rag-green border-rag-green/20",
  Cancelled: "bg-muted text-muted-foreground border-border",
};

const ACTION_STATUS_STYLES: Record<ActionItemStatus, string> = {
  "Not Started": "bg-muted text-muted-foreground",
  "In Progress": "bg-info/10 text-info",
  Complete: "bg-rag-green/10 text-rag-green",
  Blocked: "bg-rag-red/10 text-rag-red",
};

export function MeetingCard({ type, meetings, onUpdate }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sectionOpen, setSectionOpen] = useState(true);

  const label = type === "QBR" ? "Quarterly Business Reviews" : "Steering Committees";
  const filtered = meetings.filter(m => m.type === type);

  const addMeeting = () => {
    const newMeeting: MeetingActivity = {
      id: `m-${Date.now()}`, type, accountId: "", accountName: "", scheduledDate: new Date().toISOString().split("T")[0],
      status: "Planned", agenda: "", recordingUrl: "", mom: "", actionItems: [],
      createdAt: new Date().toISOString().split("T")[0],
    };
    onUpdate([...meetings, newMeeting]);
    setExpandedId(newMeeting.id);
  };

  const updateMeeting = (id: string, patch: Partial<MeetingActivity>) => {
    onUpdate(meetings.map(m => m.id === id ? { ...m, ...patch } : m));
  };

  const deleteMeeting = (id: string) => {
    onUpdate(meetings.filter(m => m.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const addActionItem = (meetingId: string) => {
    const m = meetings.find(m => m.id === meetingId);
    if (!m) return;
    const ai: ActionItem = { id: `ai-${Date.now()}`, task: "", owner: TEAM_MEMBERS[0], dueDate: "", status: "Not Started" };
    updateMeeting(meetingId, { actionItems: [...m.actionItems, ai] });
  };

  const updateActionItem = (meetingId: string, aiId: string, patch: Partial<ActionItem>) => {
    const m = meetings.find(m => m.id === meetingId);
    if (!m) return;
    updateMeeting(meetingId, { actionItems: m.actionItems.map(a => a.id === aiId ? { ...a, ...patch } : a) });
  };

  const deleteActionItem = (meetingId: string, aiId: string) => {
    const m = meetings.find(m => m.id === meetingId);
    if (!m) return;
    updateMeeting(meetingId, { actionItems: m.actionItems.filter(a => a.id !== aiId) });
  };

  return (
    <Collapsible open={sectionOpen} onOpenChange={setSectionOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4" /> {label}
                <Badge variant="secondary" className="text-[10px]">{filtered.length}</Badge>
              </CardTitle>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", sectionOpen && "rotate-180")} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-3 pt-0">
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No {label.toLowerCase()} yet.</p>
            )}
            {filtered.map(meeting => {
              const dateStatus = getDueDateStatus(meeting.scheduledDate);
              return (
                <div key={meeting.id} className="border border-border rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedId(expandedId === meeting.id ? null : meeting.id)}
                    className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className={cn(
                        "text-sm font-medium",
                        dateStatus === "overdue" && "text-rag-red",
                        dateStatus === "upcoming" && "text-rag-amber",
                        dateStatus === "normal" && "text-foreground"
                      )}>
                        {meeting.scheduledDate}
                      </span>
                      {dateStatus === "overdue" && (
                        <TooltipProvider><Tooltip><TooltipTrigger><AlertCircle className="h-3.5 w-3.5 text-rag-red" /></TooltipTrigger><TooltipContent>Overdue</TooltipContent></Tooltip></TooltipProvider>
                      )}
                      {dateStatus === "upcoming" && (
                        <TooltipProvider><Tooltip><TooltipTrigger><AlertCircle className="h-3.5 w-3.5 text-rag-amber" /></TooltipTrigger><TooltipContent>Due within 7 days</TooltipContent></Tooltip></TooltipProvider>
                      )}
                      <Badge className={cn("text-[10px] border", STATUS_STYLES[meeting.status])}>{meeting.status}</Badge>
                      <span className="text-xs text-muted-foreground truncate max-w-[200px]">{meeting.agenda || "No agenda"}</span>
                    </div>
                    <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform flex-shrink-0", expandedId === meeting.id && "rotate-180")} />
                  </button>

                  {expandedId === meeting.id && (
                    <div className="p-4 border-t border-border space-y-4 bg-muted/10">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Scheduled Date</label>
                          <Input type="date" value={meeting.scheduledDate} onChange={e => updateMeeting(meeting.id, { scheduledDate: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Status</label>
                          <Select value={meeting.status} onValueChange={v => updateMeeting(meeting.id, { status: v as ActivityStatus })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Planned">Planned</SelectItem>
                              <SelectItem value="Completed">Completed</SelectItem>
                              <SelectItem value="Cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Agenda</label>
                        <Textarea value={meeting.agenda} onChange={e => updateMeeting(meeting.id, { agenda: e.target.value })} rows={2} placeholder="Meeting agenda..." />
                      </div>

                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Meeting Recording URL</label>
                        <div className="flex gap-2">
                          <Input value={meeting.recordingUrl} onChange={e => updateMeeting(meeting.id, { recordingUrl: e.target.value })} placeholder="https://..." />
                          {meeting.recordingUrl && (
                            <Button variant="outline" size="icon" asChild><a href={meeting.recordingUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a></Button>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Minutes of Meeting (MoM)</label>
                        <Textarea value={meeting.mom} onChange={e => updateMeeting(meeting.id, { mom: e.target.value })} rows={3} placeholder="Meeting notes..." />
                      </div>

                      {/* Action Items */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs font-medium text-foreground">Action Items</label>
                          <Button variant="outline" size="sm" onClick={() => addActionItem(meeting.id)} className="h-7 text-xs gap-1">
                            <Plus className="h-3 w-3" /> Add
                          </Button>
                        </div>
                        {meeting.actionItems.length === 0 && <p className="text-xs text-muted-foreground">No action items.</p>}
                        <div className="space-y-2">
                          {meeting.actionItems.map(ai => {
                            const aiDateStatus = ai.dueDate ? getDueDateStatus(ai.dueDate) : "normal";
                            return (
                              <div key={ai.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center">
                                <Input value={ai.task} onChange={e => updateActionItem(meeting.id, ai.id, { task: e.target.value })} placeholder="Task..." className="text-xs h-8" />
                                <Select value={ai.owner} onValueChange={v => updateActionItem(meeting.id, ai.id, { owner: v })}>
                                  <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>{TEAM_MEMBERS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                                </Select>
                                <Input type="date" value={ai.dueDate} onChange={e => updateActionItem(meeting.id, ai.id, { dueDate: e.target.value })}
                                  className={cn("w-[130px] h-8 text-xs", aiDateStatus === "overdue" && "border-rag-red text-rag-red", aiDateStatus === "upcoming" && "border-rag-amber text-rag-amber")} />
                                <Select value={ai.status} onValueChange={v => updateActionItem(meeting.id, ai.id, { status: v as ActionItemStatus })}>
                                  <SelectTrigger className="w-[110px] h-8 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {(["Not Started", "In Progress", "Complete", "Blocked"] as ActionItemStatus[]).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteActionItem(meeting.id, ai.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <Button variant="ghost" size="sm" className="text-xs text-destructive hover:text-destructive" onClick={() => deleteMeeting(meeting.id)}>
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <Button variant="outline" size="sm" onClick={addMeeting} className="w-full text-xs gap-1">
              <Plus className="h-3.5 w-3.5" /> Add {type}
            </Button>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
