import { GovernanceEventRecord } from '@/types/governance'
import { ScoreActivityTask } from '@/types/scoreActivity'

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

export function buildUnifiedCalendarItems(
  governanceEvents: GovernanceEventRecord[],
  scoreTasks: ScoreActivityTask[],
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
  ]
}
