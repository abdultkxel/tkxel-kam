import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CalendarDays, ChevronLeft, ChevronRight, Presentation, Shield, Users,
  TrendingUp, ClipboardCheck, Plus, Filter,
} from "lucide-react";
import { MOCK_CALENDAR_EVENTS, MOCK_MEETINGS, CalendarEvent } from "@/data/governance";
import { useOpportunities } from "@/contexts/OpportunitiesContext";
import { useOpportunityDetail } from "@/contexts/OpportunityDetailContext";
import { isOpenStage, formatCurrency } from "@/data/opportunities";
import { MOCK_ACCOUNTS } from "@/data/accounts";
import { useAuth } from "@/contexts/AuthContext";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  addMonths, subMonths, isSameDay, isToday,
} from "date-fns";

interface CalendarMeeting {
  id: string;
  title: string;
  date: string;
  type: string;
  accountId: string;
  accountName: string;
}

function getAllMeetings(): CalendarMeeting[] {
  const fromEvents: CalendarMeeting[] = MOCK_CALENDAR_EVENTS.map(e => ({
    id: e.id, title: e.title, date: e.date, type: e.type,
    accountId: e.accountId, accountName: e.accountName,
  }));
  const fromMeetings: CalendarMeeting[] = MOCK_MEETINGS.map(m => ({
    id: m.id, title: `${m.type} — ${m.agenda.slice(0, 40)}`,
    date: m.scheduledDate, type: m.type,
    accountId: m.accountId, accountName: m.accountName,
  }));
  const seen = new Set<string>();
  const all: CalendarMeeting[] = [];
  for (const m of [...fromEvents, ...fromMeetings]) {
    const key = `${m.date}-${m.type}-${m.accountId}`;
    if (!seen.has(key)) { seen.add(key); all.push(m); }
  }
  return all.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

const typeConfig: Record<string, { icon: React.ElementType; dotClass: string; bgClass: string }> = {
  QBR: { icon: Presentation, dotClass: "bg-primary", bgClass: "bg-primary/10 text-primary" },
  SteerCo: { icon: Shield, dotClass: "bg-info", bgClass: "bg-info/10 text-info" },
  Meeting: { icon: Users, dotClass: "bg-rag-green", bgClass: "bg-rag-green/10 text-rag-green" },
  Task: { icon: ClipboardCheck, dotClass: "bg-chart-5", bgClass: "bg-chart-5/10 text-chart-5" },
  "Opp Close": { icon: TrendingUp, dotClass: "bg-chart-4", bgClass: "bg-chart-4/10 text-chart-4" },
  "Opp Task": { icon: ClipboardCheck, dotClass: "bg-chart-5", bgClass: "bg-chart-5/10 text-chart-5" },
};

const EVENT_TYPES = ["QBR", "SteerCo", "Meeting", "Task"] as const;

export function MeetingsCalendar() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [customEvents, setCustomEvents] = useState<CalendarMeeting[]>([]);
  const [newEvent, setNewEvent] = useState({
    title: "",
    date: new Date().toISOString().split("T")[0],
    type: "Meeting" as string,
    accountId: "",
  });

  const { opportunities } = useOpportunities();
  const { tasks: oppTasks } = useOpportunityDetail();
  const { user } = useAuth();
  const isAM = user?.role === "am";

  // Get AM's allocated accounts
  const allocatedAccounts = isAM
    ? MOCK_ACCOUNTS.filter(a => a.amId === user?.id)
    : MOCK_ACCOUNTS;

  // Merge all events
  const meetings = useMemo(() => {
    const base = getAllMeetings();

    const oppCloseEvents: CalendarMeeting[] = opportunities
      .filter(o => isOpenStage(o.stage))
      .map(o => {
        const acc = MOCK_ACCOUNTS.find(a => a.id === o.accountId);
        return {
          id: `opp-close-${o.id}`,
          title: `${acc?.name}: ${o.name} closes (${formatCurrency(o.estimatedValue)})`,
          date: o.targetClose,
          type: "Opp Close",
          accountId: o.accountId,
          accountName: acc?.name || "",
        };
      });

    const oppTaskEvents: CalendarMeeting[] = oppTasks
      .filter(t => !t.completed)
      .map(t => {
        const opp = opportunities.find(o => o.id === t.opportunityId);
        const acc = opp ? MOCK_ACCOUNTS.find(a => a.id === opp.accountId) : null;
        return {
          id: `opp-task-${t.id}`,
          title: `${t.title}${opp ? ` (${opp.name})` : ""}`,
          date: t.dueDate,
          type: "Opp Task",
          accountId: acc?.id || "",
          accountName: acc?.name || "",
        };
      });

    return [...base, ...oppCloseEvents, ...oppTaskEvents, ...customEvents]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [opportunities, oppTasks, customEvents]);

  // Filter by account
  const filteredMeetings = useMemo(() => {
    if (accountFilter === "all") return meetings;
    return meetings.filter(m => m.accountId === accountFilter);
  }, [meetings, accountFilter]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDow = getDay(monthStart);

  const getMeetingsForDay = (day: Date) =>
    filteredMeetings.filter(m => isSameDay(new Date(m.date), day));

  const now = new Date();
  const upcomingMeetings = filteredMeetings.filter(m => {
    const d = new Date(m.date);
    return d >= now && d.getTime() - now.getTime() <= 30 * 24 * 60 * 60 * 1000;
  });

  // Selected day events
  const selectedDayEvents = selectedDay ? getMeetingsForDay(selectedDay) : [];

  const handleAddEvent = () => {
    if (!newEvent.title.trim() || !newEvent.accountId) return;
    const acc = MOCK_ACCOUNTS.find(a => a.id === newEvent.accountId);
    const event: CalendarMeeting = {
      id: `custom-${Date.now()}`,
      title: newEvent.title,
      date: newEvent.date,
      type: newEvent.type,
      accountId: newEvent.accountId,
      accountName: acc?.name || "",
    };
    setCustomEvents(prev => [...prev, event]);
    setNewEvent({ title: "", date: new Date().toISOString().split("T")[0], type: "Meeting", accountId: "" });
    setAddDialogOpen(false);
  };

  const openAddForDay = (day: Date) => {
    setNewEvent(prev => ({ ...prev, date: day.toISOString().split("T")[0] }));
    setAddDialogOpen(true);
  };

  // Unique accounts that have events
  const accountsWithEvents = useMemo(() => {
    const ids = new Set(meetings.map(m => m.accountId).filter(Boolean));
    return MOCK_ACCOUNTS.filter(a => ids.has(a.id));
  }, [meetings]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" /> Global Meetings Calendar
          </CardTitle>
          <div className="flex items-center gap-2">
            {/* Account filter */}
            <div className="flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <Select value={accountFilter} onValueChange={setAccountFilter}>
                <SelectTrigger className="h-8 text-xs w-[160px]">
                  <SelectValue placeholder="All Accounts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Accounts</SelectItem>
                  {accountsWithEvents.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Add Event button */}
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => setAddDialogOpen(true)}>
              <Plus className="h-3 w-3" /> Add Event
            </Button>
            {/* Month nav */}
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium text-foreground min-w-[120px] text-center">
                {format(currentMonth, "MMMM yyyy")}
              </span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Calendar grid */}
          <div className="lg:col-span-2">
            <div className="grid grid-cols-7 gap-px mb-1">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                <div key={d} className="text-[10px] font-medium text-muted-foreground text-center py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px">
              {Array.from({ length: startDow }).map((_, i) => (
                <div key={`empty-${i}`} className="h-16" />
              ))}
              {days.map(day => {
                const dayMeetings = getMeetingsForDay(day);
                const todayCheck = isToday(day);
                const isSelected = selectedDay && isSameDay(day, selectedDay);
                return (
                  <div
                    key={day.toISOString()}
                    onClick={() => setSelectedDay(day)}
                    className={`h-16 flex flex-col items-center justify-start pt-1 rounded-md transition-colors cursor-pointer ${
                      isSelected ? "bg-primary/15 ring-1 ring-primary/40" :
                      todayCheck ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted/50"
                    }`}
                  >
                    <span className={`text-xs leading-none ${
                      todayCheck ? "font-bold text-primary" : "text-foreground"
                    }`}>
                      {format(day, "d")}
                    </span>
                    {dayMeetings.length > 0 && (
                      <div className="flex flex-col items-center gap-0.5 mt-1">
                        <div className="flex gap-0.5">
                          {dayMeetings.slice(0, 3).map((m, i) => {
                            const cfg = typeConfig[m.type] || typeConfig.Meeting;
                            return <span key={i} className={`h-1.5 w-1.5 rounded-full ${cfg.dotClass}`} />;
                          })}
                        </div>
                        {dayMeetings.length > 3 && (
                          <span className="text-[8px] text-muted-foreground">+{dayMeetings.length - 3}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border flex-wrap">
              {Object.entries(typeConfig).map(([type, cfg]) => (
                <div key={type} className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${cfg.dotClass}`} />
                  <span className="text-[10px] text-muted-foreground">{type}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right sidebar: selected day or upcoming */}
          <div className="border-l border-border pl-4">
            {selectedDay ? (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-foreground">{format(selectedDay, "EEEE, MMM d")}</h3>
                  <Button variant="ghost" size="sm" className="h-6 text-xs text-primary" onClick={() => openAddForDay(selectedDay)}>
                    <Plus className="h-3 w-3 mr-1" /> Add
                  </Button>
                </div>
                {selectedDayEvents.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">No events on this day</p>
                ) : (
                  <ScrollArea className="max-h-[300px]">
                    <div className="space-y-2">
                      {selectedDayEvents.map(m => {
                        const cfg = typeConfig[m.type] || typeConfig.Meeting;
                        const Icon = cfg.icon;
                        return (
                          <div key={m.id} className="flex items-start gap-2 p-2 rounded-md bg-muted/30">
                            <div className={`h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${cfg.bgClass}`}>
                              <Icon className="h-3 w-3" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-foreground">{m.title}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-[9px]">{m.type}</Badge>
                                {m.accountName && (
                                  <span className="text-[10px] text-muted-foreground">{m.accountName}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </div>
            ) : (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Upcoming (30 days)</p>
                {upcomingMeetings.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">No upcoming events</p>
                ) : (
                  <ScrollArea className="max-h-[300px]">
                    <div className="space-y-1.5">
                      {upcomingMeetings.slice(0, 10).map(m => {
                        const cfg = typeConfig[m.type] || typeConfig.Meeting;
                        const Icon = cfg.icon;
                        const daysAway = Math.ceil((new Date(m.date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                        return (
                          <div key={m.id} className="flex items-center gap-2 py-1.5">
                            <div className={`h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 ${cfg.bgClass}`}>
                              <Icon className="h-3 w-3" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-foreground truncate">{m.title}</p>
                              {m.accountName && (
                                <p className="text-[10px] text-muted-foreground">{m.accountName}</p>
                              )}
                            </div>
                            <Badge variant="outline" className="text-[10px] shrink-0">
                              {daysAway === 0 ? "Today" : daysAway === 1 ? "Tomorrow" : `${daysAway}d`}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>

      {/* Add Event Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Add Event</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Event Title</label>
              <Input
                placeholder="e.g. Weekly Sync, QBR Prep..."
                value={newEvent.title}
                onChange={e => setNewEvent(prev => ({ ...prev, title: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Account</label>
              <Select value={newEvent.accountId} onValueChange={v => setNewEvent(prev => ({ ...prev, accountId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {allocatedAccounts.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Event Type</label>
                <Select value={newEvent.type} onValueChange={v => setNewEvent(prev => ({ ...prev, type: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Date</label>
                <Input
                  type="date"
                  value={newEvent.date}
                  onChange={e => setNewEvent(prev => ({ ...prev, date: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddEvent} disabled={!newEvent.title.trim() || !newEvent.accountId}>Add Event</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
