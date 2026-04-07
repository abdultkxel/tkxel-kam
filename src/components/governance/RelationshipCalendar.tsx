import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Plus, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/data/governance";

interface Props {
  events: CalendarEvent[];
  onUpdate: (events: CalendarEvent[]) => void;
}

const TYPE_COLORS: Record<string, string> = {
  QBR: "bg-primary/10 text-primary border-primary/20",
  SteerCo: "bg-rag-amber/10 text-rag-amber border-rag-amber/20",
  Meeting: "bg-info/10 text-info border-info/20",
};

export function RelationshipCalendar({ events, onUpdate }: Props) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = currentDate.toLocaleString("default", { month: "long", year: "numeric" });

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const eventsByDay = useMemo(() => {
    const map: Record<number, CalendarEvent[]> = {};
    events.forEach(e => {
      const d = new Date(e.date);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate();
        if (!map[day]) map[day] = [];
        map[day].push(e);
      }
    });
    return map;
  }, [events, year, month]);

  const openNewEvent = (day?: number) => {
    const d = day ? new Date(year, month, day) : new Date();
    setEditEvent({
      id: `ce-${Date.now()}`,
      title: "",
      date: d.toISOString().split("T")[0],
      type: "Meeting",
      accountId: "",
      accountName: "",
    });
    setDialogOpen(true);
  };

  const openEditEvent = (ev: CalendarEvent) => {
    setEditEvent({ ...ev });
    setDialogOpen(true);
  };

  const saveEvent = () => {
    if (!editEvent) return;
    const exists = events.find(e => e.id === editEvent.id);
    if (exists) {
      onUpdate(events.map(e => e.id === editEvent.id ? editEvent : e));
    } else {
      onUpdate([...events, editEvent]);
    }
    setDialogOpen(false);
    setEditEvent(null);
  };

  const deleteEvent = () => {
    if (!editEvent) return;
    onUpdate(events.filter(e => e.id !== editEvent.id));
    setDialogOpen(false);
    setEditEvent(null);
  };

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const today = new Date();
  const isToday = (day: number) => today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="h-4 w-4" /> Relationship Calendar
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-sm font-medium min-w-[140px] text-center">{monthName}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" className="text-xs gap-1 ml-2" onClick={() => openNewEvent()}>
              <Plus className="h-3.5 w-3.5" /> Event
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
          {days.map(d => (
            <div key={d} className="bg-muted/50 p-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
          ))}
          {cells.map((day, i) => (
            <div
              key={i}
              className={cn(
                "bg-background min-h-[80px] p-1.5 text-xs cursor-pointer hover:bg-muted/30 transition-colors",
                !day && "bg-muted/20"
              )}
              onClick={() => day && openNewEvent(day)}
            >
              {day && (
                <>
                  <span className={cn(
                    "inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-medium mb-0.5",
                    isToday(day) && "bg-primary text-primary-foreground"
                  )}>{day}</span>
                  <div className="space-y-0.5">
                    {(eventsByDay[day] || []).map(ev => (
                      <button
                        key={ev.id}
                        onClick={(e) => { e.stopPropagation(); openEditEvent(ev); }}
                        className={cn("w-full text-left rounded px-1 py-0.5 text-[10px] font-medium truncate border", TYPE_COLORS[ev.type])}
                      >
                        {ev.title || ev.type}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex gap-3 mt-3">
          {Object.entries(TYPE_COLORS).map(([type, cls]) => (
            <div key={type} className="flex items-center gap-1">
              <div className={cn("h-2.5 w-2.5 rounded-sm", cls.split(" ")[0])} />
              <span className="text-[10px] text-muted-foreground">{type}</span>
            </div>
          ))}
        </div>
      </CardContent>

      {/* Edit/Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-sm">{editEvent && events.find(e => e.id === editEvent.id) ? "Edit Event" : "New Event"}</DialogTitle>
          </DialogHeader>
          {editEvent && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Title</label>
                <Input value={editEvent.title} onChange={e => setEditEvent({ ...editEvent, title: e.target.value })} placeholder="Event title..." />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Date</label>
                <Input type="date" value={editEvent.date} onChange={e => setEditEvent({ ...editEvent, date: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Type</label>
                <Select value={editEvent.type} onValueChange={v => setEditEvent({ ...editEvent, type: v as CalendarEvent["type"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="QBR">QBR</SelectItem>
                    <SelectItem value="SteerCo">SteerCo</SelectItem>
                    <SelectItem value="Meeting">Meeting</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 justify-end pt-2">
                {events.find(e => e.id === editEvent.id) && (
                  <Button variant="ghost" size="sm" className="text-xs text-destructive" onClick={deleteEvent}>Delete</Button>
                )}
                <Button size="sm" className="text-xs" onClick={saveEvent}>Save</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
