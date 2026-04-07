import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import {
  type KycFormData, type KycContact,
  INDUSTRIES, ENGAGEMENT_MODELS, REVENUE_RANGES, SENIORITY_LEVELS, CONTACT_TYPES,
} from "@/data/onboarding";

interface Props {
  data: KycFormData;
  onChange: (d: KycFormData) => void;
  errors: Record<string, string>;
}

export function WizardStep1({ data, onChange, errors }: Props) {
  const set = (key: keyof KycFormData, value: any) => onChange({ ...data, [key]: value });

  const updateContact = (id: string, field: keyof KycContact, value: string) => {
    onChange({
      ...data,
      contacts: data.contacts.map(c => c.id === id ? { ...c, [field]: value } : c),
    });
  };

  const addContact = () => {
    onChange({
      ...data,
      contacts: [...data.contacts, { id: crypto.randomUUID(), name: "", title: "", seniority: "", ownerAtTkxel: "", type: "" }],
    });
  };

  const removeContact = (id: string) => {
    if (data.contacts.length <= 1) return;
    onChange({ ...data, contacts: data.contacts.filter(c => c.id !== id) });
  };

  return (
    <div className="space-y-8">
      {/* Blue info banner */}
      <div className="rounded-md p-4 border-l-4" style={{ backgroundColor: "#EFF6FF", borderLeftColor: "#1D4ED8" }}>
        <p className="text-sm font-medium" style={{ color: "#1D4ED8" }}>
          KYC must be completed to activate this account.
        </p>
      </div>

      {/* Account record fields */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-foreground uppercase tracking-wide mb-2">Account Record</legend>
        <Field label="Account Name" error={errors.accountName} required>
          <Input value={data.accountName} onChange={e => { set("accountName", e.target.value); set("companyName", e.target.value); }}
            placeholder="e.g. Acme Corp" className={errors.accountName ? "border-destructive" : ""} />
        </Field>
        <Field label="Segment" error={errors.segment} required>
          <div className="flex gap-3">
            {(["Growth", "Retention"] as const).map(s => (
              <button key={s} type="button" onClick={() => set("segment", s)}
                className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                  data.segment === s
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground border-border hover:bg-muted"
                }`}>{s}</button>
            ))}
          </div>
        </Field>
        <Field label="Engagement Model" error={errors.engagementModel} required>
          <Select value={data.engagementModel} onValueChange={v => set("engagementModel", v)}>
            <SelectTrigger className={errors.engagementModel ? "border-destructive" : ""}>
              <SelectValue placeholder="Select model" />
            </SelectTrigger>
            <SelectContent>{ENGAGEMENT_MODELS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      </fieldset>

      {/* Section 1 — Client Overview */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-foreground uppercase tracking-wide mb-2">Section 1 — Client Overview</legend>
        <Field label="Company Name" error={errors.companyName} required>
          <Input value={data.companyName} onChange={e => set("companyName", e.target.value)}
            className={`${errors.companyName ? "border-destructive" : ""} ${data.companyName === data.accountName && data.accountName ? "bg-[#EFF6FF]" : ""}`}
            placeholder="Pre-filled from Account Name" />
        </Field>
        <Field label="Industry" error={errors.industry} required>
          <Select value={data.industry} onValueChange={v => set("industry", v)}>
            <SelectTrigger className={errors.industry ? "border-destructive" : ""}><SelectValue placeholder="Select industry" /></SelectTrigger>
            <SelectContent>{INDUSTRIES.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="HQ Location" error={errors.hqLocation} required>
            <Input value={data.hqLocation} onChange={e => set("hqLocation", e.target.value)} placeholder="San Francisco, CA"
              className={errors.hqLocation ? "border-destructive" : ""} />
          </Field>
          <Field label="Website" error={errors.website} required>
            <Input type="url" value={data.website} onChange={e => set("website", e.target.value)} placeholder="https://example.com"
              className={errors.website ? "border-destructive" : ""} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="LinkedIn" helper="Optional">
            <Input type="url" value={data.linkedin} onChange={e => set("linkedin", e.target.value)} placeholder="https://linkedin.com/company/..." />
          </Field>
          <Field label="Founded Year" helper="Optional">
            <Input type="number" value={data.foundedYear} onChange={e => set("foundedYear", e.target.value)} placeholder="2015" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Revenue Range">
            <Select value={data.revenueRange} onValueChange={v => set("revenueRange", v)}>
              <SelectTrigger><SelectValue placeholder="Select range" /></SelectTrigger>
              <SelectContent>{REVENUE_RANGES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Employee Count" helper="Optional">
            <Input type="number" value={data.employeeCount} onChange={e => set("employeeCount", e.target.value)} placeholder="500" />
          </Field>
        </div>
      </fieldset>

      {/* Section 2 — Key Contacts */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-foreground uppercase tracking-wide mb-2">Section 2 — Key Contacts</legend>
        {errors.contacts && <p className="text-sm text-destructive">{errors.contacts}</p>}
        {data.contacts.map((contact, idx) => (
          <div key={contact.id} className="relative border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Contact {idx + 1}</span>
              {data.contacts.length > 1 && (
                <button type="button" onClick={() => removeContact(contact.id)} className="text-destructive hover:text-destructive/80">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-[11px] text-muted-foreground">Name</span>
                  <Input value={contact.name} onChange={e => updateContact(contact.id, "name", e.target.value)} placeholder="Full name" />
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] text-muted-foreground">Title</span>
                  <Input value={contact.title} onChange={e => updateContact(contact.id, "title", e.target.value)} placeholder="Job title" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <span className="text-[11px] text-muted-foreground">Seniority</span>
                  <Select value={contact.seniority} onValueChange={v => updateContact(contact.id, "seniority", v)}>
                    <SelectTrigger><SelectValue placeholder="Seniority" /></SelectTrigger>
                    <SelectContent>{SENIORITY_LEVELS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] text-muted-foreground">Owner at Tkxel</span>
                  <Input value={contact.ownerAtTkxel} onChange={e => updateContact(contact.id, "ownerAtTkxel", e.target.value)} placeholder="Owner name" />
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] text-muted-foreground">Type</span>
                  <Select value={contact.type} onValueChange={v => updateContact(contact.id, "type", v)}>
                    <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
                    <SelectContent>{CONTACT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addContact}>
          <Plus className="h-4 w-4 mr-1" /> Add Contact
        </Button>
      </fieldset>

      {/* Section 3 — Engagement History */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-foreground uppercase tracking-wide mb-2">Section 3 — Engagement History</legend>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Start Date" error={errors.startDate} required>
            <Input type="date" value={data.startDate} onChange={e => set("startDate", e.target.value)}
              className={errors.startDate ? "border-destructive" : ""} />
          </Field>
          <Field label="Contract Value" error={errors.contractValue} required>
            <Input value={data.contractValue} onChange={e => set("contractValue", e.target.value)}
              placeholder="$1,200,000" className={errors.contractValue ? "border-destructive" : ""} />
          </Field>
        </div>
        <Field label="Services Engaged" error={errors.servicesEngaged} required>
          <Input value={data.servicesEngaged} onChange={e => set("servicesEngaged", e.target.value)}
            placeholder="Cloud Migration, Staff Augmentation" className={errors.servicesEngaged ? "border-destructive" : ""} />
        </Field>
        <Field label="Key Milestones" helper="Optional">
          <Textarea value={data.keyMilestones} onChange={e => set("keyMilestones", e.target.value)}
            placeholder="Phase 1 completed Jan 2026..." rows={3} />
        </Field>
      </fieldset>

      {/* Section 4 — Strategic Importance */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-foreground uppercase tracking-wide mb-2">Section 4 — Strategic Importance</legend>
        <Field label="Strategic Notes" helper="Optional">
          <Textarea value={data.strategicNotes} onChange={e => set("strategicNotes", e.target.value)}
            placeholder="Notes on strategic direction..." rows={3} />
        </Field>
        <Field label="Risk Flags" helper="Optional">
          <Textarea value={data.riskFlags} onChange={e => set("riskFlags", e.target.value)}
            placeholder="Any risk flags to note..." rows={2} />
        </Field>
      </fieldset>
    </div>
  );
}

function Field({ label, children, required, helper, error }: {
  label: string; children: React.ReactNode; required?: boolean; helper?: string; error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {helper && !error && <p className="text-[13px] text-muted-foreground">{helper}</p>}
      {error && <p className="text-[13px] text-destructive">{error}</p>}
    </div>
  );
}
