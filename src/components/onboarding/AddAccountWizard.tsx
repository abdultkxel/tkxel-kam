import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { X, Check, Minus, CircleDot, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  type WizardData,
  TOTAL_STEPS, DRAFT_KEY, STEP_DEFS, SKIPPED_STEP_TASKS,
  getInitialWizardData,
} from "@/data/onboarding";
import { WizardStep1 } from "./WizardStep1";
import { WizardStep2 } from "./WizardStep2";
import { WizardStep3 } from "./WizardStep3";
import { WizardStep4 } from "./WizardStep4";
import { WizardStep5 } from "./WizardStep5";
import { WizardStep6 } from "./WizardStep6";
import { WizardStep7 } from "./WizardStep7";
import { type Account } from "@/data/accounts";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  onAccountCreated: (account: Account, tasks: any[]) => void;
}

export function AddAccountWizard({ open, onClose, onAccountCreated }: Props) {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [wizardData, setWizardData] = useState<WizardData>(getInitialWizardData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    if (open) {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) {
        try {
          const parsed = JSON.parse(draft);
          if (parsed.kyc) {
            setWizardData(parsed);
            setCurrentStep(parsed._currentStep || 1);
          }
        } catch { /* ignore corrupt draft */ }
      }
    }
  }, [open]);

  const validateStep1 = (): boolean => {
    const e: Record<string, string> = {};
    const k = wizardData.kyc;
    if (!k.accountName.trim()) e.accountName = "Account name is required";
    if (!k.segment) e.segment = "Segment is required";
    if (!k.engagementModel) e.engagementModel = "Engagement model is required";
    if (!k.companyName.trim()) e.companyName = "Company name is required";
    if (!k.industry) e.industry = "Industry is required";
    if (!k.hqLocation.trim()) e.hqLocation = "HQ location is required";
    if (!k.website.trim()) e.website = "Website is required";
    if (!k.startDate) e.startDate = "Start date is required";
    if (!k.contractValue.trim()) e.contractValue = "Contract value is required";
    if (!k.servicesEngaged.trim()) e.servicesEngaged = "Services engaged is required";
    // Validate at least one contact has a name
    const hasValidContact = k.contacts.some(c => c.name.trim());
    if (!hasValidContact) e.contacts = "At least one contact with a name is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    if (currentStep === 1 && !validateStep1()) return;

    // Mark current step as complete
    setWizardData(prev => ({
      ...prev,
      stepStatuses: { ...prev.stepStatuses, [currentStep]: "complete" },
    }));
    setErrors({});
    setCurrentStep(prev => Math.min(prev + 1, TOTAL_STEPS));
  };

  const handleBack = () => {
    setErrors({});
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleSkip = () => {
    setWizardData(prev => ({
      ...prev,
      stepStatuses: { ...prev.stepStatuses, [currentStep]: "skipped" },
    }));
    setErrors({});
    setCurrentStep(prev => Math.min(prev + 1, TOTAL_STEPS));
  };

  const handleSaveDraft = () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...wizardData, _currentStep: currentStep }));
    toast.success("Draft saved. You can resume onboarding later.");
    onClose();
  };

  const handleCancel = () => setConfirmClose(true);

  const handleConfirmCancel = () => {
    localStorage.removeItem(DRAFT_KEY);
    setWizardData(getInitialWizardData());
    setCurrentStep(1);
    setErrors({});
    setConfirmClose(false);
    onClose();
  };

  const handleConfirm = () => {
    const id = `acc-new-${Date.now()}`;
    const k = wizardData.kyc;

    const newAccount: Account = {
      id,
      name: k.accountName,
      segment: k.segment as "Growth" | "Retention",
      health: { overall: 0, relationship: 0, contract: 0, resource: 0 },
      riskStatus: "green",
      amId: user?.id || "u1",
      amName: user?.name || "Sarah Mitchell",
      industry: k.industry,
      arr: k.contractValue,
      lastUpdated: new Date().toISOString().split("T")[0],
      contractStart: k.startDate,
      contractEnd: wizardData.financials.contractEnd || "",
      stakeholders: k.contacts.filter(c => c.name.trim()).length,
      activities: [],
      onboardingStatus: "complete",
    };

    // Generate auto-tasks for skipped steps
    const generatedTasks: any[] = [];
    const now = new Date();
    [2, 3, 4, 5, 6].forEach(stepId => {
      const status = wizardData.stepStatuses[stepId];
      if (status !== "complete") {
        const tasks = SKIPPED_STEP_TASKS[stepId] || [];
        tasks.forEach(task => {
          const due = new Date(now);
          due.setDate(due.getDate() + task.dueDaysFromCreation);
          generatedTasks.push({
            id: `onb-${id}-${crypto.randomUUID().slice(0, 8)}`,
            title: task.title,
            accountId: id,
            accountName: k.accountName,
            tab: task.tab,
            priority: task.priority,
            dueDate: due.toISOString().split("T")[0],
            status: "pending",
            recurring: task.recurring || false,
            recurringInterval: task.recurringInterval || null,
            source: "onboarding-wizard",
          });
        });
      }
    });

    localStorage.removeItem(DRAFT_KEY);
    onAccountCreated(newAccount, generatedTasks);
    setWizardData(getInitialWizardData());
    setCurrentStep(1);
    setErrors({});
    toast.success(`Account "${k.accountName}" created with ${generatedTasks.length} auto-generated tasks.`);
  };

  const goToStep = (stepNum: number) => {
    setErrors({});
    setCurrentStep(stepNum);
  };

  const stepDef = STEP_DEFS.find(s => s.id === currentStep)!;
  const isOptional = !stepDef.required;
  const progressPct = (currentStep / TOTAL_STEPS) * 100;

  const renderContent = () => {
    switch (currentStep) {
      case 1: return <WizardStep1 data={wizardData.kyc} onChange={kyc => setWizardData(prev => ({ ...prev, kyc }))} errors={errors} />;
      case 2: return <WizardStep2 data={wizardData.strategy} segment={wizardData.kyc.segment} onChange={strategy => setWizardData(prev => ({ ...prev, strategy }))} />;
      case 3: return <WizardStep3 data={wizardData.health} onChange={health => setWizardData(prev => ({ ...prev, health }))} />;
      case 4: return <WizardStep4 data={wizardData.governance} onChange={governance => setWizardData(prev => ({ ...prev, governance }))} />;
      case 5: return <WizardStep5 data={wizardData.financials} onChange={financials => setWizardData(prev => ({ ...prev, financials }))} prefillStart={wizardData.kyc.startDate} />;
      case 6: return <WizardStep6 data={wizardData.opportunities} onChange={opportunities => setWizardData(prev => ({ ...prev, opportunities }))} />;
      case 7: return <WizardStep7 data={wizardData} onGoToStep={goToStep} />;
      default: return null;
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={() => handleCancel()}>
        <DialogContent className="max-w-[1100px] w-[95vw] h-[90vh] p-0 gap-0 flex flex-col overflow-hidden [&>button]:hidden">
          {/* Progress bar */}
          <div className="h-1 w-full bg-border">
            <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progressPct}%` }} />
          </div>

          {/* Header */}
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

          {/* Body */}
          <div className="flex flex-1 overflow-hidden">
            {/* Left Sidebar */}
            <div className="w-[240px] flex-shrink-0 border-r border-border overflow-y-auto"
              style={{ backgroundColor: "hsl(210 33% 98%)" }}>
              <div className="p-3 space-y-0.5">
                {STEP_DEFS.map(step => {
                  const isCurrent = step.id === currentStep;
                  const status = wizardData.stepStatuses[step.id];
                  const isCompleted = status === "complete";
                  const isSkipped = status === "skipped";
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
                        ) : isSkipped ? (
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
                      <span className="flex-1 truncate text-xs">{step.title}</span>
                      {step.required ? (
                        <Badge variant="destructive" className="text-[8px] px-1.5 py-0 flex-shrink-0">Required</Badge>
                      ) : (
                        <span className="text-[9px] text-muted-foreground flex-shrink-0">Optional</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right Content */}
            <ScrollArea className="flex-1">
              <div className="p-6 max-w-[780px]">
                {renderContent()}
              </div>
            </ScrollArea>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end px-6 py-3 border-t border-border bg-background gap-2">
            {currentStep > 1 && (
              <Button variant="outline" onClick={handleBack}>Back</Button>
            )}
            {isOptional && currentStep < TOTAL_STEPS && (
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
