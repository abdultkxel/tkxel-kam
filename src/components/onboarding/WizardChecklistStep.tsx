import { type OnboardingStep } from "@/data/onboarding";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { type AccountFormData } from "@/data/onboarding";

interface Props {
  step: OnboardingStep;
  onToggleTask: (taskId: string) => void;
  notes: string;
  onNotesChange: (notes: string) => void;
  showKycFields?: boolean;
  formData?: AccountFormData;
  onFormChange?: (d: AccountFormData) => void;
  errors?: Record<string, string>;
  shakeError?: boolean;
}

export function WizardChecklistStep({
  step, onToggleTask, notes, onNotesChange,
  showKycFields, formData, onFormChange, errors = {}, shakeError,
}: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">{step.title}</h2>
        {step.subtitle && <p className="text-sm text-muted-foreground mt-1">{step.subtitle}</p>}
      </div>

      {showKycFields && (
        <div className="rounded-md p-3 border-l-4" style={{
          backgroundColor: "hsl(219 100% 97%)",
          borderLeftColor: "hsl(224 76% 48%)",
        }}>
          <p className="text-sm font-medium" style={{ color: "hsl(224 76% 48%)" }}>
            KYC is required before this account can be moved to active management.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {step.tasks.map(task => (
          <div key={task.id}
            className={`flex items-start gap-3 p-3 rounded-md border transition-all ${
              task.checked
                ? "border-l-[3px] border-l-[hsl(142,72%,29%)] bg-[hsl(138,76%,97%)]"
                : shakeError && step.required
                  ? "border-destructive animate-[shake_0.3s_ease-in-out] border-l-[3px] border-l-destructive"
                  : "border-border"
            }`}
          >
            <Checkbox checked={task.checked} onCheckedChange={() => onToggleTask(task.id)}
              className="mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">{task.title}</p>
              <p className="text-[13px] text-muted-foreground mt-0.5">{task.helper}</p>
            </div>
          </div>
        ))}
      </div>

      {showKycFields && formData && onFormChange && (
        <div className="space-y-4 pt-4 border-t border-border">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">KYC Details</h3>
          <KycField label="Client Business Summary" required value={formData.clientBusinessSummary}
            onChange={v => onFormChange({ ...formData, clientBusinessSummary: v })}
            helper="2–3 sentences describing what the client does and their market position."
            error={errors.clientBusinessSummary} rows={4} />
          <KycField label="Client Success Criteria" required value={formData.clientSuccessCriteria}
            onChange={v => onFormChange({ ...formData, clientSuccessCriteria: v })}
            helper="What does the client define as a successful engagement?" error={errors.clientSuccessCriteria} />
          <KycField label="Key Business Challenges" required value={formData.keyBusinessChallenges}
            onChange={v => onFormChange({ ...formData, keyBusinessChallenges: v })}
            helper="What problems are they trying to solve with Tkxel's help?" error={errors.keyBusinessChallenges} />
          <KycField label="KYC Document Reference / Link" value={formData.kycDocReference}
            onChange={v => onFormChange({ ...formData, kycDocReference: v })}
            helper="Paste a link to the full KYC document if stored externally." />
        </div>
      )}

      <div className="pt-4 border-t border-border">
        <label className="text-sm font-medium text-foreground">Notes</label>
        <Textarea className="mt-1.5" rows={3} placeholder="Add any additional notes for this section..."
          value={notes} onChange={e => onNotesChange(e.target.value)} style={{ minHeight: 80 }} />
      </div>
    </div>
  );
}

function KycField({ label, value, onChange, helper, error, required, rows = 3 }: {
  label: string; value: string; onChange: (v: string) => void;
  helper?: string; error?: string; required?: boolean; rows?: number;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      <Textarea rows={rows} value={value} onChange={e => onChange(e.target.value)}
        className={error ? "border-destructive" : ""} />
      {helper && !error && <p className="text-[13px] text-muted-foreground">{helper}</p>}
      {error && <p className="text-[13px] text-destructive">{error}</p>}
    </div>
  );
}
