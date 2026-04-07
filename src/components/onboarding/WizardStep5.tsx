import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { type FinancialsFormData, type InvoiceRow, type SowRow } from "@/data/onboarding";

interface Props {
  data: FinancialsFormData;
  onChange: (d: FinancialsFormData) => void;
  prefillStart?: string;
  prefillEnd?: string;
}

export function WizardStep5({ data, onChange, prefillStart, prefillEnd }: Props) {
  const set = (key: keyof FinancialsFormData, value: any) => onChange({ ...data, [key]: value });

  const addInvoice = () => {
    const inv: InvoiceRow = { id: crypto.randomUUID(), invoiceNumber: "", period: "", amount: "", dueDate: "", status: "Pending" };
    set("invoices", [...data.invoices, inv]);
  };

  const updateInvoice = (id: string, field: keyof InvoiceRow, value: string) => {
    set("invoices", data.invoices.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const removeInvoice = (id: string) => set("invoices", data.invoices.filter(i => i.id !== id));

  const addSow = () => {
    const sow: SowRow = { id: crypto.randomUUID(), reference: "", description: "", startDate: "", value: "", status: "Active" };
    set("sows", [...data.sows, sow]);
  };

  const updateSow = (id: string, field: keyof SowRow, value: string) => {
    set("sows", data.sows.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const removeSow = (id: string) => set("sows", data.sows.filter(s => s.id !== id));

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-foreground">Financials</h2>
        <p className="text-sm text-muted-foreground mt-1">Capture the financial landscape of this account.</p>
      </div>

      <div className="rounded-md p-4 border-l-4" style={{ backgroundColor: "#F9FAFB", borderLeftColor: "#9CA3AF" }}>
        <p className="text-sm text-muted-foreground">
          Recommended within <strong>1 week</strong> of account creation. If skipped, tasks will be auto-generated.
        </p>
      </div>

      {/* Revenue & Contract */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-foreground uppercase tracking-wide mb-2">Revenue & Contract</legend>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Revenue" required>
            <Input value={data.revenue} onChange={e => set("revenue", e.target.value)} placeholder="$1,200,000" />
          </Field>
          <Field label="Total Contract Value (TCV)">
            <Input value={data.tcv} onChange={e => set("tcv", e.target.value)} placeholder="$3,600,000" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Contract Start Date">
            <Input type="date" value={data.contractStart || prefillStart || ""}
              onChange={e => set("contractStart", e.target.value)}
              className={data.contractStart === "" && prefillStart ? "bg-[#EFF6FF]" : ""} />
            {!data.contractStart && prefillStart && <p className="text-xs text-muted-foreground">Pre-filled from Step 1</p>}
          </Field>
          <Field label="Contract End Date">
            <Input type="date" value={data.contractEnd || prefillEnd || ""}
              onChange={e => set("contractEnd", e.target.value)}
              className={data.contractEnd === "" && prefillEnd ? "bg-[#EFF6FF]" : ""} />
            {!data.contractEnd && prefillEnd && <p className="text-xs text-muted-foreground">Pre-filled from Step 1</p>}
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Contract Status">
            <Select value={data.contractStatus} onValueChange={v => set("contractStatus", v)}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Expired">Expired</SelectItem>
                <SelectItem value="Renewed">Renewed</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Notice Period (days)">
            <Input type="number" value={data.noticePeriodDays} onChange={e => set("noticePeriodDays", e.target.value)} placeholder="90" />
          </Field>
          <Field label="Rate Escalation %">
            <Input type="number" value={data.rateEscalation} onChange={e => set("rateEscalation", e.target.value)} placeholder="5" />
          </Field>
        </div>
      </fieldset>

      {/* Invoices */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-foreground uppercase tracking-wide mb-2">Billing & Payment Status</legend>
        {data.invoices.map((inv, idx) => (
          <div key={inv.id} className="relative border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Invoice {idx + 1}</span>
              <button type="button" onClick={() => removeInvoice(inv.id)} className="text-destructive hover:text-destructive/80">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground">Invoice #</span>
                <Input value={inv.invoiceNumber} onChange={e => updateInvoice(inv.id, "invoiceNumber", e.target.value)} placeholder="INV-001" />
              </div>
              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground">Period</span>
                <Input value={inv.period} onChange={e => updateInvoice(inv.id, "period", e.target.value)} placeholder="Q1 2026" />
              </div>
              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground">Amount</span>
                <Input value={inv.amount} onChange={e => updateInvoice(inv.id, "amount", e.target.value)} placeholder="$50,000" />
              </div>
              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground">Due Date</span>
                <Input type="date" value={inv.dueDate} onChange={e => updateInvoice(inv.id, "dueDate", e.target.value)} />
              </div>
              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground">Status</span>
                <Select value={inv.status} onValueChange={v => updateInvoice(inv.id, "status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Paid">Paid</SelectItem>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="Overdue">Overdue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addInvoice}>
          <Plus className="h-4 w-4 mr-1" /> Add Invoice
        </Button>
      </fieldset>

      {/* SOW */}
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-foreground uppercase tracking-wide mb-2">SOW / Amendment History</legend>
        {data.sows.map((sow, idx) => (
          <div key={sow.id} className="relative border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">SOW {idx + 1}</span>
              <button type="button" onClick={() => removeSow(sow.id)} className="text-destructive hover:text-destructive/80">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground">Reference</span>
                <Input value={sow.reference} onChange={e => updateSow(sow.id, "reference", e.target.value)} placeholder="SOW-001" />
              </div>
              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground">Description</span>
                <Input value={sow.description} onChange={e => updateSow(sow.id, "description", e.target.value)} placeholder="Project description" />
              </div>
              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground">Start Date</span>
                <Input type="date" value={sow.startDate} onChange={e => updateSow(sow.id, "startDate", e.target.value)} />
              </div>
              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground">Value</span>
                <Input value={sow.value} onChange={e => updateSow(sow.id, "value", e.target.value)} placeholder="$100,000" />
              </div>
              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground">Status</span>
                <Select value={sow.status} onValueChange={v => updateSow(sow.id, "status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                    <SelectItem value="Cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addSow}>
          <Plus className="h-4 w-4 mr-1" /> Add SOW
        </Button>
      </fieldset>
    </div>
  );
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}
