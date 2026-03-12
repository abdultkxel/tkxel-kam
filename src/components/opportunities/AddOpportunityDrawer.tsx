import React, { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { MOCK_ACCOUNTS } from "@/data/accounts";
import { TEAM_MEMBERS } from "@/data/strategy";
import {
  SERVICE_CATEGORIES, STAGE_ORDER, CONFIDENCE_PCT,
  type OpportunityType, type OpportunityStage, type Confidence, type Opportunity,
} from "@/data/opportunities";
import { useOpportunities } from "@/contexts/OpportunitiesContext";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefillAccountId?: string;
  prefillServiceLine?: string;
  prefillCategory?: string;
  editOpportunity?: Opportunity | null;
}

const TYPES: OpportunityType[] = ["Upsell", "Cross-sell", "Renewal Expansion", "New Service"];
const CONFIDENCES: { label: string; value: Confidence }[] = [
  { label: "Low (25%)", value: "Low" },
  { label: "Medium (50%)", value: "Medium" },
  { label: "High (80%)", value: "High" },
];

export function AddOpportunityDrawer({ open, onOpenChange, prefillAccountId, prefillServiceLine, prefillCategory, editOpportunity }: Props) {
  const { addOpportunity, updateOpportunity } = useOpportunities();

  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [type, setType] = useState<OpportunityType>("Upsell");
  const [category, setCategory] = useState("");
  const [serviceLine, setServiceLine] = useState("");
  const [value, setValue] = useState("");
  const [confidence, setConfidence] = useState<Confidence>("Medium");
  const [stage, setStage] = useState<OpportunityStage>("Identified");
  const [targetClose, setTargetClose] = useState<Date | undefined>();
  const [owner, setOwner] = useState("Sarah Mitchell");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (editOpportunity) {
      setName(editOpportunity.name);
      setAccountId(editOpportunity.accountId);
      setType(editOpportunity.type);
      setCategory(editOpportunity.serviceCategory);
      setServiceLine(editOpportunity.serviceLine);
      setValue(editOpportunity.estimatedValue.toString());
      setConfidence(editOpportunity.confidence);
      setStage(editOpportunity.stage);
      setTargetClose(new Date(editOpportunity.targetClose));
      setOwner(editOpportunity.owner);
      setNotes(editOpportunity.notes);
    } else {
      setName("");
      setAccountId(prefillAccountId || "");
      setType("Upsell");
      setCategory(prefillCategory || "");
      setServiceLine(prefillServiceLine || "");
      setValue("");
      setConfidence("Medium");
      setStage("Identified");
      setTargetClose(undefined);
      setOwner("Sarah Mitchell");
      setNotes("");
    }
  }, [open, editOpportunity, prefillAccountId, prefillServiceLine, prefillCategory]);

  const numericValue = parseFloat(value) || 0;
  const weightedValue = Math.round(numericValue * CONFIDENCE_PCT[confidence]);

  const handleSave = () => {
    if (!name || !accountId) return;
    const data = {
      name, accountId, type, serviceCategory: category, serviceLine,
      estimatedValue: numericValue, confidence, stage,
      targetClose: targetClose ? format(targetClose, "yyyy-MM-dd") : "",
      owner, notes,
    };
    if (editOpportunity) {
      updateOpportunity(editOpportunity.id, data);
    } else {
      addOpportunity(data);
    }
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{editOpportunity ? "Edit Opportunity" : "Add Opportunity"}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 mt-6">
          <div>
            <Label>Opportunity Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. GenAI Analytics Pilot" />
          </div>
          <div>
            <Label>Account *</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                {MOCK_ACCOUNTS.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={v => setType(v as OpportunityType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Service Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{SERVICE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Service Line</Label>
            <Input value={serviceLine} onChange={e => setServiceLine(e.target.value)} placeholder="e.g. Predictive Analytics" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Estimated Value ($)</Label>
              <Input type="number" value={value} onChange={e => setValue(e.target.value)} placeholder="150000" />
            </div>
            <div>
              <Label>Confidence</Label>
              <Select value={confidence} onValueChange={v => setConfidence(v as Confidence)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CONFIDENCES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Weighted Value</p>
            <p className="text-lg font-semibold text-foreground">${weightedValue.toLocaleString()}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Stage</Label>
              <Select value={stage} onValueChange={v => setStage(v as OpportunityStage)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STAGE_ORDER.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Target Close</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !targetClose && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {targetClose ? format(targetClose, "MMM d, yyyy") : "Pick date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={targetClose} onSelect={setTargetClose} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div>
            <Label>Owner</Label>
            <Select value={owner} onValueChange={setOwner}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TEAM_MEMBERS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
          </div>
          <div className="flex gap-3 pt-4">
            <Button onClick={handleSave} className="flex-1" disabled={!name || !accountId}>Save</Button>
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancel</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
