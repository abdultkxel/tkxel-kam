import { useState } from "react";
import { type OnboardingStep } from "@/data/onboarding";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, ChevronRight } from "lucide-react";

interface Props {
  step: OnboardingStep;
  onTaskValueChange: (taskId: string, value: string) => void;
  notes: string;
  onNotesChange: (notes: string) => void;
  errors?: Record<string, string>;
  shakeError?: boolean;
}

export function WizardChecklistStep({
  step, onTaskValueChange, notes, onNotesChange, errors = {}, shakeError,
}: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const subSections = step.subSections || [];

  const toggleSection = (ssId: string) => {
    setCollapsed(prev => ({ ...prev, [ssId]: !prev[ssId] }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">{step.title}</h2>
        {step.subtitle && <p className="text-sm text-muted-foreground mt-1">{step.subtitle}</p>}
      </div>

      {step.infoBanner && (
        <div className="rounded-md p-3 border-l-4" style={{
          backgroundColor: "hsl(219 100% 97%)",
          borderLeftColor: "hsl(224 76% 48%)",
        }}>
          <p className="text-sm font-medium" style={{ color: "hsl(224 76% 48%)" }}>
            {step.infoBanner}
          </p>
        </div>
      )}

      {step.advisoryBanner && (
        <div className="rounded-md p-3 border-l-4" style={{
          backgroundColor: "hsl(210 20% 98%)",
          borderLeftColor: "hsl(220 9% 63%)",
        }}>
          <p className="text-sm font-medium text-muted-foreground">
            {step.advisoryBanner}
          </p>
        </div>
      )}

      {errors._tasks && (
        <p className="text-sm text-destructive font-medium">{errors._tasks}</p>
      )}

      <div className="space-y-3">
        {subSections.map(ss => {
          const isCollapsed = collapsed[ss.id] ?? false;
          const filledCount = ss.tasks.filter(t => (t.value || "").trim().length > 0).length;
          return (
            <div key={ss.id} className="border border-border rounded-md overflow-hidden">
              <button
                type="button"
                onClick={() => toggleSection(ss.id)}
                className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
              >
                {isCollapsed
                  ? <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                }
                <span className="flex-1 text-sm font-semibold text-foreground">{ss.title}</span>
                <span className="text-xs text-muted-foreground">
                  {filledCount}/{ss.tasks.length}
                </span>
              </button>
              {!isCollapsed && (
                <div className="px-4 pb-4 space-y-4">
                  {ss.tasks.map(task => {
                    const hasValue = (task.value || "").trim().length > 0;
                    const hasError = shakeError && step.required && !hasValue;
                    return (
                      <div key={task.id}
                        className={`space-y-1.5 p-3 rounded-md border transition-all ${
                          hasValue
                            ? "border-l-[3px] border-l-[hsl(142,72%,29%)] bg-[hsl(138,76%,97%)]"
                            : hasError
                              ? "border-destructive animate-[shake_0.3s_ease-in-out] border-l-[3px] border-l-destructive bg-[hsl(0,84%,97%)]"
                              : "border-border"
                        }`}
                      >
                        <label className="text-sm font-medium text-foreground">{task.title}</label>
                        <p className="text-[13px] text-muted-foreground">{task.helper}</p>
                        <Input
                          value={task.value || ""}
                          onChange={e => onTaskValueChange(task.id, e.target.value)}
                          placeholder="Enter details..."
                          className={hasError ? "border-destructive" : ""}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="pt-4 border-t border-border">
        <label className="text-sm font-medium text-foreground">Notes</label>
        <Textarea className="mt-1.5" rows={3}
          placeholder={step.sectionLabel
            ? `Add ${step.title.replace(/^[A-E]: /, '')} notes or link to external documents...`
            : "Add any additional notes for this section..."}
          value={notes} onChange={e => onNotesChange(e.target.value)}
          style={{ minHeight: 80, borderRadius: 6 }} />
      </div>
    </div>
  );
}
