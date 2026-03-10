import { Users, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "../CollapsibleSection";
import type { KycData, KycContact, Seniority, ContactType } from "@/data/kyc";

interface Props {
  kyc: KycData;
  onChange: (partial: Partial<KycData>) => void;
  disabled: boolean;
}

const SENIORITY_OPTIONS: Seniority[] = ["C-Level", "Director", "Manager"];
const CONTACT_TYPES: ContactType[] = ["Sponsor", "Influencer", "Detractor", "Champion"];

export function KeyContactsSection({ kyc, onChange, disabled }: Props) {
  const addContact = () => {
    const newContact: KycContact = {
      id: `kc-${Date.now()}`,
      name: "",
      title: "",
      seniority: "Manager",
      relationshipOwner: "",
      contactType: "Influencer",
    };
    onChange({ contacts: [...kyc.contacts, newContact] });
  };

  const updateContact = (id: string, patch: Partial<KycContact>) => {
    onChange({ contacts: kyc.contacts.map(c => c.id === id ? { ...c, ...patch } : c) });
  };

  const removeContact = (id: string) => {
    onChange({ contacts: kyc.contacts.filter(c => c.id !== id) });
  };

  return (
    <CollapsibleSection title="Key Contacts" icon={<Users className="h-4 w-4" />} step={2}>
      {kyc.contacts.length === 0 && (
        <p className="text-sm text-muted-foreground">No contacts added yet.</p>
      )}
      <div className="space-y-3">
        {kyc.contacts.map((contact) => (
          <div key={contact.id} className="grid grid-cols-1 sm:grid-cols-6 gap-2 p-3 rounded-lg bg-muted/30 border border-border items-end">
            <div className="space-y-1 sm:col-span-1">
              <span className="text-[11px] text-muted-foreground">Name</span>
              <Input value={contact.name} onChange={e => updateContact(contact.id, { name: e.target.value })} disabled={disabled} className="h-8 text-sm" />
            </div>
            <div className="space-y-1 sm:col-span-1">
              <span className="text-[11px] text-muted-foreground">Title</span>
              <Input value={contact.title} onChange={e => updateContact(contact.id, { title: e.target.value })} disabled={disabled} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground">Seniority</span>
              <Select value={contact.seniority} onValueChange={v => updateContact(contact.id, { seniority: v as Seniority })} disabled={disabled}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{SENIORITY_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground">Owner (Tkxel)</span>
              <Input value={contact.relationshipOwner} onChange={e => updateContact(contact.id, { relationshipOwner: e.target.value })} disabled={disabled} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground">Type</span>
              <Select value={contact.contactType} onValueChange={v => updateContact(contact.id, { contactType: v as ContactType })} disabled={disabled}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{CONTACT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex justify-end">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-rag-red" onClick={() => removeContact(contact.id)} disabled={disabled}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
      {!disabled && (
        <Button variant="outline" size="sm" onClick={addContact}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Contact
        </Button>
      )}
    </CollapsibleSection>
  );
}
