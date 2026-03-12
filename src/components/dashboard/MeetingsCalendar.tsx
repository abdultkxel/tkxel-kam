import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays, ChevronLeft, ChevronRight, Presentation, Shield, Users } from "lucide-react";
import { MOCK_CALENDAR_EVENTS, MOCK_MEETINGS } from "@/data/governance";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  addMonths, subMonths, isSameDay, isSameMonth, isToday,
} from "date-fns";

interface CalendarMeeting {
  id: string;
  title: string;
  date: string;
  type: string;
}

function getAllMeetings(): CalendarMeeting[] {
  const fromEvents = MOCK_CALENDAR_EVENTS.map(e => ({
    id: e.id, title: e.title, date: e.date, type: e.type,
  }));
  const fromMeetings = MOCK_MEETINGS.map(m => ({
    id: m.id, title: `${m.type} — ${m.agenda.slice(0, 40)}`, date: m.scheduledDate, type: m.type,
  }));
  // Deduplicate by date + type
  const seen = new Set<string>();
  const all: CalendarMeeting[] = [];
  for (const m of [...fromEvents, ...fromMeetings]) {
    const key = `${m.date}-${m.type}`;
    if (!seen.has(key)) { seen.add(key); all.push(m); }
  }
  return all.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

const typeConfig: Record<string, { icon: React.ElementType; dotClass: string; bgClass: string }> = {
  QBR: { icon: Presentation, dotClass: "bg-primary", bgClass: "bg-primary/10 text-primary" },
  SteerCo: { icon: Shield, dotClass: "bg-info", bgClass: "bg-info/10 text-info" },
  Meeting: { icon: Users, dotClass: "bg-rag-green", bgClass: "bg-rag-green/10 text-rag-green" },
};

export function MeetingsCalendar() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const meetings = getAllMeetings();

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDow = getDay(monthStart); // 0=Sun

  const getMeetingsForDay = (day: Date) =>
    meetings.filter(m => isSameDay(new Date(m.date), day));

  // Upcoming list (next 30 days from today)
  const now = new Date();
  const upcomingMeetings = meetings.filter(m => {
    const d = new Date(m.date);
    return d >= now && d.getTime() - now.getTime() <= 30 * 24 * 60 * 60 * 1000;
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" /> Meetings Calendar
          </CardTitle>
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
      </CardHeader>
      <CardContent>
        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-px mb-1">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
            <div key={d} className="text-[10px] font-medium text-muted-foreground text-center py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px">
          {/* Empty cells for offset */}
          {Array.from({ length: startDow }).map((_, i) => (
            <div key={`empty-${i}`} className="h-10" />
          ))}
          {days.map(day => {
            const dayMeetings = getMeetingsForDay(day);
            const today = isToday(day);
            return (
              <div
                key={day.toISOString()}
                className={`h-10 flex flex-col items-center justify-start pt-1 rounded-md transition-colors ${
                  today ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted/50"
                }`}
              >
                <span className={`text-xs leading-none ${
                  today ? "font-bold text-primary" : "text-foreground"
                }`}>
                  {format(day, "d")}
                </span>
                {dayMeetings.length > 0 && (
                  <div className="flex gap-0.5 mt-1">
                    {dayMeetings.slice(0, 3).map((m, i) => {
                      const cfg = typeConfig[m.type] || typeConfig.Meeting;
                      return <span key={i} className={`h-1.5 w-1.5 rounded-full ${cfg.dotClass}`} />;
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border">
          {Object.entries(typeConfig).map(([type, cfg]) => (
            <div key={type} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${cfg.dotClass}`} />
              <span className="text-[10px] text-muted-foreground">{type}</span>
            </div>
          ))}
        </div>

        {/* Upcoming list */}
        {upcomingMeetings.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Upcoming</p>
            {upcomingMeetings.slice(0, 5).map(m => {
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
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {daysAway === 0 ? "Today" : daysAway === 1 ? "Tomorrow" : `${daysAway}d`}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
