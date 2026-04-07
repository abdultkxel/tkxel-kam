import { Badge } from "@/components/ui/badge";
import { Check, SkipForward, Clock } from "lucide-react";
import { type WizardData, STEP_DEFS, SKIPPED_STEP_TASKS } from "@/data/onboarding";

interface Props {
  data: WizardData;
  onGoToStep: (step: number) => void;
}

export function WizardStep7({ data, onGoToStep }: Props) {
  const { kyc } = data;
  const primaryContact = kyc.contacts[0];

  const addDays = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-foreground">Review Your Account Setup</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Your account will be created. Tasks will be auto-generated for any sections you skipped.
        </p>
      </div>

      {/* Account Summary Card */}
      <div className="rounded-lg border border-border p-5 bg-muted/30 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="text-lg font-semibold text-foreground">{kyc.accountName || "Unnamed Account"}</h3>
          {kyc.segment && (
            <Badge variant="secondary" className={kyc.segment === "Growth" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}>
              {kyc.segment}
            </Badge>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground text-xs">Industry</span>
            <p className="font-medium">{kyc.industry || "—"}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Engagement Model</span>
            <p className="font-medium">{kyc.engagementModel || "—"}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Primary Contact</span>
            <p className="font-medium">{primaryContact?.name || "—"}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Role</span>
            <p className="font-medium">{primaryContact?.title || "—"}</p>
          </div>
        </div>
      </div>

      {/* Steps 2-6 Status */}
      <div className="space-y-3">
        {STEP_DEFS.filter(s => s.id >= 2 && s.id <= 6).map(stepDef => {
          const status = data.stepStatuses[stepDef.id];
          const isComplete = status === "complete";
          const isSkipped = status === "skipped" || status === "incomplete";
          const tasks = SKIPPED_STEP_TASKS[stepDef.id] || [];

          return (
            <div key={stepDef.id} className="rounded-lg border border-border p-4">
              <div className="flex items-center gap-3">
                {isComplete ? (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[hsl(142,72%,29%)]">
                    <Check className="h-3.5 w-3.5 text-[hsl(0,0%,100%)]" />
                  </span>
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
                    <SkipForward className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                )}
                <div className="flex-1">
                  <span className="font-medium text-sm">{stepDef.title}</span>
                  {isComplete ? (
                    <p className="text-xs text-muted-foreground">✅ Data will be saved to <strong>{stepDef.tabName}</strong> tab</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">⏭ Skipped — tasks will be auto-generated</p>
                  )}
                </div>
                {!isComplete && (
                  <button type="button" onClick={() => onGoToStep(stepDef.id)}
                    className="text-xs text-primary hover:underline">Go back & complete</button>
                )}
              </div>

              {/* Show auto-generated tasks for skipped steps */}
              {isSkipped && tasks.length > 0 && (
                <div className="mt-3 ml-9 space-y-2">
                  {tasks.map((task, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-foreground">{task.title}</span>
                      <Badge variant="outline" className="text-[9px] ml-auto">{task.priority}</Badge>
                      <span className="text-muted-foreground whitespace-nowrap">Due: {addDays(task.dueDaysFromCreation)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
