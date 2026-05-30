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
  AccountHealthRollup,
  AIExtractionDraft,
  EducationContent,
  EngagementDeliveryStatus,
  EngagementHealth,
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
  accountHealthSnapshots: AccountHealthRollup['snapshots']
  onboardingDrafts: AIExtractionDraft[]
  signals: SignalRecord[]
  retentionPlans: RetentionPlan[]
  educationContent: EducationContent[]
  escalationRecords: EscalationRecord[]
  addMockUploadDraft: (fileNames: string[], uploadedByName: string) => string
  addAccountKycIntakeDraft: (account: Account, fileNames: string[], uploadedByName: string) => string
  approveDraft: (draftId: string) => AIExtractionDraft | undefined
  rejectDraft: (draftId: string) => void
  createEngagement: (engagement: Omit<EngagementRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => EngagementRecord
  updateEngagement: (engagementId: string, updates: Partial<EngagementRecord>) => EngagementRecord | undefined
  archiveEngagement: (engagementId: string) => EngagementRecord | undefined
  recalculateEngagementHealth: (engagementId: string) => EngagementHealth | undefined
  getAccountHealthRollup: (accountId: string) => AccountHealthRollup
  replaceAccountEngagements: (accountId: string, nextEngagements: EngagementRecord[]) => void
  upsertEngagement: (engagement: EngagementRecord) => EngagementRecord
  setEngagementHealth: (engagementId: string, health: EngagementHealth) => void
  saveAccountHealthRollupSnapshot: (rollup: AccountHealthRollup) => void
  addSignal: (signal: SignalRecord) => void
  updateSignalStatus: (signalId: string, status: SignalStatus) => void
}

