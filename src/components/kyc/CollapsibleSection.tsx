import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  step: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export function CollapsibleSection({ title, icon, step, children, defaultOpen = true }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border border-border rounded-lg overflow-hidden">
      <CollapsibleTrigger className="flex items-center gap-3 w-full px-4 py-3 bg-muted/30 hover:bg-muted/60 transition-colors text-left">
        <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center flex-shrink-0">
          {step}
        </span>
        <span className="flex items-center gap-2 text-sm font-medium text-foreground flex-1">
          {icon} {title}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="p-4 space-y-4">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
