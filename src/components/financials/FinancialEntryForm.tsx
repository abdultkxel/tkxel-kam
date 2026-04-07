import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, DollarSign } from "lucide-react";
import { type FinancialData, type Invoice, type SOWEntry, type InvoiceStatus, type SOWStatus, MOCK_FINANCIAL_DATA } from "@/data/financials";

interface FinancialEntryFormProps {
  accountId: string;
  onSave: (data: FinancialData) => void;
}

interface FormInvoice {
  id: string;
  invoiceNumber: string;
  period: string;
  amount: string;
  dueDate: string;
  status: InvoiceStatus;
}

interface FormSOW {
  id: string;
  reference: string;
  description: string;
  startDate: string;
  value: string;
  status: SOWStatus;
}

export function FinancialEntryForm({ accountId, onSave }: FinancialEntryFormProps) {
  const [revenue, setRevenue] = useState("");
  const [tcv, setTcv] = useState("");
  const [contractStart, setContractStart] = useState("");
  const [contractEnd, setContractEnd] = useState("");
  const [contractStatus, setContractStatus] = useState("Active");
  const [noticePeriodDays, setNoticePeriodDays] = useState("");
  const [rateEscalation, setRateEscalation] = useState("");
  const [billingCycle, setBillingCycle] = useState<"Monthly" | "Quarterly">("Monthly");

  const [invoices, setInvoices] = useState<FormInvoice[]>([]);
  const [sows, setSows] = useState<FormSOW[]>([]);

  const addInvoice = () => {
    setInvoices(prev => [...prev, {
      id: crypto.randomUUID(),
      invoiceNumber: "",
      period: "",
      amount: "",
      dueDate: "",
      status: "Pending" as InvoiceStatus,
    }]);
  };

  const updateInvoice = (id: string, field: keyof FormInvoice, value: string) => {
    setInvoices(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const removeInvoice = (id: string) => setInvoices(prev => prev.filter(i => i.id !== id));

  const addSow = () => {
    setSows(prev => [...prev, {
      id: crypto.randomUUID(),
      reference: "",
      description: "",
      startDate: "",
      value: "",
      status: "Active" as SOWStatus,
    }]);
  };

  const updateSow = (id: string, field: keyof FormSOW, value: string) => {
    setSows(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const removeSow = (id: string) => setSows(prev => prev.filter(s => s.id !== id));

  const handleSave = () => {
    const data: FinancialData = {
      terms: {
        noticePeriodDays: parseInt(noticePeriodDays) || 90,
        rateEscalation: rateEscalation ? `${rateEscalation}% annual increase` : "None",
        billingCycle,
        yoyGrowth: 0,
      },
      invoices: invoices.map(inv => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        period: inv.period,
        amount: parseFloat(inv.amount.replace(/[^0-9.]/g, "")) || 0,
        dueDate: inv.dueDate,
        status: inv.status,
      })),
      sows: sows.map(sow => ({
        id: sow.id,
        reference: sow.reference,
        description: sow.description,
        startDate: sow.startDate,
        value: parseFloat(sow.value.replace(/[^0-9.]/g, "")) || 0,
        status: sow.status,
      })),
    };

    // Store in mock data so the regular view can pick it up
    MOCK_FINANCIAL_DATA[accountId] = data;
    onSave(data);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Add Financial Details
          </CardTitle>
          <p className="text-sm text-muted-foreground">Enter the financial information for this account.</p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Revenue & Contract */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-foreground uppercase tracking-wide mb-2">Revenue & Contract</legend>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Revenue (ARR)">
                <Input value={revenue} onChange={e => setRevenue(e.target.value)} placeholder="$1,200,000" />
              </Field>
              <Field label="Total Contract Value (TCV)">
                <Input value={tcv} onChange={e => setTcv(e.target.value)} placeholder="$3,600,000" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Contract Start Date">
                <Input type="date" value={contractStart} onChange={e => setContractStart(e.target.value)} />
              </Field>
              <Field label="Contract End Date">
                <Input type="date" value={contractEnd} onChange={e => setContractEnd(e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Field label="Contract Status">
                <Select value={contractStatus} onValueChange={setContractStatus}>
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
                <Input type="number" value={noticePeriodDays} onChange={e => setNoticePeriodDays(e.target.value)} placeholder="90" />
              </Field>
              <Field label="Rate Escalation %">
                <Input type="number" value={rateEscalation} onChange={e => setRateEscalation(e.target.value)} placeholder="5" />
              </Field>
              <Field label="Billing Cycle">
                <Select value={billingCycle} onValueChange={v => setBillingCycle(v as "Monthly" | "Quarterly")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Monthly">Monthly</SelectItem>
                    <SelectItem value="Quarterly">Quarterly</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </fieldset>

          {/* Invoices */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-foreground uppercase tracking-wide mb-2">Billing & Payment Status</legend>
            {invoices.map((inv, idx) => (
              <div key={inv.id} className="relative border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Invoice {idx + 1}</span>
                  <button type="button" onClick={() => removeInvoice(inv.id)} className="text-destructive hover:text-destructive/80">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <Field label="Invoice #">
                    <Input value={inv.invoiceNumber} onChange={e => updateInvoice(inv.id, "invoiceNumber", e.target.value)} placeholder="INV-001" />
                  </Field>
                  <Field label="Period">
                    <Input value={inv.period} onChange={e => updateInvoice(inv.id, "period", e.target.value)} placeholder="Q1 2026" />
                  </Field>
                  <Field label="Amount">
                    <Input value={inv.amount} onChange={e => updateInvoice(inv.id, "amount", e.target.value)} placeholder="$50,000" />
                  </Field>
                  <Field label="Due Date">
                    <Input type="date" value={inv.dueDate} onChange={e => updateInvoice(inv.id, "dueDate", e.target.value)} />
                  </Field>
                  <Field label="Status">
                    <Select value={inv.status} onValueChange={v => updateInvoice(inv.id, "status", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Paid">Paid</SelectItem>
                        <SelectItem value="Pending">Pending</SelectItem>
                        <SelectItem value="Overdue">Overdue</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
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
            {sows.map((sow, idx) => (
              <div key={sow.id} className="relative border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">SOW {idx + 1}</span>
                  <button type="button" onClick={() => removeSow(sow.id)} className="text-destructive hover:text-destructive/80">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <Field label="Reference">
                    <Input value={sow.reference} onChange={e => updateSow(sow.id, "reference", e.target.value)} placeholder="SOW-001" />
                  </Field>
                  <Field label="Description">
                    <Input value={sow.description} onChange={e => updateSow(sow.id, "description", e.target.value)} placeholder="Project description" />
                  </Field>
                  <Field label="Start Date">
                    <Input type="date" value={sow.startDate} onChange={e => updateSow(sow.id, "startDate", e.target.value)} />
                  </Field>
                  <Field label="Value">
                    <Input value={sow.value} onChange={e => updateSow(sow.id, "value", e.target.value)} placeholder="$100,000" />
                  </Field>
                  <Field label="Status">
                    <Select value={sow.status} onValueChange={v => updateSow(sow.id, "status", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Active">Active</SelectItem>
                        <SelectItem value="Completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addSow}>
              <Plus className="h-4 w-4 mr-1" /> Add SOW
            </Button>
          </fieldset>

          <div className="flex justify-end pt-4 border-t">
            <Button onClick={handleSave} className="px-8">
              Save Financial Details
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
    </div>
  );
}
