import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { type GovernanceFormData, type GovMeeting, type GovEscalation } from "@/data/onboarding";

interface Props {
  data: GovernanceFormData;
  onChange: (d: GovernanceFormData) => void;
}

export function WizardStep4({ data, onChange }: Props) {
  const addQBR = () => onChange({ ...data, qbrs: [...data.qbrs, { id: crypto.randomUUID(), date: "", status: "Planned", notes: "" }] });
  const addSteerCo = () => onChange({ ...data, steercos: [...data.steercos, { id: crypto.randomUUID(), date: "", status: "Planned", notes: "" }] });
  const addEscalation = () => onChange({ ...data, escalations: [...data.escalations, { id: crypto.randomUUID(), title: "", severity: "Medium", status: "Open", date: "" }] });

  const updateMeeting = (type: "qbrs" | "steercos", id: string, field: keyof GovMeeting, value: string) => {
    onChange({ ...data, [type]: data[type].map((m: GovMeeting) => m.id === id ? { ...m, [field]: value } : m) });
  };

  const updateEscalation = (id: string, field: keyof GovEscalation, value: string) => {
    onChange({ ...data, escalations: data.escalations.map(e => e.id === id ? { ...e, [field]: value } : e) });
  };

  const removeMeeting = (type: "qbrs" | "steercos", id: string) => {
    onChange({ ...data, [type]: data[type].filter((m: GovMeeting) => m.id !== id) });
  };

  const removeEscalation = (id: string) => {
    onChange({ ...data, escalations: data.escalations.filter(e => e.id !== id) });
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-foreground">Governance</h2>
        <p className="text-sm text-muted-foreground mt-1">Establish the meeting and reporting structure.</p>
      </div>

      <div className="rounded-md p-4 border-l-4" style={{ backgroundColor: "#F9FAFB", borderLeftColor: "#9CA3AF" }}>
        <p className="text-sm text-muted-foreground">
          Recommended within <strong>3 weeks</strong> of account creation. If skipped, tasks will be auto-generated.
        </p>
      </div>

      {/* QBRs */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-foreground uppercase tracking-wide mb-2">QBRs</legend>
        {data.qbrs.map((m, idx) => (
          <MeetingRow key={m.id} meeting={m} index={idx}
            onUpdate={(f, v) => updateMeeting("qbrs", m.id, f, v)}
            onRemove={() => removeMeeting("qbrs", m.id)} />
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addQBR}>
          <Plus className="h-4 w-4 mr-1" /> Add QBR
        </Button>
      </fieldset>

      {/* Steering Committees */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-foreground uppercase tracking-wide mb-2">Steering Committees</legend>
        {data.steercos.map((m, idx) => (
          <MeetingRow key={m.id} meeting={m} index={idx}
            onUpdate={(f, v) => updateMeeting("steercos", m.id, f, v)}
            onRemove={() => removeMeeting("steercos", m.id)} />
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addSteerCo}>
          <Plus className="h-4 w-4 mr-1" /> Add SteerCo
        </Button>
      </fieldset>

      {/* Escalations */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-foreground uppercase tracking-wide mb-2">Escalations</legend>
        {data.escalations.map((e, idx) => (
          <div key={e.id} className="relative border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Escalation {idx + 1}</span>
              <button type="button" onClick={() => removeEscalation(e.id)} className="text-destructive hover:text-destructive/80">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input value={e.title} onChange={ev => updateEscalation(e.id, "title", ev.target.value)} placeholder="Title" />
              <Input type="date" value={e.date} onChange={ev => updateEscalation(e.id, "date", ev.target.value)} />
              <Select value={e.severity} onValueChange={v => updateEscalation(e.id, "severity", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Low">Low</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                </SelectContent>
              </Select>
              <Select value={e.status} onValueChange={v => updateEscalation(e.id, "status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Open">Open</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                  <SelectItem value="Resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addEscalation}>
          <Plus className="h-4 w-4 mr-1" /> Add Escalation
        </Button>
      </fieldset>
    </div>
  );
}

function MeetingRow({ meeting, index, onUpdate, onRemove }: {
  meeting: GovMeeting; index: number;
  onUpdate: (field: keyof GovMeeting, value: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="relative border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Entry {index + 1}</span>
        <button type="button" onClick={onRemove} className="text-destructive hover:text-destructive/80">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Input type="date" value={meeting.date} onChange={e => onUpdate("date", e.target.value)} />
        <Select value={meeting.status} onValueChange={v => onUpdate("status", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Planned">Planned</SelectItem>
            <SelectItem value="Completed">Completed</SelectItem>
            <SelectItem value="Cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Input value={meeting.notes} onChange={e => onUpdate("notes", e.target.value)} placeholder="Notes (optional)" />
      </div>
    </div>
  );
}
