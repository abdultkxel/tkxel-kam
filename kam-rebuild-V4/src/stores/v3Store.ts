import { nanoid } from 'nanoid'
import { create } from 'zustand'
import {
  draftSourceDocuments,
  educationContent,
  engagements,
  escalationRecords,
  onboardingDrafts,
  retentionPlans,
  signals,
  sourceDocuments,
} from '@/data/v3Mock'
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

export const useV3Store = create<V3Store>((set, get) => ({
  sourceDocuments: [...sourceDocuments, ...draftSourceDocuments],
  engagements,
  onboardingDrafts,
  signals,
  retentionPlans,
  educationContent,
  escalationRecords,
  addMockUploadDraft: (fileNames, uploadedByName) => {
    const draftId = `draft-${nanoid(6)}`
    const accountId = `account-${nanoid(5)}`
    const documentIds = fileNames.map((name, index) => `doc-${draftId}-${index}`)
    const createdAt = new Date().toISOString()
    const docs: SourceDocument[] = fileNames.map((name, index) => ({
      id: documentIds[index],
      name,
      type: name.toLowerCase().includes('sow') ? 'sow' : 'project_charter',
      uploadedAt: createdAt,
      uploadedByName,
      confidence: index === 0 ? 86 : 81,
      pages: index === 0 ? 10 : 18,
      status: index === 0 ? 'parsed' : 'needs_review',
      citations: [
        {
          id: `cit-${draftId}-${index}`,
          documentId: documentIds[index],
          label: index === 0 ? 'Program scope' : 'Term and renewal',
          page: index === 0 ? 2 : 6,
          excerpt: index === 0 ? 'AI detected a modernization program with executive governance.' : 'AI detected a term end, renewal date, and notice window requiring review.',
        },
      ],
    }))
    const draft: AIExtractionDraft = {
      ...onboardingDrafts[0],
      id: draftId,
      createdAt,
      createdByName: uploadedByName,
      sourceDocumentIds: documentIds,
      accountDraft: {
        ...onboardingDrafts[0].accountDraft,
        id: accountId,
        name: fileNames[0]?.replace(/\\.(pdf|docx?)$/i, '').replace(/[-_]/g, ' ') || 'New Charter Account',
        stage: 'Onboarding',
      },
      engagementDrafts: onboardingDrafts[0].engagementDrafts.map(engagement => ({
        ...engagement,
        id: `eng-${draftId}`,
        accountId,
        accountName: fileNames[0]?.replace(/\\.(pdf|docx?)$/i, '').replace(/[-_]/g, ' ') || 'New Charter Account',
        sourceDocumentIds: documentIds,
      })),
      kycDraft: {
        ...onboardingDrafts[0].kycDraft,
        id: `kyc-${draftId}`,
        accountId,
        sourceDocumentIds: documentIds,
      },
    }
    set(state => ({
      sourceDocuments: [...docs, ...state.sourceDocuments],
      onboardingDrafts: [draft, ...state.onboardingDrafts],
    }))
    return draftId
  },
  addAccountKycIntakeDraft: (account, fileNames, uploadedByName) => {
    const draftId = `draft-${account.id}-${nanoid(6)}`
    const names = fileNames.length ? fileNames : [`${account.name} Project Charter.pdf`, `${account.name} Renewal SOW.pdf`]
    const documentIds = names.map((_, index) => `doc-${draftId}-${index}`)
    const createdAt = new Date().toISOString()
    const docs: SourceDocument[] = names.map((name, index) => ({
      id: documentIds[index],
      accountId: account.id,
      engagementId: `eng-${draftId}`,
      name,
      type: name.toLowerCase().includes('sow') ? 'sow' : 'project_charter',
      uploadedAt: createdAt,
      uploadedByName,
      confidence: name.toLowerCase().includes('sow') ? 88 : 91,
      pages: name.toLowerCase().includes('sow') ? 18 : 11,
      status: name.toLowerCase().includes('sow') ? 'needs_review' : 'parsed',
      citations: [
        {
          id: `cit-${draftId}-${index}`,
          documentId: documentIds[index],
          label: name.toLowerCase().includes('sow') ? 'Renewal terms' : 'Engagement scope',
          page: name.toLowerCase().includes('sow') ? 6 : 2,
          excerpt: name.toLowerCase().includes('sow')
            ? 'AI detected term, renewal date, notice period, commercial exposure, and service obligations for KAM review.'
            : 'AI detected engagement objectives, scope, milestones, success metrics, stakeholders, and assumptions.',
        },
      ],
    }))
    const draft: AIExtractionDraft = {
      ...onboardingDrafts[0],
      id: draftId,
      status: 'ready_for_review',
      createdAt,
      createdByName: uploadedByName,
      sourceDocumentIds: documentIds,
      confidence: 89,
      missingFields: ['Confirm finance approver and legal entity name'],
      conflicts: names.some(name => name.toLowerCase().includes('sow')) ? ['SOW renewal clause needs commercial owner confirmation.'] : [],
      accountDraft: {
        ...account,
        stage: account.stage,
      },
      engagementDrafts: onboardingDrafts[0].engagementDrafts.map(engagement => ({
        ...engagement,
        id: `eng-${draftId}`,
        accountId: account.id,
        accountName: account.name,
        name: names.find(name => name.toLowerCase().includes('sow'))?.replace(/\.(pdf|docx?)$/i, '').replace(/[-_]/g, ' ') ?? `${account.name} New Engagement`,
        ownerId: account.ownerId,
        ownerName: account.ownerName,
        sourceDocumentIds: documentIds,
      })),
      kycDraft: {
        ...onboardingDrafts[0].kycDraft,
        id: `kyc-${draftId}`,
        accountId: account.id,
        status: 'ready_for_review',
        confidence: 89,
        sourceDocumentIds: documentIds,
        sections: {
          company: `${account.name} is an active ${account.segment.toLowerCase()} account owned by ${account.ownerName}; AI refreshed the client snapshot from the new charter/SOW package.`,
          industry: `${account.tags.join(', ')} context with current lifecycle stage ${account.stage}; industry assumptions require review against current market research.`,
          stakeholders: account.stakeholders.join('. '),
          market: 'AI intake prepared market size, buying cycle, peer movement, technology trend, and macro demand prompts for validation.',
          funding: 'AI intake queued financial posture, renewal dependency, pricing sensitivity, payment behavior, and margin review fields for owner confirmation.',
          engagementContext: `New charter/SOW intake for ${account.name} identified engagement objectives, scope, delivery model, obligations, SLAs, renewal windows, and success metrics.`,
          risks: account.risks.join('. '),
        },
        missingFields: ['Finance approver email', 'Legal entity confirmation'],
        conflicts: names.some(name => name.toLowerCase().includes('sow')) ? ['Renewal and notice window require commercial validation.'] : [],
        citations: docs.flatMap(document => document.citations),
      },
    }
    set(state => ({
      sourceDocuments: [...docs, ...state.sourceDocuments],
      onboardingDrafts: [draft, ...state.onboardingDrafts],
    }))
    return draftId
  },
  approveDraft: draftId => {
    const draft = get().onboardingDrafts.find(item => item.id === draftId)
    if (!draft) return undefined
    set(state => ({
      onboardingDrafts: state.onboardingDrafts.map(item => (item.id === draftId ? { ...item, status: 'approved', kycDraft: { ...item.kycDraft, status: 'approved' } } : item)),
      engagements: [
        ...draft.engagementDrafts.map(engagement => ({ ...engagement, status: engagement.renewalTerms.riskStatus === 'critical' ? 'at_risk' as const : 'active' as const })),
        ...state.engagements.filter(item => !draft.engagementDrafts.some(engagement => engagement.id === item.id)),
      ],
    }))
    return draft
  },
  rejectDraft: draftId =>
    set(state => ({
      onboardingDrafts: state.onboardingDrafts.map(item => (item.id === draftId ? { ...item, status: 'rejected', kycDraft: { ...item.kycDraft, status: 'rejected' } } : item)),
    })),
  addSignal: signal =>
    set(state => ({
      signals: [signal, ...state.signals],
    })),
  updateSignalStatus: (signalId, status) =>
    set(state => ({
      signals: state.signals.map(signal => (signal.id === signalId ? { ...signal, status } : signal)),
    })),
}))
