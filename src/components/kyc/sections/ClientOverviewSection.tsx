import { Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CollapsibleSection } from "../CollapsibleSection";
import type { KycData } from "@/data/kyc";

interface Props {
  kyc: KycData;
  onChange: (partial: Partial<KycData>) => void;
  disabled: boolean;
}

export function ClientOverviewSection({ kyc, onChange, disabled }: Props) {
  return (
    <CollapsibleSection title="Client Overview" icon={<Building2 className="h-4 w-4" />} step={1}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Company Name" value={kyc.companyName} onChange={v => onChange({ companyName: v })} disabled={disabled} />
        <Field label="Industry" value={kyc.industry} onChange={v => onChange({ industry: v })} disabled={disabled} />
        <Field label="HQ Location" value={kyc.hqLocation} onChange={v => onChange({ hqLocation: v })} disabled={disabled} placeholder="City, Country" />
        <Field label="Website" value={kyc.website} onChange={v => onChange({ website: v })} disabled={disabled} placeholder="https://" />
        <Field label="LinkedIn" value={kyc.linkedin} onChange={v => onChange({ linkedin: v })} disabled={disabled} placeholder="https://linkedin.com/..." />
        <Field label="Founded Year" value={kyc.foundedYear} onChange={v => onChange({ foundedYear: v })} disabled={disabled} placeholder="e.g. 2015" />
        <Field label="Revenue Range" value={kyc.revenueRange} onChange={v => onChange({ revenueRange: v })} disabled={disabled} placeholder="e.g. $10M–$50M" />
        <Field label="Employee Count" value={kyc.employeeCount} onChange={v => onChange({ employeeCount: v })} disabled={disabled} placeholder="e.g. 500" />
      </div>
    </CollapsibleSection>
  );
}

function Field({ label, value, onChange, disabled, placeholder }: { label: string; value: string; onChange: (v: string) => void; disabled: boolean; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={e => onChange(e.target.value)} disabled={disabled} placeholder={placeholder} className="h-9 text-sm" />
    </div>
  );
}
