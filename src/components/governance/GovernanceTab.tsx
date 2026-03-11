import { useState } from "react";
import { MeetingCard } from "./MeetingCard";
import { EscalationCard } from "./EscalationCard";
import { RelationshipCalendar } from "./RelationshipCalendar";
import { MOCK_MEETINGS, MOCK_ESCALATIONS, MOCK_CALENDAR_EVENTS } from "@/data/governance";
import type { MeetingActivity, Escalation, CalendarEvent } from "@/data/governance";
import type { Account } from "@/data/accounts";

interface Props {
  account: Account;
}

export function GovernanceTab({ account }: Props) {
  const [meetings, setMeetings] = useState<MeetingActivity[]>(MOCK_MEETINGS);
  const [escalations, setEscalations] = useState<Escalation[]>(MOCK_ESCALATIONS);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>(MOCK_CALENDAR_EVENTS);

  return (
    <div className="space-y-4">
      <RelationshipCalendar events={calendarEvents} onUpdate={setCalendarEvents} />
      <MeetingCard type="QBR" meetings={meetings} onUpdate={setMeetings} />
      <MeetingCard type="SteerCo" meetings={meetings} onUpdate={setMeetings} />
      <EscalationCard escalations={escalations} onUpdate={setEscalations} />
    </div>
  );
}
