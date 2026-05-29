import { GovernanceEventRecord } from '@/types/governance'
import { ScoreActivityTask } from '@/types/scoreActivity'
import { SignalRecord } from '@/types/v3'

export type UnifiedCalendarItem =
  | {
      id: string
      kind: 'governance'
      accountId: string
      accountName: string
      ownerId: string
      date: string
      title: string
      detail: string
      status: GovernanceEventRecord['status']
      source: GovernanceEventRecord
    }
  | {
      id: string
      kind: 'score_activity'
      accountId: string
      accountName: string
      ownerId: string
      date: string
      title: string
      detail: string
      status: ScoreActivityTask['status']
      source: ScoreActivityTask
    }
  | {
      id: string
      kind: 'renewal_signal'
      accountId: string
      accountName: string
      ownerId: string
      date: string
      title: string
      detail: string
      status: SignalRecord['status']
      source: SignalRecord
    }

export function buildUnifiedCalendarItems(
  governanceEvents: GovernanceEventRecord[],
  scoreTasks: ScoreActivityTask[],
  signals: SignalRecord[] = [],
): UnifiedCalendarItem[] {
  return [
    ...governanceEvents.map((event): UnifiedCalendarItem => ({
      id: event.id,
      kind: 'governance',
      accountId: event.accountId,
      accountName: event.accountName,
      ownerId: event.ownerId,
      date: event.date,
      title: event.type,
      detail: event.agenda,
      status: event.status,
      source: event,
    })),
    ...scoreTasks
      .filter(task => task.status !== 'skipped')
      .map((task): UnifiedCalendarItem => ({
        id: task.id,
        kind: 'score_activity',
        accountId: task.accountId,
        accountName: task.accountName,
        ownerId: task.ownerId,
        date: task.dueDate,
        title: task.title,
        detail: task.description,
        status: task.status,
        source: task,
      })),
    ...signals
      .filter(signal => signal.dueAt && (signal.type === 'sow_expiry' || signal.type === 'notice_window'))
      .map((signal): UnifiedCalendarItem => ({
        id: signal.id,
        kind: 'renewal_signal',
        accountId: signal.accountId,
        accountName: signal.accountName,
        ownerId: signal.ownerId,
        date: signal.dueAt ?? signal.createdAt,
        title: signal.headline,
        detail: signal.detail,
        status: signal.status,
        source: signal,
      })),
  ]
}
