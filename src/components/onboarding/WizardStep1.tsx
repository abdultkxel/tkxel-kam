import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import {
  type AccountFormData,
  INDUSTRIES, ENGAGEMENT_MODELS, SERVICE_LINES, DELIVERY_LOCATIONS,
} from "@/data/onboarding";

interface Props {
  data: AccountFormData;
  onChange: (d: AccountFormData) => void;
  errors: Record<string, string>;
}

export function WizardStep1({ data, onChange, errors }: Props) {
  const set = (key: keyof AccountFormData, value: any) =>
    onChange({ ...data, [key]: value });

  const toggleServiceLine = (line: string) => {
    const current = data.primaryServiceLines;
    set("primaryServiceLines",
      current.includes(line) ? current.filter(l => l !== line) : [...current, line]
    );
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-foreground">Core Account Information</h2>
        <p className="text-sm text-muted-foreground mt-1">Fill in the essential details for this account.</p>
      </div>

      {/* Account Identity */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-foreground uppercase tracking-wide mb-2">Account Identity</legend>
        <Field label="Account Name" error={errors.accountName} required>
          <Input value={data.accountName} onChange={e => set("accountName", e.target.value)}
            placeholder="e.g. Acme Corp" className={errors.accountName ? "border-destructive" : ""} />
        </Field>
        <Field label="Industry" error={errors.industry} required>
          <Select value={data.industry} onValueChange={v => set("industry", v)}>
            <SelectTrigger className={errors.industry ? "border-destructive" : ""}>
              <SelectValue placeholder="Select industry" />
            </SelectTrigger>
            <SelectContent>{INDUSTRIES.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
          </Select>
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
        <Field label="Account Status" error={errors.accountStatus} required>
          <div className="flex gap-3">
            {(["New Client", "Existing Client"] as const).map(s => (
              <button key={s} type="button" onClick={() => set("accountStatus", s)}
                className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                  data.accountStatus === s
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground border-border hover:bg-muted"
                }`}>{s}</button>
            ))}
          </div>
        </Field>
      </fieldset>

      {/* Account Value */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-foreground uppercase tracking-wide mb-2">Account Value</legend>
        <Field label="Total Contract Value (TCV)" error={errors.tcv} required
          helper="The total value of all contracts signed with this account.">
          <Input value={data.tcv} onChange={e => set("tcv", e.target.value)}
            placeholder="$1,200,000" className={errors.tcv ? "border-destructive" : ""} />
        </Field>
        <Field label="Annual Recurring Revenue" error={errors.arr} required
          helper="The annualised recurring revenue from this account.">
          <Input value={data.arr} onChange={e => set("arr", e.target.value)}
            placeholder="$400,000" className={errors.arr ? "border-destructive" : ""} />
        </Field>
        <Field label="Portfolio Revenue" helper="Broader revenue this account contributes to your portfolio, if different from Revenue.">
          <Input value={data.portfolioRevenue} onChange={e => set("portfolioRevenue", e.target.value)}
            placeholder="Optional" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Contract Start Date" error={errors.contractStart} required>
            <Input type="date" value={data.contractStart} onChange={e => set("contractStart", e.target.value)}
              className={errors.contractStart ? "border-destructive" : ""} />
          </Field>
          <Field label="Contract End Date" error={errors.contractEnd} required>
            <Input type="date" value={data.contractEnd} onChange={e => set("contractEnd", e.target.value)}
              className={errors.contractEnd ? "border-destructive" : ""} />
          </Field>
        </div>
      </fieldset>

      {/* Engagement Details */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-foreground uppercase tracking-wide mb-2">Engagement Details</legend>
        <Field label="Engagement Model" error={errors.engagementModel} required>
          <Select value={data.engagementModel} onValueChange={v => set("engagementModel", v)}>
            <SelectTrigger className={errors.engagementModel ? "border-destructive" : ""}>
              <SelectValue placeholder="Select model" />
            </SelectTrigger>
            <SelectContent>{ENGAGEMENT_MODELS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Engagement Scope Summary" helper="Brief description of what Tkxel is delivering for this account.">
          <Textarea rows={3} value={data.engagementScope}
            onChange={e => set("engagementScope", e.target.value)} placeholder="Describe the engagement scope..." />
        </Field>
        <Field label="Primary Service Lines" error={errors.primaryServiceLines} required>
          <div className="flex flex-wrap gap-2">
            {SERVICE_LINES.map(line => (
              <button key={line} type="button" onClick={() => toggleServiceLine(line)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  data.primaryServiceLines.includes(line)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground border-border hover:bg-muted"
                }`}>{line}</button>
            ))}
          </div>
        </Field>
        <Field label="Delivery Location" error={errors.deliveryLocation} required>
          <Select value={data.deliveryLocation} onValueChange={v => set("deliveryLocation", v)}>
            <SelectTrigger className={errors.deliveryLocation ? "border-destructive" : ""}>
              <SelectValue placeholder="Select location" />
            </SelectTrigger>
            <SelectContent>{DELIVERY_LOCATIONS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      </fieldset>

      {/* Primary Contact */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-foreground uppercase tracking-wide mb-2">Primary Contact</legend>
        <Field label="Contact Name" error={errors.primaryContactName} required>
          <Input value={data.primaryContactName} onChange={e => set("primaryContactName", e.target.value)}
            placeholder="Jane Doe" className={errors.primaryContactName ? "border-destructive" : ""} />
        </Field>
        <Field label="Role / Title" error={errors.primaryContactRole} required>
          <Input value={data.primaryContactRole} onChange={e => set("primaryContactRole", e.target.value)}
            placeholder="VP Engineering" className={errors.primaryContactRole ? "border-destructive" : ""} />
        </Field>
        <Field label="Email" error={errors.primaryContactEmail} required>
          <Input type="email" value={data.primaryContactEmail} onChange={e => set("primaryContactEmail", e.target.value)}
            placeholder="jane@acme.com" className={errors.primaryContactEmail ? "border-destructive" : ""} />
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
