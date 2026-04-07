import { type OnboardingStep, type AccountFormData, getCheckedCountForStep, getTotalCountForStep } from "@/data/onboarding";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronRight, Lock } from "lucide-react";
import { useState } from "react";

interface Props {
  formData: AccountFormData;
  steps: OnboardingStep[];
  onGoToStep: (step: number) => void;
}

export function WizardReviewStep({ formData, steps, onGoToStep }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Review Your Account Setup</h2>
        <p className="text-sm text-muted-foreground mt-1">
          The following tasks will be created and assigned to you for this account.
        </p>
      </div>

      <Card className="border">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-foreground">{formData.accountName || "Untitled Account"}</h3>
              <p className="text-sm text-muted-foreground mt-0.5">{formData.industry || "—"}</p>
            </div>
            {formData.segment && (
              <Badge variant="secondary" className={`text-xs font-semibold uppercase ${
                formData.segment === "Growth" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              }`}>{formData.segment}</Badge>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 text-sm">
            <div><span className="text-muted-foreground">TCV</span><p className="font-medium">{formData.tcv || "—"}</p></div>
            <div><span className="text-muted-foreground">Revenue</span><p className="font-medium">{formData.arr || "—"}</p></div>
            <div><span className="text-muted-foreground">Model</span><p className="font-medium">{formData.engagementModel || "—"}</p></div>
            <div><span className="text-muted-foreground">Contract</span>
              <p className="font-medium">{formData.contractStart && formData.contractEnd
                ? `${formData.contractStart} → ${formData.contractEnd}` : "—"}</p>
            </div>
          </div>
          {formData.primaryContactName && (
            <div className="mt-3 pt-3 border-t border-border text-sm">
              <span className="text-muted-foreground">Primary Contact: </span>
              <span className="font-medium">{formData.primaryContactName}</span>
              {formData.primaryContactRole && <span className="text-muted-foreground"> · {formData.primaryContactRole}</span>}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-2">
        {steps.filter(s => s.id >= 2 && s.id <= 6).map(step => (
          <StepSummaryRow key={step.id} step={step} onGoTo={() => onGoToStep(step.id)} />
        ))}
      </div>
    </div>
  );
}

function StepSummaryRow({ step, onGoTo }: { step: OnboardingStep; onGoTo: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const checkedCount = getCheckedCountForStep(step);
  const totalCount = getTotalCountForStep(step);
  const isSkipped = step.skipped || (checkedCount === 0 && !step.required);

  return (
    <div className="border rounded-md overflow-hidden">
      <button type="button" onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors">
        {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        <span className="flex-1 text-sm font-medium text-foreground">
          {step.title}
          {step.required && <Lock className="inline h-3 w-3 ml-1.5 text-muted-foreground" />}
        </span>
        {isSkipped ? (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs text-muted-foreground">Skipped</Badge>
            <button type="button" onClick={e => { e.stopPropagation(); onGoTo(); }}
              className="text-xs text-primary hover:underline">Go back & complete</button>
          </div>
        ) : (
          <Badge variant="secondary" className="text-xs">{checkedCount} / {totalCount} tasks</Badge>
        )}
      </button>
      {expanded && step.subSections.length > 0 && (
        <div className="px-3 pb-3 space-y-2">
          {step.subSections.map(ss => (
            <div key={ss.id}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{ss.title}</p>
              {ss.tasks.map(task => (
                <div key={task.id} className={`text-sm py-1 px-2 rounded ${
                  task.checked ? "text-foreground" : "text-muted-foreground line-through"
                }`}>
                  {task.checked ? "✓" : "○"} {task.title}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
