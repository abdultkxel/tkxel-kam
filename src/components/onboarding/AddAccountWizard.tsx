import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { X, Check, Minus, CircleDot, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  type OnboardingStep, type AccountFormData,
  getInitialFormData, getInitialSteps, getAllTasksForStep, TOTAL_STEPS,
} from "@/data/onboarding";
import { WizardStep1 } from "./WizardStep1";
import { WizardChecklistStep } from "./WizardChecklistStep";
import { WizardReviewStep } from "./WizardReviewStep";
import { type Account } from "@/data/accounts";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const DRAFT_KEY = "kam-onboarding-draft";

interface Props {
  open: boolean;
  onClose: () => void;
  onAccountCreated: (account: Account, tasks: any[]) => void;
}

export function AddAccountWizard({ open, onClose, onAccountCreated }: Props) {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [steps, setSteps] = useState<OnboardingStep[]>(getInitialSteps);
  const [formData, setFormData] = useState<AccountFormData>(getInitialFormData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [shakeError, setShakeError] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    if (open) {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) {
        try {
          const parsed = JSON.parse(draft);
          setFormData(parsed.formData);
          setSteps(parsed.steps);
          setCurrentStep(parsed.currentStep || 1);
        } catch { /* ignore */ }
      }
    }
  }, [open]);

  const validateStep1 = (): boolean => {
    const e: Record<string, string> = {};
    if (!formData.accountName.trim()) e.accountName = "Account name is required";
    if (!formData.industry) e.industry = "Industry is required";
    if (!formData.segment) e.segment = "Segment is required";
    if (!formData.accountStatus) e.accountStatus = "Account status is required";
    if (!formData.tcv.trim()) e.tcv = "TCV is required";
    if (!formData.arr.trim()) e.arr = "Revenue is required";
    if (!formData.contractStart) e.contractStart = "Start date is required";
    if (!formData.contractEnd) e.contractEnd = "End date is required";
    if (!formData.engagementModel) e.engagementModel = "Model is required";
    if (!formData.engagementScope.trim()) e.engagementScope = "Scope is required";
    if (formData.primaryServiceLines.length === 0) e.primaryServiceLines = "Select at least one service line";
    if (!formData.deliveryLocation) e.deliveryLocation = "Location is required";
    if (!formData.primaryContactName.trim()) e.primaryContactName = "Contact name is required";
    if (!formData.primaryContactRole.trim()) e.primaryContactRole = "Role is required";
    if (!formData.primaryContactEmail.trim()) e.primaryContactEmail = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.primaryContactEmail))
      e.primaryContactEmail = "Invalid email address";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateRequiredChecklist = (stepId: number): boolean => {
    const step = steps.find(s => s.id === stepId)!;
    if (!step.required) return true;
    const allTasks = getAllTasksForStep(step);
    const unchecked = allTasks.some(t => !(t.value || "").trim());
    if (unchecked) {
      setShakeError(true);
      setTimeout(() => setShakeError(false), 400);
      setErrors({ _tasks: "Please complete all tasks before proceeding." });
      return false;
    }
    setErrors({});
    return true;
  };

  const handleNext = () => {
    if (currentStep === 1 && !validateStep1()) return;
    if (currentStep >= 2 && currentStep <= 5 && !validateRequiredChecklist(currentStep)) return;

    setSteps(prev => prev.map(s =>
      s.id === currentStep ? { ...s, completed: true, skipped: false } : s
    ));
    setErrors({});
    setCurrentStep(prev => Math.min(prev + 1, TOTAL_STEPS));
  };

  const handleBack = () => {
    setErrors({});
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleSkip = () => {
    setSteps(prev => prev.map(s =>
      s.id === currentStep ? { ...s, skipped: true, completed: false } : s
    ));
    setErrors({});
    setCurrentStep(prev => Math.min(prev + 1, TOTAL_STEPS));
  };

  const handleTaskValueChange = (stepId: number, taskId: string, value: string) => {
    setSteps(prev => prev.map(s =>
      s.id === stepId ? {
        ...s,
        subSections: s.subSections.map(ss => ({
          ...ss,
          tasks: ss.tasks.map(t => t.id === taskId ? { ...t, value, checked: value.trim().length > 0 } : t),
        })),
      } : s
    ));
  };

  const handleNotesChange = (stepId: number, notes: string) => {
    setFormData(prev => ({
      ...prev,
      stepNotes: { ...prev.stepNotes, [stepId]: notes },
    }));
  };

  const handleSaveDraft = () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ formData, steps, currentStep }));
    toast.success("Draft saved. You can resume onboarding later.");
    onClose();
  };

  const handleCancel = () => setConfirmClose(true);

  const handleConfirmCancel = () => {
    localStorage.removeItem(DRAFT_KEY);
    setFormData(getInitialFormData());
    setSteps(getInitialSteps());
    setCurrentStep(1);
    setErrors({});
    setConfirmClose(false);
    onClose();
  };

  const handleConfirm = () => {
    const id = `acc-new-${Date.now()}`;
    const sectionLabels: Record<number, string> = {
      2: "A: Market Research",
      3: "B: Client Research",
      4: "C: Stakeholder Details",
      5: "D: Tkxel Engagement",
      6: "E: Financial Landscape",
    };

    const newAccount: Account = {
      id,
      name: formData.accountName,
      segment: formData.segment as "Growth" | "Retention",
      health: { overall: 0, relationship: 0, contract: 0, resource: 0 },
      riskStatus: "green",
      amId: user?.id || "u1",
      amName: user?.name || "Sarah Mitchell",
      industry: formData.industry,
      arr: formData.arr,
      lastUpdated: new Date().toISOString().split("T")[0],
      contractStart: formData.contractStart,
      contractEnd: formData.contractEnd,
      stakeholders: 0,
      activities: [],
      onboardingStatus: "in_progress",
    };

    const generatedTasks: any[] = [];
    steps.filter(s => s.id >= 2 && s.id <= 6).forEach(step => {
      step.subSections.forEach(ss => {
        ss.tasks.filter(t => (t.value || "").trim().length > 0).forEach(task => {
          generatedTasks.push({
            id: `onb-${id}-${task.id}`,
            title: task.title,
            accountId: id,
            accountName: formData.accountName,
            section: sectionLabels[step.id] || step.title,
            subSection: ss.title,
            priority: "Medium" as const,
            status: "pending" as const,
            source: "onboarding-wizard",
            createdAt: new Date().toISOString(),
          });
        });
      });
    });

    localStorage.removeItem(DRAFT_KEY);
    onAccountCreated(newAccount, generatedTasks);
    setFormData(getInitialFormData());
    setSteps(getInitialSteps());
    setCurrentStep(1);
    setErrors({});
    toast.success(`Account "${formData.accountName}" created with ${generatedTasks.length} onboarding tasks.`);
  };

  const goToStep = (stepNum: number) => {
    setErrors({});
    setCurrentStep(stepNum);
  };

  const stepDef = steps.find(s => s.id === currentStep)!;
  const isSkippable = !stepDef.required && currentStep > 1 && currentStep < TOTAL_STEPS;
  const progressPct = (currentStep / TOTAL_STEPS) * 100;

  const renderContent = () => {
    if (currentStep === 1) {
      return <WizardStep1 data={formData} onChange={setFormData} errors={errors} />;
    }
    if (currentStep === TOTAL_STEPS) {
      return <WizardReviewStep formData={formData} steps={steps} onGoToStep={goToStep} />;
    }
    return (
      <WizardChecklistStep
        step={stepDef}
        onTaskValueChange={(taskId, value) => handleTaskValueChange(currentStep, taskId, value)}
        notes={formData.stepNotes[currentStep] || ""}
        onNotesChange={(n) => handleNotesChange(currentStep, n)}
        errors={errors}
        shakeError={shakeError}
      />
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={() => handleCancel()}>
        <DialogContent className="max-w-[1100px] w-[95vw] h-[90vh] p-0 gap-0 flex flex-col overflow-hidden [&>button]:hidden">
          <div className="h-1 w-full bg-border">
            <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progressPct}%` }} />
          </div>

          <div className="flex items-center justify-between px-6 py-3 border-b border-border">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={handleCancel}
                className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
              <span className="text-sm text-muted-foreground">Step {currentStep} of {TOTAL_STEPS}</span>
            </div>
            <Button variant="outline" size="sm" onClick={handleSaveDraft}>
              <Save className="h-4 w-4 mr-1" /> Save & Finish Later
            </Button>
          </div>

          <div className="flex flex-1 overflow-hidden">
            <div className="w-[240px] flex-shrink-0 border-r border-border overflow-y-auto"
              style={{ backgroundColor: "hsl(210 33% 98%)" }}>
              <div className="p-3 space-y-0.5">
                {steps.map(step => {
                  const isCurrent = step.id === currentStep;
                  const isCompleted = step.completed;
                  const isSkippedStep = step.skipped;
                  return (
                    <button key={step.id} type="button"
                      onClick={() => goToStep(step.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-colors text-sm ${
                        isCurrent
                          ? "bg-primary/10 font-semibold text-foreground border-l-[3px] border-l-primary"
                          : "hover:bg-muted text-muted-foreground"
                      }`}>
                      <span className="flex-shrink-0">
                        {isCompleted ? (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[hsl(142,72%,29%)]">
                            <Check className="h-3 w-3 text-[hsl(0,0%,100%)]" />
                          </span>
                        ) : isSkippedStep ? (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted">
                            <Minus className="h-3 w-3 text-muted-foreground" />
                          </span>
                        ) : isCurrent ? (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                            <CircleDot className="h-3 w-3 text-primary-foreground" />
                          </span>
                        ) : (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-muted-foreground/30" />
                        )}
                      </span>
                      <span className="flex-1 truncate">{step.title}</span>
                      {step.required && (
                        <Badge variant="destructive" className="text-[9px] px-1.5 py-0">Required</Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-6 max-w-[780px]">
                {renderContent()}
              </div>
            </ScrollArea>
          </div>

          <div className="flex items-center justify-between px-6 py-3 border-t border-border bg-background">
            <div>
              {errors._tasks && <p className="text-sm text-destructive">{errors._tasks}</p>}
            </div>
            <div className="flex items-center gap-2">
              {currentStep > 1 && (
                <Button variant="outline" onClick={handleBack}>Back</Button>
              )}
              {isSkippable && (
                <Button variant="ghost" onClick={handleSkip} className="text-muted-foreground">Skip</Button>
              )}
              {currentStep < TOTAL_STEPS ? (
                <Button onClick={handleNext} className="bg-primary text-primary-foreground hover:bg-primary/90">
                  Next
                </Button>
              ) : (
                <Button onClick={handleConfirm} className="bg-primary text-primary-foreground hover:bg-primary/90 px-6">
                  Confirm & Create Account
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard progress?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure? Your progress will be lost. Use "Save & Finish Later" to keep your draft.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continue Editing</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCancel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