export const useV3Store = create<V3Store>((set, get) => ({
  sourceDocuments: [...sourceDocuments, ...draftSourceDocuments],
  engagements: engagements.map(normalizeEngagement),
  accountHealthSnapshots: [],
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
        ...draft.engagementDrafts.map(engagement => normalizeEngagement({ ...engagement, status: engagement.renewalTerms.riskStatus === 'critical' ? 'at_risk' as const : 'active' as const })),
        ...state.engagements.filter(item => !draft.engagementDrafts.some(engagement => engagement.id === item.id)),
      ],
    }))
    return draft
  },
  rejectDraft: draftId =>
    set(state => ({
      onboardingDrafts: state.onboardingDrafts.map(item => (item.id === draftId ? { ...item, status: 'rejected', kycDraft: { ...item.kycDraft, status: 'rejected' } } : item)),
    })),
  createEngagement: engagement => {
    const record = normalizeEngagement({
      ...engagement,
      id: engagement.id ?? `eng-${nanoid(8)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    set(state => ({
      engagements: [record, ...state.engagements],
    }))
    return record
  },
  updateEngagement: (engagementId, updates) => {
    const current = get().engagements.find(engagement => engagement.id === engagementId)
    if (!current) return undefined
    const next = normalizeEngagement({
      ...current,
      ...updates,
      renewalTerms: updates.renewalTerms ? { ...current.renewalTerms, ...updates.renewalTerms } : current.renewalTerms,
      updatedAt: new Date().toISOString(),
      health: updates.health ?? makeDirtyHealth('Engagement fields changed; recalculate before rollup.'),
    })
    set(state => ({
      engagements: state.engagements.map(engagement => (engagement.id === engagementId ? next : engagement)),
    }))
    return next
  },
  archiveEngagement: engagementId => {
    const current = get().engagements.find(engagement => engagement.id === engagementId)
    if (!current) return undefined
    const archived = normalizeEngagement({
      ...current,
      status: 'completed',
      updatedAt: new Date().toISOString(),
      health: makeDirtyHealth('Archived engagements no longer contribute to Account Health.'),
    })
    set(state => ({
      engagements: state.engagements.map(engagement => (engagement.id === engagementId ? archived : engagement)),
    }))
    return archived
  },
  recalculateEngagementHealth: engagementId => {
    const current = get().engagements.find(engagement => engagement.id === engagementId)
    if (!current) return undefined
    const health = calculateEngagementHealth(current)
    set(state => ({
      engagements: state.engagements.map(engagement =>
        engagement.id === engagementId ? normalizeEngagement({ ...engagement, health, updatedAt: new Date().toISOString() }) : engagement,
      ),
    }))
    return health
  },
  getAccountHealthRollup: accountId => {
    const rollup = buildAccountHealthRollup(get().engagements, accountId)
    set(state => ({
      accountHealthSnapshots: [{ id: `rollup-${nanoid(8)}`, ...rollup, createdAt: new Date().toISOString() }, ...state.accountHealthSnapshots],
    }))
    return rollup
  },
  replaceAccountEngagements: (accountId, nextEngagements) =>
    set(state => ({
      engagements: [
        ...nextEngagements.map(normalizeEngagement),
        ...state.engagements.filter(engagement => engagement.accountId !== accountId),
      ],
    })),
  upsertEngagement: engagement => {
    const record = normalizeEngagement(engagement)
    set(state => {
      const exists = state.engagements.some(item => item.id === record.id)
      return {
        engagements: exists
          ? state.engagements.map(item => (item.id === record.id ? record : item))
          : [record, ...state.engagements],
      }
    })
    return record
  },
  setEngagementHealth: (engagementId, health) =>
    set(state => ({
      engagements: state.engagements.map(engagement =>
        engagement.id === engagementId ? normalizeEngagement({ ...engagement, health, updatedAt: new Date().toISOString() }) : engagement,
      ),
    })),
  saveAccountHealthRollupSnapshot: rollup =>
    set(state => {
      const incoming = rollup.snapshots.length
        ? rollup.snapshots
        : [{ id: `rollup-${nanoid(8)}`, ...rollup, createdAt: new Date().toISOString() }]
      return {
        accountHealthSnapshots: [
          ...incoming,
          ...state.accountHealthSnapshots.filter(snapshot => !incoming.some(item => item.id === snapshot.id)),
        ],
      }
    }),
  addSignal: signal =>
    set(state => ({
      signals: [signal, ...state.signals],
    })),
  updateSignalStatus: (signalId, status) =>
    set(state => ({
      signals: state.signals.map(signal => (signal.id === signalId ? { ...signal, status } : signal)),
    })),
}))

function normalizeEngagement(engagement: EngagementRecord): EngagementRecord {
  const now = new Date().toISOString()
  const sourceDocumentLinks = engagement.sourceDocumentLinks ?? engagement.sourceDocumentIds.map(documentId => ({ title: documentId, url: `#${documentId}`, type: 'evidence' as const }))
  return {
    ...engagement,
    currency: engagement.currency ?? 'USD',
    deliveryStatus: engagement.deliveryStatus ?? deliveryStatusFromRecord(engagement),
    sourceDocumentLinks,
    attachments: engagement.attachments ?? [],
    activities: engagement.activities ?? [],
    health: engagement.health ?? makeDirtyHealth('Health has not been calculated.'),
    createdAt: engagement.createdAt ?? now,
    updatedAt: engagement.updatedAt ?? now,
  }
}

function deliveryStatusFromRecord(engagement: EngagementRecord): EngagementDeliveryStatus {
  if (engagement.status === 'completed') return 'complete'
  if (engagement.status === 'at_risk') return 'at_risk'
  if (engagement.status === 'renewal_watch') return 'watch'
  if (engagement.deliveryHealth < 60) return 'blocked'
  if (engagement.deliveryHealth < 75) return 'watch'
  return 'on_track'
}

function makeDirtyHealth(reason: string): EngagementHealth {
  return {
    score: 0,
    ragStatus: 'dirty',
    drivers: [reason],
    freshness: 'dirty',
    contributionToAccountHealth: 0,
    formulaVersion: 'engagement-health-v1',
    dirty: true,
  }
}

function calculateEngagementHealth(engagement: EngagementRecord): EngagementHealth {
  const daysToRenewal = Math.ceil((new Date(engagement.renewalTerms.renewalDate).getTime() - Date.now()) / 86400000)
  if (engagement.status === 'draft') {
    return {
      ...makeDirtyHealth('Draft engagements do not contribute to Account Health until approved.'),
      freshness: 'draft',
      calculatedAt: new Date().toISOString(),
    }
  }
  if (!engagement.sourceDocumentIds.length && !engagement.sourceDocumentLinks?.length) {
    return {
      ...makeDirtyHealth('Source evidence is missing; score marked dirty.'),
      score: Math.max(0, engagement.deliveryHealth - 10),
      freshness: 'source_missing',
      calculatedAt: new Date().toISOString(),
    }
  }

  const deliveryStatus: EngagementDeliveryStatus = engagement.deliveryStatus ?? deliveryStatusFromRecord(engagement)
  const drivers = [`Delivery health contributes ${engagement.deliveryHealth}/100.`]
  let score = engagement.deliveryHealth
  const statusPenalty = ({ on_track: 0, watch: 8, at_risk: 18, blocked: 28, complete: 0 } satisfies Record<EngagementDeliveryStatus, number>)[deliveryStatus]
  if (statusPenalty) {
    score -= statusPenalty
    drivers.push(`Delivery status penalty: ${deliveryStatus.replace('_', ' ')}.`)
  }
  const riskPenalty = Math.min(24, engagement.risks.length * 6)
  if (riskPenalty) {
    score -= riskPenalty
    drivers.push(`${engagement.risks.length} risk item(s) reduced the score.`)
  }
  if (daysToRenewal >= 0 && daysToRenewal <= 30) {
    score -= 12
    drivers.push('Renewal is inside 30 days.')
  } else if (daysToRenewal >= 0 && daysToRenewal <= 90) {
    score -= 6
    drivers.push('Renewal is inside 90 days.')
  }
  const finalScore = Math.max(0, Math.min(100, score))
  const ragStatus = finalScore < 60 ? 'red' : finalScore < 75 ? 'amber' : 'green'
  return {
    score: finalScore,
    ragStatus,
    drivers,
    freshness: 'current',
    contributionToAccountHealth: 0,
    formulaVersion: 'engagement-health-v1',
    dirty: false,
    calculatedAt: new Date().toISOString(),
  }
}

export function buildAccountHealthRollup(engagements: EngagementRecord[], accountId: string): AccountHealthRollup {
  const activeStatuses: EngagementRecord['status'][] = ['active', 'renewal_watch', 'at_risk']
  const accountEngagements = engagements.filter(engagement => engagement.accountId === accountId && activeStatuses.includes(engagement.status))
  const cleanEngagements = accountEngagements.filter(engagement => engagement.health && !engagement.health.dirty)
  const totalValue = cleanEngagements.reduce((sum, engagement) => sum + engagement.value, 0)
  const contributions = accountEngagements.map(engagement => {
    const contributionToAccountHealth = engagement.health && !engagement.health.dirty && totalValue > 0
      ? Number((engagement.health.score * (engagement.value / totalValue)).toFixed(1))
      : 0
    return {
      engagementId: engagement.id,
      engagementName: engagement.name,
      status: engagement.status,
      value: engagement.value,
      score: engagement.health?.dirty ? undefined : engagement.health?.score,
      ragStatus: engagement.health?.ragStatus ?? 'dirty',
      dirty: engagement.health?.dirty ?? true,
      contributionToAccountHealth,
      freshness: engagement.health?.freshness ?? 'not_calculated',
      drivers: engagement.health?.drivers ?? ['Health has not been calculated.'],
    }
  })
  const rollupScore = totalValue > 0
    ? Math.round(cleanEngagements.reduce((sum, engagement) => sum + (engagement.health?.score ?? 0) * (engagement.value / totalValue), 0))
    : 0

  return {
    accountId,
    rollupScore,
    formulaVersion: 'engagement-health-v1',
    contributions,
    dirtyCount: contributions.filter(contribution => contribution.dirty).length,
    snapshots: [],
  }
}
