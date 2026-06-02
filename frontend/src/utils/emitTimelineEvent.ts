import { nanoid } from 'nanoid'
import { useTimelineStore } from '@/stores/timelineStore'
import { TimelineEntry } from '@/types/timeline'

type EmitPayload = Omit<TimelineEntry, 'id' | 'timestamp'> & { timestamp?: string }

export function emitTimelineEvent(payload: EmitPayload): TimelineEntry {
  const { timestamp, ...entryPayload } = payload
  const entry: TimelineEntry = {
    ...entryPayload,
    id: nanoid(),
    timestamp: timestamp ?? new Date().toISOString(),
  }

  useTimelineStore.getState().addEntry(entry)
  return entry
}

export const emit = {
  kycSubmitted: (accountId: string, by: string, byName: string) =>
    emitTimelineEvent({
      accountId,
      eventType: 'kyc_update',
      module: 'kyc',
      title: 'KYC submitted',
      description: 'KYC packet submitted for review.',
      performedBy: by,
      performedByName: byName,
      isSystemGenerated: true,
      isImmutable: false,
      isSensitive: false,
    }),

  kycApproved: (accountId: string, by: string, byName: string) =>
    emitTimelineEvent({
      accountId,
      eventType: 'kyc_update',
      module: 'kyc',
      title: 'KYC approved',
      description: 'KYC submitted and approved.',
      performedBy: by,
      performedByName: byName,
      isSystemGenerated: true,
      isImmutable: false,
      isSensitive: false,
    }),

  kycRejected: (accountId: string, by: string, byName: string, reason: string) =>
    emitTimelineEvent({
      accountId,
      eventType: 'kyc_update',
      module: 'kyc',
      title: 'KYC rejected',
      description: reason,
      performedBy: by,
      performedByName: byName,
      isSystemGenerated: true,
      isImmutable: false,
      isSensitive: false,
    }),

  kycReopened: (accountId: string, by: string, byName: string, reason: string) =>
    emitTimelineEvent({
      accountId,
      eventType: 'kyc_update',
      module: 'kyc',
      title: 'KYC reopened',
      description: reason,
      performedBy: by,
      performedByName: byName,
      isSystemGenerated: true,
      isImmutable: false,
      isSensitive: false,
    }),

  scoreChanged: (
    accountId: string,
    by: string,
    byName: string,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    scoringVersion: string,
  ) =>
    emitTimelineEvent({
      accountId,
      eventType: 'score_change',
      module: 'scoring',
      title: 'Health score updated',
      description: `Overall score changed from ${before.overall} to ${after.overall}`,
      performedBy: by,
      performedByName: byName,
      beforeValue: before,
      afterValue: after,
      scoringVersion,
      sourceRecordId: `score-${accountId}`,
      sourceRecordType: 'scorecard',
      sourceRecordRoute: `/accounts/${accountId}?tab=health`,
      isSystemGenerated: true,
      isImmutable: true,
      isSensitive: false,
    }),

  stageChanged: (
    accountId: string,
    by: string,
    byName: string,
    fromStage: string,
    toStage: string,
    reason: string,
    overridden: boolean,
    stageRuleVersion: string,
  ) =>
    emitTimelineEvent({
      accountId,
      eventType: 'stage_change',
      module: 'stage',
      title: `Stage: ${fromStage} -> ${toStage}`,
      description: reason,
      beforeValue: { stage: fromStage, reason },
      afterValue: { stage: toStage, overridden, reason },
      performedBy: by,
      performedByName: byName,
      stageRuleVersion,
      isSystemGenerated: true,
      isImmutable: true,
      isSensitive: false,
    }),

  escalationFiled: (accountId: string, by: string, byName: string, title: string, level: string, sourceRecordId: string) =>
    emitTimelineEvent({
      accountId,
      eventType: 'escalation_event',
      module: 'escalation',
      title: `Escalation filed: ${title}`,
      description: `Severity level: ${level}`,
      performedBy: by,
      performedByName: byName,
      sourceRecordId,
      sourceRecordType: 'escalation',
      sourceRecordRoute: `/governance`,
      isSystemGenerated: true,
      isImmutable: true,
      isSensitive: false,
    }),

  escalationElevated: (accountId: string, by: string, byName: string, title: string, level: string, sourceRecordId: string) =>
    emitTimelineEvent({
      accountId,
      eventType: 'escalation_event',
      module: 'escalation',
      title: `Escalation elevated: ${title}`,
      description: `Severity level moved to ${level}`,
      performedBy: by,
      performedByName: byName,
      sourceRecordId,
      sourceRecordType: 'escalation',
      sourceRecordRoute: `/governance`,
      isSystemGenerated: true,
      isImmutable: true,
      isSensitive: false,
    }),

  escalationClosed: (accountId: string, by: string, byName: string, title: string, resolution: string, sourceRecordId: string) =>
    emitTimelineEvent({
      accountId,
      eventType: 'escalation_event',
      module: 'escalation',
      title: `Escalation closed: ${title}`,
      description: resolution,
      performedBy: by,
      performedByName: byName,
      sourceRecordId,
      sourceRecordType: 'escalation',
      sourceRecordRoute: `/governance`,
      isSystemGenerated: true,
      isImmutable: true,
      isSensitive: false,
    }),

  opportunityCreated: (accountId: string, by: string, byName: string, oppName: string, value: string, sourceRecordId: string) =>
    emitTimelineEvent({
      accountId,
      eventType: 'opportunity_event',
      module: 'opportunity',
      title: `Opportunity created: ${oppName}`,
      description: `Estimated value: ${value}`,
      performedBy: by,
      performedByName: byName,
      sourceRecordId,
      sourceRecordType: 'opportunity',
      sourceRecordRoute: '/opportunities',
      isSystemGenerated: true,
      isImmutable: false,
      isSensitive: false,
    }),

  opportunityStageChanged: (
    accountId: string,
    by: string,
    byName: string,
    oppId: string,
    fromStage: string,
    toStage: string,
  ) =>
    emitTimelineEvent({
      accountId,
      eventType: 'opportunity_event',
      module: 'opportunity',
      title: `Opportunity moved: ${fromStage} -> ${toStage}`,
      description: 'Opportunity stage was updated from the Kanban board.',
      performedBy: by,
      performedByName: byName,
      sourceRecordId: oppId,
      sourceRecordType: 'opportunity',
      sourceRecordRoute: '/opportunities',
      beforeValue: { stage: fromStage },
      afterValue: { stage: toStage },
      isSystemGenerated: true,
      isImmutable: false,
      isSensitive: false,
    }),

  opportunityWon: (accountId: string, by: string, byName: string, oppName: string, sourceRecordId: string) =>
    emitTimelineEvent({
      accountId,
      eventType: 'opportunity_event',
      module: 'opportunity',
      title: `Opportunity won: ${oppName}`,
      description: 'Opportunity moved to won.',
      performedBy: by,
      performedByName: byName,
      sourceRecordId,
      sourceRecordType: 'opportunity',
      sourceRecordRoute: '/opportunities',
      isSystemGenerated: true,
      isImmutable: false,
      isSensitive: false,
    }),

  opportunityLost: (accountId: string, by: string, byName: string, oppName: string, sourceRecordId: string) =>
    emitTimelineEvent({
      accountId,
      eventType: 'opportunity_event',
      module: 'opportunity',
      title: `Opportunity lost: ${oppName}`,
      description: 'Opportunity moved to lost.',
      performedBy: by,
      performedByName: byName,
      sourceRecordId,
      sourceRecordType: 'opportunity',
      sourceRecordRoute: '/opportunities',
      isSystemGenerated: true,
      isImmutable: false,
      isSensitive: false,
    }),

  opportunityDeferred: (accountId: string, by: string, byName: string, oppName: string, sourceRecordId: string) =>
    emitTimelineEvent({
      accountId,
      eventType: 'opportunity_event',
      module: 'opportunity',
      title: `Opportunity deferred: ${oppName}`,
      description: 'Opportunity deferred for later review.',
      performedBy: by,
      performedByName: byName,
      sourceRecordId,
      sourceRecordType: 'opportunity',
      sourceRecordRoute: '/opportunities',
      isSystemGenerated: true,
      isImmutable: false,
      isSensitive: false,
    }),

  contentShared: (accountId: string, by: string, byName: string, contentTitle: string, contentType: string) =>
    emitTimelineEvent({
      accountId,
      eventType: 'client_education',
      module: 'education',
      title: `Content shared: ${contentTitle}`,
      description: `Type: ${contentType}`,
      performedBy: by,
      performedByName: byName,
      isSystemGenerated: true,
      isImmutable: false,
      isSensitive: false,
    }),

  governanceEvent: (accountId: string, by: string, byName: string, type: string, agenda: string, sourceRecordId: string) =>
    emitTimelineEvent({
      accountId,
      eventType: 'governance_event',
      module: 'governance',
      title: `${type} held`,
      description: agenda,
      performedBy: by,
      performedByName: byName,
      sourceRecordId,
      sourceRecordType: 'governance',
      sourceRecordRoute: '/governance',
      isSystemGenerated: true,
      isImmutable: false,
      isSensitive: false,
    }),

  approvalGranted: (accountId: string, by: string, byName: string, what: string, sourceRecordId: string) =>
    emitTimelineEvent({
      accountId,
      eventType: 'approval_event',
      module: 'approval',
      title: `Approved: ${what}`,
      description: `Approved by ${byName}`,
      performedBy: by,
      performedByName: byName,
      sourceRecordId,
      sourceRecordType: 'approval',
      isSystemGenerated: true,
      isImmutable: true,
      isSensitive: true,
      sensitivityLevel: 'commercial',
    }),
}
