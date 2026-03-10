import { FileText, Upload, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "../CollapsibleSection";
import { toast } from "sonner";
import type { KycData, KycDocument } from "@/data/kyc";

interface Props {
  kyc: KycData;
  onChange: (partial: Partial<KycData>) => void;
  disabled: boolean;
}

export function DocumentsSection({ kyc, onChange, disabled }: Props) {
  const handleUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.docx,.doc";
    input.multiple = true;
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files) return;
      const newDocs: KycDocument[] = Array.from(files).map(f => ({
        id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: f.name,
        uploadedAt: new Date().toISOString().split("T")[0],
        size: f.size > 1048576 ? `${(f.size / 1048576).toFixed(1)} MB` : `${(f.size / 1024).toFixed(0)} KB`,
      }));
      onChange({ documents: [...kyc.documents, ...newDocs] });
      toast.success(`${newDocs.length} file(s) added.`);
    };
    input.click();
  };

  const handleDelete = (id: string) => {
    onChange({ documents: kyc.documents.filter(d => d.id !== id) });
    toast.success("Document removed.");
  };

  return (
    <CollapsibleSection title="Documents" icon={<FileText className="h-4 w-4" />} step={5} defaultOpen={false}>
      {kyc.documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">No documents uploaded.</p>
      ) : (
        <div className="space-y-2">
          {kyc.documents.map(doc => (
            <div key={doc.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
                  <p className="text-[11px] text-muted-foreground">{doc.uploadedAt} · {doc.size}</p>
                </div>
              </div>
              {!disabled && (
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-rag-red flex-shrink-0" onClick={() => handleDelete(doc.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      {!disabled && (
        <Button variant="outline" size="sm" onClick={handleUpload}>
          <Upload className="h-3.5 w-3.5 mr-1" /> Upload Files
        </Button>
      )}
    </CollapsibleSection>
  );
}
