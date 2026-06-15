import { create } from 'zustand'
import {
  AIExtractionDraft,
  EducationContent,
  EngagementRecord,
  EscalationRecord,
  RetentionPlan,
  SignalRecord,
  SignalStatus,
  SourceDocument,
} from '@/types/v3'
import { Account } from '@/types/account'

interface V3Store {
  sourceDocuments: SourceDocument[]
  engagements: EngagementRecord[]
  onboardingDrafts: AIExtractionDraft[]
  signals: SignalRecord[]
  retentionPlans: RetentionPlan[]
  educationContent: EducationContent[]
  escalationRecords: EscalationRecord[]
  addMockUploadDraft: (fileNames: string[], uploadedByName: string) => string
  addAccountKycIntakeDraft: (account: Account, fileNames: string[], uploadedByName: string) => string
  approveDraft: (draftId: string) => AIExtractionDraft | undefined
  rejectDraft: (draftId: string) => void
  addSignal: (signal: SignalRecord) => void
  updateSignalStatus: (signalId: string, status: SignalStatus) => void
}

export const useV3Store = create<V3Store>(set => ({
  sourceDocuments: [],
  engagements: [],
  onboardingDrafts: [],
  signals: [],
  retentionPlans: [],
  educationContent: [],
  escalationRecords: [],
  addMockUploadDraft: () => '',
  addAccountKycIntakeDraft: () => '',
  approveDraft: () => undefined,
  rejectDraft: () => undefined,
  addSignal: signal =>
    set(state => ({
      signals: [signal, ...state.signals],
    })),
  updateSignalStatus: (signalId, status) =>
    set(state => ({
      signals: state.signals.map(signal => (signal.id === signalId ? { ...signal, status } : signal)),
    })),
}))
